const db = require('../config/db');
const { readState, writeState, cloneState } = require('../models/stateStore');

const configuracoesPadrao = {
  ano_evento: 2026,
  inicio_evento: '',
  fim_evento: '',
  inicio_inscricao_modalidades: '',
  fim_inscricao_modalidades: '',
  inicio_inscricao_atletas: '',
  fim_inscricao_atletas: '',
  inicio_sorteio_chaves: '',
  fim_sorteio_chaves: '',
  limite_atletas_total_campus: 0
};

const atletasPendentes = [];

function carregarConfiguracoes() {
  const estado = readState();
  return { ...configuracoesPadrao, ...(estado.configuracoes || {}) };
}

function getConfiguracoes() {
  return cloneState(carregarConfiguracoes());
}

function salvarConfiguracoes(novosDados) {
  const estadoAtual = readState();
  const configuracoesAtuais = { ...configuracoesPadrao, ...(estadoAtual.configuracoes || {}) };
  const inicioEvento = novosDados.inicio_evento || configuracoesAtuais.inicio_evento || '';
  const anoDerivado = Number(
    novosDados.ano_evento ||
    novosDados.anoEvento ||
    (inicioEvento ? new Date(`${inicioEvento}T00:00:00`).getFullYear() : configuracoesAtuais.ano_evento)
  );

  estadoAtual.configuracoes = {
    ...configuracoesAtuais,
    ...novosDados,
    ano_evento: Number.isFinite(anoDerivado) ? anoDerivado : configuracoesAtuais.ano_evento,
    limite_atletas_total_campus: Number(
      novosDados.limite_atletas_total_campus ?? configuracoesAtuais.limite_atletas_total_campus ?? 0
    )
  };

  writeState(estadoAtual);
  return getConfiguracoes();
}

function getAnoJifc() {
  const configuracoes = getConfiguracoes();
  const anoBase = Number(configuracoes.ano_evento) || new Date().getFullYear();

  if (!configuracoes.fim_evento) {
    return anoBase;
  }

  const limiteEvento = new Date(`${configuracoes.fim_evento}T23:59:59`);
  if (Number.isNaN(limiteEvento.getTime())) {
    return anoBase;
  }

  return new Date() > limiteEvento ? anoBase + 1 : anoBase;
}

function getAtletasPendentes() {
  return atletasPendentes.map((item) => ({ ...item }));
}

function validarAtleta(atletaId) {
  const atleta = atletasPendentes.find((item) => item.id === Number(atletaId));
  if (atleta) atleta.status = 'Regular';
  return atleta;
}

async function getConfiguracoesBanco() {
  try {
    const [linhas] = await db.query('SELECT * FROM configuracoes_evento ORDER BY id DESC LIMIT 1');
    const configuracaoBanco = linhas[0] || {};
    return {
      ...getConfiguracoes(),
      ...configuracaoBanco
    };
  } catch (error) {
    return getConfiguracoes();
  }
}

function gerarDatasEventoDisponiveis(configuracoes = {}) {
  const inicioEvento = String(configuracoes?.inicio_evento || '').trim();
  const fimEvento = String(configuracoes?.fim_evento || '').trim();

  const fallbackInicio = '2026-08-26';
  const fallbackFim = '2026-08-28';

  const inicio = inicioEvento ? new Date(`${inicioEvento}T00:00:00`) : null;
  const fim = fimEvento ? new Date(`${fimEvento}T00:00:00`) : null;

  const inicioBase = inicio || (inicioEvento ? null : new Date(`${fallbackInicio}T00:00:00`));
  const fimBase = fim || (fimEvento ? null : new Date(`${fallbackFim}T00:00:00`));

  if (!inicioBase || !fimBase || inicioBase > fimBase) {
    return [fallbackInicio, '2026-08-27', fallbackFim];
  }

  const datas = [];
  const cursor = new Date(inicioBase);
  while (cursor <= fimBase) {
    const ano = cursor.getFullYear();
    const mes = String(cursor.getMonth() + 1).padStart(2, '0');
    const dia = String(cursor.getDate()).padStart(2, '0');
    datas.push(`${ano}-${mes}-${dia}`);
    cursor.setDate(cursor.getDate() + 1);
  }

  return datas.length ? datas : [fallbackInicio, '2026-08-27', fallbackFim];
}

module.exports = {
  getConfiguracoes,
  salvarConfiguracoes,
  getAnoJifc,
  getAtletasPendentes,
  validarAtleta,
  getConfiguracoesBanco,
  gerarDatasEventoDisponiveis
};
