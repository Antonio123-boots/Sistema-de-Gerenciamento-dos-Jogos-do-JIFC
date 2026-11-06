const RULES = {
  futsal: {
    tipo: 'gols',
    padraoEliminatoria: 'alternado',
    pontuacaoVitoria: 3,
    pontuacaoEmpate: 1,
    pontuacaoDerrota: 0,
    colunasTabela: ['Pts', 'PJ', 'V', 'E', 'D', 'GP', 'GC', 'SG', 'CF'],
    colunasChave: ['Pts', 'PJ', 'V', 'E', 'D', 'GP', 'GC', 'SG', 'CF'],
    cartaoAmarelo: -1,
    cartaoVermelho: -3,
    temSets: false,
    temCartoes: true,
    criteriosDesempate: [
      'pontos',
      'confronto_direto',
      'vitorias',
      'saldo_gols',
      'maior_gols_feitos',
      'menor_gols_sofridos',
      'menor_cartoes_vermelhos',
      'menor_cartoes_amarelos',
      'sorteio'
    ],
    ordenarPor: (a, b) => {
      if (b.pontos !== a.pontos) return b.pontos - a.pontos;
      if (b.vitorias !== a.vitorias) return b.vitorias - a.vitorias;
      const saldoA = a.pontos_pro - a.pontos_contra;
      const saldoB = b.pontos_pro - b.pontos_contra;
      if (saldoB !== saldoA) return saldoB - saldoA;
      if (b.pontos_pro !== a.pontos_pro) return b.pontos_pro - a.pontos_pro;
      return 0;
    }
  },
  handebol: {
    tipo: 'gols',
    padraoEliminatoria: 'alternado',
    pontuacaoVitoria: 3,
    pontuacaoEmpate: 1,
    pontuacaoDerrota: 0,
    colunasTabela: ['Pts', 'PJ', 'V', 'E', 'D', 'GP', 'GC', 'SG', 'CF'],
    colunasChave: ['Pts', 'PJ', 'V', 'E', 'D', 'GP', 'GC', 'SG', 'CF'],
    cartaoAmarelo: -1,
    cartaoVermelho: -3,
    excluicao2Min: -1,
    temSets: false,
    temCartoes: true,
    criteriosDesempate: [
      'pontos',
      'confronto_direto',
      'vitorias',
      'saldo_gols_empatadas',
      'saldo_gols',
      'menor_gols_sofridos',
      'maior_gols_feitos',
      'media_gols',
      'sancoes',
      'sorteio'
    ],
    ordenarPor: (a, b) => {
      if (b.pontos !== a.pontos) return b.pontos - a.pontos;
      if (b.vitorias !== a.vitorias) return b.vitorias - a.vitorias;
      const saldoA = a.pontos_pro - a.pontos_contra;
      const saldoB = b.pontos_pro - b.pontos_contra;
      if (saldoB !== saldoA) return saldoB - saldoA;
      if (a.pontos_contra !== b.pontos_contra) return a.pontos_contra - b.pontos_contra;
      if (b.pontos_pro !== a.pontos_pro) return b.pontos_pro - a.pontos_pro;
      const mediaA = a.pontos_contra > 0 ? a.pontos_pro / a.pontos_contra : a.pontos_pro;
      const mediaB = b.pontos_contra > 0 ? b.pontos_pro / b.pontos_contra : b.pontos_pro;
      if (mediaB !== mediaA) return mediaB - mediaA;
      const sancA = (a.cartoes_amarelos || 0) * 1 + (a.cartoes_vermelhos || 0) * 3 + (a.excluicoes_2min || 0) * 1;
      const sancB = (b.cartoes_amarelos || 0) * 1 + (b.cartoes_vermelhos || 0) * 3 + (b.excluicoes_2min || 0) * 1;
      return sancA - sancB;
    }
  },
  basquete: {
    tipo: 'pontos',
    padraoEliminatoria: 'alternado',
    pontuacaoVitoria: 3,
    pontuacaoEmpate: 1,
    pontuacaoDerrota: 0,
    colunasTabela: ['Pts', 'PJ', 'V', 'E', 'D', 'PF', 'PC', 'SP'],
    colunasChave: ['Pts', 'PJ', 'V', 'E', 'D', 'PF', 'PC', 'SP'],
    temSets: false,
    temCartoes: false,
    criteriosDesempate: [
      'pontos',
      'confronto_direto',
      'vitorias',
      'saldo_gols',
      'maior_gols_feitos',
      'pontos_average',
      'sorteio'
    ],
    ordenarPor: (a, b) => {
      if (b.pontos !== a.pontos) return b.pontos - a.pontos;
      if (b.vitorias !== a.vitorias) return b.vitorias - a.vitorias;
      const saldoA = a.pontos_pro - a.pontos_contra;
      const saldoB = b.pontos_pro - b.pontos_contra;
      if (saldoB !== saldoA) return saldoB - saldoA;
      if (b.pontos_pro !== a.pontos_pro) return b.pontos_pro - a.pontos_pro;
      return 0;
    }
  },
  'volei de praia': {
    tipo: 'sets',
    padraoEliminatoria: 'sequencial',
    pontuacaoVitoria3_0_3_1: 3,
    pontuacaoVitoria3_2: 2,
    pontuacaoDerrota2_3: 1,
    pontuacaoDerrota0_3_1_3: 0,
    pontuacaoEmpate: 0,
    colunasTabela: ['Pts', 'PJ', 'V', 'D', 'SG', 'SP', 'SA', 'PA'],
    colunasChave: ['Pts', 'PJ', 'V', 'D', 'SG', 'SP', 'SA', 'PA'],
    temSets: true,
    temCartoes: false,
    criteriosDesempate: [
      'vitorias',
      'sets_average',
      'pontos_average',
      'sorteio'
    ],
    ordenarPor: (a, b) => {
      if (b.pontos !== a.pontos) return b.pontos - a.pontos;
      if (b.vitorias !== a.vitorias) return b.vitorias - a.vitorias;
      const qsA = a.sets_perdidos > 0 ? a.sets_ganhos / a.sets_perdidos : a.sets_ganhos;
      const qsB = b.sets_perdidos > 0 ? b.sets_ganhos / b.sets_perdidos : b.sets_ganhos;
      if (qsB !== qsA) return qsB - qsA;
      const pqA = a.pontos_contra > 0 ? a.pontos_pro / a.pontos_contra : a.pontos_pro;
      const pqB = b.pontos_contra > 0 ? b.pontos_pro / b.pontos_contra : b.pontos_pro;
      return pqB - pqA;
    }
  },
  volei: {
    tipo: 'sets',
    padraoEliminatoria: 'alternado',
    pontuacaoVitoria3_0_3_1: 3,
    pontuacaoVitoria3_2: 2,
    pontuacaoDerrota2_3: 1,
    pontuacaoDerrota0_3_1_3: 0,
    pontuacaoEmpate: 0,
    colunasTabela: ['Pts', 'PJ', 'V', 'D', 'SG', 'SP', 'SA', 'PA'],
    colunasChave: ['Pts', 'PJ', 'V', 'D', 'SG', 'SP', 'SA', 'PA'],
    temSets: true,
    temCartoes: false,
    criteriosDesempate: [
      'vitorias',
      'sets_average',
      'pontos_average',
      'sorteio'
    ],
    ordenarPor: (a, b) => {
      if (b.pontos !== a.pontos) return b.pontos - a.pontos;
      if (b.vitorias !== a.vitorias) return b.vitorias - a.vitorias;
      const qsA = a.sets_perdidos > 0 ? a.sets_ganhos / a.sets_perdidos : a.sets_ganhos;
      const qsB = b.sets_perdidos > 0 ? b.sets_ganhos / b.sets_perdidos : b.sets_ganhos;
      if (qsB !== qsA) return qsB - qsA;
      const pqA = a.pontos_contra > 0 ? a.pontos_pro / a.pontos_contra : a.pontos_pro;
      const pqB = b.pontos_contra > 0 ? b.pontos_pro / b.pontos_contra : b.pontos_pro;
      return pqB - pqA;
    }
  },
  'tenis de mesa': {
    tipo: 'sets',
    padraoEliminatoria: 'sequencial', // individual; dupla usa 'alternado' (ver obterPadraoEliminatoria)
    pontuacaoVitoria3_0_3_1: 3,
    pontuacaoVitoria3_2: 2,
    pontuacaoDerrota2_3: 1,
    pontuacaoDerrota0_3_1_3: 0,
    pontuacaoEmpate: 0,
    colunasTabela: ['Pts', 'PJ', 'V', 'D', 'SG', 'SP', 'SA', 'PA'],
    colunasChave: ['Pts', 'PJ', 'V', 'D', 'SG', 'SP', 'SA', 'PA'],
    temSets: true,
    temCartoes: false,
    criteriosDesempate: [
      'confronto_direto',
      'vitorias',
      'sets_average',
      'pontos_average',
      'sorteio'
    ],
    ordenarPor: (a, b) => {
      if (b.pontos !== a.pontos) return b.pontos - a.pontos;
      if (b.vitorias !== a.vitorias) return b.vitorias - a.vitorias;
      const qsA = a.sets_perdidos > 0 ? a.sets_ganhos / a.sets_perdidos : a.sets_ganhos;
      const qsB = b.sets_perdidos > 0 ? b.sets_ganhos / b.sets_perdidos : b.sets_ganhos;
      if (qsB !== qsA) return qsB - qsA;
      const pqA = a.pontos_contra > 0 ? a.pontos_pro / a.pontos_contra : a.pontos_pro;
      const pqB = b.pontos_contra > 0 ? b.pontos_pro / b.pontos_contra : b.pontos_pro;
      return pqB - pqA;
    }
  },
  badminton: {
    tipo: 'sets',
    padraoEliminatoria: 'sequencial',
    pontuacaoVitoria3_0_3_1: 3,
    pontuacaoVitoria3_2: 2,
    pontuacaoDerrota2_3: 1,
    pontuacaoDerrota0_3_1_3: 0,
    pontuacaoEmpate: 0,
    colunasTabela: ['Pts', 'PJ', 'V', 'D', 'SG', 'SP', 'SA', 'PA'],
    colunasChave: ['Pts', 'PJ', 'V', 'D', 'SG', 'SP', 'SA', 'PA'],
    temSets: true,
    temCartoes: false,
    criteriosDesempate: [
      'vitorias',
      'confronto_direto',
      'sets_average',
      'pontos_average',
      'sorteio'
    ],
    ordenarPor: (a, b) => {
      if (b.pontos !== a.pontos) return b.pontos - a.pontos;
      if (b.vitorias !== a.vitorias) return b.vitorias - a.vitorias;
      const qsA = a.sets_perdidos > 0 ? a.sets_ganhos / a.sets_perdidos : a.sets_ganhos;
      const qsB = b.sets_perdidos > 0 ? b.sets_ganhos / b.sets_perdidos : b.sets_ganhos;
      if (qsB !== qsA) return qsB - qsA;
      const pqA = a.pontos_contra > 0 ? a.pontos_pro / a.pontos_contra : a.pontos_pro;
      const pqB = b.pontos_contra > 0 ? b.pontos_pro / b.pontos_contra : b.pontos_pro;
      return pqB - pqA;
    }
  },
  atletismo: {
    tipo: 'individual_medida',
    tipo_individual: true,
    temSets: false,
    temCartoes: false,
    colunasTabela: ['Atleta', 'Campus', 'PTS'],
    colunasChave: ['Atleta', 'Campus', 'PTS'],
    pontuacoesPosicao: [13, 8, 6, 5, 4, 3, 2, 1],
    ordenarPor: (a, b) => {
      if (b.pontos !== a.pontos) return b.pontos - a.pontos;
      return 0;
    }
  },
  xadrez: {
    tipo: 'individual_pontos',
    tipo_individual: true,
    temSets: false,
    temCartoes: false,
    colunasTabela: ['Atleta', 'Campus', 'PTS', 'V', 'D', 'E'],
    colunasChave: ['Atleta', 'Campus', 'PTS', 'V', 'D', 'E'],
    ordenarPor: (a, b) => {
      if (b.pontos !== a.pontos) return b.pontos - a.pontos;
      if (b.vitorias !== a.vitorias) return b.vitorias - a.vitorias;
      return 0;
    }
  }
};

