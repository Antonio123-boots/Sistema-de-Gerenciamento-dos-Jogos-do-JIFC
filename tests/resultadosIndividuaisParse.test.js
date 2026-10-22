/*
 * Regressao: os formularios de resultados individuais indexam por
 * `resultados[<id do atleta>]`. Quando o id do atleta ultrapassa o arrayLimit
 * do `qs` (100), o body-parser devolve um OBJETO e o `for (const r of ...)`
 * quebrava com TypeError, impedindo o juiz de gravar qualquer resultado.
 */
const assert = require('assert');
const qs = require('qs');
const { normalizarResultados } = require('../services/resultadosIndividuaisService');

function parseComoBodyParser(urlencoded) {
  return qs.parse(urlencoded, { arrayLimit: Math.max(100, 100) });
}

function montarFormulario(atletaIds) {
  return atletaIds
    .map((id) => `resultados[${id}][atleta_id]=${id}&resultados[${id}][posicao_final]=1`)
    .join('&');
}

(async () => {
  // 1) Cenario que quebrava: ids de atleta acima do arrayLimit -> objeto
  const idsAltos = [120, 121, 122];
  const body = parseComoBodyParser(montarFormulario(idsAltos));

  assert.ok(!Array.isArray(body.resultados), 'pre-condicao: o qs deve devolver objeto neste cenario');
  assert.throws(() => { for (const r of body.resultados) void r; }, TypeError,
    'pre-condicao: percorrer o objeto sem normalizar deve falhar');

  const normalizados = normalizarResultados(body.resultados);
  assert.ok(Array.isArray(normalizados), 'normalizarResultados deve devolver um array');
  assert.strictEqual(normalizados.length, idsAltos.length);
  assert.deepStrictEqual(normalizados.map((r) => Number(r.atleta_id)), idsAltos);
  for (const r of normalizados) {
    assert.ok(typeof r === 'object' && r !== null, 'cada item deve ser um objeto valido');
  }

  // 2) Cenario normal: ids baixos -> array (nao deve ser alterado)
  const idsBaixos = [1, 2, 3];
  const bodyBaixo = parseComoBodyParser(montarFormulario(idsBaixos));
  assert.ok(Array.isArray(bodyBaixo.resultados), 'pre-condicao: o qs deve devolver array neste cenario');
  const normalizadosBaixos = normalizarResultados(bodyBaixo.resultados);
  assert.strictEqual(normalizadosBaixos.length, idsBaixos.length);
  assert.deepStrictEqual(normalizadosBaixos.map((r) => Number(r.atleta_id)), idsBaixos);

  // 3) Entradas degeneradas nao podem quebrar
  assert.deepStrictEqual(normalizarResultados(undefined), []);
  assert.deepStrictEqual(normalizarResultados(null), []);
  assert.deepStrictEqual(normalizarResultados({}), []);
  assert.deepStrictEqual(normalizarResultados('lixo'), []);
  assert.strictEqual(normalizarResultados([{ atleta_id: 9 }]).length, 1);

  console.log('Teste de normalizacao dos resultados individuais concluído com sucesso.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
