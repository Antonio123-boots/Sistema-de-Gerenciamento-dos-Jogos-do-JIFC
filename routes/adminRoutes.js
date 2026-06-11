const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');

// Rotas administrativas: configuração, análise e placar
router.get('/configurar', adminController.renderConfigurar);
router.post('/configurar/salvar', adminController.salvarConfiguracoes);

router.get('/laudos', adminController.renderAnalise);
router.post('/laudos/validar/:atletaId', adminController.validarAtleta);

// Rotas de Chaveamento Dinâmico integradas ao Banco de Dados
router.get('/chaveamento', adminController.renderChaveamento);
router.post('/chaveamento/gerar', adminController.gerarChaveamento);
router.post('/chaveamento/limpar', adminController.limparChaveamento);

module.exports = router;