require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const db = require('../config/db');
const { gerarResultadoDemonstrativo } = require('../utils/resultadoDemonstrativoJogo');

const APLICAR = process.argv.includes('--apply');

async function carregarJogos() {
  const [configuracoes] = await db.query(
    'SELECT ano_evento FROM configuracoes_evento ORDER BY id DESC LIMIT 1'
  );
  const ano = Number(configuracoes[0]?.ano_evento);
  if (ano !== 2026) throw new Error('A edição ativa não é 2026; nenhum resultado foi alterado.');

  const [jogos] = await db.query(
    `SELECT j.id, j.modalidade_id, j.fase, j.rodada, j.status,
            j.campus_1_id, j.campus_2_id, j.atleta_1_id, j.atleta_2_id,
            m.nome AS modalidade
     FROM jogos j
     JOIN modalidades m ON m.id = j.modalidade_id
     WHERE j.ano_evento = ?
     ORDER BY j.modalidade_id, j.fase, j.rodada, j.id`,
    [ano]
  );
  if (!jogos.length) throw new Error('Não há jogos existentes na edição 2026.');

  const [resultados] = await db.query(
    `SELECT j.id, j.fase, j.status,
            rc.jogo_id AS resultado_coletivo,
            (SELECT COUNT(*) FROM resultados_por_sets rps WHERE rps.jogo_id = j.id) AS total_sets
     FROM jogos j
     LEFT JOIN resultados_coletivos rc ON rc.jogo_id = j.id
     WHERE j.ano_evento = ?`,
    [ano]
  );

  const resultadosPorId = new Map(resultados.map((resultado) => [Number(resultado.id), resultado]));
  const finais = jogos.filter((jogo) => String(jogo.fase) === 'Final');
  const protegidos = finais.filter((jogo) => {
    const resultado = resultadosPorId.get(Number(jogo.id));
    return resultado.resultado_coletivo != null || Number(resultado.total_sets) > 0;
  });
  if (protegidos.length) {
    throw new Error(`${protegidos.length} finais já têm resultado; nenhum dado foi alterado.`);
  }

  const partidas = jogos.filter((jogo) => String(jogo.fase) !== 'Final');
  const jaComResultado = partidas.filter((jogo) => {
    const resultado = resultadosPorId.get(Number(jogo.id));
    return resultado.resultado_coletivo != null || Number(resultado.total_sets) > 0;
  });
  if (jaComResultado.length) {
    throw new Error(`${jaComResultado.length} jogos não finais já têm resultados; não vou sobrescrevê-los.`);
  }

  const naoAgendados = partidas.filter((jogo) => String(jogo.status) !== 'Agendado');
  if (naoAgendados.length) {
    throw new Error(`${naoAgendados.length} jogos não estão Agendados; nenhum resultado foi alterado.`);
  }

  return { ano, finais, jogos: partidas };
}

async function executar() {
  const { ano, finais, jogos } = await carregarJogos();
  const resultados = jogos.map((jogo) => ({
    jogo,
    resultado: gerarResultadoDemonstrativo(jogo)
  }));
  if (resultados.some(({ resultado }) => !resultado)) {
    throw new Error('A lista de resultados incluiu uma final; nenhum resultado foi alterado.');
  }

  console.log(`Jogos existentes com resultados a preencher: ${resultados.length}`);
  console.log(`Finais mantidas sem resultado: ${finais.length}`);
  console.log('Nenhum jogo será criado ou removido.');
  if (!APLICAR) {
    console.log('Prévia concluída. Use --apply para gravar os resultados.');
    return;
  }

  await db.withTransaction(async () => {
    for (const { jogo, resultado } of resultados) {
      const [insercao] = await db.query(
        'INSERT INTO resultados_coletivos (jogo_id, placar_1, placar_2) VALUES (?, ?, ?)',
        [jogo.id, resultado.placar1, resultado.placar2]
      );
      if (insercao.affectedRows !== 1) {
        throw new Error(`Não foi possível registrar o placar do jogo ${jogo.id}; a transação será revertida.`);
      }

      for (const set of resultado.sets) {
        await db.query(
          'INSERT INTO resultados_por_sets (jogo_id, numero_set, pontos_1, pontos_2) VALUES (?, ?, ?, ?)',
          [jogo.id, set.numero, set.pontos_1, set.pontos_2]
        );
      }

      const individual = Boolean(jogo.atleta_1_id && jogo.atleta_2_id);
      const vencedor = resultado.vencedorLado == null
        ? null
        : individual
          ? resultado.vencedorLado === 1 ? jogo.atleta_1_id : jogo.atleta_2_id
          : resultado.vencedorLado === 1 ? jogo.campus_1_id : jogo.campus_2_id;
      const colunaVencedor = individual ? 'vencedor_atleta_id' : 'vencedor_campus_id';
      const [atualizacao] = await db.query(
        `UPDATE jogos
         SET status = 'Encerrado', wo = 0, ${colunaVencedor} = ?
         WHERE id = ? AND ano_evento = ? AND fase <> 'Final' AND status = 'Agendado'`,
        [vencedor, jogo.id, ano]
      );
      if (atualizacao.affectedRows !== 1) {
        throw new Error(`O jogo ${jogo.id} não pôde ser encerrado; a transação será revertida.`);
      }
    }
  });

  console.log(`Resultados gravados em ${resultados.length} jogos existentes; ${finais.length} finais continuam sem resultado.`);
}

executar()
  .catch((error) => {
    console.error(`Falha ao preencher resultados: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => db.end());
