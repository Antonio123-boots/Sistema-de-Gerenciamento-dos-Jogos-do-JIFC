// Base de dados local em memória para modalidades e atletas dos campus.
const db = require('../config/db');
const { listarCampiSync } = require('./campiCatalog');
const { readState, writeState } = require('./stateStore');

const campusBase = listarCampiSync();
const modalidadesBase = [
  'Futsal Masculino',
  'Futsal Feminino',
  'Vôlei Masculino',
  'Vôlei Feminino',
  'Basquete Masculino',
  'Basquete Feminino'
];

const nomesAtletas = [
  'Lucas Mendes', 'Camila Nunes', 'Bruno Alves', 'Ana Souza', 'Pedro Henrique',
  'Mariana Silva', 'João Victor', 'Luiza Costa', 'Gabriel Martins', 'Bianca Rocha',
  'Rafael Oliveira', 'Nina Pereira', 'Caio Santos', 'Aline Freitas', 'Thiago Cardoso'
];

const estadoInicialCampus = carregarEstadoCampus();
const inscricoesCampus = estadoInicialCampus.inscricoesCampus;

const atletasCampus = estadoInicialCampus.atletasCampus;

function normalizarCPFParaBanco(valor) {
  return String(valor || '').replace(/\D/g, '').slice(0, 11);
}

function normalizarNomeModalidadeParaBanco(nome) {
  return String(nome || '')
    .trim()
    .replace(/^Tênis$/i, 'Tênis de Mesa')
    .replace(/^V[oô]leibol(\s*(Masculino|Feminino))?$/i, 'Vôlei $2')
    .trim();
}

const { inferirGeneroModalidade, inferirTipoConfrontoModalidade, inferirFormatoDisputaModalidade } = require('../utils/modalidadeHelpers');

async function buscarCampusIdNoBanco(campusNome) {
  const nome = String(campusNome || '').trim();
  if (!nome) {
    return null;
  }

  try {
    const [linhas] = await db.query(
      'SELECT id FROM campus WHERE nome = ? OR nome_exibicao = ? OR slug = ? LIMIT 1',
      [nome, nome, gerarSlug(nome)]
    );
    return linhas[0]?.id || null;
  } catch (error) {
    return null;
  }
}

async function garantirCampusNoBanco(campusNome) {
  const campusId = await buscarCampusIdNoBanco(campusNome);
  if (campusId) {
    return campusId;
  }

  const nome = String(campusNome || '').trim();
  if (!nome) {
    return null;
  }

  try {
    const slug = gerarSlug(nome);
    const [resultado] = await db.query(
      'INSERT INTO campus (nome, nome_exibicao, cidade, email, senha, slug, cor, foto_perfil, banned, ban_motivo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [nome, nome, nome, `${slug}@ifc.edu.br`, 'jifc2026', slug, '#2980b9', '/imagens/avatar.svg', 0, '']
    );
    return resultado.insertId;
  } catch (error) {
    return null;
  }
}

async function garantirModalidadeNoBanco(nomeModalidade) {
  const nome = normalizarNomeModalidadeParaBanco(nomeModalidade);
  if (!nome) {
    return null;
  }

  const nomeBase = nome.replace(/\s+(Masculino|Feminino)$/i, '').trim();
  const genero = inferirGeneroModalidade(nome);
  const tipoConfronto = inferirTipoConfrontoModalidade(nome);
  const formatoDisputa = inferirFormatoDisputaModalidade(nome);

  try {
    const [linhas] = await db.query(
      'SELECT id FROM modalidades WHERE (nome = ? OR nome = ?) AND genero = ? LIMIT 1',
      [nome, nomeBase, genero]
    );

    if (linhas[0]?.id) {
      return linhas[0].id;
    }

    const [resultado] = await db.query(
      'INSERT INTO modalidades (nome, genero, tipo_confronto, formato_disputa) VALUES (?, ?, ?, ?)',
      [nome, genero, tipoConfronto, formatoDisputa]
    );

    return resultado.insertId;
  } catch (error) {
    return null;
  }
}

