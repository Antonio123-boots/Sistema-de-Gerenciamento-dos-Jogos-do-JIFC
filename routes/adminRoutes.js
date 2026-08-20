const express = require('express');
const router = express.Router();
const { body, param, validationResult } = require('express-validator');
const adminController = require('../controllers/adminController');
const juizController = require('../controllers/juizController');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth, requireRole('admin'));

const campusValidation = [
    body('nome').trim().notEmpty().withMessage('Nome é obrigatório.').isLength({ max: 100 }),
    body('email').isEmail().withMessage('E-mail inválido.').normalizeEmail(),
    body('senha').optional({ checkFalsy: true }).isLength({ min: 6 }).withMessage('Senha deve ter no mínimo 6 caracteres.')
];

const slugParam = [
    param('slug').trim().notEmpty().withMessage('Slug inválido.')
];

const modalidadeValidation = [
    body('nome_modalidade').trim().notEmpty().withMessage('Nome da modalidade é obrigatório.')
];

const jogoValidation = [
    body('status').optional().isIn(['Agendado', 'Em Andamento', 'Encerrado', 'Cancelado']).withMessage('Status inválido.')
];

router.get('/configurar', adminController.renderConfigurar);
router.post('/configurar/salvar', adminController.salvarConfiguracoes);
router.post('/modalidades/cadastrar', modalidadeValidation, adminController.cadastrarModalidade);
router.post('/modalidades/excluir/:modalidadeId', adminController.excluirModalidade);

router.get('/cadastroCampus', adminController.renderCadastroCampus);
router.post('/cadastroCampus/salvar', campusValidation, adminController.salvarCadastroCampus);
router.post('/cadastroCampus/excluir/:slug', slugParam, adminController.excluirCampusCadastro);
router.get('/banirCampus', adminController.renderBanirCampus);
router.post('/banirCampus/salvar', adminController.salvarBanirCampus);
router.post('/banirCampus/desbanir/:slug', slugParam, adminController.handleDesbanirCampus);
router.post('/banirCampus/excluir/:slug', slugParam, adminController.excluirCampus);

router.get('/laudos', adminController.renderAnalise);
router.post('/laudos/validar/:atletaId', adminController.validarAtleta);
router.post('/laudos/reprovar/:atletaId', adminController.marcarIrregular);

router.get('/chaveamento', adminController.renderChaveamento);
router.get('/chaveamento/campus/:id', adminController.renderResumoCampus);
router.post('/chaveamento/gerar', adminController.gerarChaveamento);
router.post('/chaveamento/limpar', adminController.limparChaveamento);
router.post('/chaveamento/publicar', adminController.publicarChaveamento);
router.post('/chaveamento/cancelar', adminController.cancelarSorteio);
router.get('/chaveamento/exportar', adminController.exportResumoInscricoes);
router.post('/chaveamento/jogo/:jogoId/salvar', jogoValidation, adminController.salvarJogoChaveamento);

router.get('/juizes', juizController.renderListar);
router.get('/juizes/cadastrar', juizController.renderCadastrar);
router.post('/juizes/cadastrar', [
    body('nome').trim().notEmpty().withMessage('Nome é obrigatório.').isLength({ max: 100 }),
    body('email').isEmail().withMessage('E-mail inválido.').normalizeEmail(),
    body('senha').isLength({ min: 6 }).withMessage('Senha deve ter no mínimo 6 caracteres.')
], juizController.handleCadastrar);
router.get('/juizes/editar/:id', juizController.renderEditar);
router.post('/juizes/editar/:id', [
    body('nome').trim().notEmpty().withMessage('Nome é obrigatório.').isLength({ max: 100 }),
    body('email').isEmail().withMessage('E-mail inválido.').normalizeEmail()
], juizController.handleEditar);
router.post('/juizes/excluir/:id', juizController.handleExcluir);

module.exports = router;
