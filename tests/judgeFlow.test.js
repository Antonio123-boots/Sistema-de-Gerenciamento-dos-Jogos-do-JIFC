const assert = require('assert');
const juizService = require('../services/juizService');
const { obterUsuarioPorEmail } = require('../models/authUsers');
const db = require('../config/db');

(async () => {
  const email = `juiz${Date.now()}@teste.com`;
  let juizId = null;

  try {
    juizId = await juizService.cadastrarJuiz({
      nome: 'Juiz Teste Fluxo',
      email,
      senha: 'juiz123',
      esportes: ['Futsal']
    });

    const usuario = await obterUsuarioPorEmail(email);
    assert.strictEqual(usuario.tipo, 'juiz');
    assert.strictEqual(Number(usuario.juizId), Number(juizId));

    const esportes = await juizService.obterEsportesDoJuiz(usuario.juizId);
    assert.deepStrictEqual(esportes, ['Futsal']);

    const lista = await juizService.listarJuizes();
    assert.ok(lista.some((item) => item.email === email.toLowerCase()));

    console.log('Teste de cadastro e recuperação de juiz concluído com sucesso.');
  } finally {
    if (juizId) {
      try {
        await juizService.excluirJuiz(juizId);
      } catch (_) {}
    }
    await db.end();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
