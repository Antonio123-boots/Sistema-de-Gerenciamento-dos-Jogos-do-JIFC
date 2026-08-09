const assert = require('assert');
const { filtrarModalidadesParaHome } = require('../utils/homeFilters');

const modalidadesBase = [
  { slug: 'futsal-masculino', nome: 'Futsal Masculino', dia: '24/06' },
  { slug: 'volei-masculino', nome: 'Voleibol Masculino', dia: '25/06' },
  { slug: 'basquete-masculino', nome: 'Basquete Masculino', dia: '26/06' }
];

const porModalidade = filtrarModalidadesParaHome(modalidadesBase, { modalidade: 'futsal-masculino' });
assert.deepStrictEqual(porModalidade.map((item) => item.slug), ['futsal-masculino']);

const porDia = filtrarModalidadesParaHome(modalidadesBase, { dia: '24/06' });
assert.deepStrictEqual(porDia.map((item) => item.slug), ['futsal-masculino']);

const combinada = filtrarModalidadesParaHome(modalidadesBase, { modalidade: 'volei-masculino', dia: '25/06' });
assert.deepStrictEqual(combinada.map((item) => item.slug), ['volei-masculino']);

const semFiltro = filtrarModalidadesParaHome(modalidadesBase, {});
assert.strictEqual(semFiltro.length, 3);

console.log('Teste de filtro combinado da home concluído com sucesso.');
