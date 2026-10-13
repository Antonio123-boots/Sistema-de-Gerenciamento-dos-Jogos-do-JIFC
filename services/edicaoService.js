const db = require('../config/db');
const boletimService = require('./boletimService');
const resultadosIndividuaisService = require('./resultadosIndividuaisService');
const modalidadeService = require('./modalidadeService');
const jogoService = require('./jogoService');

const FORMATO_VERSAO = 1;

function obterBaseNome(nome) {
  return String(nome || '')
    .trim()
    .replace(/\s+(masculino|feminino)$/i, '')
    .trim();
}

function cidadeDe(nome) {
  return String(nome || 'Campus').replace(/^IFC\s+/i, '').trim();
}

async function capturarCampi() {
  const [rows] = await db.query(
    'SELECT id, nome, nome_exibicao, slug, cor, cidade, foto_perfil FROM campus ORDER BY nome ASC'
  );
  return (rows || []).map((c) => ({
    id: c.id,
    nome: c.nome,
    nomeExibicao: c.nome_exibicao || c.nome,
    slug: c.slug || null,
    cor: c.cor || null,
    cidade: c.cidade || null,
    foto: c.foto_perfil || null
  }));
}

async function capturarModalidades() {
  const lista = await modalidadeService.getModalidadesBanco();
  return (Array.isArray(lista) ? lista : []).map((m) => ({
    id: m.id,
    nome: String(m.nome || '').trim(),
    base: obterBaseNome(m.nome),
    genero: String(m.genero || '').trim(),
    tipoConfronto: String(m.tipo_confronto || '').trim() || 'Coletivo',
    formatoDisputa: String(m.formato_disputa || '').trim(),
    icone: String(m.icone || m.imagem || '').trim() || null
  }));
}

async function capturarChaves() {
  const [rows] = await db.query('SELECT id, modalidade_id, numero_chave, nome_chave, sub_categoria FROM chaves');
  return (rows || []).map((c) => ({
    id: c.id,
    modalidadeId: c.modalidade_id,
    numeroChave: c.numero_chave,
    nomeChave: c.nome_chave,
    subCategoria: c.sub_categoria || 'geral'
  }));
}

async function capturarGrupos() {
  const [rows] = await db.query(`
    SELECT cg.id, cg.modalidade_id, cg.chave_id, cg.campus_id, cg.atleta_id,
           cg.pontos, cg.jogos_jogados, cg.vitorias, cg.empates, cg.derrotas,
           cg.pontos_pro, cg.pontos_contra, cg.saldo_pontuacao,
           cg.cartoes_amarelos, cg.cartoes_vermelhos, cg.sets_ganhos, cg.sets_perdidos,
           c.nome_exibicao AS campus_nome, a.nome AS atleta_nome
    FROM classificacao_grupos cg
    LEFT JOIN campus c ON cg.campus_id = c.id
    LEFT JOIN atletas a ON cg.atleta_id = a.id
    ORDER BY cg.modalidade_id ASC, cg.chave_id ASC, cg.pontos DESC, cg.vitorias DESC
  `);

  const chaves = await capturarChaves();
  const mapaChaves = new Map(chaves.map((c) => [c.id, c.nomeChave]));

  return (rows || []).map((g) => ({
    modalidadeId: g.modalidade_id,
    chaveId: g.chave_id || null,
    grupo: g.chave_id ? (mapaChaves.get(g.chave_id) || null) : null,
    campusId: g.campus_id || null,
    campus: g.campus_nome || null,
    atletaId: g.atleta_id || null,
    atleta: g.atleta_nome || null,
    pontos: Number(g.pontos || 0),
    jogosJogados: Number(g.jogos_jogados || 0),
    vitorias: Number(g.vitorias || 0),
    empates: Number(g.empates || 0),
    derrotas: Number(g.derrotas || 0),
    pontosPro: Number(g.pontos_pro || 0),
    pontosContra: Number(g.pontos_contra || 0),
    saldo: Number(g.saldo_pontuacao || 0),
    cartoesAmarelos: Number(g.cartoes_amarelos || 0),
    cartoesVermelhos: Number(g.cartoes_vermelhos || 0),
    setsGanhos: Number(g.sets_ganhos || 0),
    setsPerdidos: Number(g.sets_perdidos || 0)
  }));
}

