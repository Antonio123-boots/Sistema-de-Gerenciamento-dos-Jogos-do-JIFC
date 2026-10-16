const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const adminController = require('../controllers/adminController');
const juizController = require('../controllers/juizController');
const edicaoWizardController = require('../controllers/edicaoWizardController');
const { requireAuth, requireRole } = require('../middleware/auth');
const { handleValidationForm } = require('../middleware/validation');

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
    body('nome_modalidade').trim().notEmpty().withMessage('Nome da modalidade é obrigatório.'),
    body('limite_inscritos').optional({ checkFalsy: true }).isInt({ min: 0 }).withMessage('Limite de inscritos deve ser um número maior ou igual a zero.')
];

const jogoValidation = [
    body('status').optional().isIn(['Agendado', 'Em Andamento', 'Encerrado', 'Cancelado']).withMessage('Status inválido.')
];

const modalidadeIdParam = [
    param('modalidadeId').isInt({ min: 1 }).withMessage('Modalidade inválida.')
];

const atletaIdParam = [
    param('atletaId').isInt({ min: 1 }).withMessage('Atleta inválido.')
];

const campusIdParam = [
    param('id').isInt({ min: 1 }).withMessage('Campus inválido.')
];

const jogoIdParam = [
    param('jogoId').isInt({ min: 1 }).withMessage('Jogo inválido.')
];

const anoParam = [
    param('ano').isInt({ min: 2000, max: 2100 }).withMessage('Ano inválido.')
];

const idParam = [
    param('id').isInt({ min: 1 }).withMessage('Identificador inválido.')
];

const idxParam = [
    param('idx').isInt({ min: 0 }).withMessage('Modalidade inválida.')
];

const etapaParam = [
    param('etapa').isIn(['dados', 'campi', 'modalidades', 'modalidade', 'revisao']).withMessage('Etapa inválida.')
];

const dataCampos = ['inicio_evento', 'fim_evento', 'inicio_inscricao_modalidades', 'fim_inscricao_modalidades',
    'inicio_inscricao_atletas', 'fim_inscricao_atletas', 'inicio_sorteio_chaves', 'fim_sorteio_chaves'];

const configuracaoValidation = [
    ...dataCampos.map((campo) => body(campo).optional({ checkFalsy: true }).isISO8601().withMessage('Data inválida.')),
    body('limite_atletas_total_campus').optional({ checkFalsy: true }).isInt({ min: 0 }).withMessage('Limite de atletas deve ser um número maior ou igual a zero.')
];

const banirCampusValidation = [
    body('slug').trim().notEmpty().withMessage('Campus é obrigatório.'),
    body('tipoPunicao').isIn(['banimento', 'suspensao', 'advertencia', 'atleta']).withMessage('Tipo de punição inválido.'),
    body('duracaoSuspensao').optional({ checkFalsy: true }).isInt({ min: 0 }).withMessage('Duração da suspensão inválida.')
];

const salvarAnoAtualValidation = [
    body('ano').optional({ checkFalsy: true }).isInt({ min: 2000, max: 2100 }).withMessage('Ano inválido.'),
    body('ano_jifc').optional({ checkFalsy: true }).isInt({ min: 2000, max: 2100 }).withMessage('Ano inválido.')
];

router.get('/configurar', adminController.renderConfigurar);
router.post('/configurar/salvar', configuracaoValidation, handleValidationForm, adminController.salvarConfiguracoes);
router.post('/modalidades/cadastrar', modalidadeValidation, handleValidationForm, adminController.cadastrarModalidade);
router.post('/modalidades/excluir/:modalidadeId', modalidadeIdParam, handleValidationForm, adminController.excluirModalidade);

router.get('/cadastroCampus', adminController.renderCadastroCampus);
router.post('/cadastroCampus/salvar', campusValidation, handleValidationForm, adminController.salvarCadastroCampus);
router.post('/cadastroCampus/excluir/:slug', slugParam, handleValidationForm, adminController.excluirCampusCadastro);
router.get('/banirCampus', adminController.renderBanirCampus);
router.post('/banirCampus/salvar', banirCampusValidation, handleValidationForm, adminController.salvarBanirCampus);
router.post('/banirCampus/desbanir/:slug', slugParam, handleValidationForm, adminController.handleDesbanirCampus);
router.post('/banirCampus/excluir/:slug', slugParam, handleValidationForm, adminController.excluirCampus);

router.get('/laudos', adminController.renderAnalise);
router.post('/laudos/validar/:atletaId', atletaIdParam, handleValidationForm, adminController.validarAtleta);
router.post('/laudos/reprovar/:atletaId', atletaIdParam, handleValidationForm, adminController.marcarIrregular);

