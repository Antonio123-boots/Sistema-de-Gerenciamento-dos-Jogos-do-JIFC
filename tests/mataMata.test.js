const assert = require('node:assert/strict');
const { montarEstruturaEliminatoria, FASES_ORDEM } = require('../services/mataMataService');
const { obterPadraoEliminatoria } = require('../utils/sportClassificationRules');

// ---------- Padrões por esporte ----------
assert.equal(obterPadraoEliminatoria('Futsal Masculino', 'geral'), 'alternado');
assert.equal(obterPadraoEliminatoria('Basquete Feminino', 'geral'), 'alternado');
assert.equal(obterPadraoEliminatoria('Handebol Masculino', 'geral'), 'alternado');
assert.equal(obterPadraoEliminatoria('Voleibol Masculino', 'geral'), 'alternado');
assert.equal(obterPadraoEliminatoria('Vôlei de Praia', 'geral'), 'sequencial');
assert.equal(obterPadraoEliminatoria('Tênis de Mesa Masculino', 'individual'), 'sequencial');
assert.equal(obterPadraoEliminatoria('Tênis de Mesa Masculino', 'dupla'), 'alternado');
assert.equal(obterPadraoEliminatoria('Xadrez', 'geral'), null);
assert.equal(obterPadraoEliminatoria('Atletismo 100m', 'geral'), null);

// ---------- Rejeições ----------
assert.throws(() => montarEstruturaEliminatoria('alternado', 5), /não suportada/i);
assert.throws(() => montarEstruturaEliminatoria('alternado', 1), /pelo menos 2 chaves/i);
assert.throws(() => montarEstruturaEliminatoria(null, 4), /padrão de eliminatória definido/i);
assert.throws(() => montarEstruturaEliminatoria('sequencial', 0), /pelo menos 2 chaves/i);

// ---------- 2 chaves (semis direto): 4 jogos ----------
{
  const e = montarEstruturaEliminatoria('alternado', 2);
  assert.equal(e.jogos.length, 4);
  assert.deepEqual(e.jogos.map(j => j.fase), ['Semifinal', 'Semifinal', 'Terceiro Lugar', 'Final']);
  assert.deepEqual(e.jogos.map(j => j.rotuloCasa + ' x ' + j.rotuloFora),
    ['1A x 2B', '1B x 2A', 'D1 x D2', 'V1 x V2']);
  assert.deepEqual(e.resumo.semifinais, [1, 2]);
  assert.equal(e.resumo.final, 4);
}

// ---------- 3 chaves (terceiros): quartas com T1/T2, 8 jogos ----------
{
  const e = montarEstruturaEliminatoria('alternado', 3);
  assert.equal(e.jogos.length, 8);
  const qf = e.jogos.slice(0, 4);
  assert.ok(qf.every(j => j.fase === 'Quartas'));
  assert.deepEqual(qf.map(j => j.rotuloCasa + ' x ' + j.rotuloFora),
    ['1A x T2', '1C x 2A', '1B x T1', '2B x 2C']);
  const sf = e.jogos.slice(4, 6);
  assert.ok(sf.every(j => j.fase === 'Semifinal'));
  assert.deepEqual(sf.map(j => j.rotuloCasa + ' x ' + j.rotuloFora), ['V1 x V2', 'V3 x V4']);
  const t3 = e.jogos[6];
  const fin = e.jogos[7];
  assert.equal(t3.fase, 'Terceiro Lugar');
  assert.equal(t3.rotuloCasa + ' x ' + t3.rotuloFora, 'D5 x D6');
  assert.equal(fin.fase, 'Final');
  assert.equal(fin.rotuloCasa + ' x ' + fin.rotuloFora, 'V5 x V6');
}

// ---------- 4 chaves alternado: mesmo grupo só re-encontra na final ----------
{
  const e = montarEstruturaEliminatoria('alternado', 4);
  assert.equal(e.jogos.length, 8);
  // jogos 1-2 formam o lado A/C; jogos 3-4 o lado B/D
  assert.deepEqual(e.jogos.slice(0, 4).map(j => j.rotuloCasa + ' x ' + j.rotuloFora),
    ['1A x 2C', '1C x 2A', '1B x 2D', '1D x 2B']);
  // semis fundem pares da mesma metade: lado A/C (jogos 1,2) vs lado B/D (jogos 3,4)
  assert.deepEqual(e.jogos.slice(4, 6).map(j => j.rotuloCasa + ' x ' + j.rotuloFora), ['V1 x V2', 'V3 x V4']);
  assert.equal(e.resumo.final, 8);
}

