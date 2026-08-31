const db = require('../config/db');
const { ensureMataMataColumns } = require('../config/ensureSchema');
const { obterPadraoEliminatoria } = require('../utils/sportClassificationRules');
const { statusEfetivo } = require('../utils/jogoStatus');

const FASES_ORDEM = ['Oitavas', 'Quartas', 'Semifinal', 'Terceiro Lugar', 'Final'];
const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function letraChave(numeroChave) {
  return LETRAS[(Number(numeroChave) - 1) % LETRAS.length];
}

/**
 * Montador puro (sem banco) da árvore de eliminatória.
 * padrao: 'sequencial' | 'alternado'
 * Retorna { jogos: [{ numero, fase, rodada, rotuloCasa, rotuloFora }] }
 *
 * Rótulos: '1A'/'2C' = 1º/2º da chave; 'T1'/'T2' = melhor/segundo melhor terceiro;
 * 'V13' = vencedor do jogo 13; 'D17' = derrotado do jogo 17.
 * A numeração é local da eliminatória (começa em 1); o service soma o offset dos jogos de grupo.
 */
function montarEstruturaEliminatoria(padrao, quantidadeChaves) {
  const total = Number(quantidadeChaves);
  if (!Number.isInteger(total) || total < 2) {
    throw new Error('A eliminatória requer pelo menos 2 chaves.');
  }
  if (![2, 3, 4, 8].includes(total)) {
    throw new Error(`Quantidade de chaves não suportada (${total}). Formatos disponíveis: 2, 3 ou 4 chaves.`);
  }
  if (!['sequencial', 'alternado'].includes(padrao)) {
    throw new Error('Esta modalidade não possui padrão de eliminatória definido.');
  }

  const jogos = [];
  let rodadaAtual = 0;

  function criarJogo(fase, rotuloCasa, rotuloFora) {
    const numero = jogos.length + 1;
    const jogo = { numero, fase, rodada: rodadaAtual, rotuloCasa, rotuloFora };
    jogos.push(jogo);
    return jogo;
  }

  function primeiraRodada() {
    rodadaAtual += 1;
    if (total === 2) {
      return [
        criarJogo('Semifinal', '1A', '2B'),
        criarJogo('Semifinal', '1B', '2A')
      ];
    }
    if (total === 3) {
      return [
        criarJogo('Quartas', '1A', 'T2'),
        criarJogo('Quartas', '1C', '2A'),
        criarJogo('Quartas', '1B', 'T1'),
        criarJogo('Quartas', '2B', '2C')
      ];
    }
    const pares = total === 8
      ? (padrao === 'sequencial'
        ? [[1, 2], [3, 4], [5, 6], [7, 8]]
        : [[1, 3], [5, 7], [2, 4], [6, 8]])
      : (padrao === 'sequencial'
        ? [[1, 2], [3, 4]]
        : [[1, 3], [2, 4]]);

    const confrontos = [];
    for (const [chave1, chave2] of pares) {
      const l1 = letraChave(chave1);
      const l2 = letraChave(chave2);
      const fase = total === 8 ? 'Oitavas' : 'Quartas';
      confrontos.push(criarJogo(fase, `1${l1}`, `2${l2}`));
      confrontos.push(criarJogo(fase, `1${l2}`, `2${l1}`));
    }
    return confrontos;
  }

  let atual = primeiraRodada();
  let semis = null;

  const FASE_POR_QUANTIDADE = { 8: 'Oitavas', 4: 'Quartas', 2: 'Semifinal' };

  while (atual.length > 2) {
    rodadaAtual += 1;
    const faseProxima = FASE_POR_QUANTIDADE[atual.length / 2];
    const proxima = [];
    for (let i = 0; i < atual.length; i += 2) {
      proxima.push(criarJogo(faseProxima, `V${atual[i].numero}`, `V${atual[i + 1].numero}`));
    }
    atual = proxima;
  }

  semis = atual;

  rodadaAtual += 1;
  const disputaTerceiro = criarJogo('Terceiro Lugar', `D${semis[0].numero}`, `D${semis[1].numero}`);
  const finalJogo = criarJogo('Final', `V${semis[0].numero}`, `V${semis[1].numero}`);

  return {
    padrao,
    quantidadeChaves: total,
    jogos,
    resumo: {
      semifinais: [semis[0].numero, semis[1].numero],
      terceiroLugar: disputaTerceiro.numero,
      final: finalJogo.numero
    }
  };
}

function fasePertenceEliminatoria(fase) {
  return FASES_ORDEM.includes(String(fase || ''));
}