async function sincronizarLinksCampusModalidade(campusId, modalidades) {
  if (!campusId) {
    return;
  }

  const modalidadesSelecionadas = normalizarInscricoesCampus(modalidades);
  const modalidadeIds = [];

  for (const modalidade of modalidadesSelecionadas) {
    const modalidadeId = await garantirModalidadeNoBanco(modalidade);
    if (modalidadeId) {
      modalidadeIds.push(modalidadeId);
    }
  }

  const idsUnicos = [...new Set(modalidadeIds)];
  await db.query('DELETE FROM campus_modalidade WHERE campus_id = ?', [campusId]);

  for (const modalidadeId of idsUnicos) {
    await db.query('INSERT INTO campus_modalidade (campus_id, modalidade_id) VALUES (?, ?)', [campusId, modalidadeId]);
  }
}

async function sincronizarAtletaNoBanco(campusId, atletaDados, modalidadesSelecionadas = []) {
  if (!campusId) {
    return null;
  }

  const nome = String(atletaDados?.nome || '').trim();
  const matricula = normalizarMatricula(atletaDados?.matricula);
  const cpf = normalizarCPFParaBanco(atletaDados?.cpf);
  const genero = normalizarGenero(atletaDados?.genero) || 'Masculino';
  const dataNascimento = String(atletaDados?.dataNascimento || '').trim();
  const modalidades = normalizarModalidades(modalidadesSelecionadas);
  const modalidadeIds = [];

  for (const modalidade of modalidades) {
    const modalidadeId = await garantirModalidadeNoBanco(modalidade);
    if (modalidadeId) {
      modalidadeIds.push(modalidadeId);
    }
  }

  const [existente] = await db.query('SELECT id FROM atletas WHERE campus_id = ? AND matricula = ? LIMIT 1', [campusId, matricula]);
  let atletaId = existente?.[0]?.id || null;

  const provasAtletismoJson = Array.isArray(atletaDados?.atletismoProvas) && atletaDados.atletismoProvas.length
    ? JSON.stringify(atletaDados.atletismoProvas)
    : null;

  if (atletaId) {
    await db.query(
      'UPDATE atletas SET nome = ?, cpf = ?, genero = ?, data_nascimento = ?, provas_atletismo = COALESCE(?, provas_atletismo) WHERE id = ?',
      [nome, cpf, genero, dataNascimento, provasAtletismoJson, atletaId]
    );
  } else {
    const [resultado] = await db.query(
      'INSERT INTO atletas (campus_id, nome, cpf, matricula, genero, data_nascimento, provas_atletismo) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [campusId, nome, cpf, matricula, genero, dataNascimento, provasAtletismoJson]
    );
    atletaId = resultado.insertId;
  }

  await db.query('DELETE FROM atleta_modalidade WHERE atleta_id = ?', [atletaId]);
  for (const modalidadeId of [...new Set(modalidadeIds)]) {
    await db.query('INSERT INTO atleta_modalidade (atleta_id, modalidade_id) VALUES (?, ?)', [atletaId, modalidadeId]);
  }

  return atletaId;
}

function normalizarMatricula(matricula) {
  return String(matricula || '')
    .trim()
    .replace(/\D/g, '')
    .slice(0, 12);
}

function formatarCPF(valor) {
  const apenasDigitos = String(valor || '')
    .replace(/\D/g, '')
    .slice(0, 11);

  if (apenasDigitos.length <= 3) {
    return apenasDigitos;
  }

  if (apenasDigitos.length <= 6) {
    return `${apenasDigitos.slice(0, 3)}.${apenasDigitos.slice(3)}`;
  }

  if (apenasDigitos.length <= 9) {
    return `${apenasDigitos.slice(0, 3)}.${apenasDigitos.slice(3, 6)}.${apenasDigitos.slice(6)}`;
  }

  return `${apenasDigitos.slice(0, 3)}.${apenasDigitos.slice(3, 6)}.${apenasDigitos.slice(6, 9)}-${apenasDigitos.slice(9, 11)}`;
}

function normalizarCPF(cpf) {
  return formatarCPF(cpf);
}

function validarMatricula(matricula) {
  const valor = normalizarMatricula(matricula);

  if (!/^\d{9,12}$/.test(valor)) {
    const erro = new Error('A matrícula deve conter entre 9 e 12 dígitos.');
    erro.code = 'MATRICULA_INVALIDA';
    throw erro;
  }

  return valor;
}

