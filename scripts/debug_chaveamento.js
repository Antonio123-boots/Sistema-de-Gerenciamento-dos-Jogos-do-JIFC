const adminModel = require('../models/adminModel');

(async () => {
  try {
    const modalidades = await adminModel.getModalidadesBanco();
    console.log('modalidades', modalidades.length);
    const inscritos = await adminModel.getInscritosModalidade(modalidades[0].id, 'Individual');
    console.log('inscritos', inscritos.length);
    const chaves = await adminModel.getChavesModalidade(modalidades[0].id, 'Individual');
    console.log('chaves', chaves);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
})();