function normalizarNome(nome) {
  return String(nome || '').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[-_]+/g, ' ');
}

const PLACAR_WO = {
  futsal: { p1: 3, p2: 0 },
  handebol: { p1: 10, p2: 0 },
  basquete: { p1: 20, p2: 0 },
  'volei de praia': { p1: 2, p2: 0, sets: [{ pontos_1: 21, pontos_2: 0 }, { pontos_1: 21, pontos_2: 0 }] },
  volei: { p1: 2, p2: 0, sets: [{ pontos_1: 21, pontos_2: 0 }, { pontos_1: 21, pontos_2: 0 }] },
  'tenis de mesa': { p1: 2, p2: 0, sets: [{ pontos_1: 11, pontos_2: 0 }, { pontos_1: 11, pontos_2: 0 }] },
  badminton: { p1: 2, p2: 0, sets: [{ pontos_1: 21, pontos_2: 0 }, { pontos_1: 21, pontos_2: 0 }] }
};

function obterPlacarWo(nomeModalidade) {
  const nome = normalizarNome(nomeModalidade);
  for (const [chave, placar] of Object.entries(PLACAR_WO)) {
    if (nome.includes(chave)) return placar;
  }
  return { p1: 1, p2: 0 };
}

function obterRegras(nomeModalidade) {
  const nome = normalizarNome(nomeModalidade);
  for (const [chave, regras] of Object.entries(RULES)) {
    if (nome.includes(chave)) {
      return regras;
    }
  }
  const erro = new Error(`Não há regras esportivas cadastradas para a modalidade "${String(nomeModalidade || '').trim()}".`);
  erro.code = 'MODALIDADE_SEM_REGRAS';
  throw erro;
}