async function capturarJogos() {
  const jogosBrutos = await jogoService.getJogosPublicados({});
  if (!Array.isArray(jogosBrutos) || !jogosBrutos.length) return [];

  const ids = jogosBrutos.map((j) => j.id);
  const marcas = Array(ids.length).fill('?').join(',');
  const [extraRows] = await db.query(
    `SELECT id, modalidade_id, chave_id, numero_jogo, vencedor_campus_id, sub_categoria
     FROM jogos
     WHERE id IN (${marcas})`,
    ids
  );
  const extra = new Map((extraRows || []).map((e) => [e.id, e]));

  const chaves = await capturarChaves();
  const mapaChaves = new Map(chaves.map((c) => [c.id, c.nomeChave]));

  return jogosBrutos.map((j) => {
    const ex = extra.get(j.id) || {};
    const tipoConfronto = String(j.tipo_confronto || 'Coletivo');
    const rotuloCasa = String(j.rotuloCasa || j.rotulo_casa || '').trim() || null;
    const rotuloFora = String(j.rotuloFora || j.rotulo_fora || '').trim() || null;
    return {
      id: j.id,
      modalidadeId: ex.modalidade_id,
      modalidade: String(j.modalidade || '').trim(),
      genero: String(j.genero || '').trim(),
      tipoConfronto,
      tipoIndividual: tipoConfronto === 'Individual',
      fase: String(j.fase || '').trim(),
      rodada: Number(j.rodada || 0),
      chaveId: ex.chave_id || null,
      chave: ex.chave_id ? (mapaChaves.get(ex.chave_id) || null) : null,
      subCategoria: String(j.subCategoria || ex.sub_categoria || 'geral').trim(),
      data: String(j.data || '').trim(),
      horario: String(j.horario || '').trim(),
      local: String(j.local_jogo || '').trim(),
      status: String(j.status || '').trim(),
      publicado: 1,
      wo: Boolean(j.wo),
      numeroJogo: ex.numero_jogo || null,
      casaId: j.campus_1_id || null,
      casa: String(j.casa || rotuloCasa || '').trim() || null,
      foraId: j.campus_2_id || null,
      fora: String(j.fora || rotuloFora || '').trim() || null,
      atletaCasa: j.atletaCasa || null,
      atletaFora: j.atletaFora || null,
      placarCasa: Number(j.placar_casa || 0),
      placarFora: Number(j.placar_fora || 0),
      sets: Array.isArray(j.sets) ? j.sets.map((s) => ({ numero: s.numero, pontosCasa: s.pontos_1, pontosFora: s.pontos_2 })) : [],
      vencedorCampus: j.vencedor_campus_id || null,
      rotuloCasa,
      rotuloFora,
      disputaPontos1: j.disputa_pontos_1,
      disputaPontos2: j.disputa_pontos_2,
      cancelado: Boolean(!j.wo && String(j.status || '').trim() === 'Cancelado')
    };
  });
}

async function capturarAtletismo() {
  const { resolverSlugDaProva } = require('../utils/atletismoProvas');
  const modalidades = await capturarModalidades();
  const modalidadesAtletismo = modalidades.filter((m) =>
    /atletismo/i.test(String(m.base || m.nome).toLowerCase())
  );
  if (!modalidadesAtletismo.length) return null;

  const provas = [];
  const campiPorGenero = [];

  for (const mod of modalidadesAtletismo) {
    const provasDaModalidade = await resultadosIndividuaisService.obterProvasPorModalidade(mod.id);
    for (const prova of provasDaModalidade) {
      const resultados = await resultadosIndividuaisService.obterResultadosPorProva(prova.id);
      provas.push({
        id: prova.id,
        modalidadeId: mod.id,
        modalidadeGenero: mod.genero,
        genero: mod.genero,
        slug: resolverSlugDaProva(prova.nome) || '',
        nome: String(prova.nome || '').trim(),
        tipoResultado: String(prova.tipo_resultado || 'medida').trim(),
        ordem: Number(prova.ordem || 0),
        formato: String(prova.formato || 'direta').trim(),
        resultados: (resultados || []).map((r) => ({
          atletaId: r.atleta_id,
          atleta: String(r.atleta_nome || '').trim(),
          campus: String(r.campus_nome || '').trim() || null,
          valorTempo: r.resultado_tempo_exibicao ? String(r.resultado_tempo_exibicao) : null,
          valorMedida: r.resultado_medida != null ? Number(r.resultado_medida) : null,
          tempo: r.resultado_tempo_exibicao ? String(r.resultado_tempo_exibicao) : null,
          medida: r.resultado_medida != null ? Number(r.resultado_medida) : null,
          resultado: r.resultado_tempo_exibicao
            ? String(r.resultado_tempo_exibicao)
            : (r.resultado_medida != null ? Number(r.resultado_medida) : null),
          posicao: Number(r.posicao_final || 0),
          pontos: Number(r.pontos || 0),
          bateria: Number(r.numero_bateria || 0),
          etapa: String(r.etapa || 'prova').trim(),
          raia: Number(r.numero_raia || 0)
        }))
      });
    }

    try {
      const classificacaoGeral = await resultadosIndividuaisService.obterClassificacaoGeralCampi(mod.genero);
      if (Array.isArray(classificacaoGeral) && classificacaoGeral.length) {
        classificacaoGeral.forEach((linha, index) => {
          campiPorGenero.push({
            genero: mod.genero,
            campus: String(linha.campus || linha.campus_nome || '').trim() || null,
            posicao: Number(linha.posicao || index + 1),
            pontos: Number(linha.pontos || 0)
          });
        });
      }
    } catch (_) { /* classificação geral do atletismo é opcional */ }
  }

  return {
    modalidadeId: modalidadesAtletismo[0].id,
    podeExistir: true,
    provas,
    campi: campiPorGenero
  };
}

