const chaveamento = require('../services/chaveamentoService');

const COLETIVOS = [1, 2, 4, 5, 7, 8, 9, 10, 11, 15];
const TENIS = [12, 16];

(async () => {
  try {
    for (const id of COLETIVOS) {
      const r = await chaveamento.efetuarChaveamentoMatematico(id, '');
      console.log(`Sorteio coletivo modalidade ${id}: ${r.chaves.length} chaves, ${r.jogos.length} jogos`);
    }
    for (const id of TENIS) {
      const ri = await chaveamento.efetuarChaveamentoMatematico(id, 'individual');
      console.log(`Sorteio tenis ${id} individual: ${ri.chaves.length} chaves, ${ri.jogos.length} jogos`);
      const rd = await chaveamento.efetuarChaveamentoMatematico(id, 'dupla');
      console.log(`Sorteio tenis ${id} dupla: ${rd.chaves.length} chaves, ${rd.jogos.length} jogos`);
    }
    console.log('sorteio-fase2-ok');
  } catch (error) {
    console.error('ERRO:', error.message);
    process.exitCode = 1;
  }
})();
