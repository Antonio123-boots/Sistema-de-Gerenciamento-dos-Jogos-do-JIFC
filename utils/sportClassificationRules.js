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
    pontuacaoVitoria: 2,
    pontuacaoEmpate: 1,
    pontuacaoDerrota: 0,
    colunasTabela: ['Pts', 'PJ', 'V', 'E', 'D', 'GP', 'GC', 'SG'],
    colunasChave: ['Pts', 'PJ', 'V', 'E', 'D', 'GP', 'GC', 'SG'],
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
  voleibol: {
    tipo: 'sets',
    pontuacaoVitoria: 3,
    pontuacaoEmpate: 0,
    pontuacaoDerrota: 1,
    colunasTabela: ['Pts', 'PJ', 'V', 'D', 'SG', 'SP', 'Sets+/-'],
    colunasChave: ['Pts', 'PJ', 'V', 'D', 'Sets+/-'],
    temSets: true,
    temCartoes: false,
    ordenarPor: (a, b) => {
      if (b.pontos !== a.pontos) return b.pontos - a.pontos;
      if (b.sets_ganhos !== a.sets_ganhos) return b.sets_ganhos - a.sets_ganhos;
      if (a.sets_perdidos !== b.sets_perdidos) return a.sets_perdidos - b.sets_perdidos;
      return 0;
    }
  },
  'volei de praia': {
    tipo: 'sets',
    pontuacaoVitoria: 3,
    pontuacaoEmpate: 0,
    pontuacaoDerrota: 1,
    colunasTabela: ['Pts', 'PJ', 'V', 'D', 'SG', 'SP', 'Sets+/-'],
    colunasChave: ['Pts', 'PJ', 'V', 'D', 'Sets+/-'],
    temSets: true,
    temCartoes: false,
    ordenarPor: (a, b) => {
      if (b.pontos !== a.pontos) return b.pontos - a.pontos;
      if (b.sets_ganhos !== a.sets_ganhos) return b.sets_ganhos - a.sets_ganhos;
      if (a.sets_perdidos !== b.sets_perdidos) return a.sets_perdidos - b.sets_perdidos;
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
