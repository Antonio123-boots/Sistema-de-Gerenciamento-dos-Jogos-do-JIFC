const PROVAS_ATLETISMO = [
  '100m rasos',
  '200m rasos',
  '400m',
  '800m',
  '1500m',
  '3000m',
  '5000m',
  '4x100m',
  '4x400m',
  'Salto em distância',
  'Salto em altura',
  'Salto Triplo',
  'Disco',
  'Dardo',
  'Peso'
];

const ATLETAS_POR_PROVA_ATLETISMO = 8;
const MAX_PROVAS_POR_ATLETA = 3;
const TOTAL_ATLETAS_ATLETISMO = PROVAS_ATLETISMO.length
  * ATLETAS_POR_PROVA_ATLETISMO / MAX_PROVAS_POR_ATLETA;

function hashDeterministico(valor, sal) {
  let hash = (Number(valor) * 2654435761 + Number(sal) * 2246822519) >>> 0;
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 2246822519) >>> 0;
  hash ^= hash >>> 13;
  return hash >>> 0;
}

function distribuirProvasAtletismo(atletas, sal = 0) {
  if (!Array.isArray(atletas) || atletas.length < TOTAL_ATLETAS_ATLETISMO) {
    throw new Error(`São necessários pelo menos ${TOTAL_ATLETAS_ATLETISMO} atletas para preencher as provas de atletismo com até ${ATLETAS_POR_PROVA_ATLETISMO} participantes por prova.`);
  }

  const provasPorAtleta = new Map(atletas.map((atleta) => [atleta, []]));
  const selecionadosPorCampus = new Map();
  const selecionados = [];

  while (selecionados.length < TOTAL_ATLETAS_ATLETISMO) {
    const candidatos = atletas
      .filter((atleta) => !selecionados.includes(atleta))
      .map((atleta, ordem) => ({
        atleta,
        ordem,
        campusId: atleta.campusId === undefined ? 'geral' : Number(atleta.campusId)
      }))
      .sort((a, b) => (selecionadosPorCampus.get(a.campusId) || 0) - (selecionadosPorCampus.get(b.campusId) || 0)
        || hashDeterministico(a.atleta.indice || a.atleta.id || a.ordem, sal)
          - hashDeterministico(b.atleta.indice || b.atleta.id || b.ordem, sal)
        || a.ordem - b.ordem);
    const escolhido = candidatos[0];
    selecionados.push(escolhido.atleta);
    selecionadosPorCampus.set(escolhido.campusId, (selecionadosPorCampus.get(escolhido.campusId) || 0) + 1);
  }

  PROVAS_ATLETISMO.forEach((prova, indice) => {
    const candidatos = selecionados
      .map((atleta, ordem) => ({ atleta, ordem, provas: provasPorAtleta.get(atleta) }))
      .filter((item) => item.provas.length < MAX_PROVAS_POR_ATLETA)
      .sort((a, b) => a.provas.length - b.provas.length
        || hashDeterministico(a.atleta.indice || a.atleta.id || a.ordem, sal + indice)
          - hashDeterministico(b.atleta.indice || b.atleta.id || b.ordem, sal + indice)
        || a.ordem - b.ordem);

    if (candidatos.length < ATLETAS_POR_PROVA_ATLETISMO) {
      throw new Error(`Não há atletas disponíveis para distribuir a prova ${prova} sem ultrapassar ${MAX_PROVAS_POR_ATLETA} provas por atleta.`);
    }

    candidatos.slice(0, ATLETAS_POR_PROVA_ATLETISMO)
      .forEach(({ atleta }) => provasPorAtleta.get(atleta).push(prova));
  });

  return provasPorAtleta;
}

module.exports = {
  ATLETAS_POR_PROVA_ATLETISMO,
  MAX_PROVAS_POR_ATLETA,
  PROVAS_ATLETISMO,
  TOTAL_ATLETAS_ATLETISMO,
  distribuirProvasAtletismo
};