function obterPadraoEliminatoria(nomeModalidade, subCategoria) {
  let regras;
  try {
    regras = obterRegras(nomeModalidade);
  } catch (erro) {
    return null;
  }

  if (!regras || !regras.padraoEliminatoria) return null;
  if (normalizarNome(nomeModalidade).includes('tenis de mesa') && normalizarNome(subCategoria) === 'dupla') {
    return 'alternado';
  }
  return regras.padraoEliminatoria;
}

function colunasParaExibicao(nomeModalidade) {
  const regras = obterRegras(nomeModalidade);
  return regras.colunasTabela;
}

function colunasParaChave(nomeModalidade) {
  const regras = obterRegras(nomeModalidade);
  return regras.colunasChave;
}

function converterRegrasJsonParaInterno(regrasJson) {
  if (!regrasJson) return null;
  let regras = regrasJson;
  if (typeof regrasJson === 'string') {
    try { regras = JSON.parse(regrasJson); } catch (e) { return null; }
  }
  if (!regras || typeof regras !== 'object') return null;
  const tipoApuracao = regras.tipoApuracao || regras.tipo || 'gols';
  const usaSets = regras.usaSets === true || regras.usa_sets === true || tipoApuracao === 'sets';
  const usaCartoes = regras.usaCartoes === true || regras.usa_cartoes === true;
  const pontuacao = regras.pontuacao || {};
  const pontuacaoSetsConfigurada = regras.pontuacaoSets || regras.pontuacao_sets;
  const pontuacaoSets = pontuacaoSetsConfigurada && typeof pontuacaoSetsConfigurada === 'object' ? pontuacaoSetsConfigurada : null;
  const pontosVitoria = Number(pontuacao.vitoria ?? 3);
  const pontosDerrota = Number(pontuacao.derrota ?? 0);
  const colunasPadrao = usaSets
    ? ['Pts', 'PJ', 'V', 'D', 'SG', 'SP', 'SA', 'PA']
    : ['Pts', 'PJ', 'V', 'E', 'D', 'GP', 'GC', 'SG'];
  const r = {
    tipo: usaSets ? 'sets' : (tipoApuracao === 'pontos' ? 'pontos' : (tipoApuracao === 'medida' || tipoApuracao === 'individual_medida' ? 'individual_medida' : (tipoApuracao === 'pontuacao_individual' || tipoApuracao === 'individual_pontos' ? 'individual_pontos' : 'gols'))),
    padraoEliminatoria: regras.padraoEliminatoria || regras.padrao_eliminatoria || 'alternado',
    pontuacaoVitoria: pontosVitoria,
    pontuacaoEmpate: Number(pontuacao.empate ?? 1),
    pontuacaoDerrota: pontosDerrota,
    pontuacaoVitoria3_0_3_1: Number(pontuacaoSets?.vitoria3_0_3_1 ?? pontosVitoria),
    pontuacaoVitoria3_2: Number(pontuacaoSets?.vitoria3_2 ?? pontosVitoria),
    pontuacaoDerrota2_3: Number(pontuacaoSets?.derrota2_3 ?? pontosDerrota),
    pontuacaoDerrota0_3_1_3: Number(pontuacaoSets?.derrota0_3_1_3 ?? pontosDerrota),
    colunasTabela: Array.isArray(regras.colunasTabela) ? regras.colunasTabela : colunasPadrao,
    colunasChave: Array.isArray(regras.colunasChave) ? regras.colunasChave : colunasPadrao,
    temSets: usaSets,
    temCartoes: usaCartoes,
    criteriosDesempate: Array.isArray(regras.criteriosDesempate) ? regras.criteriosDesempate : ['pontos', 'confronto_direto', 'vitorias', 'saldo_gols', 'sorteio'],
    ordenarPor: (a, b) => {
      if ((b.pontos || 0) !== (a.pontos || 0)) return (b.pontos || 0) - (a.pontos || 0);
      if ((b.vitorias || 0) !== (a.vitorias || 0)) return (b.vitorias || 0) - (a.vitorias || 0);
      if (usaSets) {
        const qsA = (a.sets_perdidos || 0) > 0 ? (a.sets_ganhos || 0) / (a.sets_perdidos || 0) : (a.sets_ganhos || 0);
        const qsB = (b.sets_perdidos || 0) > 0 ? (b.sets_ganhos || 0) / (b.sets_perdidos || 0) : (b.sets_ganhos || 0);
        if (qsB !== qsA) return qsB - qsA;
      } else {
        const sa = (a.pontos_pro || 0) - (a.pontos_contra || 0);
        const sb = (b.pontos_pro || 0) - (b.pontos_contra || 0);
        if (sb !== sa) return sb - sa;
      }
      if ((b.pontos_pro || 0) !== (a.pontos_pro || 0)) return (b.pontos_pro || 0) - (a.pontos_pro || 0);
      return 0;
    }
  };
  if (regras.tipo_individual || tipoApuracao === 'medida' || tipoApuracao === 'individual_medida') {
    r.tipo = 'individual_medida';
    r.tipo_individual = true;
    r.colunasTabela = ['Atleta', 'Campus', 'PTS'];
    r.colunasChave = ['Atleta', 'Campus', 'PTS'];
  } else if (tipoApuracao === 'pontuacao_individual' || tipoApuracao === 'individual_pontos') {
    r.tipo = 'individual_pontos';
    r.tipo_individual = true;
    r.colunasTabela = ['Atleta', 'Campus', 'PTS', 'V', 'D', 'E'];
    r.colunasChave = ['Atleta', 'Campus', 'PTS', 'V', 'D', 'E'];
  }
  return r;
}

