const db = require('../config/db');
const { obterRegras } = require('../utils/sportClassificationRules');

const PONTUACAO_POSICAO = [13, 8, 6, 5, 4, 3, 2, 1];
const FORMATOS_PROVA = ['direta', 'final_por_tempo', 'baterias_com_final'];

/*
 * O body-parser usa `qs` com arrayLimit = max(100, qtd de parametros). Como os
 * formularios indexam por `resultados[<id do atleta>]`, quando o id do atleta e
 * maior que o arrayLimit o `qs` devolve um OBJETO (`{ "120": {...} }`) em vez de
 * um array, quebrando `for (const r of resultados)`.
 * Aqui normalizamos sempre para array, preservando a ordem numerica das chaves.
 */
function normalizarResultados(resultados) {
  if (Array.isArray(resultados)) return resultados;

  if (resultados && typeof resultados === 'object') {
    return Object.keys(resultados)
      .sort((a, b) => Number(a) - Number(b))
      .map((chave) => resultados[chave])
      .filter((item) => item && typeof item === 'object');
  }

  return [];
}

/* Converte "h:mm:ss.ms", "mm:ss.ms" ou "s.ms" para milissegundos (null se inválido) */
function converterTempoParaMs(valor) {
  const texto = String(valor || '').trim();
  if (!texto) return null;

  const matchCompleto = texto.match(/^(?:(\d{1,2}):)?(\d{1,3}):(\d{1,2})(?:[.,](\d{1,3}))?$/);
  if (matchCompleto) {
    const horas = Number(matchCompleto[1] || 0);
    const minutos = Number(matchCompleto[2]);
    const segundos = Number(matchCompleto[3]);
    const milesimos = matchCompleto[4] ? Number(String(matchCompleto[4]).padEnd(3, '0')) : 0;
    return ((horas * 60 + minutos) * 60 + segundos) * 1000 + milesimos;
  }

  const matchSegundos = texto.match(/^(\d{1,4})(?:[.,](\d{1,3}))?$/);
  if (matchSegundos) {
    const segundos = Number(matchSegundos[1]);
    const milesimos = matchSegundos[2] ? Number(String(matchSegundos[2]).padEnd(3, '0')) : 0;
    return segundos * 1000 + milesimos;
  }

  return null;
}

/* "00:00:10.523" -> "00:10.523" (mantém horas apenas quando > 0) */
function formatarTempoExibicao(valorDb) {
  const texto = String(valorDb || '').trim();
  if (!texto) return '';
  const match = texto.match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?$/);
  if (!match) return texto;
  const horas = Number(match[1] || 0);
  const minutos = String(match[2]).padStart(2, '0');
  const segundos = String(match[3]).padStart(2, '0');
  const milesimos = match[4] ? '.' + String(match[4]).padEnd(3, '0') : '.000';
  return horas > 0 ? `${horas}:${minutos}:${segundos}${milesimos}` : `${minutos}:${segundos}${milesimos}`;
}

function normalizarFormato(formato) {
  return FORMATOS_PROVA.includes(String(formato || '')) ? String(formato) : 'direta';
}

async function obterProvasPorModalidade(modalidadeId) {
  const [rows] = await db.query(
    'SELECT id, modalidade_id, nome, tipo_resultado, ordem, formato FROM provas WHERE modalidade_id = ? ORDER BY ordem ASC, id ASC',
    [modalidadeId]
  );
  return rows.map((row) => ({ ...row, formato: normalizarFormato(row.formato) }));
}

async function criarProva(modalidadeId, nome, tipoResultado, ordem, formato) {
  const formatoNormalizado = tipoResultado === 'tempo' ? normalizarFormato(formato) : 'direta';
  const [result] = await db.query(
    'INSERT INTO provas (modalidade_id, nome, tipo_resultado, ordem, formato) VALUES (?, ?, ?, ?, ?)',
    [modalidadeId, nome, tipoResultado || 'medida', ordem || 0, formatoNormalizado]
  );
  return result.insertId;
}

async function excluirProva(provaId) {
  await db.query('DELETE FROM provas WHERE id = ?', [provaId]);
}

async function obterAtletasPorModalidade(modalidadeId) {
  const [rows] = await db.query(
    `SELECT a.id, a.nome, c.nome AS campus_nome
     FROM atleta_modalidade am
     JOIN atletas a ON am.atleta_id = a.id
     LEFT JOIN campus c ON a.campus_id = c.id
     WHERE am.modalidade_id = ?
     ORDER BY c.nome ASC, a.nome ASC`,
    [modalidadeId]
  );
  return rows;
}

