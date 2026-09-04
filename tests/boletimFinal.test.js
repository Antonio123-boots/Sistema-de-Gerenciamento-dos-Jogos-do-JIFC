const assert = require('node:assert/strict');
const { detectarEncerramentoJifc, montarResumoBoletim } = require('../services/boletimService');

const encerrado = detectarEncerramentoJifc({
  totalJogos: 12,
  totalEncerrados: 12,
  totalAgendados: 0,
  totalEmAndamento: 0,
  totalCancelados: 0
});
assert.equal(encerrado, true);

const incompleto = detectarEncerramentoJifc({
  totalJogos: 12,
  totalEncerrados: 10,
  totalAgendados: 1,
  totalEmAndamento: 1,
  totalCancelados: 0
});
assert.equal(incompleto, false);

const resumo = montarResumoBoletim({
  ano: 2025,
  ranking: [
    { campi: 'Campus A', pontos: 96 },
    { campi: 'Campus B', pontos: 90 }
  ],
  modalidades: [
    { nome: 'Basquete', campeao: 'Campus A', vice: 'Campus B' }
  ],
  dataGeracao: '2026-08-31'
});

assert.equal(resumo.ano, 2025);
assert.equal(resumo.ranking[0].campi, 'Campus A');
assert.equal(resumo.modalidades[0].nome, 'Basquete');
assert.ok(resumo.dataGeracao);

console.log('Teste de boletim final concluído com sucesso.');
