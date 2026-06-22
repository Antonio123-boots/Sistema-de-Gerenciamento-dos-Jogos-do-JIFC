const express = require('express');
const router = express.Router();
const campusController = require('../controllers/campusController');

// Rotas do painel do campus: inscrições, atletas e jogos.
router.get('/inscricoes', campusController.renderInscricoes);
router.post('/inscricoes/salvar', campusController.salvarInscricoes);

router.get('/atletas', campusController.renderAtletas);
router.post('/atletas/cadastrar', campusController.cadastrarAtleta);
router.get('/atletas/editar/:id', campusController.editarAtleta);
router.post('/atletas/atualizar/:id', campusController.atualizarAtleta);
router.post('/atletas/excluir/:id', campusController.excluirAtleta);
router.post('/atletas/substituir', campusController.substituirAtleta);
router.get('/jogos', campusController.renderJogos);

module.exports = router;