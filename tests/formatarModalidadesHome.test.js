const assert = require('assert');
const { formatarModalidadesParaHome } = require('../routes/userRoutes');

// REGRESSÃO: antigamente, com duas modalidades do mesmo esporte (mesmo slug base)
// que passavam no filtro de gênero, o trecho usava a variável inexistente "atual"
// e lançava ReferenceError, derrubando a home com 500.
const duplicarSlugEGenero = [
  { nome: 'Tênis de Mesa Masculino', genero: 'Masculino' },
  { nome: 'Tenis de Mesa Masculino', genero: 'Masculino' }
];

let resultado = null;
try {
  resultado = formatarModalidadesParaHome(duplicarSlugEGenero, 'Masculino', '');
} catch (e) {
  assert.fail(`Não deveria lançar exceção com slugs duplicados + filtro de gênero: ${e.message}`);
}
assert.ok(Array.isArray(resultado), 'Deveria retornar uma lista.');
assert.strictEqual(resultado.length, 1, 'Slugs duplicados devem colapsar em uma única modalidade.');
assert.strictEqual(resultado[0].slugBase, 'tenis-de-mesa-masculino');

// Filtro de gênero descarta o gênero oposto e mantém apenas o que combina.
const mistoPorGenero = [
  { nome: 'Futsal Masculino', genero: 'Masculino' },
  { nome: 'Futsal Feminino', genero: 'Feminino' }
];
const apenasFeminino = formatarModalidadesParaHome(mistoPorGenero, 'Feminino', '');
assert.strictEqual(apenasFeminino.length, 1, 'Com filtro feminino deve sobrar apenas a modalidade feminina.');
assert.strictEqual(apenasFeminino[0].genero, 'Feminino');

// Sem filtro: uma única modalidade por esporte, independente do gênero.
const semFiltro = formatarModalidadesParaHome(mistoPorGenero, '', '');
assert.strictEqual(semFiltro.length, 1, 'Sem filtro deve manter uma modalidade por esporte.');
assert.ok(semFiltro[0].slugBase === 'futsal' || semFiltro[0].slugBase === 'futsal-feminino');

console.log('Teste de regressão da formatação de modalidades da home concluído com sucesso.');