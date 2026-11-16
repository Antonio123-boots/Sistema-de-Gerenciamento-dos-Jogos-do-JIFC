require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const db = require('../config/db');
const { montarAgenda } = require('../utils/agendaJogosJifc');

const APLICAR = process.argv.includes('--apply');

function dataIso(valor) {
  return String(valor || '').slice(0, 10);
}

function imprimirResumo(jogos, agenda) {
  const porDia = new Map();
  const porLocal = new Map();
  agenda.forEach((item) => {
    porDia.set(item.data, (porDia.get(item.data) || 0) + 1);
    porLocal.set(item.local, (porLocal.get(item.local) || 0) + 1);
  });

  console.log(`Jogos existentes selecionados: ${jogos.length}`);
  console.log('Nenhum jogo será criado ou removido.');
  console.log('Distribuição por dia:');
  porDia.forEach((quantidade, dia) => console.log(`  ${dia}: ${quantidade} jogos`));
  console.log('Distribuição por local:');
  porLocal.forEach((quantidade, local) => console.log(`  ${local}: ${quantidade} jogos`));
}

async function executar() {
  const [configuracoes] = await db.query(
    `SELECT ano_evento, DATE_FORMAT(inicio_evento, '%Y-%m-%d') AS inicio,
            DATE_FORMAT(fim_evento, '%Y-%m-%d') AS fim
     FROM configuracoes_evento ORDER BY id DESC LIMIT 1`
  );
  const configuracao = configuracoes[0];
  if (!configuracao
      || Number(configuracao.ano_evento) !== 2026
      || dataIso(configuracao.inicio) !== '2026-11-30'
      || dataIso(configuracao.fim) !== '2026-12-02') {
    throw new Error('A edição ativa não corresponde ao JIFC de 30/11/2026 a 02/12/2026; nenhum jogo foi alterado.');
  }

  const [jogos] = await db.query(
    `SELECT j.id, j.modalidade_id, j.fase, j.rodada, j.status,
            j.campus_1_id, j.campus_2_id, j.atleta_1_id, j.atleta_2_id,
            m.nome AS modalidade, m.genero
     FROM jogos j
     JOIN modalidades m ON m.id = j.modalidade_id
     WHERE j.ano_evento = ?
     ORDER BY j.modalidade_id, j.fase, j.rodada, j.id`,
    [Number(configuracao.ano_evento)]
  );
  if (!jogos.length) throw new Error('Não há confrontos existentes nesta edição.');

  const naoAgendados = jogos.filter((jogo) => String(jogo.status || '') !== 'Agendado');
  if (naoAgendados.length) {
    throw new Error(`${naoAgendados.length} jogos não estão com status Agendado; para proteger resultados, nenhum jogo foi alterado.`);
  }

  const [resultados] = await db.query(
    `SELECT COUNT(DISTINCT j.id) AS total
     FROM jogos j
     LEFT JOIN resultados_coletivos rc ON rc.jogo_id = j.id
     WHERE j.ano_evento = ?
       AND (rc.jogo_id IS NOT NULL
            OR EXISTS (SELECT 1 FROM resultados_por_sets rps WHERE rps.jogo_id = j.id)
            OR j.vencedor_campus_id IS NOT NULL OR j.vencedor_atleta_id IS NOT NULL)`,
    [Number(configuracao.ano_evento)]
  );
  if (Number(resultados[0]?.total || 0) > 0) {
    throw new Error('Há jogos com resultados nesta edição; para preservar os resultados, nenhum jogo foi alterado.');
  }

  const agenda = montarAgenda(jogos);
  const idsSelecionados = new Set(jogos.map((jogo) => Number(jogo.id)));
  const idsAgendados = new Set(agenda.map((jogo) => Number(jogo.id)));
  if (idsSelecionados.size !== idsAgendados.size
      || [...idsSelecionados].some((id) => !idsAgendados.has(id))) {
    throw new Error('A agenda não contém exatamente os jogos existentes; nenhum jogo foi alterado.');
  }

  imprimirResumo(jogos, agenda);
  if (!APLICAR) {
    console.log('Prévia concluída. Use --apply para atualizar somente data, horário e local.');
    return;
  }

  await db.withTransaction(async () => {
    for (const item of agenda) {
      const dataHora = `${item.data} ${item.horario}`;
      const [resultado] = await db.query(
        `UPDATE jogos SET data_hora = ?, local_jogo = ?
         WHERE id = ? AND ano_evento = ? AND status = 'Agendado'`,
        [dataHora, item.local, item.id, Number(configuracao.ano_evento)]
      );
      if (resultado.affectedRows !== 1) {
        const [confirmacao] = await db.query(
          `SELECT 1 FROM jogos
           WHERE id = ? AND ano_evento = ? AND status = 'Agendado'
             AND data_hora = ? AND local_jogo = ?
           LIMIT 1`,
          [item.id, Number(configuracao.ano_evento), dataHora, item.local]
        );
        if (!confirmacao.length) {
          throw new Error(`O jogo ${item.id} não pôde ser atualizado com segurança; a transação será revertida.`);
        }
      }
    }
  });

  console.log(`Agenda aplicada a ${agenda.length} jogos existentes. Nenhum confronto foi criado ou removido.`);
}

executar()
  .catch((error) => {
    console.error(`Falha ao agendar os jogos: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => db.end());