async function capturarXadrez() {
  const modalidades = await capturarModalidades();
  const modalidadesXadrez = modalidades.filter((m) =>
    /xadrez/i.test(String(m.base || m.nome).toLowerCase())
  );
  if (!modalidadesXadrez.length) return null;

  const classificacao = [];
  const campiPorGenero = [];
  for (const mod of modalidadesXadrez) {
    try {
      const [linhas] = await db.query(`
         SELECT rx.atleta_id, rx.pontuacao, rx.vitorias, rx.derrotas, rx.empates, rx.publicado,
           a.nome AS atleta_nome, a.campus_id AS campus_id,
           COALESCE(NULLIF(c.nome_exibicao, ''), c.nome) AS campus_nome
        FROM resultados_xadrez rx
        JOIN atletas a ON rx.atleta_id = a.id
        LEFT JOIN campus c ON a.campus_id = c.id
        WHERE rx.modalidade_id = ?
        ORDER BY rx.pontuacao DESC, rx.vitorias DESC
      `, [mod.id]);
      (linhas || []).forEach((linha) => {
        classificacao.push({
          atletaId: linha.atleta_id,
          atleta: String(linha.atleta_nome || linha.atleta || '').trim() || null,
          campusId: linha.campus_id || null,
          campus: String(linha.campus_nome || '').trim() || null,
          genero: mod.genero,
          pontuacao: Number(linha.pontuacao || 0),
          vitorias: Number(linha.vitorias || 0),
          empates: Number(linha.empates || 0),
          derrotas: Number(linha.derrotas || 0),
          publicado: Boolean(linha.publicado)
        });
      });

      const classificacaoCampi = await resultadosIndividuaisService.obterClassificacaoGeralXadrez(mod.id);
      (classificacaoCampi || []).forEach((linha, index) => {
        campiPorGenero.push({
          genero: mod.genero,
          campusId: linha.campus_id,
          campus: String(linha.campus_nome || '').trim() || null,
          posicao: index + 1,
          pontos: Number(linha.pontos || 0),
          vitorias: Number(linha.vitorias || 0),
          derrotas: Number(linha.derrotas || 0),
          empates: Number(linha.empates || 0)
        });
      });
    } catch (_) { /* resultados de xadrez são opcionais */ }
  }

  return {
    modalidadeId: modalidadesXadrez[0].id,
    classificacao,
    campi: campiPorGenero
  };
}

async function capturarBoletim(ano) {
  try {
    const boletim = await boletimService.obterBoletimPorAno(ano);
    if (boletim) {
      const resumo = boletim.resumo_json ? JSON.parse(boletim.resumo_json) : {};
      return {
        ranking: Array.isArray(resumo.ranking) ? resumo.ranking : [],
        modalidades: Array.isArray(resumo.modalidades) ? resumo.modalidades : [],
        dataGeracao: String(boletim.criado_em || '').slice(0, 10)
      };
    }
  } catch (_) { /* boletim não encontrado -> tenta derivar abaixo */ }

  const [rankingRows] = await db.query(`
    SELECT c.nome_exibicao AS campus,
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
      SELECT MAX(cg2.pontos) FROM classificacao_grupos cg2 WHERE cg2.modalidade_id = m.id LIMIT 1
    )
    LEFT JOIN campus c ON c.id = cg.campus_id
    LEFT JOIN classificacao_grupos cg3 ON cg3.modalidade_id = m.id AND cg3.pontos = (
      SELECT MAX(cg4.pontos) FROM classificacao_grupos cg4 WHERE cg4.modalidade_id = m.id AND cg4.id <> cg.id LIMIT 1
    )
    LEFT JOIN campus c2 ON c2.id = cg3.campus_id
    GROUP BY m.id, m.nome, c.nome_exibicao, c2.nome_exibicao
    ORDER BY m.nome ASC
  `);

  return {
    ranking: (rankingRows || []).map((row, index) => ({
      posicao: index + 1,
      campus: row.campus || 'Campus sem nome',
      pontos: Number(row.pontos || 0)
    })),
    modalidades: (modalidadesRows || []).map((row) => ({
      nome: row.modalidade || 'Modalidade',
      campeao: row.campeao || '—',
      vice: row.vice || '—'
    })),
    dataGeracao: new Date().toISOString().slice(0, 10)
  };
}