function interpretarRotulo(rotulo) {
  const texto = String(rotulo || '').trim().toUpperCase();
  let m = texto.match(/^([12])([A-Z])$/);
  if (m) return { tipo: 'chave', posicao: Number(m[1]), chave: m[2] };
  m = texto.match(/^T([12])$/);
  if (m) return { tipo: 'terceiro', ordem: Number(m[1]) };
  m = texto.match(/^[VD](\d+)$/);
  if (m) return { tipo: texto[0] === 'V' ? 'vencedor' : 'derrotado', numero: Number(m[1]) };
  return null;
}

async function classificarChaves(idModalidade, sub, colCasa, colFora) {
  const { getClassificacaoModalidade } = require('./classificacaoService');

  const [chaves] = await db.query(
    'SELECT id, numero_chave FROM chaves WHERE modalidade_id = ? AND sub_categoria = ? ORDER BY numero_chave ASC',
    [idModalidade, sub]
  );
  const resultado = new Map();
  for (const chave of chaves) {
    // Ordem IDÊNTICA à tabela de classificação exibida (regras de desempate do esporte).
    const linhas = await getClassificacaoModalidade(idModalidade, chave.id);
    const classificados = linhas
      .filter((l) => l.atleta_id || l.campus_id)
      .map((l) => Number(l.atleta_id || l.campus_id));
    const detalhes = linhas.map((l) => ({
      id: Number(l.atleta_id || l.campus_id),
      jogos: Number(l.jogos_jogados || 0),
      pontos: Number(l.pontos || 0),
      vitorias: Number(l.vitorias || 0),
      pro: Number(l.pontos_pro || 0),
      contra: Number(l.pontos_contra || 0),
      sets_ganhos: Number(l.sets_ganhos || 0),
      sets_perdidos: Number(l.sets_perdidos || 0)
    }));

    const [jogosChave] = await db.query(
      `SELECT j.${colCasa} AS id_casa, j.${colFora} AS id_fora, j.status
       FROM jogos j
       WHERE j.modalidade_id = ? AND j.sub_categoria = ? AND j.chave_id = ? AND j.fase = 'Fase de Grupos'`,
      [idModalidade, sub, chave.id]
    );
    let completa = jogosChave.length > 0;
    for (const jogo of jogosChave) {
      const casa = jogo.id_casa ? Number(jogo.id_casa) : null;
      const fora = jogo.id_fora ? Number(jogo.id_fora) : null;
      if (!casa || !fora || String(jogo.status) !== 'Encerrado') {
        completa = false;
        continue;
      }
    }
    resultado.set(chave.numero_chave, { classificados, completa, detalhes });
  }
  return resultado;
}

function vencedorEDerrotadoDoJogo(jogo, colCasa, colFora) {
  if (String(jogo.status) !== 'Encerrado') return null;

  if (jogo.wo) {
    const woVencedor = Number(jogo.vencedor_campus_id || jogo.vencedor_atleta_id);
    if (woVencedor) {
      const casaId = Number(jogo[colCasa]);
      const foraId = Number(jogo[colFora]);
      if (woVencedor === casaId) return { vencedor: casaId, perdedor: foraId };
      if (woVencedor === foraId) return { vencedor: foraId, perdedor: casaId };
    }
  }

  if (jogo.placar_1 == null || jogo.placar_2 == null) return null;
  const p1 = Number(jogo.placar_1);
  const p2 = Number(jogo.placar_2);
  let vencedor = null;
  if (p1 !== p2) {
    vencedor = p1 > p2 ? jogo[colCasa] : jogo[colFora];
  } else {
    const d1 = jogo.disputa_pontos_1;
    const d2 = jogo.disputa_pontos_2;
    if (d1 != null && d2 != null && Number(d1) !== Number(d2)) {
      vencedor = Number(d1) > Number(d2) ? jogo[colCasa] : jogo[colFora];
    }
  }
  if (vencedor == null) return null;
  const perdedor = vencedor === jogo[colCasa] ? jogo[colFora] : jogo[colCasa];
  return { vencedor, perdedor };
}

