const assert = require('node:assert/strict');
const { obterRegras } = require('../utils/sportClassificationRules');
const {
  construirMapaConfrontos,
  compararComDesempate,
  ordenarGrupoComDesempate
} = require('../services/classificacaoService');

function comparar(a, b, nomeModalidade, jogos = []) {
  const regras = obterRegras(nomeModalidade);
  return compararComDesempate(a, b, regras, construirMapaConfrontos(jogos), jogos);
}

const basqueteA = { campus_id: 1, pontos: 3, vitorias: 1, pontos_pro: 70, pontos_contra: 60 };
const basqueteB = { campus_id: 2, pontos: 3, vitorias: 1, pontos_pro: 80, pontos_contra: 70 };
const jogoBasquete = [{ campus_1_id: 1, campus_2_id: 2, placar_1: 70, placar_2: 60 }];
assert.ok(comparar(basqueteA, basqueteB, 'Basquetebol', jogoBasquete) < 0);

const grupoFutsal = [
  { campus_id: 1, pontos: 3, vitorias: 0, pontos_pro: 1, pontos_contra: 0 },
  { campus_id: 2, pontos: 3, vitorias: 1, pontos_pro: 1, pontos_contra: 0 },
  { campus_id: 3, pontos: 3, vitorias: 2, pontos_pro: 1, pontos_contra: 0 }
];
ordenarGrupoComDesempate(grupoFutsal, obterRegras('Futsal'), [
  { campus_1_id: 1, campus_2_id: 2, placar_1: 5, placar_2: 0 }
]);
assert.deepEqual(grupoFutsal.map((item) => item.campus_id), [3, 2, 1]);

const handebolA = { campus_id: 1, pontos: 3, vitorias: 1, pontos_pro: 20, pontos_contra: 15 };
const handebolB = { campus_id: 2, pontos: 3, vitorias: 1, pontos_pro: 18, pontos_contra: 15 };
const jogosHandebol = [{ campus_1_id: 1, campus_2_id: 2, placar_1: 20, placar_2: 18 }];
assert.ok(comparar(handebolA, handebolB, 'Handebol', jogosHandebol) < 0);

const voleiA = { campus_id: 1, pontos: 3, vitorias: 1, sets_ganhos: 4, sets_perdidos: 2, pontos_pro: 90, pontos_contra: 80 };
const voleiB = { campus_id: 2, pontos: 3, vitorias: 1, sets_ganhos: 3, sets_perdidos: 2, pontos_pro: 90, pontos_contra: 80 };
assert.ok(comparar(voleiA, voleiB, 'Voleibol') < 0);
assert.ok(comparar(voleiA, voleiB, 'Vôlei de Praia') < 0);

const tenisA = { atleta_id: 11, pontos: 3, vitorias: 1, sets_ganhos: 2, sets_perdidos: 2, pontos_pro: 22, pontos_contra: 22 };
const tenisB = { atleta_id: 12, pontos: 3, vitorias: 1, sets_ganhos: 3, sets_perdidos: 2, pontos_pro: 33, pontos_contra: 20 };
const jogoTenis = [{ atleta_1_id: 11, atleta_2_id: 12, placar_1: 2, placar_2: 0 }];
assert.ok(comparar(tenisA, tenisB, 'Tênis de Mesa', jogoTenis) < 0);

const regrasXadrez = obterRegras('Xadrez');
assert.equal(regrasXadrez.tipo, 'individual_pontos');
assert.equal(regrasXadrez.tipo_individual, true);
assert.deepEqual(regrasXadrez.colunasTabela, ['Atleta', 'Campus', 'PTS', 'V', 'D', 'E']);

console.log('Testes de desempate por modalidade concluídos com sucesso.');
