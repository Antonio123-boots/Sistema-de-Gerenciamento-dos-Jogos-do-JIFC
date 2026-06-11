const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const adminModel = require('../models/adminModel');

async function renderTabelas(req, res) {
  try {
    const jogos = await adminModel.getJogos();

    res.render('juiz/tabelas', {
      title: 'Painel do Juiz',
      usuarioLogado: req.session?.usuario || null,
      mostrarFiltros: false,
      jogos
    });
  } catch (error) {
    console.error(error);
    res.status(500).send('Erro ao carregar o painel do juiz.');
  }
}

router.get('/tabelas', renderTabelas);
router.get('/jogos/placar/:jogoId', adminController.renderPlacar);
router.post('/jogos/placar/:jogoId/salvar', adminController.salvarPlacar);

module.exports = router;
