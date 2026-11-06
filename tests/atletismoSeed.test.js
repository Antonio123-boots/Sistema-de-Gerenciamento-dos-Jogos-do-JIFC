const assert = require('assert');
const {
  ATLETAS_POR_PROVA_ATLETISMO,
  PROVAS_ATLETISMO,
  TOTAL_ATLETAS_ATLETISMO,
  distribuirProvasAtletismo
} = require('../utils/atletismoSeed');

const atletas = Array.from({ length: 51 }, (_, indice) => ({
  indice: indice + 1,
  campusId: (indice % 17) + 1
}));
const distribuicao = distribuirProvasAtletismo(atletas, 2026);
const repeticao = distribuirProvasAtletismo(atletas, 2026);
const quantidades = PROVAS_ATLETISMO.map((prova) =>
  atletas.filter((atleta) => distribuicao.get(atleta).includes(prova)).length
);
const participantes = atletas.filter((atleta) => distribuicao.get(atleta).length > 0);

assert.strictEqual(distribuicao.size, atletas.length);
assert.strictEqual(participantes.length, TOTAL_ATLETAS_ATLETISMO);
assert(quantidades.every((quantidade) => quantidade === ATLETAS_POR_PROVA_ATLETISMO));
assert(participantes.every((atleta) => distribuicao.get(atleta).length === 3));
assert(atletas.filter((atleta) => !participantes.includes(atleta))
  .every((atleta) => distribuicao.get(atleta).length === 0));
const participantesPorCampus = new Map();
participantes.forEach((atleta) => participantesPorCampus.set(
  atleta.campusId,
  (participantesPorCampus.get(atleta.campusId) || 0) + 1
));
assert([...participantesPorCampus.values()].every((quantidade) => quantidade >= 2 && quantidade <= 3));
atletas.forEach((atleta) => {
  assert.deepStrictEqual(distribuicao.get(atleta), repeticao.get(atleta));
});
assert.throws(
  () => distribuirProvasAtletismo(atletas.slice(0, TOTAL_ATLETAS_ATLETISMO - 1)),
  new RegExp(`pelo menos ${TOTAL_ATLETAS_ATLETISMO} atletas`)
);

console.log(`Provas de atletismo limitadas a ${ATLETAS_POR_PROVA_ATLETISMO} participantes.`);