const _rc = new Map();
const _rcPorNome = new Map();

function registrarRegrasModalidade(mid, nome, regrasJson) {
  if (!mid) return null;
  const regras = converterRegrasJsonParaInterno(regrasJson);
  if (!regras) return null;

  const chave = String(mid);
  _rc.set(chave, regras);
  if (nome) {
    _rcPorNome.set(normalizarNome(nome), regras);
  }
  return regras;
}

async function obterRegrasPorModalidadeId(mid) {
  if (!mid) return null;
  const k = String(mid);
  if (_rc.has(k)) return _rc.get(k);
  try {
    const db = require('../config/db');
    const [rows] = await db.query('SELECT id, nome, regras_json FROM modalidades WHERE id = ?', [mid]);
    if (rows.length && rows[0].regras_json) {
      return registrarRegrasModalidade(rows[0].id, rows[0].nome, rows[0].regras_json);
    }
  } catch (e) {}
  return null;
}

async function carregarRegrasModalidades() {
  try {
    const db = require('../config/db');
    const [rows] = await db.query('SELECT id, nome, regras_json FROM modalidades WHERE regras_json IS NOT NULL');
    _rc.clear();
    _rcPorNome.clear();
    for (const row of rows) {
      registrarRegrasModalidade(row.id, row.nome, row.regras_json);
    }
    return _rc.size;
  } catch (e) {
    return 0;
  }
}

