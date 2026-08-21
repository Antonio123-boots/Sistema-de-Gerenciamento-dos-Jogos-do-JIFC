const RULES = {
  futsal: {
    tipo: 'gols',
    pontuacaoVitoria: 3,
    pontuacaoEmpate: 1,
    pontuacaoDerrota: 0,
    colunasTabela: ['Pts', 'PJ', 'V', 'E', 'D', 'GP', 'GC', 'SG', 'CF'],
    colunasChave: ['Pts', 'PJ', 'V', 'E', 'D', 'GP', 'GC', 'SG', 'CF'],
    cartaoAmarelo: -1,
    cartaoVermelho: -3,
    temSets: false,
    temCartoes: true,
    ordenarPor: (a, b) => {
      if (b.pontos !== a.pontos) return b.pontos - a.pontos;
      if (b.vitorias !== a.vitorias) return b.vitorias - a.vitorias;
      const saldoA = a.pontos_pro - a.pontos_contra;
      const saldoB = b.pontos_pro - b.pontos_contra;
      if (saldoB !== saldoA) return saldoB - saldoA;
      if (b.pontos_pro !== a.pontos_pro) return b.pontos_pro - a.pontos_pro;
      const fpA = (a.cartoes_amarelos || 0) * 1 + (a.cartoes_vermelhos || 0) * 3;
      const fpB = (b.cartoes_amarelos || 0) * 1 + (b.cartoes_vermelhos || 0) * 3;
      return fpA - fpB;
    }
  },
  handebol: {
    tipo: 'gols',
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
    pontuacaoVitoria: 2,
    pontuacaoEmpate: 1,
    pontuacaoDerrota: 0,
    colunasTabela: ['Pts', 'PJ', 'V', 'E', 'D', 'PF', 'PC', 'SP'],
    colunasChave: ['Pts', 'PJ', 'V', 'E', 'D', 'PF', 'PC', 'SP'],
    temSets: false,
    temCartoes: false,
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
  volei: {
    tipo: 'sets',
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
  'volei de praia': {
    tipo: 'sets',
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
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function obterRegras(nomeModalidade) {
  const nome = normalizarNome(nomeModalidade);
  for (const [chave, regras] of Object.entries(RULES)) {
    if (nome.includes(chave)) {
      return regras;
    }
  }
  return RULES.futsal;
}

function colunasParaExibicao(nomeModalidade) {
  const regras = obterRegras(nomeModalidade);
  return regras.colunasTabela;
}

function colunasParaChave(nomeModalidade) {
  const regras = obterRegras(nomeModalidade);
  return regras.colunasChave;
}

module.exports = {
  RULES,
  obterRegras,
  colunasParaExibicao,
  colunasParaChave,
  normalizarNome
};
