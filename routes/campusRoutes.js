const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const campusController = require('../controllers/campusController');
const { requireAuth, requireRole } = require('../middleware/auth');
const { handleValidationForm } = require('../middleware/validation');
const substitutionDocumentUpload = require('../middleware/substitutionDocumentUpload');

router.use(requireAuth, requireRole('campus'));

const atletaValidation = [
    body('nome').trim().notEmpty().withMessage('Nome é obrigatório.').isLength({ min: 3, max: 100 }),
    body('matricula').trim().notEmpty().withMessage('Matrícula é obrigatória.').matches(/^\d{9,12}$/).withMessage('Matrícula deve ter 9 a 12 dígitos.'),
    body('cpf').trim().notEmpty().withMessage('CPF é obrigatório.')
        .customSanitizer((valor) => String(valor).replace(/\D/g, ''))
        .matches(/^\d{11}$/).withMessage('CPF deve ter 11 dígitos.'),
    body('dataNascimento').trim().notEmpty().withMessage('Data de nascimento é obrigatória.')
];

const modalidadesValidation = [
    body('modalidades')
        .customSanitizer((valor) => {
            if (valor === undefined || valor === null || valor === '') return [];
            return Array.isArray(valor) ? valor : [valor];
        })
        .custom((lista) => Array.isArray(lista) && lista.length <= 3)
        .withMessage('Selecione no máximo 3 modalidades.')
];

const atletaIdParam = [
    param('id').isInt({ min: 1 }).withMessage('Atleta inválido.')
];

router.get('/inscricoes', campusController.renderInscricoes);
router.post('/inscricoes/salvar', modalidadesValidation, handleValidationForm, campusController.salvarInscricoes);

router.get('/atletas', campusController.renderAtletas);
router.get('/atletas/exportar', campusController.exportarAtletasExcel);
router.post('/atletas/cadastrar', substitutionDocumentUpload, atletaValidation, campusController.cadastrarAtleta);
router.get('/atletas/editar/:id', atletaIdParam, handleValidationForm, campusController.editarAtleta);
router.post('/atletas/atualizar/:id', substitutionDocumentUpload, atletaIdParam, atletaValidation, campusController.atualizarAtleta);
router.post('/atletas/excluir/:id', atletaIdParam, handleValidationForm, campusController.excluirAtleta);
router.post('/atletas/substituir', [
    substitutionDocumentUpload,
    ...atletaValidation,
    body('atletaSubstituidoId').isInt({ min: 1 }).withMessage('Selecione o atleta que será substituído.')
], campusController.substituirAtleta);
router.get('/jogos', campusController.renderJogos);

module.exports = router;
