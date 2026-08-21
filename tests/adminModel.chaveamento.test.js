const assert = require('assert');
const { agruparParticipantesEmChaves } = require('../models/adminModel');

const participantes = ['A', 'B', 'C', 'D', 'E', 'F'];
const grupos = agruparParticipantesEmChaves(participantes, 4);

assert.strictEqual(grupos.length, 2);
assert.deepStrictEqual(grupos.map((grupo) => grupo.length).sort((a, b) => b - a), [3, 3]);

const todos = grupos.flat().sort();
assert.deepStrictEqual(todos, ['A', 'B', 'C', 'D', 'E', 'F']);

console.log('Testes de agrupamento do chaveamento concluídos com sucesso.');
