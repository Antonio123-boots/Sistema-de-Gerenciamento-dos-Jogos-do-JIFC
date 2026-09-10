const assert = require('node:assert/strict');
const {
  calcularDistribuicaoTenisMesaIndividual,
  calcularDistribuicaoTamanhoChaves,
  agruparParticipantesEmChaves
} = require('../services/chaveamentoService');

assert.deepEqual(calcularDistribuicaoTenisMesaIndividual(0), []);
assert.deepEqual(calcularDistribuicaoTenisMesaIndividual(1), [1]);
assert.deepEqual(calcularDistribuicaoTenisMesaIndividual(2), [2]);
assert.deepEqual(calcularDistribuicaoTenisMesaIndividual(3), [3]);
assert.deepEqual(calcularDistribuicaoTenisMesaIndividual(4), [4]);
assert.deepEqual(calcularDistribuicaoTenisMesaIndividual(5), [3, 2]);
assert.deepEqual(calcularDistribuicaoTenisMesaIndividual(6), [3, 3]);
assert.deepEqual(calcularDistribuicaoTenisMesaIndividual(7), [4, 3]);
assert.deepEqual(calcularDistribuicaoTenisMesaIndividual(8), [4, 4]);
assert.deepEqual(calcularDistribuicaoTenisMesaIndividual(9), [3, 3, 3]);
assert.deepEqual(calcularDistribuicaoTenisMesaIndividual(10), [4, 3, 3]);
assert.deepEqual(calcularDistribuicaoTenisMesaIndividual(11), [4, 4, 3]);
assert.deepEqual(calcularDistribuicaoTenisMesaIndividual(12), [3, 3, 3, 3]);
assert.deepEqual(calcularDistribuicaoTenisMesaIndividual(17), [4, 4, 3, 3, 3]);

for (let total = 1; total <= 60; total += 1) {
  const tamanhos = calcularDistribuicaoTenisMesaIndividual(total);
  assert.equal(tamanhos.reduce((a, b) => a + b, 0), total, `soma invalida para ${total}`);
  if (total >= 6) {
    tamanhos.forEach((tamanho) => {
      assert.ok(tamanho >= 3 && tamanho <= 4, `chave com ${tamanho} atletas em total ${total}`);
    });
  }
}

const antigo = calcularDistribuicaoTamanhoChaves(8);
assert.deepEqual(antigo, [3, 3, 2]);

const participantes = [];
for (let i = 1; i <= 8; i += 1) {
  participantes.push({
    id: i,
    nomeAtleta: `Atleta ${i}`,
    nomeCampus: `IFC Campus ${i}`,
    numeroSistema: i
  });
}
const gruposOito = agruparParticipantesEmChaves(participantes, 3, {
  modalidadeNome: 'Tênis de Mesa Masculino',
  subCategoria: 'individual'
});
assert.deepEqual(gruposOito.map((g) => g.length).sort((a, b) => a - b), [4, 4]);

const participantesDezesseis = participantes.concat(
  Array.from({ length: 8 }, (_, i) => ({
    id: 9 + i,
    nomeAtleta: `Atleta ${9 + i}`,
    nomeCampus: `IFC Campus ${9 + i}`,
    numeroSistema: 9 + i
  }))
);
const gruposDezesseis = agruparParticipantesEmChaves(participantesDezesseis, 3, {
  modalidadeNome: 'Tênis de Mesa Feminino',
  subCategoria: 'individual'
});
assert.deepEqual(gruposDezesseis.map((g) => g.length).sort((a, b) => a - b), [3, 3, 3, 3, 4]);

console.log('OK sorteioTenisMesa.test.js');
