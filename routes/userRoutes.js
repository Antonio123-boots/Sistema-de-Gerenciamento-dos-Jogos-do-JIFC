const express = require('express');
const router = express.Router();
const adminModel = require('../models/adminModel');
const campusModel = require('../models/campusModel');
const { listarCampi, obterCampusPorSlug, listarCredenciaisCampus, senhaPadraoCampus } = require('../models/campiCatalog');

const IFCS = [
    'IFC Araquari', 'IFC Blumenau', 'IFC Brusque', 'IFC Camboriú', 'IFC Concórdia',
    'IFC Fraiburgo', 'IFC Ibirama', 'IFC Luzerna', 'IFC Rio do Sul', 'IFC Santa Rosa do Sul',
    'IFC São Bento do Sul', 'IFC São Francisco do Sul', 'IFC Sombrio', 'IFC Videira', 'IFC Abelardo Luz'
];

const modalidades = [
    { slug: 'futsal-masculino', nome: 'Futsal Masculino', genero: 'Masculino', icone: '⚽', dia: '24/06', chaves: ['A', 'B'] },
    { slug: 'futsal-feminino', nome: 'Futsal Feminino', genero: 'Feminino', icone: '⚽', dia: '24/06', chaves: ['A'] },
    { slug: 'voleibol-masculino', nome: 'Voleibol Masculino', genero: 'Masculino', icone: '🏐', dia: '25/06', chaves: ['A', 'B'] },
    { slug: 'voleibol-feminino', nome: 'Voleibol Feminino', genero: 'Feminino', icone: '🏐', dia: '25/06', chaves: ['A'] },
    { slug: 'basquete-masculino', nome: 'Basquete Masculino', genero: 'Masculino', icone: '🏀', dia: '26/06', chaves: ['A', 'B'] },
    { slug: 'basquete-feminino', nome: 'Basquete Feminino', genero: 'Feminino', icone: '🏀', dia: '26/06', chaves: ['A'] }
];

function agruparJogosPorDia(jogos) {
    return jogos.reduce((acumulador, jogo) => {
        const dia = jogo.data;
        if (!acumulador[dia]) {
            acumulador[dia] = [];
        }
        acumulador[dia].push(jogo);
        return acumulador;
    }, {});
}

function gerarDiasDoEvento(configuracoes) {
    const inicioEvento = configuracoes.inicio_evento;
    const fimEvento = configuracoes.fim_evento;

    if (!inicioEvento || !fimEvento) {
        return [];
    }

    const inicio = new Date(`${inicioEvento}T00:00:00`);
    const fim = new Date(`${fimEvento}T00:00:00`);

    if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime()) || inicio > fim) {
        return [];
    }

    const dias = [];
    const cursor = new Date(inicio);

    while (cursor <= fim) {
        const dia = String(cursor.getDate()).padStart(2, '0');
        const mes = String(cursor.getMonth() + 1).padStart(2, '0');
        dias.push(`${dia}/${mes}`);
        cursor.setDate(cursor.getDate() + 1);
    }

    return dias;
}

function gerarJogos() {
    return modalidades.map((modalidade, index) => ({
        ...modalidade,
        jogos: [
            {
                id: index * 3 + 1,
                data: modalidade.dia,
                horario: ['09:00', '10:30', '13:30'][index % 3],
                casa: IFCS[(index * 2) % IFCS.length],
                fora: IFCS[(index * 3 + 1) % IFCS.length],
                placar: ['3 x 1', '2 x 2', '4 x 3'][index % 3],
                status: 'Encerrado'
            },
            {
                id: index * 3 + 2,
                data: modalidade.dia,
                horario: ['11:00', '12:15', '15:00'][index % 3],
                casa: IFCS[(index * 4 + 2) % IFCS.length],
                fora: IFCS[(index * 5 + 3) % IFCS.length],
                placar: ['2 x 0', '3 x 1', '1 x 1'][index % 3],
                status: 'Encerrado'
            },
            {
                id: index * 3 + 3,
                data: modalidade.dia,
                horario: ['16:00', '17:30', '18:30'][index % 3],
                casa: IFCS[(index * 6 + 4) % IFCS.length],
                fora: IFCS[(index * 7 + 5) % IFCS.length],
                placar: ['4 x 2', '2 x 1', '3 x 2'][index % 3],
                status: 'Agendado'
            }
        ]
    }));
}

