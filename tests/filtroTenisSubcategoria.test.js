const assert = require('assert');
const { ehTenisDeMesa, classificarSubCategoriaJogo, normalizarSubCategoriaFiltro } = require('../services/jogoService');

assert.strictEqual(ehTenisDeMesa('Tênis de Mesa Masculino'), true);
assert.strictEqual(ehTenisDeMesa('tenis de mesa feminino'), true);
assert.strictEqual(ehTenisDeMesa('Futsal Masculino'), false);
assert.strictEqual(ehTenisDeMesa('Vôlei de Praia Feminino'), false);
assert.strictEqual(ehTenisDeMesa(''), false);

assert.strictEqual(classificarSubCategoriaJogo('Tênis de Mesa Masculino', 10, 22), 'individual');
assert.strictEqual(classificarSubCategoriaJogo('Tênis de Mesa Feminino', 5, null), 'individual');
assert.strictEqual(classificarSubCategoriaJogo('Tênis de Mesa Masculino', null, null), 'dupla');
assert.strictEqual(classificarSubCategoriaJogo('Futsal Masculino', 1, 2), null);
assert.strictEqual(classificarSubCategoriaJogo('Futsal Masculino', null, null), null);
assert.strictEqual(classificarSubCategoriaJogo('', 1, 2), null);

assert.strictEqual(normalizarSubCategoriaFiltro('individual'), 'individual');
assert.strictEqual(normalizarSubCategoriaFiltro('Individual'), 'individual');
assert.strictEqual(normalizarSubCategoriaFiltro(' DUPLA '), 'dupla');
assert.strictEqual(normalizarSubCategoriaFiltro('duplas'), '');
assert.strictEqual(normalizarSubCategoriaFiltro(''), '');

console.log('Teste de filtro Individual/Dupla do Tênis de Mesa concluído com sucesso.');
