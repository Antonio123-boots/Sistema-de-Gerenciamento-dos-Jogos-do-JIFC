const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');

// Rotas administrativas: configuração, registro de campus, análise e placar
router.get('/configurar', adminController.renderConfigurar);
router.post('/configurar/salvar', adminController.salvarConfiguracoes);
router.post('/modalidades/cadastrar', adminController.cadastrarModalidade);
router.post('/modalidades/excluir/:modalidadeId', adminController.excluirModalidade);

router.get('/cadastroCampus', adminController.renderCadastroCampus);
router.post('/cadastroCampus/salvar', adminController.salvarCadastroCampus);
router.post('/cadastroCampus/excluir/:slug', adminController.excluirCampusCadastro);
router.get('/banirCampus', adminController.renderBanirCampus);
router.post('/banirCampus/salvar', adminController.salvarBanirCampus);
router.post('/banirCampus/desbanir/:slug', adminController.handleDesbanirCampus);
router.post('/banirCampus/excluir/:slug', adminController.excluirCampus);

router.get('/laudos', adminController.renderAnalise);
router.post('/laudos/validar/:atletaId', adminController.validarAtleta);
router.post('/laudos/reprovar/:atletaId', adminController.marcarIrregular);

// Rotas de Chaveamento Dinâmico integradas ao Banco de Dados
router.get('/chaveamento', adminController.renderChaveamento);
router.get('/chaveamento/campus/:id', adminController.renderResumoCampus);
router.post('/chaveamento/gerar', adminController.gerarChaveamento);
router.post('/chaveamento/limpar', adminController.limparChaveamento);
router.get('/chaveamento/exportar', adminController.exportResumoInscricoes);

module.exports = router;