function filtrarPorDia(dia = '24/06', slug = '') {
    return gerarJogos().filter((item) => item.dia === dia && (!slug || item.slug === slug));
}

/* GET home page (Usuário Comum) */
router.get('/', function(req, res, next) {
    const diaSelecionado = req.query.dia || '24/06';
    const modalidadeSelecionada = req.query.modalidade || '';
    const lista = filtrarPorDia(diaSelecionado, modalidadeSelecionada);

    res.locals.modalidades = gerarJogos();
    res.render('user', {
        title: 'JIFC - Início',
        usuarioLogado: req.session?.usuario || null,
        mostrarFiltros: true,
        modalidades: lista.length ? lista : gerarJogos().filter((item) => item.dia === diaSelecionado),
        diaSelecionado,
        modalidadeSelecionada: modalidadeSelecionada || null
    });
});

/* GET login page */
router.get('/login', function(req, res, next) {
    if (req.session && req.session.usuario) {
        return res.redirect('/perfil');
    }
    res.render('login', {
        title: 'JIFC - Login',
        usuarioLogado: null,
        mostrarFiltros: false,
        erro: null,
        credenciaisCampus: listarCredenciaisCampus(),
        senhaPadraoCampus
    });
});

/* GET profile page */
router.get('/perfil', async function(req, res, next) {
    if (!req.session || !req.session.usuario) {
        return res.redirect('/login');
    }

    const configuracoes = adminModel.getConfiguracoes();
    const hoje = new Date().toISOString().slice(0, 10);

    function estaNoPrazo(inicio, fim) {
        if (!inicio || !fim) return false;
        return hoje >= inicio && hoje <= fim;
    }

    const prazoModalidadesAberto = estaNoPrazo(configuracoes.inicio_inscricao_modalidades, configuracoes.fim_inscricao_modalidades);
    const prazoAtletasAberto = estaNoPrazo(configuracoes.inicio_inscricao_atletas, configuracoes.fim_inscricao_atletas);
    const statusInscricao = prazoModalidadesAberto
        ? 'Inscrições de modalidades abertas'
        : prazoAtletasAberto
            ? 'Inscrições de atletas abertas'
            : 'Aguardando configuração do admin';
    const textoModalidades = prazoModalidadesAberto ? 'Inscrever modalidades' : 'Ver modalidades';
    const textoAtletas = prazoAtletasAberto ? 'Inscrever atletas' : 'Substituir atletas';
    const mostrarAcoesInscricao = prazoModalidadesAberto || prazoAtletasAberto;
    const anoBaseEvento = Number(configuracoes.ano_evento || new Date().getFullYear());

    const campusNome = req.session.usuario.nome || 'IFC Blumenau';
    const atletasCampus = campusModel.getAtletas(campusNome);
    const modalidadesCampus = campusModel.getInscricoes(campusNome);
    const jogos = await adminModel.getJogos();
    const jogosCampus = jogos.filter((jogo) =>
        jogo.casa === campusNome || jogo.fora === campusNome
    );
    const jogosCampusPorDia = agruparJogosPorDia(jogosCampus);
    const diasEvento = gerarDiasDoEvento(configuracoes);
    const diasJogosCampus = diasEvento.length ? diasEvento : Object.keys(jogosCampusPorDia).sort((a, b) => {
        const [diaA, mesA] = a.split('/').map(Number);
        const [diaB, mesB] = b.split('/').map(Number);
        return new Date(anoBaseEvento, (mesA || 1) - 1, diaA || 1) - new Date(anoBaseEvento, (mesB || 1) - 1, diaB || 1);
    });
    const diaJogosSelecionado = diasJogosCampus.includes(req.query.dia) ? req.query.dia : (diasJogosCampus[0] || '');

    res.render('perfil', {
        title: 'JIFC - Perfil',
        usuarioLogado: req.session.usuario,
        mostrarFiltros: false,
        configuracoes,
        statusInscricao,
        prazoModalidadesAberto,
        prazoAtletasAberto,
        textoModalidades,
        textoAtletas,
        mostrarAcoesInscricao,
        atletasCampus,
        modalidadesCampus,
        jogosCampus,
        jogosCampusPorDia,
        diasEvento,
        diasJogosCampus,
        diaJogosSelecionado,
        anoJifc: adminModel.getAnoJifc()
    });
});

