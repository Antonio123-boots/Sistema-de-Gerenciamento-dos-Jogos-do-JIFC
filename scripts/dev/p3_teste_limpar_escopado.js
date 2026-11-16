require('dotenv').config({ path: '.env' });
const adminController = require('../controllers/adminController');
const adminModel = require('../models/adminModel');
const { sincronizarClassificacaoGruposModalidade } = require('../services/classificacaoService');
const db = require('../config/db');

const ID = 11;

function chamarController(body) {
  return new Promise((resolve) => {
    const req = { body };
    const res = {
      redirect: (url) => resolve({ ok: true, url }),
      status(code) {
        return { send: (msg) => resolve({ ok: false, code, msg }) };
      }
    };
    adminController.limparChaveamento(req, res);
  });
}

async function contar() {
  const [rows] = await db.query(
    `SELECT sub_categoria,
            (SELECT COUNT(*) FROM chaves c WHERE c.modalidade_id = j.modalidade_id AND c.sub_categoria = j.sub_categoria) AS chaves,
            COUNT(*) AS jogos
     FROM jogos j WHERE j.modalidade_id = ? GROUP BY sub_categoria`,
    [ID]
  );
  const mapa = {};
  rows.forEach((r) => { mapa[r.sub_categoria] = { chaves: Number(r.chaves), jogos: Number(r.jogos) }; });
  const [cm] = await db.query('SELECT COUNT(*) AS vinculados FROM campus_modalidade WHERE modalidade_id = ? AND chave_id IS NOT NULL', [ID]);
  const [cg] = await db.query(
    `SELECT ch.sub_categoria, COUNT(*) AS total FROM classificacao_grupos cg JOIN chaves ch ON ch.id = cg.chave_id WHERE cg.modalidade_id = ? GROUP BY ch.sub_categoria`,
    [ID]
  );
  mapa._campusVinculados = Number(cm[0].vinculados);
  mapa._classif = {};
  cg.forEach((r) => { mapa._classif[r.sub_categoria] = Number(r.total); });
  return mapa;
}

(async () => {
  try {
    console.log('ANTES:', JSON.stringify(await contar()));

    console.log('\n1) Limpando aba DUPLA...');
    const r1 = await chamarController({ modalidadeId: ID, subCategoria: 'dupla' });
    console.log('   redirect:', r1.url);
    const depoisDupla = await contar();
    console.log('DEPOIS:', JSON.stringify(depoisDupla));
    const individualOk = depoisDupla.individual && depoisDupla.individual.jogos === 36 && (depoisDupla._classif.individual || 0) === 34;
    console.log(individualOk ? '   OK: individual intacta apos limpar dupla' : '   FALHOU: individual foi afetada!');

    console.log('\n2) Limpando aba INDIVIDUAL...');
    await chamarController({ modalidadeId: ID, subCategoria: 'individual' });
    const sozinho = await contar();
    console.log('DEPOIS:', JSON.stringify(sozinho));
    const zerado = !sozinho.individual && !sozinho.dupla;
    console.log(zerado ? '   OK: tudo zerado como esperado' : '   FALHOU: sobrou dados');

    console.log('\n3) Restaurando estado completo...');
    await adminModel.efetuarChaveamentoMatematico(ID, 'individual');
    await adminModel.efetuarChaveamentoMatematico(ID, 'dupla');
    await sincronizarClassificacaoGruposModalidade(ID);
    const restaurado = await contar();
    console.log('RESTAURADO:', JSON.stringify(restaurado));
    const okFinal =
      restaurado.individual && restaurado.individual.jogos === 36 &&
      restaurado.dupla && restaurado.dupla.jogos === 24 &&
      restaurado.dupla.chaves === 4 &&
      (restaurado._classif.individual || 0) === 34 && (restaurado._classif.dupla || 0) === 16 &&
      restaurado._campusVinculados === 16;
    console.log(okFinal ? '\nTUDO OK - estado restaurado e coexistencia valida' : '\nFALHOU na restauracao');

    process.exit(okFinal && individualOk && zerado ? 0 : 1);
  } catch (error) {
    console.error('ERRO:', error.message);
    process.exit(1);
  }
})();