async function obterResultadosPorProva(provaId) {
  const [rows] = await db.query(
    `SELECT ra.id, ra.prova_id, ra.atleta_id, ra.resultado_tempo, ra.resultado_medida, ra.posicao_final, ra.pontos,
            ra.numero_bateria, ra.numero_raia, ra.etapa,
            a.nome AS atleta_nome, c.nome AS campus_nome
     FROM resultados_atletismo ra
     JOIN atletas a ON ra.atleta_id = a.id
     LEFT JOIN campus c ON a.campus_id = c.id
     WHERE ra.prova_id = ?
     ORDER BY ra.etapa ASC, ra.numero_bateria ASC, ra.posicao_final ASC, ra.id ASC`,
    [provaId]
  );
  return rows.map((row) => ({
    ...row,
    etapa: row.etapa || 'prova',
    resultado_tempo_exibicao: formatarTempoExibicao(row.resultado_tempo)
  }));
}

/* Salva/atualiza um registro único respeitando a etapa (prova ou final) */
async function salvarResultadoEtapa(provaId, atletaId, dados) {
  const etapa = String(dados.etapa || 'prova') === 'final' ? 'final' : 'prova';
  const [existe] = await db.query(
    'SELECT id FROM resultados_atletismo WHERE prova_id = ? AND atleta_id = ? AND etapa = ?',
    [provaId, atletaId, etapa]
  );

  if (existe.length) {
    await db.query(
      `UPDATE resultados_atletismo
      SET resultado_tempo = ?, resultado_medida = ?, posicao_final = ?, pontos = ?, numero_bateria = ?, numero_raia = ?
       WHERE id = ?`,
          [dados.resultadoTempo, dados.resultadoMedida, dados.posicaoFinal, dados.pontos, dados.numeroBateria, dados.numeroRaia, existe[0].id]
    );
    return;
  }

  await db.query(
    `INSERT INTO resultados_atletismo (prova_id, atleta_id, resultado_tempo, resultado_medida, posicao_final, pontos, numero_bateria, numero_raia, etapa)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [provaId, atletaId, dados.resultadoTempo, dados.resultadoMedida, dados.posicaoFinal, dados.pontos, dados.numeroBateria, dados.numeroRaia, etapa]
  );
}

/* Ordena automaticamente os resultados de uma etapa pelo tempo e distribui os pontos
   (1º ao 8º pontuam; do 9º em diante ficam com 0). */
async function recalcularRankingPorTempo(provaId, etapa) {
  const [rows] = await db.query(
    "SELECT id, resultado_tempo FROM resultados_atletismo WHERE prova_id = ? AND etapa = ?",
    [provaId, etapa]
  );

  const comTempo = rows
    .map((row) => ({ id: row.id, ms: converterTempoParaMs(row.resultado_tempo) }))
    .filter((row) => row.ms != null)
    .sort((a, b) => a.ms - b.ms);

  const idsComTempo = new Set(comTempo.map((row) => row.id));

  for (let i = 0; i < rows.length; i++) {
    if (!idsComTempo.has(rows[i].id)) {
      await db.query('UPDATE resultados_atletismo SET posicao_final = NULL, pontos = 0 WHERE id = ?', [rows[i].id]);
    }
  }

  for (let i = 0; i < comTempo.length; i++) {
    const posicao = i + 1;
    const pontos = posicao <= PONTUACAO_POSICAO.length ? PONTUACAO_POSICAO[posicao - 1] : 0;
    await db.query('UPDATE resultados_atletismo SET posicao_final = ?, pontos = ? WHERE id = ?', [posicao, pontos, comTempo[i].id]);
  }
}

async function salvarResultadosProva(provaId, resultados, formatoProva) {
  const formato = normalizarFormato(formatoProva);

  for (const r of normalizarResultados(resultados)) {
    const atletaId = Number(r.atleta_id);
    if (!atletaId) continue;

    if (formato === 'final_por_tempo') {
      await salvarResultadoEtapa(provaId, atletaId, {
        etapa: 'prova',
        resultadoTempo: r.resultado_tempo || null,
        resultadoMedida: null,
        posicaoFinal: null,
        pontos: 0,
        numeroBateria: Number(r.numero_bateria) > 0 ? Number(r.numero_bateria) : null,
        numeroRaia: Number(r.numero_raia) > 0 ? Number(r.numero_raia) : null
      });
      continue;
    }

    if (formato === 'baterias_com_final') {
      const classificado = r.classificado_final === 'on' || r.classificado_final === '1' || r.classificado_final === 'true';

      await salvarResultadoEtapa(provaId, atletaId, {
        etapa: 'prova',
        resultadoTempo: r.resultado_tempo || null,
        resultadoMedida: null,
        posicaoFinal: null,
        pontos: 0,
        numeroBateria: Number(r.numero_bateria) > 0 ? Number(r.numero_bateria) : null,
        numeroRaia: Number(r.numero_raia) > 0 ? Number(r.numero_raia) : null
      });

      if (classificado) {
        const tempoFinal = r.resultado_tempo_final || null;
        if (tempoFinal) {
          await salvarResultadoEtapa(provaId, atletaId, {
            etapa: 'final',
            resultadoTempo: tempoFinal,
            resultadoMedida: null,
            posicaoFinal: null,
            pontos: 0,
            numeroBateria: null,
            numeroRaia: Number(r.numero_raia) > 0 ? Number(r.numero_raia) : null
          });
        }
      } else {
        await db.query(
          "DELETE FROM resultados_atletismo WHERE prova_id = ? AND atleta_id = ? AND etapa = 'final'",
          [provaId, atletaId]
        );
      }
      continue;
    }

    // Formato direta: posição informada manualmente pelo juiz (sem limite de atletas;
    // somente do 1º ao 8º recebem pontuação).
    const resultadoTempo = r.resultado_tempo || null;
    const resultadoMedida = r.resultado_medida != null && r.resultado_medida !== '' ? Number(r.resultado_medida) : null;
    const posicaoFinal = r.posicao_final != null && r.posicao_final !== '' ? Number(r.posicao_final) : null;
    const pontos = posicaoFinal != null && posicaoFinal >= 1 && posicaoFinal <= PONTUACAO_POSICAO.length
      ? PONTUACAO_POSICAO[posicaoFinal - 1]
      : 0;

    await salvarResultadoEtapa(provaId, atletaId, {
      etapa: 'prova',
      resultadoTempo,
      resultadoMedida,
      posicaoFinal,
      pontos,
      numeroBateria: Number(r.numero_bateria) > 0 ? Number(r.numero_bateria) : null,
      numeroRaia: Number(r.numero_raia) > 0 ? Number(r.numero_raia) : null
    });
  }

  if (formato === 'final_por_tempo') {
    await recalcularRankingPorTempo(provaId, 'prova');
  } else if (formato === 'baterias_com_final') {
    await recalcularRankingPorTempo(provaId, 'final');
  }
}

async function obterClassificacaoAtletismo(modalidadeId) {
  const [rows] = await db.query(
    `SELECT a.id AS atleta_id, a.nome AS atleta_nome, c.nome AS campus_nome,
            COALESCE(SUM(ra.pontos), 0) AS pontos
     FROM atleta_modalidade am
     JOIN atletas a ON am.atleta_id = a.id
     LEFT JOIN campus c ON a.campus_id = c.id
     LEFT JOIN resultados_atletismo ra ON ra.atleta_id = a.id
       AND ra.prova_id IN (SELECT id FROM provas WHERE modalidade_id = ?)
     WHERE am.modalidade_id = ?
     GROUP BY a.id, a.nome, c.nome
     ORDER BY pontos DESC`,
    [modalidadeId, modalidadeId]
  );
  return rows;
}

async function obterClassificacaoGeralCampi(generoFiltro) {
  const genero = String(generoFiltro || '').trim();
  const [rows] = await db.query(
    `SELECT c.id AS campus_id, COALESCE(NULLIF(c.nome_exibicao, ''), c.nome) AS campus_nome,
            c.foto_perfil AS foto_perfil,
            COALESCE(SUM(ra.pontos), 0) AS pontos,
            COUNT(DISTINCT ra.prova_id) AS provas_pontuadas,
            SUM(CASE WHEN ra.posicao_final = 1 THEN 1 ELSE 0 END) AS primeiros_lugares,
            SUM(CASE WHEN ra.posicao_final = 2 THEN 1 ELSE 0 END) AS segundos_lugares,
            SUM(CASE WHEN ra.posicao_final = 3 THEN 1 ELSE 0 END) AS terceiros_lugares,
            SUM(CASE WHEN ra.posicao_final = 4 THEN 1 ELSE 0 END) AS quartos_lugares,
            SUM(CASE WHEN ra.posicao_final = 5 THEN 1 ELSE 0 END) AS quintos_lugares,
            SUM(CASE WHEN ra.posicao_final = 6 THEN 1 ELSE 0 END) AS sextos_lugares,
            SUM(CASE WHEN ra.posicao_final = 7 THEN 1 ELSE 0 END) AS setimos_lugares,
            SUM(CASE WHEN ra.posicao_final = 8 THEN 1 ELSE 0 END) AS oitavos_lugares
     FROM atletas a
     JOIN campus c ON c.id = a.campus_id
     JOIN atleta_modalidade am ON am.atleta_id = a.id
     JOIN modalidades m ON m.id = am.modalidade_id AND LOWER(m.nome) LIKE '%atletismo%'
     LEFT JOIN resultados_atletismo ra ON ra.atleta_id = a.id AND ra.pontos > 0
       AND ra.prova_id IN (
         SELECT p.id FROM provas p
         JOIN modalidades mp ON mp.id = p.modalidade_id
         WHERE LOWER(mp.nome) LIKE '%atletismo%'
       )
     WHERE (? = '' OR UPPER(m.genero) = UPPER(?))
     GROUP BY c.id, campus_nome, c.foto_perfil
    ORDER BY pontos DESC, primeiros_lugares DESC, segundos_lugares DESC,
          terceiros_lugares DESC, quartos_lugares DESC, quintos_lugares DESC,
          sextos_lugares DESC, setimos_lugares DESC, oitavos_lugares DESC,
          campus_nome ASC`,
    [genero, genero]
  );
  return rows;
}

async function obterResultadosXadrez(modalidadeId) {
  const [rows] = await db.query(
    `SELECT rx.id, rx.modalidade_id, rx.atleta_id, rx.pontuacao, rx.vitorias, rx.derrotas, rx.empates,
            a.nome AS atleta_nome, c.nome AS campus_nome
     FROM resultados_xadrez rx
     JOIN atletas a ON rx.atleta_id = a.id
     LEFT JOIN campus c ON a.campus_id = c.id
     WHERE rx.modalidade_id = ?
     ORDER BY rx.pontuacao DESC, rx.vitorias DESC`,
    [modalidadeId]
  );
  return rows;
}

async function salvarResultadosXadrez(modalidadeId, resultados) {
  for (const r of normalizarResultados(resultados)) {
    const atletaId = Number(r.atleta_id);
    if (!atletaId) continue;

    const pontuacao = Number(r.pontuacao) || 0;
    const vitorias = Number(r.vitorias) || 0;
    const derrotas = Number(r.derrotas) || 0;
    const empates = Number(r.empates) || 0;

    const [existe] = await db.query(
      'SELECT id FROM resultados_xadrez WHERE modalidade_id = ? AND atleta_id = ?',
      [modalidadeId, atletaId]
    );

    if (existe.length) {
      await db.query(
        'UPDATE resultados_xadrez SET pontuacao = ?, vitorias = ?, derrotas = ?, empates = ? WHERE modalidade_id = ? AND atleta_id = ?',
        [pontuacao, vitorias, derrotas, empates, modalidadeId, atletaId]
      );
    } else {
      await db.query(
        'INSERT INTO resultados_xadrez (modalidade_id, atleta_id, pontuacao, vitorias, derrotas, empates) VALUES (?, ?, ?, ?, ?, ?)',
        [modalidadeId, atletaId, pontuacao, vitorias, derrotas, empates]
      );
    }
  }
}

async function obterClassificacaoXadrez(modalidadeId) {
  const [rows] = await db.query(
    `SELECT a.id AS atleta_id, a.nome AS atleta_nome, c.nome AS campus_nome,
            rx.pontuacao, rx.vitorias, rx.derrotas, rx.empates
     FROM atleta_modalidade am
     JOIN atletas a ON am.atleta_id = a.id
     LEFT JOIN campus c ON a.campus_id = c.id
     LEFT JOIN resultados_xadrez rx ON rx.atleta_id = a.id AND rx.modalidade_id = ?
     WHERE am.modalidade_id = ?
     ORDER BY COALESCE(rx.pontuacao, 0) DESC, COALESCE(rx.vitorias, 0) DESC`,
    [modalidadeId, modalidadeId]
  );
  return rows;
}

async function obterClassificacaoGeralXadrez(modalidadeId) {
  const [rows] = await db.query(
    `SELECT c.id AS campus_id, COALESCE(NULLIF(c.nome_exibicao, ''), c.nome) AS campus_nome,
            COALESCE(SUM(rx.pontuacao), 0) AS pontos,
            COALESCE(SUM(rx.vitorias), 0) AS vitorias,
            COALESCE(SUM(rx.derrotas), 0) AS derrotas,
            COALESCE(SUM(rx.empates), 0) AS empates
     FROM resultados_xadrez rx
     JOIN atletas a ON a.id = rx.atleta_id
     JOIN campus c ON c.id = a.campus_id
     WHERE rx.modalidade_id = ?
     GROUP BY c.id, campus_nome
     ORDER BY pontos DESC, vitorias DESC, campus_nome ASC`,
    [modalidadeId]
  );
  return rows;
}

async function sincronizarResultadosXadrezModalidade(modalidadeId) {
  const id = Number(modalidadeId || 0);
  if (!id) return;

  const [inscritos] = await db.query(
    'SELECT DISTINCT atleta_id FROM atleta_modalidade WHERE modalidade_id = ?',
    [id]
  );

  for (const inscrito of inscritos) {
    const atletaId = Number(inscrito.atleta_id);
    if (!atletaId) continue;

    const [existe] = await db.query(
      'SELECT id FROM resultados_xadrez WHERE modalidade_id = ? AND atleta_id = ?',
      [id, atletaId]
    );

    if (!existe.length) {
      await db.query(
        'INSERT INTO resultados_xadrez (modalidade_id, atleta_id, pontuacao, vitorias, derrotas, empates) VALUES (?, ?, 0, 0, 0, 0)',
        [id, atletaId]
      );
    }
  }
}

async function publicarProvasModalidade(modalidadeId) {
  const id = Number(modalidadeId || 0);
  if (!id) return;
  const { ensureProvasPublicadoColumn } = require('../config/ensureSchema');
  await ensureProvasPublicadoColumn();
  await db.query('UPDATE provas SET publicado = 1 WHERE modalidade_id = ?', [id]);
}

async function publicarResultadosXadrezModalidade(modalidadeId) {
  const id = Number(modalidadeId || 0);
  if (!id) return;
  const { ensureResultadosXadrezPublicadoColumn } = require('../config/ensureSchema');
  await ensureResultadosXadrezPublicadoColumn();
  await db.query('UPDATE resultados_xadrez SET publicado = 1 WHERE modalidade_id = ?', [id]);
}

async function publicarModalidadeIndividual(modalidadeId) {
  const id = Number(modalidadeId || 0);
  if (!id) return;

  const [modRows] = await db.query('SELECT nome FROM modalidades WHERE id = ?', [id]);
  const nomeModalidade = String(modRows[0]?.nome || '').toLowerCase();

  if (nomeModalidade.includes('atletismo')) {
    await publicarProvasModalidade(id);
  } else if (nomeModalidade.includes('xadrez')) {
    await sincronizarResultadosXadrezModalidade(id);
    await publicarResultadosXadrezModalidade(id);
  }
}

async function publicarTodasModalidadesIndividuais() {
  const { ensureProvasPublicadoColumn, ensureResultadosXadrezPublicadoColumn } = require('../config/ensureSchema');
  await ensureProvasPublicadoColumn();
  await ensureResultadosXadrezPublicadoColumn();

  const [modalidadesXadrez] = await db.query(
    'SELECT id FROM modalidades WHERE LOWER(nome) LIKE ?',
    ['%xadrez%']
  );
  for (const modalidade of modalidadesXadrez) {
    await sincronizarResultadosXadrezModalidade(modalidade.id);
  }

  await db.query('UPDATE provas SET publicado = 1');
  await db.query('UPDATE resultados_xadrez SET publicado = 1');
}

function ehEsporteIndividual(nomeModalidade) {
  const regras = obterRegras(nomeModalidade);
  return Boolean(regras.tipo_individual);
}

function ehAtletismo(nomeModalidade) {
  const regras = obterRegras(nomeModalidade);
  return regras.tipo === 'individual_medida';
}

function ehXadrez(nomeModalidade) {
  const regras = obterRegras(nomeModalidade);
  return regras.tipo === 'individual_pontos';
}

module.exports = {
  obterProvasPorModalidade,
  criarProva,
  excluirProva,
  obterAtletasPorModalidade,
  obterResultadosPorProva,
  salvarResultadosProva,
  converterTempoParaMs,
  formatarTempoExibicao,
  normalizarFormato,
  normalizarResultados,
  obterClassificacaoAtletismo,
  obterClassificacaoGeralCampi,
  obterResultadosXadrez,
  salvarResultadosXadrez,
  obterClassificacaoXadrez,
  obterClassificacaoGeralXadrez,
  sincronizarResultadosXadrezModalidade,
  ehEsporteIndividual,
  ehAtletismo,
  ehXadrez,
  publicarProvasModalidade,
  publicarResultadosXadrezModalidade,
  publicarModalidadeIndividual,
  publicarTodasModalidadesIndividuais
};
