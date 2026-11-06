const assert = require('assert');

const dbPath = require.resolve('../config/db');
require(dbPath);
const dbCache = require.cache[dbPath];
const dbOriginal = dbCache.exports;
const authPath = require.resolve('../middleware/auth');
const secretOriginal = process.env.JWT_SECRET;
let consultas = 0;
let campusBanido = false;

const dbFake = {
  async query() {
    consultas += 1;
    return [[{ banned: campusBanido ? 1 : 0 }]];
  }
};

process.env.JWT_SECRET = 'test-secret-for-campus-session-authorization';
dbCache.exports = dbFake;
delete require.cache[authPath];
const auth = require('../middleware/auth');

function criarResponse() {
  return {
    headers: {},
    locals: {},
    statusCode: 200,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    send(message) {
      this.message = message;
      return this;
    },
    redirect(url) {
      this.redirectUrl = url;
      return this;
    }
  };
}

function criarRequest(payload) {
  const token = auth.gerarToken(payload);
  return { headers: { cookie: `token=${encodeURIComponent(token)}` } };
}

(async () => {
  try {
    campusBanido = true;
    const responseBanido = criarResponse();
    let nextBanido = false;
    await auth.requireRole('campus')(
      criarRequest({ tipo: 'campus', email: 'campus@ifc.edu.br', campusSlug: 'campus' }),
      responseBanido,
      () => { nextBanido = true; }
    );
    assert.strictEqual(responseBanido.statusCode, 403);
    assert.match(responseBanido.headers['Set-Cookie'], /Max-Age=0/);
    assert.strictEqual(nextBanido, false);

    campusBanido = false;
    const responseAtivo = criarResponse();
    let nextAtivo = false;
    await auth.requireRole('campus')(
      criarRequest({ tipo: 'campus', email: 'campus@ifc.edu.br', campusSlug: 'campus' }),
      responseAtivo,
      () => { nextAtivo = true; }
    );
    assert.strictEqual(nextAtivo, true);

    const consultasAntesDaContaBase = consultas;
    const responseBase = criarResponse();
    let nextBase = false;
    await auth.requireRole('campus')(
      criarRequest({ tipo: 'campus', email: 'instituicao@ifc.edu.br', campusSlug: null }),
      responseBase,
      () => { nextBase = true; }
    );
    assert.strictEqual(nextBase, true);
    assert.strictEqual(consultas, consultasAntesDaContaBase);

    console.log('Sessões de campus banido/inexistente foram invalidadas.');
  } finally {
    dbCache.exports = dbOriginal;
    delete require.cache[authPath];
    if (secretOriginal === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = secretOriginal;
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});