router.get('/chaveamento', adminController.renderChaveamento);
router.get('/chaveamento/campus/:id', campusIdParam, handleValidationForm, adminController.renderResumoCampus);
router.post('/chaveamento/gerar', adminController.gerarChaveamento);
router.post('/chaveamento/limpar', adminController.limparChaveamento);
router.post('/chaveamento/publicar', adminController.publicarChaveamento);
router.post('/chaveamento/publicar-tudo', adminController.publicarTodosJogos);
router.post('/chaveamento/excluir-publicacao', adminController.excluirPublicacao);
router.post('/chaveamento/eliminatoria/gerar', adminController.gerarEliminatoria);
router.post('/chaveamento/cancelar', adminController.cancelarSorteio);
router.get('/chaveamento/exportar', adminController.exportResumoInscricoes);
router.post('/chaveamento/jogo/:jogoId/salvar', jogoIdParam, jogoValidation, handleValidationForm, adminController.salvarJogoChaveamento);
router.get('/boletins', adminController.renderBoletins);
router.get('/boletins/:ano', anoParam, handleValidationForm, adminController.renderBoletimAno);
router.post('/boletins/gerar', adminController.gerarBoletimFinal);

router.get('/edicoes', adminController.renderEdicoesAnteriores);

router.post('/edicoes/salvar-ano-atual', salvarAnoAtualValidation, handleValidationForm, adminController.salvarEdicaoAtualAno);
router.post('/edicoes/gerar-exemplo', adminController.gerarEdicaoExemplo);
router.post('/edicoes/importar', adminController.importarEdicaoArquivo);
router.post('/edicoes/excluir/:ano', anoParam, handleValidationForm, adminController.excluirEdicaoAno);
router.get('/edicoes/exportar/:ano', anoParam, handleValidationForm, adminController.exportarEdicaoAno);

router.get('/edicoes/nova', edicaoWizardController.renderWizard);
router.post('/edicoes/nova/dados', edicaoWizardController.salvarDadosGerais);
router.post('/edicoes/nova/campi', edicaoWizardController.salvarCampi);
router.post('/edicoes/nova/modalidades', edicaoWizardController.salvarModalidades);
router.post('/edicoes/nova/modalidades/ir', edicaoWizardController.irParaModalidade);
router.post('/edicoes/nova/voltar/:etapa', etapaParam, handleValidationForm, edicaoWizardController.voltarEtapa);
router.post('/edicoes/nova/voltar-revisao', edicaoWizardController.voltarRevisao);
router.post('/edicoes/nova/preencher-exemplo', edicaoWizardController.preencherExemplo);
router.post('/edicoes/nova/modalidade/:idx/participantes', idxParam, handleValidationForm, edicaoWizardController.salvarParticipantes);
router.post('/edicoes/nova/modalidade/:idx/voltar-participantes', idxParam, handleValidationForm, edicaoWizardController.voltarParticipantes);
router.post('/edicoes/nova/modalidade/:idx/grupos', idxParam, handleValidationForm, edicaoWizardController.salvarGrupos);
router.post('/edicoes/nova/modalidade/:idx/voltar-grupos', idxParam, handleValidationForm, edicaoWizardController.voltarGrupos);
router.post('/edicoes/nova/modalidade/:idx/confrontos', idxParam, handleValidationForm, edicaoWizardController.salvarConfrontos);
router.post('/edicoes/nova/modalidade/:idx/voltar-confrontos', idxParam, handleValidationForm, edicaoWizardController.voltarConfrontos);
router.post('/edicoes/nova/modalidade/:idx/resultados', idxParam, handleValidationForm, edicaoWizardController.salvarResultados);
router.post('/edicoes/nova/modalidade/:idx/eliminatoria', idxParam, handleValidationForm, edicaoWizardController.salvarEliminatoria);
router.post('/edicoes/nova/modalidade/:idx/voltar-eliminatoria', idxParam, handleValidationForm, edicaoWizardController.voltarEliminatoria);
router.post('/edicoes/nova/modalidade/:idx/sub-etapa', idxParam, handleValidationForm, edicaoWizardController.alternarSubEtapa);
router.post('/edicoes/nova/salvar', edicaoWizardController.salvarFinal);
router.post('/edicoes/nova/cancelar', edicaoWizardController.cancelar);

router.get('/juizes', juizController.renderListar);
router.get('/juizes/cadastrar', juizController.renderCadastrar);
router.post('/juizes/cadastrar', [
    body('nome').trim().notEmpty().withMessage('Nome é obrigatório.').isLength({ max: 100 }),
    body('email').isEmail().withMessage('E-mail inválido.').normalizeEmail(),
    body('senha').isLength({ min: 6 }).withMessage('Senha deve ter no mínimo 6 caracteres.')
  ], juizController.handleCadastrar);
router.get('/juizes/editar/:id', idParam, handleValidationForm, juizController.renderEditar);
router.post('/juizes/editar/:id', [
    body('nome').trim().notEmpty().withMessage('Nome é obrigatório.').isLength({ max: 100 }),
    body('email').isEmail().withMessage('E-mail inválido.').normalizeEmail(),
    body('senha').optional({ checkFalsy: true }).isLength({ min: 6 }).withMessage('Senha deve ter no mínimo 6 caracteres.')
  ], juizController.handleEditar);
router.post('/juizes/excluir/:id', idParam, handleValidationForm, juizController.handleExcluir);

module.exports = router;