async function resolverEliminatoria(modalidadeId, subCategoria) {
  await ensureMataMataColumns();

  const idModalidade = Number(modalidadeId || 0);
  const sub = String(subCategoria || '').trim().toLowerCase() || 'geral';
  if (!idModalidade) return { preenchidos: 0 };

  const [modalRows] = await db.query('SELECT tipo_confronto FROM modalidades WHERE id = ?', [idModalidade]);
  if (!modalRows.length) return { preenchidos: 0 };
  const ehTipoIndividual = String(modalRows[0].tipo_confronto || '').toLowerCase() === 'individual';
  const ehIndividual = ehTipoIndividual && sub !== 'dupla';
  const colCasa = ehIndividual ? 'atleta_1_id' : 'campus_1_id';
  const colFora = ehIndividual ? 'atleta_2_id' : 'campus_2_id';

  const [jogos] = await db.query(
    `SELECT j.*, rc.placar_1 AS placar_1, rc.placar_2 AS placar_2
     FROM jogos j
     LEFT JOIN resultados_coletivos rc ON rc.jogo_id = j.id
     WHERE j.modalidade_id = ? AND j.sub_categoria = ?
       AND j.fase IN ('Oitavas', 'Quartas', 'Semifinal', 'Final', 'Terceiro Lugar')
     ORDER BY j.numero_jogo ASC`,
    [idModalidade, sub]
  );
  if (!jogos.length) return { preenchidos: 0 };

  const offset = Number(jogos[0].numero_jogo) - 1;
  const porNumeroLocal = new Map(jogos.map((j) => [Number(j.numero_jogo) - offset, j]));

  const chavesClassificadas = await classificarChaves(idModalidade, sub, colCasa, colFora);
  const todasCompletas = [...chavesClassificadas.values()].every((c) => c.completa) && chavesClassificadas.size > 0;

  let melhoresTerceiros = [];
  if (todasCompletas && chavesClassificadas.size >= 3) {
    melhoresTerceiros = [...chavesClassificadas.values()]
      .map((c) => c.detalhes[2])
      .filter(Boolean)
      .sort((a, b) =>
        b.pontos - a.pontos || b.vitorias - a.vitorias ||
        (b.pro - b.contra) - (a.pro - a.contra) || b.pro - a.pro || a.id - b.id
      )
      .map((s) => s.id);
  }

  function resolverRotulo(descritor) {
    if (!descritor) return null;
    if (descritor.tipo === 'chave') {
      const info = chavesClassificadas.get(descritor.chave.charCodeAt(0) - 64);
      return info ? (info.classificados[descritor.posicao - 1] ?? null) : null;
    }
    if (descritor.tipo === 'terceiro') {
      if (!todasCompletas) return null;
      return melhoresTerceiros[descritor.ordem - 1] ?? null;
    }
    const jogoRef = porNumeroLocal.get(descritor.numero);
    if (!jogoRef) return null;
    const desfecho = vencedorEDerrotadoDoJogo(jogoRef, colCasa, colFora);
    if (!desfecho) return null;
    return descritor.tipo === 'vencedor' ? desfecho.vencedor : desfecho.perdedor;
  }

  let preenchidos = 0;
  for (const jogo of jogos) {
    const descCasa = interpretarRotulo(jogo.rotulo_casa);
    const descFora = interpretarRotulo(jogo.rotulo_fora);
    if (!descCasa && !descFora) continue;

    const novoCasa = descCasa ? resolverRotulo(descCasa) : jogo[colCasa];
    const novoFora = descFora ? resolverRotulo(descFora) : jogo[colFora];
    if ((descCasa && novoCasa == null) || (descFora && novoFora == null)) continue;

    if (Number(jogo[colCasa]) !== Number(novoCasa) || Number(jogo[colFora]) !== Number(novoFora)) {
      await db.query(`UPDATE jogos SET ${colCasa} = ?, ${colFora} = ? WHERE id = ?`, [novoCasa, novoFora, jogo.id]);
      jogo[colCasa] = novoCasa;
      jogo[colFora] = novoFora;
      preenchidos += 1;
    }
  }

  return { preenchidos };
}

module.exports = {
  montarEstruturaEliminatoria,
  gerarEliminatoria,
  listarEliminatoria,
  fasePertenceEliminatoria,
  resolverEliminatoria,
  FASES_ORDEM
};