function validarNomeCompleto(nome) {
  const valor = String(nome || '').trim().replace(/\s+/g, ' ');
  return valor.split(' ').filter(Boolean).length >= 2 ? valor : '';
}

function normalizarGenero(genero) {
  const valor = String(genero || '').trim().toLowerCase();
  if (valor === 'f' || valor === 'feminino') {
    return 'Feminino';
  }

  if (valor === 'm' || valor === 'masculino') {
    return 'Masculino';
  }

  return '';
}

function obterAnoAtual() {
  return new Date().getFullYear();
}

function obterAnoNascimento(dataNascimento) {
  const data = new Date(dataNascimento);
  return Number.isNaN(data.getTime()) ? null : data.getFullYear();
}

function obterAnoEvento(opcoes = {}) {
  const anoEvento = Number(opcoes.anoEvento || new Date().getFullYear());
  return Number.isFinite(anoEvento) ? anoEvento : new Date().getFullYear();
}

function normalizarStatusSolicitado(status) {
  const statusNormalizado = String(status || 'Regular').trim().toLowerCase();
  if (statusNormalizado.startsWith('anal') || statusNormalizado.startsWith('pend')) {
    return 'Analise';
  }

  if (statusNormalizado.startsWith('repro') || statusNormalizado.startsWith('irreg') || statusNormalizado.startsWith('nao')) {
    return 'Reprovado';
  }

  return 'Regular';
}

function normalizarModalidades(valor) {
  const lista = Array.isArray(valor) ? valor : [valor];
  const modalidades = lista
    .map((item) => String(item || '').trim())
    .filter(Boolean);

  return [...new Set(modalidades)].slice(0, 3);
}

function normalizarListaDetalhes(valor) {
  const lista = Array.isArray(valor) ? valor : [valor];
  const detalhes = lista
    .map((item) => String(item || '').trim())
    .filter(Boolean);

  return [...new Set(detalhes)];
}

function normalizarDetalhesAtleta(dados = {}) {
  const modalidades = normalizarModalidades(dados.modalidades || dados.modalidade);
  const temAtletismo = modalidades.some((modalidade) => /atletismo/i.test(modalidade));
  const temTenisMesa = modalidades.some((modalidade) => /tênis de mesa|tenis de mesa/i.test(modalidade));

  return {
    atletismoProvas: temAtletismo ? normalizarListaDetalhes(dados.atletismoProvas || dados.provasAtletismo) : [],
    tenisMesaParticipacoes: temTenisMesa ? normalizarListaDetalhes(dados.tenisMesaParticipacoes || dados.participacoesTenisMesa) : []
  };
}

function validarDetalhesAtleta(dados, modalidadesSelecionadas = []) {
  const detalhes = normalizarDetalhesAtleta(dados);
  const temAtletismo = modalidadesSelecionadas.some((modalidade) => /atletismo/i.test(modalidade));
  const temTenisMesa = modalidadesSelecionadas.some((modalidade) => /tênis de mesa|tenis de mesa/i.test(modalidade));

  if (temAtletismo && detalhes.atletismoProvas.length === 0) {
    const erro = new Error('Selecione pelo menos uma prova de atletismo.');
    erro.code = 'PROVAS_ATLETISMO_OBRIGATORIAS';
    throw erro;
  }

  if (temTenisMesa && detalhes.tenisMesaParticipacoes.length === 0) {
    const erro = new Error('Selecione pelo menos uma participação para tênis de mesa.');
    erro.code = 'PARTICIPACOES_TENIS_MESA_OBRIGATORIAS';
    throw erro;
  }

  return detalhes;
}

function normalizarInscricoesCampus(valor) {
  const lista = Array.isArray(valor) ? valor : [valor];
  const modalidades = lista
    .map((item) => String(item || '').trim())
    .filter(Boolean);

  return [...new Set(modalidades)];
}

function atletaEhSub19(dados, opcoes = {}) {
  const anoNascimento = obterAnoNascimento(dados.dataNascimento);
  const anoEvento = obterAnoEvento(opcoes);
  const anoLimite = anoEvento - 19;

  return anoNascimento !== null && anoNascimento >= anoLimite;
}

