const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const campusController = require('../controllers/campusController');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth, requireRole('campus'));

const atletaValidation = [
    body('nome').trim().notEmpty().withMessage('Nome é obrigatório.').isLength({ min: 3, max: 100 }),
    body('matricula').trim().notEmpty().withMessage('Matrícula é obrigatória.').matches(/^\d{9,12}$/).withMessage('Matrícula deve ter 9 a 12 dígitos.'),
    body('cpf').trim().notEmpty().withMessage('CPF é obrigatório.').matches(/^\d{11}$/).withMessage('CPF deve ter 11 dígitos.'),
    body('dataNascimento').trim().notEmpty().withMessage('Data de nascimento é obrigatória.')
];

router.get('/inscricoes', campusController.renderInscricoes);
router.post('/inscricoes/salvar', campusController.salvarInscricoes);

router.get('/atletas', campusController.renderAtletas);
router.post('/atletas/cadastrar', atletaValidation, campusController.cadastrarAtleta);
router.get('/atletas/editar/:id', campusController.editarAtleta);
router.post('/atletas/atualizar/:id', atletaValidation, campusController.atualizarAtleta);
router.post('/atletas/excluir/:id', campusController.excluirAtleta);
router.post('/atletas/substituir', atletaValidation, campusController.substituirAtleta);
router.get('/jogos', campusController.renderJogos);

module.exports = router;
