const assert = require('assert');
const jogoService = require('../services/jogoService');

const { filtrarJogosDoCampus } = jogoService;

const jogos = [
  // Coletivo: casa/fora vêm na forma exibição (ex.: "Araquari")
  { id: 1, modalidade: 'Futebol', casa: 'Araquari', fora: 'Blumenau' },
  { id: 2, modalidade: 'Vôlei', casa: 'Blumenau', fora: 'Araquari' },
  // Coletivo sem nome de exibição: casa/fora vêm no nome completo ("IFC Araquari")
  { id: 3, modalidade: 'Futsal', casa: 'IFC Araquari', fora: 'IFC Sombrio' },
  // Individual: casa/fora carregam o campus do atleta
  { id: 4, modalidade: 'Atletismo', casa: 'Araquari', fora: null },
  // Jogo de outro campus
  { id: 5, modalidade: 'Futebol', casa: 'Sombrio', fora: 'Videira' }
];

assert.strictEqual(
  filtrarJogosDoCampus(jogos, ['IFC Araquari', 'Araquari']).length,
  4,
  'O filtro deve casar tanto o nome completo quanto o nome de exibição do campus.'
);
assert.strictEqual(
  filtrarJogosDoCampus(jogos, ['Araquari']).length,
  3,
  'Deve casar jogos cujo casa/fora é o nome de exibição.'
);
assert.strictEqual(
  filtrarJogosDoCampus(jogos, ['IFC Sombrio']).length,
  1,
  'Deve casar pelo nome completo.'
);
assert.strictEqual(filtrarJogosDoCampus(jogos, []).length, 0, 'Sem nomes de campus, nada deve ser retornado.');
assert.strictEqual(filtrarJogosDoCampus([], ['Araquari']).length, 0, 'Sem jogos, nada deve ser retornado.');

console.log('Teste de filtro de jogos do campus concluído com sucesso.');