/* GET chaveamento page */
router.get('/chaveamento', function(req, res, next) {
    const diaSelecionado = req.query.dia || '24/06';
    const modalidadeSelecionada = req.query.modalidade || '';
    const lista = filtrarPorDia(diaSelecionado, modalidadeSelecionada);
    const modalidade = gerarJogos().find((item) => item.slug === modalidadeSelecionada) || lista[0] || gerarJogos()[0];

    res.locals.modalidades = gerarJogos();
    res.render('chaveamento', {
        title: 'Chaveamento - JIFC',
        usuarioLogado: req.session?.usuario || null,
        mostrarFiltros: false,
        modalidades: lista.length ? lista : gerarJogos().filter((item) => item.dia === diaSelecionado),
        modalidadeSelecionada: modalidade,
        diaSelecionado
    });
});

/* GET equipes page */
router.get('/equipes', function(req, res, next) {
    res.render('equipes', { 
        title: 'Equipes',
        usuarioLogado: req.session?.usuario || null,
        mostrarFiltros: false,
        campi: listarCampi()
    });
});

router.get('/equipes/:slug', async function(req, res, next) {
    const campus = obterCampusPorSlug(req.params.slug);

    if (!campus) {
        return res.redirect('/equipes');
    }

    const configuracoes = adminModel.getConfiguracoes();
    const jogos = await adminModel.getJogos();
    const atletasCampus = campusModel.getAtletas(campus.nome);
    const modalidadesCampus = campusModel.getInscricoes(campus.nome);
    const jogosCampus = jogos.filter((jogo) => jogo.casa === campus.nome || jogo.fora === campus.nome);
    const jogosCampusPorDia = agruparJogosPorDia(jogosCampus);
    const diasEvento = gerarDiasDoEvento(configuracoes);
    const diasJogosCampus = diasEvento.length ? diasEvento : Object.keys(jogosCampusPorDia).sort((a, b) => {
        const [diaA, mesA] = a.split('/').map(Number);
        const [diaB, mesB] = b.split('/').map(Number);
        return new Date(Number(configuracoes.ano_evento || new Date().getFullYear()), (mesA || 1) - 1, diaA || 1) - new Date(Number(configuracoes.ano_evento || new Date().getFullYear()), (mesB || 1) - 1, diaB || 1);
    });
    const diaJogosSelecionado = diasJogosCampus.includes(req.query.dia) ? req.query.dia : (diasJogosCampus[0] || '');

    res.render('perfil', {
        title: `Perfil - ${campus.nomeExibicao}`,
        usuarioLogado: req.session?.usuario || null,
        mostrarFiltros: false,
        configuracoes,
        statusInscricao: 'Perfil público do campus',
        prazoModalidadesAberto: false,
        prazoAtletasAberto: false,
        textoModalidades: 'Ver modalidades',
        textoAtletas: 'Ver atletas',
        mostrarAcoesInscricao: false,
        atletasCampus,
        modalidadesCampus,
        jogosCampus,
        jogosCampusPorDia,
        diasEvento,
        diasJogosCampus,
        diaJogosSelecionado,
        anoJifc: adminModel.getAnoJifc(),
        modoPublico: true,
        campusSelecionado: campus
    });
});

module.exports = router;