async function gerarEliminatoria(modalidadeId, subCategoria) {
  await ensureMataMataColumns();

  const idModalidade = Number(modalidadeId || 0);
  const sub = String(subCategoria || '').trim().toLowerCase() || 'geral';
  if (!idModalidade) {
    throw new Error('Modalidade não informada.');
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [modalidadeRows] = await conn.query('SELECT nome FROM modalidades WHERE id = ?', [idModalidade]);
    if (!modalidadeRows.length) {
      throw new Error('Modalidade não encontrada.');
    }
    const padrao = obterPadraoEliminatoria(modalidadeRows[0].nome, sub);
    if (!padrao) {
      throw new Error('Esta modalidade não possui eliminatória (atletismo e xadrez não participam).');
    }

    const [chaves] = await conn.query(
      'SELECT id, numero_chave FROM chaves WHERE modalidade_id = ? AND sub_categoria = ? ORDER BY numero_chave ASC',
      [idModalidade, sub]
    );
    if (chaves.length < 2) {
      throw new Error('São necessárias pelo menos 2 chaves definidas pelo sorteio antes de gerar a eliminatória.');
    }

    const [existentes] = await conn.query(
      `SELECT COUNT(*) AS total, COALESCE(SUM(status = 'Encerrado'), 0) AS encerrados
       FROM jogos
       WHERE modalidade_id = ? AND sub_categoria = ? AND fase IN ('Oitavas', 'Quartas', 'Semifinal', 'Final', 'Terceiro Lugar')`,
      [idModalidade, sub]
    );
    if (Number(existentes[0].encerrados) > 0) {
      throw new Error('Já existem jogos de eliminatória encerrados nesta modalidade. Cancele o sorteio para recomeçar.');
    }
    if (Number(existentes[0].total) > 0) {
      await conn.query(
        `DELETE FROM jogos WHERE modalidade_id = ? AND sub_categoria = ? AND fase IN ('Oitavas', 'Quartas', 'Semifinal', 'Final', 'Terceiro Lugar')`,
        [idModalidade, sub]
      );
    }

    const [grupos] = await conn.query(
      "SELECT COUNT(*) AS total FROM jogos WHERE modalidade_id = ? AND sub_categoria = ? AND fase = 'Fase de Grupos'",
      [idModalidade, sub]
    );
    const numeroInicial = Number(grupos[0].total) + 1;

    const estrutura = montarEstruturaEliminatoria(padrao, chaves.length);

    for (const jogo of estrutura.jogos) {
      await conn.query(
        `INSERT INTO jogos
           (modalidade_id, chave_id, fase, rodada,
            campus_1_id, campus_2_id, atleta_1_id, atleta_2_id,
            data_hora, local_jogo, status, publicado,
            sub_categoria, rotulo_casa, rotulo_fora, numero_jogo)
         VALUES (?, NULL, ?, ?, NULL, NULL, NULL, NULL, NULL, 'A definir', 'Agendado', 0, ?, ?, ?, ?)`,
        [idModalidade, jogo.fase, jogo.rodada, sub, jogo.rotuloCasa, jogo.rotuloFora, numeroInicial + jogo.numero - 1]
      );
    }

    await conn.commit();

    return {
      padrao: estrutura.padrao,
      quantidadeChaves: estrutura.quantidadeChaves,
      totalJogos: estrutura.jogos.length,
      numeroInicial,
      porFase: FASES_ORDEM
        .map((fase) => ({ fase, quantidade: estrutura.jogos.filter((j) => j.fase === fase).length }))
        .filter((item) => item.quantidade > 0)
    };
  } catch (error) {
    try { await conn.rollback(); } catch (_) { console.warn('Aviso: Falha no rollback em mataMataService:', _.message || _); }
    throw error;
  } finally {
    conn.release();
  }
}

async function listarEliminatoria(modalidadeId, subCategoria) {
  await ensureMataMataColumns();

  const idModalidade = Number(modalidadeId || 0);
  const sub = String(subCategoria || '').trim().toLowerCase() || 'geral';
  if (!idModalidade) return [];

  const [linhas] = await db.query(
    `SELECT j.*, 
            c1.nome AS campus_1_nome, c1.nome_exibicao AS campus_1_exibicao, c1.foto_perfil AS foto_casa,
            c2.nome AS campus_2_nome, c2.nome_exibicao AS campus_2_exibicao, c2.foto_perfil AS foto_fora,
            a1.nome AS atleta_1_nome, a2.nome AS atleta_2_nome,
            rc.placar_1, rc.placar_2
     FROM jogos j
     LEFT JOIN campus c1 ON c1.id = j.campus_1_id
     LEFT JOIN campus c2 ON c2.id = j.campus_2_id
     LEFT JOIN atletas a1 ON a1.id = j.atleta_1_id
     LEFT JOIN atletas a2 ON a2.id = j.atleta_2_id
     LEFT JOIN resultados_coletivos rc ON rc.jogo_id = j.id
     WHERE j.modalidade_id = ? AND j.sub_categoria = ?
       AND j.fase IN ('Oitavas', 'Quartas', 'Semifinal', 'Final', 'Terceiro Lugar')
     ORDER BY FIELD(j.fase, 'Oitavas', 'Quartas', 'Semifinal', 'Terceiro Lugar', 'Final'), j.numero_jogo ASC`,
    [idModalidade, sub]
  );

  const fases = [];
  for (const fase of FASES_ORDEM) {
    const jogosFase = linhas
      .filter((linha) => String(linha.fase) === fase)
      .map((linha) => ({
        ...linha,
        status: statusEfetivo(linha.status, linha.data_hora)
      }));
    if (jogosFase.length) {
      fases.push({ fase, jogos: jogosFase });
    }
  }
  return fases;
}