function obterModalidadesSalvas(dados) {
  const modalidades = normalizarModalidades(dados.modalidades || dados.modalidade);
  return modalidades.length ? modalidades : [];
}

function validarCamposObrigatoriosAtleta(dados) {
  const nome = String(dados.nome || '').trim();
  const matricula = validarMatricula(dados.matricula);
  const genero = normalizarGenero(dados.genero) || 'Masculino';
  const dataNascimento = String(dados.dataNascimento || '').trim();
  const cpf = normalizarCPF(String(dados.cpf || '').trim());
  const status = 'Analise';
  const modalidades = obterModalidadesSalvas(dados);
  const detalhesAtleta = normalizarDetalhesAtleta(dados);

  if (!nome || !matricula || !dataNascimento || !modalidades.length) {
    const erro = new Error('Preencha todos os campos antes de inscrever o atleta.');
    erro.code = 'CAMPOS_OBRIGATORIOS';
    throw erro;
  }

  return { nome, matricula, genero, dataNascimento, cpf, status, modalidades, ...detalhesAtleta };
}

function normalizarStatusExibicao(status) {
  return normalizarStatusSolicitado(status || 'Analise');
}

function extrairGeneroPorModalidade(modalidades = []) {
  const lista = normalizarModalidades(modalidades);
  if (lista.some((modalidade) => /feminino/i.test(modalidade))) {
    return 'Feminino';
  }

  return 'Masculino';
}

function criarEstadoPadraoCampus() {
  const inscricoesPadrao = campusBase.reduce((acumulador, campus, index) => {
    const primeiraModalidade = modalidadesBase[index % modalidadesBase.length];
    const segundaModalidade = modalidadesBase[(index + 2) % modalidadesBase.length];

    acumulador[campus.nome] = [primeiraModalidade, segundaModalidade].filter((modalidade, posicao, lista) => lista.indexOf(modalidade) === posicao);
    return acumulador;
  }, {});

  const atletasPadrao = campusBase.map((campus, index) => ({
    id: index + 1,
    nome: nomesAtletas[index],
    campus: campus.nome,
    matricula: `2026${String(index + 1).padStart(4, '0')}`,
    modalidade: inscricoesPadrao[campus.nome][0],
    dataNascimento: `200${index % 3 === 0 ? 6 : 7}-${String((index % 9) + 1).padStart(2, '0')}-${String((index % 27) + 1).padStart(2, '0')}`,
    status: 'Regular'
  }));

  return {
    inscricoesCampus: inscricoesPadrao,
    atletasCampus: atletasPadrao
  };
}

function carregarEstadoCampus() {
  const estado = readState();
  const padrao = criarEstadoPadraoCampus();
  const campusPersistido = estado.campus || {};
  const inscricoesPersistidas = campusPersistido.inscricoesCampus || campusPersistido.inscricoes || {};

  return {
    inscricoesCampus: {
      ...padrao.inscricoesCampus,
      ...inscricoesPersistidas
    },
    atletasCampus: Object.prototype.hasOwnProperty.call(campusPersistido, 'atletasCampus')
      ? campusPersistido.atletasCampus
      : (Object.prototype.hasOwnProperty.call(campusPersistido, 'atletas') ? campusPersistido.atletas : padrao.atletasCampus)
  };
}

function persistirEstadoCampus() {
  const estadoAtual = readState();
  estadoAtual.campus = {
    inscricoesCampus,
    atletasCampus
  };

  writeState(estadoAtual);
}

const { gerarSlug } = require('../utils/slug');

function removerCampusDoEstado(campusAtual) {
  const nomesCampus = [campusAtual?.nome, campusAtual?.nomeExibicao, campusAtual?.slug]
    .filter((valor) => typeof valor === 'string' && valor.trim())
    .map((valor) => valor.trim())
    .filter((valor, index, lista) => lista.indexOf(valor) === index);

  if (inscricoesCampus && typeof inscricoesCampus === 'object') {
    for (const nomeCampus of nomesCampus) {
      delete inscricoesCampus[nomeCampus];
      delete inscricoesCampus[gerarSlug(nomeCampus)];
    }
  }

  if (Array.isArray(atletasCampus)) {
    const proximoEstado = atletasCampus.filter((atleta) => {
      const campusNome = String(atleta?.campus || '').trim();
      const campusSlug = String(atleta?.campusSlug || '').trim();
      return (
        campusNome !== String(campusAtual?.nome || '').trim() &&
        campusNome !== String(campusAtual?.nomeExibicao || '').trim() &&
        campusSlug !== String(campusAtual?.slug || '').trim()
      );
    });

    atletasCampus.splice(0, atletasCampus.length, ...proximoEstado);
  }

  persistirEstadoCampus();
}

