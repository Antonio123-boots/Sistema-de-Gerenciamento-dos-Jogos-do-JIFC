const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { requireAuth, requireRole } = require('../middleware/auth');
const juizController = require('../controllers/juizController');

router.use(requireAuth, requireRole('juiz'));

router.get('/', juizController.renderPerfil);
router.get('/:esporte', juizController.renderJogos);
router.get('/jogos/:jogoId/placar', juizController.renderPlacar);
router.post('/jogos/:jogoId/placar', [
  body('placar1').isInt({ min: 0 }).withMessage('Placar inválido.'),
  body('placar2').isInt({ min: 0 }).withMessage('Placar inválido.'),
  body('status').isIn(['Agendado', 'Em Andamento', 'Encerrado', 'Cancelado']).withMessage('Status inválido.')
], juizController.handleSalvarPlacar);

router.post('/jogos/:jogoId/wo', [
  body('campus_vencedor').isInt({ min: 1 }).withMessage('Selecione o campus vencedor.')
], juizController.handleAplicarWO);

module.exports = router;