async function capturarEdicaoAtual(anoJifc) {
  const ano = Number(anoJifc || new Date().getFullYear());
  const statusJifc = await boletimService.obterStatusJifc();
  if (!statusJifc.encerrado) {
    throw new Error('Não é possível salvar a edição enquanto o JIFC não estiver encerrado.');
  }

  const [campi, modalidades, chaves, grupos, jogos, boletim] = await Promise.allSettled([
    capturarCampi(),
    capturarModalidades(),
    capturarChaves(),
    capturarGrupos(),
    capturarJogos(),
    capturarBoletim(ano)
  ]);

  const dados = {
    formatoVersao: FORMATO_VERSAO,
    ano,
    titulo: `JIFC ${ano}`,
    origem: 'auto',
    geradoEm: new Date().toISOString().slice(0, 10),
    campi: campi.status === 'fulfilled' ? campi.value : [],
    modalidades: modalidades.status === 'fulfilled' ? modalidades.value : [],
    chaves: chaves.status === 'fulfilled' ? chaves.value : [],
    grupos: grupos.status === 'fulfilled' ? grupos.value : [],
    jogos: jogos.status === 'fulfilled' ? jogos.value : [],
    boletim: boletim.status === 'fulfilled' ? boletim.value : { ranking: [], modalidades: [], dataGeracao: null }
  };

  const [atletismo, xadrez] = await Promise.allSettled([
    capturarAtletismo(),
    capturarXadrez()
  ]);
  if (atletismo.status === 'fulfilled' && atletismo.value) dados.atletismo = atletismo.value;
  if (xadrez.status === 'fulfilled' && xadrez.value) dados.xadrez = xadrez.value;

  return dados;
}

async function salvarEdicaoAtual(anoJifc) {
  const dados = await capturarEdicaoAtual(anoJifc);
  return persistirEdicao(dados);
}

async function persistirEdicao(dados) {
  const ano = Number(dados.ano || 0);
  if (!ano) throw new Error('Ano da edição é obrigatório.');

  const titulo = String(dados.titulo || '').trim() || `JIFC ${ano}`;
  const origem = dados.origem === 'importada' ? 'importada' : 'auto';
  const jsonTexto = JSON.stringify(dados);

  const [existente] = await db.query('SELECT id FROM edicoes_anteriores WHERE ano_jifc = ?', [ano]);
  if (existente.length) {
    await db.query(
      'UPDATE edicoes_anteriores SET titulo = ?, origem = ?, dados_json = ?, atualizado_em = NOW() WHERE ano_jifc = ?',
      [titulo, origem, jsonTexto, ano]
    );
    return { id: existente[0].id, ano, titulo, origem, atualizado: true };
  }

  const [resultado] = await db.query(
    'INSERT INTO edicoes_anteriores (ano_jifc, titulo, origem, dados_json) VALUES (?, ?, ?, ?)',
    [ano, titulo, origem, jsonTexto]
  );
  return { id: resultado.insertId, ano, titulo, origem, atualizado: false };
}

function validarImportacao(dados) {
  const avisos = [];

  if (!dados || typeof dados !== 'object') {
    throw new Error('Arquivo de edição inválido: o documento não é um JSON de objeto.');
  }
  if (Number(dados.formatoVersao) !== FORMATO_VERSAO) {
    throw new Error(`Formato de edição incompatível. Esperado versão ${FORMATO_VERSAO}.`);
  }

  const ano = Number(dados.ano || 0);
  if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) {
    throw new Error('Campo "ano" inválido. Informe um ano entre 2000 e 2100.');
  }
  if (!Array.isArray(dados.campi) || dados.campi.length === 0) {
    throw new Error('Bloco "campi" é obrigatório e deve conter ao menos um campus.');
  }
  if (!Array.isArray(dados.modalidades) || dados.modalidades.length === 0) {
    throw new Error('Bloco "modalidades" é obrigatório e deve conter ao menos uma modalidade.');
  }
  if (!Array.isArray(dados.jogos)) {
    throw new Error('Bloco "jogos" é obrigatório (pode ser um array vazio).');
  }

  const idsModalidades = new Set(dados.modalidades.map((m) => Number(m && m.id)));
  for (let i = 0; i < dados.jogos.length; i += 1) {
    const jogo = dados.jogos[i];
    if (!jogo || !idsModalidades.has(Number(jogo.modalidadeId))) {
      throw new Error(`Jogo na posição ${i} referencia uma modalidade inexistente (modalidadeId).`);
    }
  }

  for (const bloco of ['chaves', 'grupos', 'atletismo', 'xadrez', 'boletim']) {
    if (!dados[bloco]) avisos.push(`Bloco opcional "${bloco}" ausente.`);
  }

  return { ano, avisos };
}

