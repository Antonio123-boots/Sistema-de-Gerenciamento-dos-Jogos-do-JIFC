const assert = require('node:assert/strict');
const adminModel = require('../models/adminModel');
const { obterRegras, colunasParaExibicao } = require('../utils/sportClassificationRules');

const tipoAtletismo = adminModel.getTipoTabelaModalidade('Atletismo');
assert.equal(tipoAtletismo, 'atletismo');

const tipoXadrez = adminModel.getTipoTabelaModalidade('Xadrez');
assert.equal(tipoXadrez, 'xadrez');

const colunasBasquete = adminModel.getColunasTabelaModalidade('Basquete');
assert.deepEqual(colunasBasquete, ['Pts', 'PJ', 'V', 'E', 'D', 'PF', 'PC', 'SP']);

const colunasXadrez = adminModel.getColunasTabelaModalidade('Xadrez');
assert.deepEqual(colunasXadrez, ['Atleta', 'Campus', 'PTS', 'V', 'D', 'E', 'SB']);

const colunasAtletismo = adminModel.getColunasTabelaModalidade('Atletismo');
assert.deepEqual(colunasAtletismo, ['Categoria', 'Resultado']);

assert.equal(adminModel.isModalidadeSorteavel('Atletismo', 'Individual', 'geral'), false);
assert.equal(adminModel.isModalidadeSorteavel('Xadrez', 'Individual', 'geral'), false);

const regrasFutsal = obterRegras('Futsal Masculino');
assert.equal(regrasFutsal.tipo, 'gols');
assert.equal(regrasFutsal.temSets, false);
assert.equal(regrasFutsal.temCartoes, true);
assert.equal(regrasFutsal.pontuacaoVitoria, 3);
assert.deepEqual(regrasFutsal.colunasTabela, ['Pts', 'PJ', 'V', 'E', 'D', 'GP', 'GC', 'SG', 'CF']);
assert.throws(() => obterRegras('Esporte sem regra'), (erro) => erro.code === 'MODALIDADE_SEM_REGRAS');

const regrasVoleibol = obterRegras('Voleibol Feminino');
assert.equal(regrasVoleibol.tipo, 'sets');
assert.equal(regrasVoleibol.temSets, true);
assert.equal(regrasVoleibol.temCartoes, false);
assert.deepEqual(regrasVoleibol.colunasTabela, ['Pts', 'PJ', 'V', 'D', 'SG', 'SP', 'SA', 'PA']);
assert.equal(regrasVoleibol.pontuacaoVitoria3_0_3_1, 3);
assert.equal(regrasVoleibol.pontuacaoVitoria3_2, 2);
assert.equal(regrasVoleibol.pontuacaoDerrota2_3, 1);
assert.equal(regrasVoleibol.pontuacaoDerrota0_3_1_3, 0);

const regrasTenisMesa = obterRegras('Tênis de Mesa Masculino');
assert.equal(regrasTenisMesa.tipo, 'sets');
assert.equal(regrasTenisMesa.temSets, true);
assert.equal(regrasTenisMesa.temCartoes, false);
assert.deepEqual(regrasTenisMesa.colunasTabela, ['Pts', 'PJ', 'V', 'D', 'SG', 'SP', 'SA', 'PA']);
assert.equal(regrasTenisMesa.pontuacaoVitoria3_0_3_1, 3);
assert.equal(regrasTenisMesa.pontuacaoVitoria3_2, 2);
assert.equal(regrasTenisMesa.pontuacaoDerrota2_3, 1);
assert.equal(regrasTenisMesa.pontuacaoDerrota0_3_1_3, 0);
assert.deepEqual(regrasTenisMesa.criteriosDesempate, ['confronto_direto', 'vitorias', 'sets_average', 'pontos_average', 'sorteio']);

const regrasTenisMesaSlug = obterRegras('tenis-de-mesa-masculino');
assert.equal(regrasTenisMesaSlug.tipo, 'sets');
assert.deepEqual(regrasTenisMesaSlug.colunasTabela, ['Pts', 'PJ', 'V', 'D', 'SG', 'SP', 'SA', 'PA']);

const regrasHandebol = obterRegras('Handebol');
assert.equal(regrasHandebol.tipo, 'gols');
assert.equal(regrasHandebol.temSets, false);
assert.equal(regrasHandebol.pontuacaoVitoria, 3);

const regrasBasquete = obterRegras('Basquete');
assert.equal(regrasBasquete.tipo, 'pontos');
assert.equal(regrasBasquete.temSets, false);
assert.equal(regrasBasquete.pontuacaoVitoria, 3);
assert.deepEqual(regrasBasquete.criteriosDesempate, [
  'pontos',
  'confronto_direto',
  'vitorias',
  'saldo_gols',
  'maior_gols_feitos',
  'pontos_average',
  'sorteio'
]);

const colunasFutsal = colunasParaExibicao('Futsal');
assert.deepEqual(colunasFutsal, ['Pts', 'PJ', 'V', 'E', 'D', 'GP', 'GC', 'SG', 'CF']);

const colunasVoleibol = colunasParaExibicao('Voleibol');
assert.deepEqual(colunasVoleibol, ['Pts', 'PJ', 'V', 'D', 'SG', 'SP', 'SA', 'PA']);

console.log('Teste de regras de tabela por esporte concluído com sucesso.');
