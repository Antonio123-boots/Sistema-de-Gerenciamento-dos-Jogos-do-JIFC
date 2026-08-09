const assert = require('assert');
const { agruparParticipantesEmChaves } = require('../models/adminModel');

const participantes = ['A', 'B', 'C', 'D', 'E', 'F'];
const grupos = agruparParticipantesEmChaves(participantes, 4);

assert.strictEqual(grupos.length, 2);
assert.deepStrictEqual(grupos[0], ['A', 'B', 'C', 'D']);
assert.deepStrictEqual(grupos[1], ['E', 'F']);

console.log('Testes de agrupamento do chaveamento concluídos com sucesso.');