async function importarEdicao(dadosBrutos) {
  const { ano, avisos } = validarImportacao(dadosBrutos);

  const [existente] = await db.query('SELECT id FROM edicoes_anteriores WHERE ano_jifc = ?', [ano]);
  if (existente.length) {
    throw new Error(`Já existe uma edição salva para o ano ${ano}.`);
  }

  const dados = {
    ...dadosBrutos,
    formatoVersao: FORMATO_VERSAO,
    ano,
    titulo: String(dadosBrutos.titulo || '').trim() || `JIFC ${ano}`,
    origem: 'importada',
    geradoEm: String(dadosBrutos.geradoEm || '').trim() || new Date().toISOString().slice(0, 10)
  };

  const persistido = await persistirEdicao(dados);
  return { ...persistido, avisos };
}

async function listarEdicoes() {
  const [linhas] = await db.query(
    'SELECT id, ano_jifc, titulo, origem, criado_em, atualizado_em FROM edicoes_anteriores ORDER BY ano_jifc DESC'
  );
  const edicoes = await Promise.all((linhas || []).map(async (linha) => {
    let resumo = { modalidades: 0, jogos: 0 };
    try {
      const [raw] = await db.query('SELECT dados_json FROM edicoes_anteriores WHERE id = ?', [linha.id]);
      const dados = raw && raw[0] ? JSON.parse(raw[0].dados_json || '{}') : {};
      resumo = {
        modalidades: Array.isArray(dados.modalidades) ? dados.modalidades.length : 0,
        jogos: Array.isArray(dados.jogos) ? dados.jogos.length : 0
      };
    } catch (_) { /* mantém resumo zerado */ }
    return {
      id: linha.id,
      ano: linha.ano_jifc,
      titulo: linha.titulo || `JIFC ${linha.ano_jifc}`,
      origem: linha.origem,
      criadoEm: linha.criado_em,
      atualizadoEm: linha.atualizado_em,
      ...resumo
    };
  }));
  return edicoes || [];
}

async function listarAnosEdicoes() {
  const [linhas] = await db.query(
    'SELECT ano_jifc, titulo FROM edicoes_anteriores ORDER BY ano_jifc DESC'
  );
  return (linhas || []).map((l) => ({
    ano: l.ano_jifc,
    titulo: l.titulo || `JIFC ${l.ano_jifc}`
  }));
}

async function obterEdicao(anoJifc) {
  const ano = Number(anoJifc || 0);
  if (!ano) return null;
  const [linhas] = await db.query(
    'SELECT * FROM edicoes_anteriores WHERE ano_jifc = ? LIMIT 1',
    [ano]
  );
  const linha = linhas[0] || null;
  if (!linha) return null;
  return {
    id: linha.id,
    ano: linha.ano_jifc,
    titulo: linha.titulo || `JIFC ${linha.ano_jifc}`,
    origem: linha.origem,
    criadoEm: linha.criado_em,
    atualizadoEm: linha.atualizado_em,
    dados: JSON.parse(linha.dados_json || '{}')
  };
}

async function exportarEdicao(anoJifc) {
  const edicao = await obterEdicao(anoJifc);
  return edicao ? edicao.dados : null;
}

async function excluirEdicao(anoJifc) {
  const ano = Number(anoJifc || 0);
  if (!ano) throw new Error('Ano da edição é obrigatório.');
  await db.query('DELETE FROM edicoes_anteriores WHERE ano_jifc = ?', [ano]);
}

module.exports = {
  FORMATO_VERSAO,
  capturarCampi,
  capturarModalidades,
  capturarChaves,
  capturarGrupos,
  capturarJogos,
  capturarAtletismo,
  capturarXadrez,
  capturarBoletim,
  capturarEdicaoAtual,
  salvarEdicaoAtual,
  importarEdicao,
  listarEdicoes,
  listarAnosEdicoes,
  obterEdicao,
  exportarEdicao,
  excluirEdicao
};