function determinarStatusAtleta(dados, excluirId = null, statusSolicitado = 'Regular', opcoes = {}) {
  const matriculaNormalizada = normalizarMatricula(dados.matricula);
  const statusBase = normalizarStatusSolicitado(statusSolicitado);

  if (!matriculaNormalizada || obterAnoNascimento(dados.dataNascimento) === null) {
    return 'Irregular';
  }

  const matriculaRepetida = atletasCampus.some((atleta) => {
    if (excluirId && atleta.id === Number(excluirId)) {
      return false;
    }

    return normalizarMatricula(atleta.matricula) === matriculaNormalizada;
  });

  if (matriculaRepetida) {
    return 'Irregular';
  }

  if (!atletaEhSub19(dados, opcoes)) {
    return 'Irregular';
  }

  return statusBase;
}

function localizarAtletaPorId(atletaId) {
  return atletasCampus.find((item) => item.id === Number(atletaId)) || null;
}

// Retorna as modalidades cadastradas para o campus informado.
function getInscricoes(campusNome) {
  return (inscricoesCampus[campusNome] || []).slice();
}

// Salva a lista de modalidades escolhidas por um campus.
async function salvarInscricoes(campusNome, modalidades) {
  const listaNormalizada = normalizarInscricoesCampus(modalidades);
  inscricoesCampus[campusNome] = listaNormalizada;
  persistirEstadoCampus();

  const campusId = await garantirCampusNoBanco(campusNome);
  if (campusId) {
    await sincronizarLinksCampusModalidade(campusId, listaNormalizada);
  }

  return getInscricoes(campusNome);
}

// Busca os atletas pertencentes a um campus específico.
function getAtletas(campusNome) {
  return atletasCampus.filter((item) => item.campus === campusNome).map((item) => ({
    ...item,
    modalidades: normalizarModalidades(item.modalidades || item.modalidade),
    modalidade: Array.isArray(item.modalidades) ? item.modalidades.join(', ') : item.modalidade,
    genero: item.genero || extrairGeneroPorModalidade(item.modalidades || item.modalidade),
    status: normalizarStatusExibicao(item.status),
    atletismoProvas: Array.isArray(item.atletismoProvas) ? item.atletismoProvas : [],
    tenisMesaParticipacoes: Array.isArray(item.tenisMesaParticipacoes) ? item.tenisMesaParticipacoes : []
  }));
}

function getAtletasParaAnalise(campusNome = null) {
  const base = campusNome ? atletasCampus.filter((item) => item.campus === campusNome) : atletasCampus;
  return base.map((item) => ({
    ...item,
    modalidades: normalizarModalidades(item.modalidades || item.modalidade),
    modalidade: Array.isArray(item.modalidades) ? item.modalidades.join(', ') : item.modalidade,
    genero: item.genero || extrairGeneroPorModalidade(item.modalidades || item.modalidade),
    status: normalizarStatusExibicao(item.status),
    atletismoProvas: Array.isArray(item.atletismoProvas) ? item.atletismoProvas : [],
    tenisMesaParticipacoes: Array.isArray(item.tenisMesaParticipacoes) ? item.tenisMesaParticipacoes : []
  })).sort((a, b) => a.campus.localeCompare(b.campus) || a.nome.localeCompare(b.nome));
}

function getAtletaPorId(atletaId) {
  const atleta = localizarAtletaPorId(atletaId);
  return atleta ? {
    ...atleta,
    modalidades: normalizarModalidades(atleta.modalidades || atleta.modalidade),
    modalidade: Array.isArray(atleta.modalidades) ? atleta.modalidades.join(', ') : atleta.modalidade,
    genero: atleta.genero || extrairGeneroPorModalidade(atleta.modalidades || atleta.modalidade),
    status: normalizarStatusExibicao(atleta.status),
    atletismoProvas: Array.isArray(atleta.atletismoProvas) ? atleta.atletismoProvas : [],
    tenisMesaParticipacoes: Array.isArray(atleta.tenisMesaParticipacoes) ? atleta.tenisMesaParticipacoes : []
  } : null;
}

