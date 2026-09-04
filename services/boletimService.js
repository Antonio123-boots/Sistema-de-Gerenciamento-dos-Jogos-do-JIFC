const db = require('../config/db');

function detectarEncerramentoJifc({ totalJogos = 0, totalEncerrados = 0, totalAgendados = 0, totalEmAndamento = 0, totalCancelados = 0 } = {}) {
  const total = Number(totalJogos || 0);
  const encerrados = Number(totalEncerrados || 0);
  const agendados = Number(totalAgendados || 0);
  const emAndamento = Number(totalEmAndamento || 0);
  const cancelados = Number(totalCancelados || 0);

  if (!total) return false;
  if (cancelados >= total) return false;

  return encerrados === total && agendados === 0 && emAndamento === 0;
}

async function obterStatusJifc() {
  const [linhas] = await db.query(`
    SELECT
      COUNT(*) AS total_jogos,
      SUM(CASE WHEN status = 'Encerrado' THEN 1 ELSE 0 END) AS total_encerrados,
      SUM(CASE WHEN status = 'Agendado' THEN 1 ELSE 0 END) AS total_agendados,
      SUM(CASE WHEN status = 'Em Andamento' THEN 1 ELSE 0 END) AS total_em_andamento,
      SUM(CASE WHEN status = 'Cancelado' THEN 1 ELSE 0 END) AS total_cancelados
    FROM jogos
  `);

  const dados = linhas[0] || {};
  const encerrado = detectarEncerramentoJifc({
    totalJogos: Number(dados.total_jogos || 0),
    totalEncerrados: Number(dados.total_encerrados || 0),
    totalAgendados: Number(dados.total_agendados || 0),
    totalEmAndamento: Number(dados.total_em_andamento || 0),
    totalCancelados: Number(dados.total_cancelados || 0)
  });

  return {
    totalJogos: Number(dados.total_jogos || 0),
    totalEncerrados: Number(dados.total_encerrados || 0),
    totalAgendados: Number(dados.total_agendados || 0),
    totalEmAndamento: Number(dados.total_em_andamento || 0),
    totalCancelados: Number(dados.total_cancelados || 0),
    encerrado
  };
}

function montarResumoBoletim({ ano, ranking = [], modalidades = [], dataGeracao = new Date().toISOString().slice(0, 10) } = {}) {
  return {
    ano: Number(ano || new Date().getFullYear()),
    ranking: Array.isArray(ranking) ? ranking : [],
    modalidades: Array.isArray(modalidades) ? modalidades : [],
    dataGeracao
  };
}

async function listarBoletins() {
  const [linhas] = await db.query(`
    SELECT *
    FROM boletins_finais
    ORDER BY ano_jifc DESC, criado_em DESC
  `);

  return linhas || [];
}

async function obterBoletimPorAno(anoJifc) {
  const ano = Number(anoJifc || 0);
  if (!ano) return null;

  const [linhas] = await db.query(`
    SELECT *
    FROM boletins_finais
    WHERE ano_jifc = ?
    ORDER BY criado_em DESC
    LIMIT 1
  `, [ano]);

  return linhas[0] || null;
}

async function gerarBoletimFinal(anoJifc) {
  const ano = Number(anoJifc || new Date().getFullYear());
  const statusJifc = await obterStatusJifc();

  if (!statusJifc.encerrado) {
    throw new Error('Não é possível gerar o boletim final enquanto o JIFC não estiver encerrado.');
  }

  const [rankingRows] = await db.query(`
    SELECT
      c.nome_exibicao AS campus,
      COALESCE(SUM(cg.pontos), 0) AS pontos
    FROM campus c
    LEFT JOIN classificacao_grupos cg ON cg.campus_id = c.id
    GROUP BY c.id, c.nome_exibicao
    ORDER BY pontos DESC, c.nome_exibicao ASC
  `);

  const [modalidadesRows] = await db.query(`
    SELECT m.nome AS modalidade,
           c.nome_exibicao AS campeao,
           c2.nome_exibicao AS vice
    FROM modalidades m
    LEFT JOIN classificacao_grupos cg ON cg.modalidade_id = m.id AND cg.pontos = (
      SELECT MAX(cg2.pontos)
      FROM classificacao_grupos cg2
      WHERE cg2.modalidade_id = m.id
      LIMIT 1
    )
    LEFT JOIN campus c ON c.id = cg.campus_id
    LEFT JOIN classificacao_grupos cg3 ON cg3.modalidade_id = m.id AND cg3.pontos = (
      SELECT MAX(cg4.pontos)
      FROM classificacao_grupos cg4
      WHERE cg4.modalidade_id = m.id AND cg4.id <> cg.id
      LIMIT 1
    )
    LEFT JOIN campus c2 ON c2.id = cg3.campus_id
    GROUP BY m.id, m.nome, c.nome_exibicao, c2.nome_exibicao
    ORDER BY m.nome ASC
  `);

  const resumo = montarResumoBoletim({
    ano,
    ranking: (rankingRows || []).map((row, index) => ({
      posicao: index + 1,
      campi: row.campus || 'Campus sem nome',
      pontos: Number(row.pontos || 0)
    })),
    modalidades: (modalidadesRows || []).map((row) => ({
      nome: row.modalidade || 'Modalidade',
      campeao: row.campeao || '—',
      vice: row.vice || '—'
    })),
    dataGeracao: new Date().toISOString().slice(0, 10)
  });

  const [existente] = await db.query('SELECT id FROM boletins_finais WHERE ano_jifc = ?', [ano]);
  if (existente && existente.length) {
    await db.query(
      `UPDATE boletins_finais
       SET resumo_json = ?, modalidades_json = ?, ranking_json = ?, atualizado_em = NOW()
       WHERE ano_jifc = ?`,
      [JSON.stringify(resumo), JSON.stringify(resumo.modalidades), JSON.stringify(resumo.ranking), ano]
    );
    return { ...resumo, id: existente[0].id, atualizado: true };
  }

  const [resultado] = await db.query(
    `INSERT INTO boletins_finais
      (ano_jifc, resumo_json, modalidades_json, ranking_json, criado_em)
     VALUES (?, ?, ?, ?, NOW())`,
    [ano, JSON.stringify(resumo), JSON.stringify(resumo.modalidades), JSON.stringify(resumo.ranking)]
  );

  return { ...resumo, id: resultado.insertId, atualizado: false };
}

module.exports = {
  detectarEncerramentoJifc,
  obterStatusJifc,
  montarResumoBoletim,
  listarBoletins,
  obterBoletimPorAno,
  gerarBoletimFinal
};
