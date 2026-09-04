const assert = require('node:assert/strict');
const { obterRegras } = require('../utils/sportClassificationRules');
const {
  construirMapaConfrontos,
  compararComDesempate,
  ordenarGrupoComDesempate
} = require('../services/classificacaoService');

const regrasFutsal = obterRegras('Futsal Masculino');
const atletaA = { campus_id: 1, pontos: 3, vitorias: 1, pontos_pro: 2, pontos_contra: 0 };
const atletaB = { campus_id: 2, pontos: 3, vitorias: 1, pontos_pro: 1, pontos_contra: 0 };
const jogoDireto = [{ campus_1_id: 1, campus_2_id: 2, placar_1: 2, placar_2: 0 }];
const mapaDireto = construirMapaConfrontos(jogoDireto);

assert.ok(compararComDesempate(atletaA, atletaB, regrasFutsal, mapaDireto, jogoDireto) < 0);
assert.ok(compararComDesempate(atletaB, atletaA, regrasFutsal, mapaDireto, jogoDireto) > 0);

const grupo = [
  { campus_id: 1, pontos: 3, vitorias: 0, pontos_pro: 2, pontos_contra: 1 },
  { campus_id: 2, pontos: 3, vitorias: 2, pontos_pro: 4, pontos_contra: 0 },
  { campus_id: 3, pontos: 3, vitorias: 1, pontos_pro: 3, pontos_contra: 1 }
];
const jogosGrupo = [{ campus_1_id: 1, campus_2_id: 2, placar_1: 5, placar_2: 0 }];
ordenarGrupoComDesempate(grupo, regrasFutsal, jogosGrupo);
assert.deepEqual(grupo.map((item) => item.campus_id), [2, 3, 1]);

console.log('Testes comportamentais de desempate concluídos com sucesso.');