function limparCacheRegrasModalidade(mid, nome = '') {
  if (mid) {
    _rc.delete(String(mid));
  }
  if (nome) {
    _rcPorNome.delete(normalizarNome(nome));
  }
}

function obterRegras(nomeModalidade, modalidadeId = null) {
  if (modalidadeId) {
    const k = String(modalidadeId);
    if (_rc.has(k)) return _rc.get(k);
  }

  const nome = normalizarNome(nomeModalidade);
  if (_rcPorNome.has(nome)) {
    return _rcPorNome.get(nome);
  }

  for (const [chave, regras] of Object.entries(RULES)) {
    if (nome.includes(chave)) {
      return regras;
    }
  }
  const erro = new Error(`N\u00e3o h\u00e1 regras esportivas cadastradas para a modalidade "${String(nomeModalidade || '').trim()}".`);
  erro.code = 'MODALIDADE_SEM_REGRAS';
  throw erro;
}

module.exports = {
  RULES,
  obterRegras,
  obterRegrasPorModalidadeId,
  carregarRegrasModalidades,
  registrarRegrasModalidade,
  converterRegrasJsonParaInterno,
  limparCacheRegrasModalidade,
  colunasParaExibicao,
  colunasParaChave,
  normalizarNome,
  obterPlacarWo,
  obterPadraoEliminatoria
};
