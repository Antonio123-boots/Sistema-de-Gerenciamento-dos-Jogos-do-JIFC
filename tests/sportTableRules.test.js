const assert = require('node:assert/strict');
const adminModel = require('../models/adminModel');

const tipoAtletismo = adminModel.getTipoTabelaModalidade('Atletismo');
assert.equal(tipoAtletismo, 'atletismo');

const tipoXadrez = adminModel.getTipoTabelaModalidade('Xadrez');
assert.equal(tipoXadrez, 'xadrez');

const colunasBasquete = adminModel.getColunasTabelaModalidade('Basquete');
assert.deepEqual(colunasBasquete, ['PTS', 'J', 'V', 'D', 'E', '%', 'PF', 'PC', 'SP']);

const colunasXadrez = adminModel.getColunasTabelaModalidade('Xadrez');
assert.deepEqual(colunasXadrez, ['Atleta', 'Campus', 'PTS', 'V', 'D', 'E', 'SB']);

const colunasAtletismo = adminModel.getColunasTabelaModalidade('Atletismo');
assert.deepEqual(colunasAtletismo, ['Categoria', 'Resultado']);

assert.equal(adminModel.isModalidadeSorteavel('Atletismo', 'Individual', 'geral'), false);
assert.equal(adminModel.isModalidadeSorteavel('Xadrez', 'Individual', 'geral'), false);

console.log('Teste de regras de tabela por esporte concluído com sucesso.');
