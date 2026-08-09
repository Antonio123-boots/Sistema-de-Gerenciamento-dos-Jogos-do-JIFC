const express = require('express');
const router = express.Router();
const adminModel = require('../models/adminModel');
const campusModel = require('../models/campusModel');
const { listarCampi, obterCampusPorSlug, listarCredenciaisCampus, senhaPadraoCampus, atualizarCampus } = require('../models/campiCatalog');
const { salvarFotoPerfilUsuario } = require('../models/authUsers');
const { filtrarModalidadesParaHome } = require('../utils/homeFilters');

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

function normalizarNomeBase(nome) {
    return String(nome || '')
        .replace(/\s+(Masculino|Feminino)$/i, '')
        .trim();
}

function gerarSlugBase(nome) {
    return String(nome || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
}

function mapearImagemModalidade(nome) {
    const nomeNormalizado = String(nome || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    if (nomeNormalizado.includes('futsal')) return '/imagens/futsal1.svg';
    if (nomeNormalizado.includes('volei') || nomeNormalizado.includes('vôlei')) return '/imagens/volei1.svg';
    if (nomeNormalizado.includes('basquete')) return '/imagens/basquete1.svg';
    if (nomeNormalizado.includes('handebol')) return '/imagens/handebol1.svg';
    if (nomeNormalizado.includes('tenis')) return '/imagens/tenisdemesa1.svg';
    if (nomeNormalizado.includes('xadrez')) return '/imagens/xadrez1.svg';
    if (nomeNormalizado.includes('atletismo')) return '/imagens/atletismo1.svg';
    if (nomeNormalizado.includes('praia') || nomeNormalizado.includes('areia')) return '/imagens/areia1.svg';

    return '/imagens/atletismo1.svg';
}

function formatarModalidadesParaHome(modalidadesBanco = []) {
    const mapa = new Map();

    (Array.isArray(modalidadesBanco) ? modalidadesBanco : []).forEach((mod, index) => {
        const nome = String(mod.nome || '').trim() || `Modalidade ${index + 1}`;
        const nomeBase = normalizarNomeBase(nome);
        const slugBase = gerarSlugBase(nomeBase);

        if (mapa.has(slugBase)) {
            return;
        }

        mapa.set(slugBase, {
            ...mod,
            nome: nomeBase,
            nomeBase,
            slug: String(mod.slug || slugBase).trim(),
            slugBase,
            dia: String(mod.dia || mod.data || '').trim(),
            imagem: String(mod.imagem || mod.icone || mapearImagemModalidade(nome)).trim() || '/imagens/atletismo1.svg'
        });
    });

    return Array.from(mapa.values());
}

function montarDiasDisponiveis(modalidadesParaExibir = []) {
    const dias = [...new Set(
        (Array.isArray(modalidadesParaExibir) ? modalidadesParaExibir : [])
            .map((mod) => String(mod.dia || mod.data || '').trim())
            .filter(Boolean)
    )];

    return dias.sort((a, b) => {
        const [diaA, mesA] = a.split('/').map(Number);
        const [diaB, mesB] = b.split('/').map(Number);
        return (mesA * 100 + diaA) - (mesB * 100 + diaB);
    });
}

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
router.get('/', async function(req, res, next) {
    try {
        const modalidadeSelecionada = String(req.query.modalidade || '').trim();
        const diaSelecionadoSolicitado = String(req.query.dia || '').trim();
        const modalidadesBanco = await adminModel.getModalidadesBanco();
        const modalidadesDisponiveis = formatarModalidadesParaHome(modalidadesBanco);
        const diasDisponiveis = montarDiasDisponiveis(modalidadesDisponiveis);
        const diaSelecionado = diasDisponiveis.includes(diaSelecionadoSolicitado)
            ? diaSelecionadoSolicitado
            : (diasDisponiveis[0] || '');

        const lista = filtrarModalidadesParaHome(modalidadesDisponiveis, {
            modalidade: modalidadeSelecionada,
            dia: diaSelecionado
        });

        res.locals.modalidades = modalidadesDisponiveis;
        res.render('user', {
            title: 'JIFC - Início',
            usuarioLogado: req.session?.usuario || null,
            mostrarFiltros: true,
            modalidades: lista,
            diasDisponiveis,
            diaSelecionado,
            modalidadeSelecionada: modalidadeSelecionada || null
        });
    } catch (error) {
        console.error('Erro ao carregar home pública:', error);
        res.locals.modalidades = [];
        const modalidadeSelecionada = String(req.query.modalidade || '').trim();
        const diaSelecionadoSolicitado = String(req.query.dia || '').trim();
        const modalidadesDisponiveis = formatarModalidadesParaHome([]);
        const diasDisponiveis = montarDiasDisponiveis(modalidadesDisponiveis);
        const diaSelecionado = diasDisponiveis.includes(diaSelecionadoSolicitado)
            ? diaSelecionadoSolicitado
            : (diasDisponiveis[0] || '');
        const lista = filtrarModalidadesParaHome(modalidadesDisponiveis, {
            modalidade: modalidadeSelecionada,
            dia: diaSelecionado
        });

        res.render('user', {
            title: 'JIFC - Início',
            usuarioLogado: req.session?.usuario || null,
            mostrarFiltros: true,
            modalidades: lista,
            diasDisponiveis,
            diaSelecionado,
            modalidadeSelecionada: modalidadeSelecionada || null
        });
    }
});

/* GET login page */
router.get('/login', async function(req, res, next) {
    if (req.session && req.session.usuario) {
        return res.redirect('/perfil');
    }
    res.render('login', {
        title: 'JIFC - Login',
        usuarioLogado: null,
        mostrarFiltros: false,
        erro: null,
        credenciaisCampus: await listarCredenciaisCampus(),
        senhaPadraoCampus
    });
});

/* GET profile page */
router.post('/perfil/foto', async function(req, res, next) {
    if (!req.session || !req.session.usuario) {
        return res.redirect('/login');
    }

    const fotoPerfil = String(req.body.fotoPerfil || '').trim() || '/imagens/avatar.svg';

    try {
        if (req.session.usuario.tipo === 'campus' && req.session.usuario.campusSlug) {
            const campusAtualizado = await atualizarCampus(req.session.usuario.campusSlug, {
                fotoPerfil
            });

            req.session.usuario.fotoPerfil = campusAtualizado.fotoPerfil || fotoPerfil;
        } else {
            const fotoPersistida = salvarFotoPerfilUsuario(req.session.usuario.email, fotoPerfil);
            req.session.usuario.fotoPerfil = fotoPersistida || fotoPerfil;
        }

        global.sessions.set(req.sessionId, req.session);
        return res.redirect('/perfil');
    } catch (error) {
        console.error('Erro ao salvar foto de perfil:', error);
        return res.redirect('/perfil');
    }
});

router.post('/perfil/editar', async function(req, res, next) {
    if (!req.session || !req.session.usuario) {
        return res.redirect('/login');
    }

    if (req.session.usuario.tipo !== 'campus' || !req.session.usuario.campusSlug) {
        return res.redirect('/perfil?erro=' + encodeURIComponent('A edição de perfil está disponível apenas para campi.'));
    }

    try {
        const campusAtualizado = await atualizarCampus(req.session.usuario.campusSlug, {
            nome: req.body.nome,
            nomeExibicao: req.body.nomeExibicao,
            email: req.body.email,
            senha: req.body.senha,
            cidade: req.body.cidade,
            fotoPerfil: req.body.fotoPerfil || req.session.usuario.fotoPerfil || '/imagens/avatar.svg'
        });

        req.session.usuario.nome = campusAtualizado.nome || req.session.usuario.nome;
        req.session.usuario.nomeExibicao = campusAtualizado.nomeExibicao || req.session.usuario.nomeExibicao;
        req.session.usuario.email = campusAtualizado.email || req.session.usuario.email;
        req.session.usuario.cidade = campusAtualizado.cidade || req.session.usuario.cidade;
        req.session.usuario.fotoPerfil = campusAtualizado.fotoPerfil || req.session.usuario.fotoPerfil;
        req.session.usuario.logoTexto = campusAtualizado.logoTexto || req.session.usuario.logoTexto;
        req.session.usuario.cor = campusAtualizado.cor || req.session.usuario.cor;

        global.sessions.set(req.sessionId, req.session);
        return res.redirect('/perfil?sucesso=' + encodeURIComponent('Perfil atualizado com sucesso.'));
    } catch (error) {
        console.error('Erro ao editar perfil do campus:', error);
        return res.redirect('/perfil?erro=' + encodeURIComponent(error.message || 'Não foi possível atualizar o perfil.'));
    }
});

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
        mensagemErro: req.query.erro || '',
        mensagemSucesso: req.query.sucesso || '',
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
router.get('/chaveamento', async function(req, res, next) {
    try {
        const listaModalidades = await adminModel.getModalidadesBanco();
        const listaModalidadesCompleta = listaModalidades.map((mod) => {
            const nome = String(mod.nome || '').trim();
            const genero = String(mod.genero || '').trim();
            const nomeNormalizado = nome.toLowerCase().normalize('NFD').replace(/[ -\u036f]/g, '');
            let categoria = 'outros';
            if (nomeNormalizado.includes('futsal')) categoria = 'futsal';
            else if (nomeNormalizado.includes('volei')) categoria = 'volei';
            else if (nomeNormalizado.includes('basquete')) categoria = 'basquete';
            else if (nomeNormalizado.includes('handebol')) categoria = 'handebol';
            else if (nomeNormalizado.includes('atletismo')) categoria = 'atletismo';
            else if (nomeNormalizado.includes('tenis de mesa') || nomeNormalizado.includes('tenis')) categoria = 'tenis-de-mesa';
            else if (nomeNormalizado.includes('xadrez')) categoria = 'xadrez';

            return {
                ...mod,
                icone: String(mod.icone || '🏆').trim() || '🏆',
                categoria
            };
        });

        if (!listaModalidadesCompleta.length) {
            return res.send('Nenhuma modalidade cadastrada no banco de dados.');
        }

        const modalidadeAtiva = listaModalidadesCompleta.find((item) => item.id === Number(req.query.modalidade)) || listaModalidadesCompleta[0];
        const subCategoria = req.query.sub || (modalidadeAtiva.categoria === 'tenis-de-mesa' ? 'individual' : 'geral');
        const provasAtletismo = [];
        const classificadosXadrez = [];
        const chavesGeradas = [];
        const jogosProgramados = [];

        res.locals.modalidades = listaModalidadesCompleta;
        res.render('chaveamento', {
            title: 'Chaveamento - JIFC',
            usuarioLogado: req.session?.usuario || null,
            mostrarFiltros: false,
            listaModalidadesCompleta,
            modalidadeAtiva,
            subCategoriaAtiva: subCategoria,
            provasAtletismo,
            classificadosXadrez,
            chavesGeradas,
            jogosProgramados
        });
    } catch (error) {
        console.error('Erro ao carregar chaveamento público:', error);
        res.status(500).send('Erro ao carregar o chaveamento.');
    }
});

/* GET equipes page */
router.get('/equipes', async function(req, res, next) {
    const campi = (await listarCampi()).slice().sort((a, b) => a.nomeExibicao.localeCompare(b.nomeExibicao));
    res.render('equipes', { 
        title: 'Equipes',
        usuarioLogado: req.session?.usuario || null,
        mostrarFiltros: false,
        campi
    });
});

router.get('/equipes/:slug', async function(req, res, next) {
    const campus = await obterCampusPorSlug(req.params.slug);

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
        statusInscricao: '',
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