function getQuantidadeRegulares(campusNome) {
  return atletasCampus.filter((item) => item.campus === campusNome && normalizarStatusExibicao(item.status) === 'Regular').length;
}

function getQuantidadePendentes(campusNome) {
  return getQuantidadeAnalise(campusNome);
}

function getQuantidadeAnalise(campusNome) {
  return atletasCampus.filter((item) => item.campus === campusNome && normalizarStatusExibicao(item.status) === 'Analise').length;
}

function getQuantidadeReprovados(campusNome) {
  return atletasCampus.filter((item) => item.campus === campusNome && normalizarStatusExibicao(item.status) === 'Reprovado').length;
}

function getQuantidadeTotal(campusNome) {
  return atletasCampus.filter((item) => item.campus === campusNome).length;
}

function getQuantidadeDisponivelRegular(campusNome, limiteRegularTotalCampus) {
  const limite = Number(limiteRegularTotalCampus);

  if (!Number.isFinite(limite) || limite <= 0) {
    return Infinity;
  }

  return Math.max(limite - getQuantidadeTotal(campusNome), 0);
}

// Cria um novo atleta com status regular ou pendente.
async function cadastrarAtleta(campusNome, dados, opcoes = {}) {
  const campos = validarCamposObrigatoriosAtleta(dados);
  const matriculaNormalizada = normalizarMatricula(campos.matricula);
  const matriculaExistente = atletasCampus.some((atleta) => atleta.campus === campusNome && normalizarMatricula(atleta.matricula) === matriculaNormalizada);
  const statusSolicitado = opcoes.validarImediatamente ? 'Regular' : (campos.status === 'Regular' ? 'Analise' : (campos.status || 'Analise'));
  const limiteRegularTotalCampus = Number(opcoes.limiteRegularTotalCampus || 0);
  const modalidadesSelecionadas = campos.modalidades;
  const detalhesAtleta = validarDetalhesAtleta(dados, modalidadesSelecionadas);
  const nomeCompleto = validarNomeCompleto(campos.nome);

  if (matriculaExistente) {
    const erro = new Error('Já existe um atleta cadastrado com esta matrícula neste campus.');
    erro.code = 'MATRICULA_DUPLICADA';
    throw erro;
  }

  if (obterAnoNascimento(campos.dataNascimento) === null) {
    const erro = new Error('Data de nascimento inválida.');
    erro.code = 'DATA_INVALIDA';
    throw erro;
  }

  if (!nomeCompleto) {
    const erro = new Error('Informe o nome completo do atleta, com nome e sobrenome.');
    erro.code = 'NOME_INCOMPLETO';
    throw erro;
  }

  if (!atletaEhSub19(campos, opcoes)) {
    const erro = new Error('A idade do atleta excede o limite permitido para esta categoria');
    erro.code = 'IDADE_LIMITE_EXCEDIDO';
    throw erro;
  }

  if (!modalidadesSelecionadas.length) {
    const erro = new Error('Selecione ao menos uma modalidade para este atleta.');
    erro.code = 'MODALIDADES_OBRIGATORIAS';
    throw erro;
  }

  if (modalidadesSelecionadas.length > 3) {
    const erro = new Error('O atleta pode participar de no máximo 3 esportes.');
    erro.code = 'MODALIDADES_EXCEDIDAS';
    throw erro;
  }

  if (limiteRegularTotalCampus > 0 && getQuantidadeTotal(campusNome) >= limiteRegularTotalCampus) {
    const erro = new Error('O campus atingiu o limite total de atletas permitido.');
    erro.code = 'LIMITE_REGULAR_EXCEDIDO';
    throw erro;
  }

  const atleta = {
    id: Date.now(),
    nome: nomeCompleto,
    matricula: matriculaNormalizada,
    modalidade: modalidadesSelecionadas.join(', '),
    modalidades: modalidadesSelecionadas,
    dataNascimento: campos.dataNascimento,
    cpf: campos.cpf,
    campus: campusNome,
    genero: campos.genero,
    status: statusSolicitado,
    atletismoProvas: detalhesAtleta.atletismoProvas,
    tenisMesaParticipacoes: detalhesAtleta.tenisMesaParticipacoes
  };
  atletasCampus.push(atleta);
  persistirEstadoCampus();

  const campusId = await garantirCampusNoBanco(campusNome);
  if (campusId) {
    await sincronizarAtletaNoBanco(campusId, atleta, modalidadesSelecionadas);
  }

  return atleta;
}

