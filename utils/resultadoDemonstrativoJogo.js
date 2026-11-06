const { obterRegras } = require('./sportClassificationRules');

function hashDeterministico(valor, sal = 0) {
  let hash = (Number(valor) * 2654435761 + Number(sal) * 2246822519) >>> 0;
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 2246822519) >>> 0;
  hash ^= hash >>> 13;
  return hash >>> 0;
}

function pontuacaoSet(base, hash) {
  const perdedor = 3 + (hash % Math.max(1, base - 4));
  const vantagem = 2 + ((hash >>> 5) % 5);
  return {
    vencedor: Math.max(base, perdedor + vantagem),
    perdedor
  };
}

function gerarSets(idJogo, nomeModalidade) {
  const normalizado = String(nomeModalidade || '').toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const vitoriasNecessarias = normalizado.includes('volei de praia') ? 2 : 3;
  const pontosBase = normalizado.includes('tenis de mesa') ? 11
    : normalizado.includes('volei de praia') ? 21
      : 25;
  const venceCasa = hashDeterministico(idJogo, 41) % 2 === 0;
  const setsPerdidos = hashDeterministico(idJogo, 97) % vitoriasNecessarias;
  const setsCasa = venceCasa ? vitoriasNecessarias : setsPerdidos;
  const setsFora = venceCasa ? setsPerdidos : vitoriasNecessarias;
  const resultados = [];
  let vencidosCasa = 0;
  let vencidosFora = 0;

  while (vencidosCasa < vitoriasNecessarias && vencidosFora < vitoriasNecessarias) {
    const restantesCasa = setsCasa - vencidosCasa;
    const restantesFora = setsFora - vencidosFora;
    let casaVence;
    if (restantesCasa === 0) casaVence = false;
    else if (restantesFora === 0) casaVence = true;
    else {
      casaVence = hashDeterministico(idJogo, 173 + resultados.length) % 2 === 0;
      if (casaVence && vencidosCasa + 1 > setsCasa) casaVence = false;
      if (!casaVence && vencidosFora + 1 > setsFora) casaVence = true;
    }

    const baseSet = resultados.length === (vitoriasNecessarias === 2 ? 2 : 4) ? 15 : pontosBase;
    const placar = pontuacaoSet(baseSet, hashDeterministico(idJogo, 251 + resultados.length));
    resultados.push({
      numero: resultados.length + 1,
      pontos_1: casaVence ? placar.vencedor : placar.perdedor,
      pontos_2: casaVence ? placar.perdedor : placar.vencedor
    });
    if (casaVence) vencidosCasa += 1;
    else vencidosFora += 1;
  }

  return {
    placar1: vencidosCasa,
    placar2: vencidosFora,
    sets: resultados,
    vencedorLado: vencidosCasa > vencidosFora ? 1 : 2
  };
}

function gerarResultadoDemonstrativo(jogo) {
  const id = Number(jogo.id);
  if (!Number.isInteger(id) || id < 1) throw new Error('ID inválido ao gerar resultado do jogo.');
  if (String(jogo.fase || '').trim() === 'Final') return null;

  const nome = String(jogo.modalidade || '').trim();
  const regras = obterRegras(nome);
  if (regras.temSets) return gerarSets(id, nome);

  const hash = hashDeterministico(id, Number(jogo.modalidade_id));
  const basquete = /basquete/i.test(nome);
  const futsal = /futsal/i.test(nome);
  const maximo = basquete ? 95 : futsal ? 6 : 35;
  const minimo = basquete ? 55 : futsal ? 0 : 10;
  const empatePermitido = String(jogo.fase || '').trim() === 'Fase de Grupos' && !basquete;
  if (empatePermitido && hash % 11 === 0) {
    const pontos = minimo + ((hash >>> 7) % (maximo - minimo + 1));
    return { placar1: pontos, placar2: pontos, sets: [], vencedorLado: null };
  }

  const vencedorLado = hash % 2 === 0 ? 1 : 2;
  const vencedorMinimo = futsal && !empatePermitido ? 1 : minimo;
  const vencedor = vencedorMinimo + ((hash >>> 7) % (maximo - vencedorMinimo + 1));
  const margemMaxima = basquete ? 24 : futsal ? 4 : 12;
  const margem = 1 + ((hash >>> 13) % margemMaxima);
  const perdedor = Math.max(0, vencedor - margem);
  return {
    placar1: vencedorLado === 1 ? vencedor : perdedor,
    placar2: vencedorLado === 2 ? vencedor : perdedor,
    sets: [],
    vencedorLado
  };
}

module.exports = { gerarResultadoDemonstrativo };
