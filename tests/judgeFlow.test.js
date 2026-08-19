const assert = require('assert');
const { cadastrarJuiz, listarJuizes, obterUsuarioPorEmail } = require('../models/authUsers');

(async () => {
  const email = `juiz${Date.now()}@teste.com`;
  const nome = 'Juiz Teste Fluxo';

  const juiz = await cadastrarJuiz({
    nome,
    email,
    senha: 'juiz123',
    modalidadeId: 1,
    modalidadeNome: 'Futsal'
  });

  assert.strictEqual(juiz.tipo, 'juiz');
  assert.strictEqual(juiz.email, email.toLowerCase());
  assert.strictEqual(juiz.modalidadeNome, 'Futsal');

  const usuario = await obterUsuarioPorEmail(email);
  assert.strictEqual(usuario.tipo, 'juiz');
  assert.strictEqual(Number(usuario.modalidadeId), 1);

  const lista = listarJuizes();
  assert.ok(lista.some((item) => item.email === email.toLowerCase()));

  console.log('Teste de cadastro e recuperação de juiz concluído com sucesso.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
