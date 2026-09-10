const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { requireAuth, requireRole } = require('../middleware/auth');
const juizController = require('../controllers/juizController');

router.use(requireAuth, requireRole('juiz'));

router.get('/', juizController.renderPerfil);
router.get('/:esporte/resultados', juizController.renderResultados);
router.get('/:esporte/resultados/prova/:provaId', juizController.renderResultadosProva);
router.post('/:esporte/resultados/criar-prova', juizController.handleCriarProva);
router.post('/:esporte/resultados/excluir-prova/:provaId', juizController.handleExcluirProva);
router.post('/:esporte/resultados/salvar-prova/:provaId', juizController.handleSalvarResultadosProva);
router.post('/:esporte/resultados/salvar-xadrez', juizController.handleSalvarResultadosXadrez);
router.get('/:esporte', juizController.renderJogos);
router.get('/jogos/:jogoId/placar', juizController.renderPlacar);
router.post('/jogos/:jogoId/placar', [
  body('placar1').isInt({ min: 0 }).withMessage('Placar inválido.'),
  body('placar2').isInt({ min: 0 }).withMessage('Placar inválido.'),
  body('status').isIn(['Agendado', 'Em Andamento', 'Encerrado', 'Cancelado']).withMessage('Status inválido.'),
  body('sets').optional().custom((value) => {
    if (!Array.isArray(value)) return true;
    for (const s of value) {
      if (s && s.pontos_1 !== undefined) {
        const v1 = Number(s.pontos_1);
        const v2 = Number(s.pontos_2);
        if (isNaN(v1) || isNaN(v2) || v1 < 0 || v2 < 0) {
          throw new Error('Placar do set inválido.');
        }
      }
    }
    return true;
  })
], juizController.handleSalvarPlacar);

router.post('/jogos/:jogoId/wo', [
  body('campus_vencedor').isInt({ min: 1 }).withMessage('Selecione o campus vencedor.')
], juizController.handleAplicarWO);
router.post('/jogos/:jogoId/desfazer-wo', juizController.handleDesfazerWO);

router.post('/jogos/:jogoId/adiar', [
  body('nova_data').matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Data inválida para o adiamento.'),
  body('nova_hora').matches(/^([01]\d|2[0-3]):[0-5]\d$/).withMessage('Horário inválido para o adiamento.')
], juizController.handleAdiarJogo);

module.exports = router;