// ---------- 4 chaves sequencial ----------
{
  const e = montarEstruturaEliminatoria('sequencial', 4);
  assert.deepEqual(e.jogos.slice(0, 4).map(j => j.rotuloCasa + ' x ' + j.rotuloFora),
    ['1A x 2B', '1B x 2A', '1C x 2D', '1D x 2C']);
  assert.deepEqual(e.jogos.slice(4, 6).map(j => j.rotuloCasa + ' x ' + j.rotuloFora), ['V1 x V2', 'V3 x V4']);
}

// ---------- 8 chaves sequencial: oitavas em pares seguidos, 16 jogos ----------
{
  const e = montarEstruturaEliminatoria('sequencial', 8);
  assert.equal(e.jogos.length, 16);
  const oitavas = e.jogos.slice(0, 8);
  assert.ok(oitavas.every(j => j.fase === 'Oitavas'));
  assert.deepEqual(oitavas.map(j => j.rotuloCasa + ' x ' + j.rotuloFora), [
    '1A x 2B', '1B x 2A',
    '1C x 2D', '1D x 2C',
    '1E x 2F', '1F x 2E',
    '1G x 2H', '1H x 2G'
  ]);
  const quartas = e.jogos.slice(8, 12);
  assert.ok(quartas.every(j => j.fase === 'Quartas'));
  assert.deepEqual(quartas.map(j => j.rotuloCasa + ' x ' + j.rotuloFora),
    ['V1 x V2', 'V3 x V4', 'V5 x V6', 'V7 x V8']);
  const sfNums = [13, 14];
  assert.equal(e.jogos[12].fase, 'Semifinal');
  assert.deepEqual([e.jogos[12].numero, e.jogos[13].numero], sfNums);
  assert.equal(e.jogos[14].fase, 'Terceiro Lugar');
  assert.equal(e.jogos[14].rotuloCasa + ' x ' + e.jogos[14].rotuloFora, 'D13 x D14');
  assert.equal(e.jogos[15].fase, 'Final');
  assert.equal(e.jogos[15].rotuloCasa + ' x ' + e.jogos[15].rotuloFora, 'V13 x V14');
}

// ---------- 8 chaves alternado: metades A-C-E-G / B-D-F-H ----------
{
  const e = montarEstruturaEliminatoria('alternado', 8);
  assert.equal(e.jogos.length, 16);
  assert.deepEqual(e.jogos.slice(0, 8).map(j => j.rotuloCasa + ' x ' + j.rotuloFora), [
    '1A x 2C', '1C x 2A',
    '1E x 2G', '1G x 2E',
    '1B x 2D', '1D x 2B',
    '1F x 2H', '1H x 2F'
  ]);
  // SF13 funde lado A/C/E-G; SF14 funde lado B/D/F-H
  assert.equal(e.jogos[12].rotuloCasa + ' x ' + e.jogos[12].rotuloFora, 'V9 x V10');
  assert.equal(e.jogos[13].rotuloCasa + ' x ' + e.jogos[13].rotuloFora, 'V11 x V12');
}

// ---------- Numeração contínua e rodadas coerentes em todos os cenários ----------
for (const [padrao, chaves] of [['alternado', 2], ['sequencial', 4], ['alternado', 8]]) {
  const e = montarEstruturaEliminatoria(padrao, chaves);
  e.jogos.forEach((jogo, indice) => {
    assert.equal(jogo.numero, indice + 1);
    assert.ok(FASES_ORDEM.includes(jogo.fase));
    assert.ok(jogo.rodada >= 1);
    assert.ok(typeof jogo.rotuloCasa === 'string' && jogo.rotuloCasa.length >= 2);
    assert.ok(typeof jogo.rotuloFora === 'string' && jogo.rotuloFora.length >= 2);
  });
}

console.log('PASS mataMata interno');