async function atualizarAtleta(atletaId, campusNome, dados, opcoes = {}) {
  const atleta = localizarAtletaPorId(atletaId);
  if (!atleta || atleta.campus !== campusNome) {
    return null;
  }

  const campos = validarCamposObrigatoriosAtleta(dados);
  const matriculaNormalizada = normalizarMatricula(campos.matricula);
  const matriculaExistente = atletasCampus.some((item) => item.campus === campusNome && item.id !== Number(atletaId) && normalizarMatricula(item.matricula) === matriculaNormalizada);
  const statusSolicitado = opcoes.validarImediatamente ? 'Regular' : (campos.status === 'Regular' ? 'Analise' : (campos.status || atleta.status || 'Analise'));
  const limiteRegularTotalCampus = Number(opcoes.limiteRegularTotalCampus || 0);
  const modalidadesSelecionadas = campos.modalidades;
  const detalhesAtleta = validarDetalhesAtleta(dados, modalidadesSelecionadas);
  const nomeCompleto = validarNomeCompleto(campos.nome);

  if (matriculaExistente) {
    const erro = new Error('Já existe um atleta cadastrado com esta matrícula neste campus.');
    erro.code = 'MATRICULA_DUPLICADA';
    throw erro;
  }

  if (obterAnoNascimento(campos.dataNascimento) === null) {
    const erro = new Error('Data de nascimento inválida.');
    erro.code = 'DATA_INVALIDA';
    throw erro;
  }

  if (!nomeCompleto) {
    const erro = new Error('Informe o nome completo do atleta, com nome e sobrenome.');
    erro.code = 'NOME_INCOMPLETO';
    throw erro;
  }

  if (!atletaEhSub19(campos, opcoes)) {
    const erro = new Error('A idade do atleta excede o limite permitido para esta categoria');
    erro.code = 'IDADE_LIMITE_EXCEDIDO';
    throw erro;
  }

  if (!modalidadesSelecionadas.length) {
    const erro = new Error('Selecione ao menos uma modalidade para este atleta.');
    erro.code = 'MODALIDADES_OBRIGATORIAS';
    throw erro;
  }

  if (modalidadesSelecionadas.length > 3) {
    const erro = new Error('O atleta pode participar de no máximo 3 esportes.');
    erro.code = 'MODALIDADES_EXCEDIDAS';
    throw erro;
  }

  if (limiteRegularTotalCampus > 0) {
    const totalSemAtletaAtual = atletasCampus.filter((item) => item.campus === campusNome && item.id !== Number(atletaId)).length;
    if (totalSemAtletaAtual >= limiteRegularTotalCampus) {
      const erro = new Error('O campus atingiu o limite total de atletas permitido.');
      erro.code = 'LIMITE_REGULAR_EXCEDIDO';
      throw erro;
    }
  }

  atleta.nome = nomeCompleto;
  atleta.matricula = matriculaNormalizada;
  atleta.modalidade = modalidadesSelecionadas.join(', ');
  atleta.modalidades = modalidadesSelecionadas;
  atleta.dataNascimento = campos.dataNascimento;
  atleta.cpf = campos.cpf;
  atleta.genero = campos.genero;
  atleta.status = statusSolicitado;
  atleta.atletismoProvas = detalhesAtleta.atletismoProvas;
  atleta.tenisMesaParticipacoes = detalhesAtleta.tenisMesaParticipacoes;
  persistirEstadoCampus();

  const campusId = await garantirCampusNoBanco(campusNome);
  if (campusId) {
    await sincronizarAtletaNoBanco(campusId, atleta, modalidadesSelecionadas);
  }

  return { ...atleta };
}

