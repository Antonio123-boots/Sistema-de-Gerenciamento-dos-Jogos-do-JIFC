const db = require('../config/db');
const { obterRegras } = require('../utils/sportClassificationRules');

const PONTUACAO_POSICAO = [13, 8, 6, 5, 4, 3, 2, 1];

async function obterProvasPorModalidade(modalidadeId) {
  const [rows] = await db.query(
    'SELECT id, modalidade_id, nome, tipo_resultado, ordem FROM provas WHERE modalidade_id = ? ORDER BY ordem ASC, id ASC',
    [modalidadeId]
  );
  return rows;
}

async function criarProva(modalidadeId, nome, tipoResultado, ordem) {
  const [result] = await db.query(
    'INSERT INTO provas (modalidade_id, nome, tipo_resultado, ordem) VALUES (?, ?, ?, ?)',
    [modalidadeId, nome, tipoResultado || 'medida', ordem || 0]
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
            a.nome AS atleta_nome, c.nome AS campus_nome
     FROM resultados_atletismo ra
     JOIN atletas a ON ra.atleta_id = a.id
     LEFT JOIN campus c ON a.campus_id = c.id
     WHERE ra.prova_id = ?
     ORDER BY ra.posicao_final ASC, ra.id ASC`,
    [provaId]
  );
  return rows;
}

async function salvarResultadosProva(provaId, resultados) {
  for (const r of resultados) {
    const atletaId = Number(r.atleta_id);
    if (!atletaId) continue;

    const resultadoTempo = r.resultado_tempo || null;
    const resultadoMedida = r.resultado_medida != null ? Number(r.resultado_medida) : null;
    const posicaoFinal = r.posicao_final != null ? Number(r.posicao_final) : null;
    const pontos = posicaoFinal != null && posicaoFinal >= 1 && posicaoFinal <= PONTUACAO_POSICAO.length
      ? PONTUACAO_POSICAO[posicaoFinal - 1]
      : 0;

    const [existe] = await db.query(
      'SELECT id FROM resultados_atletismo WHERE prova_id = ? AND atleta_id = ?',
      [provaId, atletaId]
    );

    if (existe.length) {
      await db.query(
        'UPDATE resultados_atletismo SET resultado_tempo = ?, resultado_medida = ?, posicao_final = ?, pontos = ? WHERE prova_id = ? AND atleta_id = ?',
        [resultadoTempo, resultadoMedida, posicaoFinal, pontos, provaId, atletaId]
      );
    } else {
      await db.query(
        'INSERT INTO resultados_atletismo (prova_id, atleta_id, resultado_tempo, resultado_medida, posicao_final, pontos) VALUES (?, ?, ?, ?, ?, ?)',
        [provaId, atletaId, resultadoTempo, resultadoMedida, posicaoFinal, pontos]
      );
    }
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
            COUNT(DISTINCT ra.prova_id) AS provas_pontuadas
     FROM atletas a
     JOIN campus c ON c.id = a.campus_id
     JOIN atleta_modalidade am ON am.atleta_id = a.id
     JOIN modalidades m ON m.id = am.modalidade_id AND LOWER(m.nome) LIKE '%atletismo%'
     LEFT JOIN resultados_atletismo ra ON ra.atleta_id = a.id
       AND ra.prova_id IN (
         SELECT p.id FROM provas p
         JOIN modalidades mp ON mp.id = p.modalidade_id
         WHERE LOWER(mp.nome) LIKE '%atletismo%'
       )
     WHERE (? = '' OR UPPER(m.genero) = UPPER(?))
     GROUP BY c.id, campus_nome, c.foto_perfil
     ORDER BY pontos DESC, campus_nome ASC`,
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
  for (const r of resultados) {
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
  obterClassificacaoAtletismo,
  obterClassificacaoGeralCampi,
  obterResultadosXadrez,
  salvarResultadosXadrez,
  obterClassificacaoXadrez,
  ehEsporteIndividual,
  ehAtletismo,
  ehXadrez
};
