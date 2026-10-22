const db = require('../config/db');
const { filtroAnoEvento } = require('../config/edicaoAtual');

/**
 * Um jogo 'Cancelado' é terminal: ele não impede o encerramento do JIFC.
 * Só bloqueia o encerramento se TODOS os jogos foram cancelados (não houve
 * evento) ou se ainda existe jogo pendente (Agendado / Em Andamento).
 */
function detectarEncerramentoJifc({ totalJogos = 0, totalEncerrados = 0, totalAgendados = 0, totalEmAndamento = 0, totalCancelados = 0, totalPendentes = null } = {}) {
  const total = Number(totalJogos || 0);
  const encerrados = Number(totalEncerrados || 0);
  const agendados = Number(totalAgendados || 0);
  const emAndamento = Number(totalEmAndamento || 0);
  const cancelados = Number(totalCancelados || 0);
  const pendentes = totalPendentes === null || totalPendentes === undefined
    ? agendados + emAndamento
    : Number(totalPendentes || 0);

  if (!total) return false;
  if (cancelados >= total) return false;

  return encerrados + cancelados === total && pendentes === 0;
}

async function obterStatusJifc() {
  const [linhas] = await db.query(`
    SELECT
      COUNT(*) AS total_jogos,
      SUM(CASE WHEN status = 'Encerrado' THEN 1 ELSE 0 END) AS total_encerrados,
      SUM(CASE WHEN status = 'Agendado' THEN 1 ELSE 0 END) AS total_agendados,
      SUM(CASE WHEN status = 'Em Andamento' THEN 1 ELSE 0 END) AS total_em_andamento,
      SUM(CASE WHEN status = 'Cancelado' THEN 1 ELSE 0 END) AS total_cancelados,
      SUM(CASE WHEN status IS NULL OR status NOT IN ('Encerrado', 'Cancelado') THEN 1 ELSE 0 END) AS total_pendentes
    FROM jogos
    WHERE ${await filtroAnoEvento()}
  `);

  const dados = linhas[0] || {};
  const encerrado = detectarEncerramentoJifc({
    totalJogos: Number(dados.total_jogos || 0),
    totalEncerrados: Number(dados.total_encerrados || 0),
    totalAgendados: Number(dados.total_agendados || 0),
    totalEmAndamento: Number(dados.total_em_andamento || 0),
    totalCancelados: Number(dados.total_cancelados || 0),
    totalPendentes: Number(dados.total_pendentes || 0)
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

function resolverVencedorFinal(final) {
  const campus1 = Number(final.campus_1_id || final.atleta_1_campus_id || 0);
  const campus2 = Number(final.campus_2_id || final.atleta_2_campus_id || 0);
  if (!campus1 || !campus2) return null;

  let vencedor = Number(final.vencedor_campus_id || 0);
  if (!vencedor && Number(final.vencedor_atleta_id || 0)) {
    if (Number(final.vencedor_atleta_id) === Number(final.atleta_1_id)) vencedor = Number(final.atleta_1_campus_id || 0);
    if (Number(final.vencedor_atleta_id) === Number(final.atleta_2_id)) vencedor = Number(final.atleta_2_campus_id || 0);
  }
  if (vencedor === campus1) return { campeao: final.campus_1, vice: final.campus_2 };
  if (vencedor === campus2) return { campeao: final.campus_2, vice: final.campus_1 };

  const placar1 = Number(final.placar_1);
  const placar2 = Number(final.placar_2);
  if (Number.isFinite(placar1) && Number.isFinite(placar2) && placar1 !== placar2) {
    return placar1 > placar2
      ? { campeao: final.campus_1, vice: final.campus_2 }
      : { campeao: final.campus_2, vice: final.campus_1 };
  }

  const disputa1 = Number(final.disputa_pontos_1);
  const disputa2 = Number(final.disputa_pontos_2);
  if (Number.isFinite(disputa1) && Number.isFinite(disputa2) && disputa1 !== disputa2) {
    return disputa1 > disputa2
      ? { campeao: final.campus_1, vice: final.campus_2 }
      : { campeao: final.campus_2, vice: final.campus_1 };
  }
  return null;
}

function aplicarFinaisAoBoletim(modalidades = [], finais = []) {
  const finaisPorModalidade = new Map();
  for (const final of finais) {
    if (String(final.status || '') !== 'Encerrado') continue;
    const podio = resolverVencedorFinal(final);
    if (!podio) continue;
    const modalidadeId = Number(final.modalidade_id);
    if (!finaisPorModalidade.has(modalidadeId)) finaisPorModalidade.set(modalidadeId, []);
    finaisPorModalidade.get(modalidadeId).push({ ...final, ...podio });
  }

  const modalidadesComFinal = new Set(finaisPorModalidade.keys());
  const resultado = modalidades
    .filter((modalidade) => !modalidadesComFinal.has(Number(modalidade.modalidade_id)))
    .map((modalidade) => ({ ...modalidade }));

  for (const [modalidadeId, podios] of finaisPorModalidade) {
    for (const podio of podios) {
      const base = modalidades.find((modalidade) => Number(modalidade.modalidade_id) === modalidadeId);
      const subCategoria = String(podio.sub_categoria || '').trim();
      const multiplasFinais = podios.length > 1;
      resultado.push({
        modalidade_id: modalidadeId,
        modalidade: base?.modalidade || podio.modalidade,
        nome: (base?.modalidade || podio.modalidade || 'Modalidade')
          + (multiplasFinais && subCategoria ? ` (${subCategoria})` : ''),
        campeao: podio.campeao || '—',
        vice: podio.vice || '—'
      });
    }
  }
  return resultado;
}

function aplicarPodiosIndividuais(modalidades = [], classificacoes = {}) {
  return modalidades.map((modalidade) => {
    const nome = String(modalidade.modalidade || modalidade.nome || '').toLowerCase();
    let ranking = [];
    if (nome.includes('atletismo')) {
      ranking = classificacoes.atletismoPorGenero?.[String(modalidade.genero || '').toLowerCase()] || [];
    } else if (nome.includes('xadrez')) {
      ranking = classificacoes.xadrezPorModalidade?.[Number(modalidade.modalidade_id)] || [];
    } else {
      return modalidade;
    }

    const classificados = ranking.filter((item) => Number(item.pontos || 0) > 0);
    if (!classificados.length) return modalidade;
    return {
      ...modalidade,
      campeao: classificados[0].campus_nome || classificados[0].campus || modalidade.campeao || '—',
      vice: classificados[1]?.campus_nome || classificados[1]?.campus || modalidade.vice || '—'
    };
  });
}

async function aplicarClassificacoesIndividuaisAoBoletim(modalidades = []) {
  const resultadosIndividuais = require('./resultadosIndividuaisService');
  const atletismoPorGenero = new Map();
  const xadrezPorModalidade = new Map();

  for (const modalidade of modalidades) {
    const nome = String(modalidade.modalidade || modalidade.nome || '').toLowerCase();
    if (nome.includes('atletismo')) {
      const genero = String(modalidade.genero || '').trim();
      const chaveGenero = genero.toLowerCase();
      if (!atletismoPorGenero.has(chaveGenero)) {
        atletismoPorGenero.set(chaveGenero, await resultadosIndividuais.obterClassificacaoGeralCampi(genero));
      }
    } else if (nome.includes('xadrez')) {
      const modalidadeId = Number(modalidade.modalidade_id);
      xadrezPorModalidade.set(modalidadeId, await resultadosIndividuais.obterClassificacaoGeralXadrez(modalidadeId));
    }
  }

  return aplicarPodiosIndividuais(modalidades, {
    atletismoPorGenero: Object.fromEntries(atletismoPorGenero),
    xadrezPorModalidade: Object.fromEntries(xadrezPorModalidade)
  });
}

async function obterResultadosFinaisModalidades() {
  const [rows] = await db.query(`
    SELECT j.modalidade_id, j.sub_categoria, j.status,
           j.campus_1_id, j.campus_2_id, j.atleta_1_id, j.atleta_2_id,
           j.vencedor_campus_id, j.vencedor_atleta_id,
           j.disputa_pontos_1, j.disputa_pontos_2,
           rc.placar_1, rc.placar_2,
           c1.nome_exibicao AS campus_1, c2.nome_exibicao AS campus_2,
           a1.campus_id AS atleta_1_campus_id, a2.campus_id AS atleta_2_campus_id,
           m.nome AS modalidade
    FROM jogos j
    JOIN modalidades m ON m.id = j.modalidade_id
    LEFT JOIN resultados_coletivos rc ON rc.jogo_id = j.id
    LEFT JOIN atletas a1 ON a1.id = j.atleta_1_id
    LEFT JOIN atletas a2 ON a2.id = j.atleta_2_id
    LEFT JOIN campus c1 ON c1.id = COALESCE(j.campus_1_id, a1.campus_id)
    LEFT JOIN campus c2 ON c2.id = COALESCE(j.campus_2_id, a2.campus_id)
    WHERE j.fase = 'Final' AND j.status = 'Encerrado'
    ORDER BY j.modalidade_id, j.sub_categoria, j.numero_jogo
  `);
  return rows || [];
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

async function montarSnapshotCompleto(ano) {
  try {
    const edicaoService = require('./edicaoService');
    const capturar = edicaoService.capturarEdicaoAtual;
    if (typeof capturar === 'function') {
      const dados = await capturar(ano, { incluirNaoPublicados: true });
      if (dados && typeof dados === 'object') {
        return dados;
      }
    }
  } catch (error) {
    console.error('Aviso: não foi possível montar o snapshot completo do boletim:', error.message);
  }
  return null;
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
    SELECT m.id AS modalidade_id,
           m.nome AS modalidade,
           m.genero,
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

  const finaisRows = await obterResultadosFinaisModalidades();

  const podiosComFinais = aplicarFinaisAoBoletim(modalidadesRows || [], finaisRows);
  const podiosFinais = await aplicarClassificacoesIndividuaisAoBoletim(podiosComFinais);
  const resumo = montarResumoBoletim({
    ano,
    ranking: (rankingRows || []).map((row, index) => ({
      posicao: index + 1,
      campi: row.campus || 'Campus sem nome',
      pontos: Number(row.pontos || 0)
    })),
    modalidades: podiosFinais.map((row) => ({
      nome: row.nome || row.modalidade || 'Modalidade',
      campeao: row.campeao || '—',
      vice: row.vice || '—'
    })),
    dataGeracao: new Date().toISOString().slice(0, 10)
  });

  const snapshotCompleto = await montarSnapshotCompleto(ano);
  const completoJson = snapshotCompleto ? JSON.stringify(snapshotCompleto) : null;

  const [existente] = await db.query('SELECT id FROM boletins_finais WHERE ano_jifc = ?', [ano]);
  if (existente && existente.length) {
    await db.query(
      `UPDATE boletins_finais
       SET resumo_json = ?, modalidades_json = ?, ranking_json = ?, completo_json = ?, atualizado_em = NOW()
       WHERE ano_jifc = ?`,
      [JSON.stringify(resumo), JSON.stringify(resumo.modalidades), JSON.stringify(resumo.ranking), completoJson, ano]
    );
    return { ...resumo, id: existente[0].id, atualizado: true, completo: Boolean(snapshotCompleto) };
  }

  const [resultado] = await db.query(
    `INSERT INTO boletins_finais
      (ano_jifc, resumo_json, modalidades_json, ranking_json, completo_json, criado_em)
     VALUES (?, ?, ?, ?, ?, NOW())`,
    [ano, JSON.stringify(resumo), JSON.stringify(resumo.modalidades), JSON.stringify(resumo.ranking), completoJson]
  );

  return { ...resumo, id: resultado.insertId, atualizado: false, completo: Boolean(snapshotCompleto) };
}

function parseJsonSeguro(valor, fallback) {
  if (valor === null || valor === undefined || valor === '') return fallback;
  if (typeof valor === 'object') return valor;
  try {
    return JSON.parse(valor);
  } catch (_) {
    return fallback;
  }
}

async function obterBoletimCompleto(anoJifc) {
  const ano = Number(anoJifc || 0);
  if (!ano) return null;

  const boletim = await obterBoletimPorAno(ano);
  if (!boletim) return null;

  const resumo = parseJsonSeguro(boletim.resumo_json, { ano, ranking: [], modalidades: [], dataGeracao: null });
  const ranking = parseJsonSeguro(boletim.ranking_json, resumo.ranking || []);
  const modalidades = parseJsonSeguro(boletim.modalidades_json, resumo.modalidades || []);
  const completo = parseJsonSeguro(boletim.completo_json, null);

  return {
    boletim,
    ano,
    resumo,
    ranking,
    modalidades,
    completo,
    temCompleto: Boolean(completo)
  };
}

async function listarAnosComBoletim() {
  const [linhas] = await db.query(`
    SELECT ano_jifc, criado_em, atualizado_em
    FROM boletins_finais
    ORDER BY ano_jifc DESC
  `);
  return linhas || [];
}

module.exports = {
  detectarEncerramentoJifc,
  obterStatusJifc,
  montarResumoBoletim,
  montarSnapshotCompleto,
  aplicarFinaisAoBoletim,
  aplicarPodiosIndividuais,
  aplicarClassificacoesIndividuaisAoBoletim,
  obterResultadosFinaisModalidades,
  listarBoletins,
  obterBoletimPorAno,
  obterBoletimCompleto,
  listarAnosComBoletim,
  gerarBoletimFinal
};