function atualizarStatusAtleta(atletaId, novoStatus) {
  const atleta = localizarAtletaPorId(atletaId);

  if (!atleta) {
    return null;
  }

  const statusNormalizado = normalizarStatusSolicitado(novoStatus);
  if (statusNormalizado === 'Regular' && !atletaEhSub19(atleta)) {
    return null;
  }

  atleta.status = statusNormalizado;
  persistirEstadoCampus();
  return { ...atleta };
}

async function excluirAtleta(atletaId, campusNome) {
  const indice = atletasCampus.findIndex((item) => item.id === Number(atletaId) && item.campus === campusNome);
  if (indice === -1) {
    return false;
  }

  atletasCampus.splice(indice, 1);
  persistirEstadoCampus();

  const campusId = await garantirCampusNoBanco(campusNome);
  if (campusId) {
    const idNumerico = Number(atletaId);
    const [linhas] = await db.query('SELECT id FROM atletas WHERE campus_id = ? AND id = ? LIMIT 1', [campusId, idNumerico]);
    if (linhas[0]?.id) {
      await db.query('DELETE FROM atleta_modalidade WHERE atleta_id = ?', [linhas[0].id]);
      await db.query('DELETE FROM atletas WHERE id = ?', [linhas[0].id]);
    }
  }

  return true;
}

// Cria uma substituição com status pendente de laudo.
async function substituirAtleta(campusNome, dados) {
  const nomeCompleto = validarNomeCompleto(dados.nome);
  if (!nomeCompleto) {
    const erro = new Error('Informe o nome completo do atleta, com nome e sobrenome.');
    erro.code = 'NOME_INCOMPLETO';
    throw erro;
  }

  const modalidadesSelecionadas = normalizarModalidades(dados.modalidades || dados.modalidade);
  const detalhesAtleta = validarDetalhesAtleta(dados, modalidadesSelecionadas);
  const atleta = { id: Date.now(), ...dados, nome: nomeCompleto, campus: campusNome, matricula: normalizarMatricula(dados.matricula), modalidades: modalidadesSelecionadas, genero: normalizarGenero(dados.genero), cpf: normalizarCPF(dados.cpf), status: 'Pendente', atletismoProvas: detalhesAtleta.atletismoProvas, tenisMesaParticipacoes: detalhesAtleta.tenisMesaParticipacoes };
  atleta.modalidade = Array.isArray(atleta.modalidades) ? atleta.modalidades.join(', ') : dados.modalidade;
  atletasCampus.push(atleta);
  persistirEstadoCampus();

  const campusId = await garantirCampusNoBanco(campusNome);
  if (campusId) {
    await sincronizarAtletaNoBanco(campusId, atleta, modalidadesSelecionadas);
  }

  return atleta;
}

/* Garante que os atletas do estado com provas de atletismo existam no banco
   (cobre inscrições antigas criadas antes da sincronização automática) */
async function sincronizarAtletasComProvasNoBanco() {
  const alvos = atletasCampus.filter((atleta) => Array.isArray(atleta.atletismoProvas) && atleta.atletismoProvas.length);
  let sincronizados = 0;

  for (const atleta of alvos) {
    try {
      const campusId = await garantirCampusNoBanco(atleta.campus);
      if (!campusId) continue;
      const atletaId = await sincronizarAtletaNoBanco(campusId, atleta, normalizarModalidades(atleta.modalidades || atleta.modalidade));
      if (atletaId) sincronizados++;
    } catch (error) {
      console.error('Erro ao sincronizar atleta do estado no banco:', error.message);
    }
  }

  return sincronizados;
}

module.exports = {
  normalizarCPF,
  normalizarMatricula,
  validarCamposObrigatoriosAtleta,
  getInscricoes,
  salvarInscricoes,
  removerCampusDoEstado,
  getAtletas,
  getAtletasParaAnalise,
  getAtletaPorId,
  getQuantidadeRegulares,
  getQuantidadePendentes,
  getQuantidadeAnalise,
  getQuantidadeReprovados,
  getQuantidadeTotal,
  getQuantidadeDisponivelRegular,
  cadastrarAtleta,
  atualizarAtleta,
  atualizarStatusAtleta,
  excluirAtleta,
  substituirAtleta,
  sincronizarAtletasComProvasNoBanco
};
