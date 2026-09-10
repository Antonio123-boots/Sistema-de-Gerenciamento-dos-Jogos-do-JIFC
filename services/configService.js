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

function carregarConfiguracoes() {
  const estado = readState();
  return { ...configuracoesPadrao, ...(estado.configuracoes || {}) };
}

function getConfiguracoes() {
  return cloneState(carregarConfiguracoes());
}

function normalizarFluxoCronologico(config = {}) {
  const dataOuNull = (valor) => {
    const texto = String(valor || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return null;
    const data = new Date(`${texto}T00:00:00`);
    return Number.isNaN(data.getTime()) ? null : texto;
  };

  const maiorData = (primeira, segunda) => {
    if (!primeira) return segunda;
    if (!segunda) return primeira;
    return primeira >= segunda ? primeira : segunda;
  };

  const ajustarIntervalo = (inicio, fim, limiteInicio = null) => {
    let inicioAjustado = dataOuNull(inicio);
    let fimAjustado = dataOuNull(fim);

    if (limiteInicio) {
      inicioAjustado = maiorData(inicioAjustado, limiteInicio);
    }
    if (!inicioAjustado && fimAjustado) inicioAjustado = fimAjustado;
    if (inicioAjustado && (!fimAjustado || fimAjustado < inicioAjustado)) {
      fimAjustado = inicioAjustado;
    }

    return [inicioAjustado, fimAjustado];
  };

  const [inicioModalidades, fimModalidades] = ajustarIntervalo(
    config.inicio_inscricao_modalidades,
    config.fim_inscricao_modalidades
  );
  const [inicioAtletas, fimAtletas] = ajustarIntervalo(
    config.inicio_inscricao_atletas,
    config.fim_inscricao_atletas,
    fimModalidades
  );
  const [inicioSorteio, fimSorteio] = ajustarIntervalo(
    config.inicio_sorteio_chaves,
    config.fim_sorteio_chaves,
    fimAtletas
  );

  return {
    ...config,
    inicio_inscricao_modalidades: inicioModalidades,
    fim_inscricao_modalidades: fimModalidades,
    inicio_inscricao_atletas: inicioAtletas,
    fim_inscricao_atletas: fimAtletas,
    inicio_sorteio_chaves: inicioSorteio,
    fim_sorteio_chaves: fimSorteio
  };
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

  estadoAtual.configuracoes = normalizarFluxoCronologico({
    ...configuracoesAtuais,
    ...novosDados,
    ano_evento: Number.isFinite(anoDerivado) ? anoDerivado : configuracoesAtuais.ano_evento,
    limite_atletas_total_campus: Number(
      novosDados.limite_atletas_total_campus ?? configuracoesAtuais.limite_atletas_total_campus ?? 0
    )
  });

  writeState(estadoAtual);
  persistirConfiguracoesNoBanco(estadoAtual.configuracoes).catch((error) => {
    console.error('Erro ao espelhar configurações no banco:', error.message);
  });
  return getConfiguracoes();
}

/* Espelha as configurações do state store na tabela configuracoes_evento.
   Grava sempre a linha mais recente; datas vazias viram NULL (estados parciais). */
async function persistirConfiguracoesNoBanco(config) {
  const dataOuNull = (valor) => {
    const texto = String(valor || '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(texto) ? texto : null;
  };

  const configNormalizada = normalizarFluxoCronologico(config);
  const valores = {
    ano_evento: Number(configNormalizada.ano_evento) || new Date().getFullYear(),
    inicio_evento: dataOuNull(configNormalizada.inicio_evento),
    fim_evento: dataOuNull(configNormalizada.fim_evento),
    inicio_inscricao_modalidades: dataOuNull(configNormalizada.inicio_inscricao_modalidades),
    fim_inscricao_modalidades: dataOuNull(configNormalizada.fim_inscricao_modalidades),
    inicio_inscricao_atletas: dataOuNull(configNormalizada.inicio_inscricao_atletas),
    fim_inscricao_atletas: dataOuNull(configNormalizada.fim_inscricao_atletas),
    inicio_sorteio_chaves: dataOuNull(configNormalizada.inicio_sorteio_chaves),
    fim_sorteio_chaves: dataOuNull(configNormalizada.fim_sorteio_chaves),
    limite_atletas_total_campus: Number(configNormalizada.limite_atletas_total_campus) || 0
  };

  const colunas = [
    'ano_evento', 'inicio_evento', 'fim_evento',
    'inicio_inscricao_modalidades', 'fim_inscricao_modalidades',
    'inicio_inscricao_atletas', 'fim_inscricao_atletas',
    'inicio_sorteio_chaves', 'fim_sorteio_chaves',
    'limite_atletas_total_campus'
  ];

  const [existentes] = await db.query('SELECT id FROM configuracoes_evento ORDER BY id DESC LIMIT 1');
  const valoresFinais = colunas.map((coluna) => valores[coluna]);

  if (existentes[0]) {
    const atribuicoes = colunas.map((coluna) => `${coluna} = ?`).join(', ');
    await db.query(`UPDATE configuracoes_evento SET ${atribuicoes} WHERE id = ?`, [...valoresFinais, existentes[0].id]);
  } else {
    const placeholders = colunas.map(() => '?').join(', ');
    await db.query(`INSERT INTO configuracoes_evento (${colunas.join(', ')}) VALUES (${placeholders})`, valoresFinais);
  }
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
  getConfiguracoesBanco,
  gerarDatasEventoDisponiveis,
  persistirConfiguracoesParaBanco
};

/* Idempotente: espelha as configurações atuais do state store no banco.
   Usado no startup para migrar estados legados e manter as fontes em sincronia. */
async function persistirConfiguracoesParaBanco() {
  const estado = readState();
  if (!estado.configuracoes || typeof estado.configuracoes !== 'object') {
    return;
  }
  const configuracoes = normalizarFluxoCronologico({ ...configuracoesPadrao, ...estado.configuracoes });
  const estadoAnterior = JSON.stringify(estado.configuracoes);
  const estadoAtualizado = JSON.stringify(configuracoes);
  if (estadoAnterior !== estadoAtualizado) {
    estado.configuracoes = configuracoes;
    writeState(estado);
  }
  await persistirConfiguracoesNoBanco(configuracoes);
}
