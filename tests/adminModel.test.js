const assert = require('assert');
const { agruparParticipantesEmChaves } = require('../models/adminModel');

const participantes = [
  { id: 1, nome: 'Atleta 1', nomeCampus: 'A' },
  { id: 2, nome: 'Atleta 2', nomeCampus: 'B' },
  { id: 3, nome: 'Atleta 3', nomeCampus: 'C' },
  { id: 4, nome: 'Atleta 4', nomeCampus: 'D' },
  { id: 5, nome: 'Atleta 5', nomeCampus: 'E' },
  { id: 6, nome: 'Atleta 6', nomeCampus: 'F' },
  { id: 7, nome: 'Atleta 7', nomeCampus: 'G' },
  { id: 8, nome: 'Atleta 8', nomeCampus: 'H' }
];

const grupos = agruparParticipantesEmChaves(participantes, 4, {
  modalidadeNome: 'Tênis de Mesa',
  subCategoria: 'individual'
});

assert.deepStrictEqual(grupos.map((grupo) => grupo.length).sort((a, b) => b - a), [4, 4]);

const ids = grupos.flat().map((participante) => participante.id).sort((a, b) => a - b);
assert.deepStrictEqual(ids, [1, 2, 3, 4, 5, 6, 7, 8]);

for (const grupo of grupos) {
  const campi = grupo.map((participante) => participante.nomeCampus);
  assert.strictEqual(new Set(campi).size, campi.length, `Grupo com campus duplicado: ${campi.join(', ')}`);
}

console.log('Teste de chaveamento de tênis de mesa individual concluído com sucesso.');
