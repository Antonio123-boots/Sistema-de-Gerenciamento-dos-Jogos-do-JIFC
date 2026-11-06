const assert = require('assert');
const juizController = require('../controllers/juizController');
const juizService = require('../services/juizService');

const dbCache = require.cache[require.resolve('../config/db')];
const dbOriginal = dbCache.exports;
const obterEsportesOriginal = juizService.obterEsportesDoJuiz;

function criarResponse() {
  return {
    statusCode: 200,
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
    },
    render(view) {
      this.view = view;
      return this;
    }
  };
}

(async () => {
  juizService.obterEsportesDoJuiz = async () => ['Futsal'];

  dbCache.exports = {
    query: async (sql) => {
      if (sql.includes('FROM provas p')) {
        return [[{
          id: 8,
          modalidade_id: 3,
          modalidade_nome: 'Atletismo',
          genero: 'Masculino',
          nome: '100m',
          formato: 'direta'
        }]];
      }
      return [[{ id: 3, nome: 'Atletismo', genero: 'Masculino' }]];
    }
  };

  try {
    const reqResultados = {
      params: { esporte: 'Atletismo' },
      query: { genero: 'Masculino' },
      user: { juizId: 12 }
    };
    const responseResultados = criarResponse();
    await juizController.renderResultados(reqResultados, responseResultados);
    assert.strictEqual(responseResultados.statusCode, 403);
    assert.match(responseResultados.message, /fora das suas atribuições/);

    const reqProva = {
      params: { esporte: 'Atletismo', provaId: '8' },
      query: {},
      user: { juizId: 12 }
    };
    const responseProva = criarResponse();
    await juizController.renderResultadosProva(reqProva, responseProva);
    assert.strictEqual(responseProva.statusCode, 403);
    assert.match(responseProva.message, /fora das suas atribuições/);

    console.log('Acesso a resultados individuais de outra modalidade foi bloqueado.');
  } finally {
    dbCache.exports = dbOriginal;
    juizService.obterEsportesDoJuiz = obterEsportesOriginal;
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});