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
    return String(nome || '').trim();
}

function gerarSlugBase(nome) {
    return String(nome || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
}

function normalizarGeneroTexto(valor = '') {
    return String(valor || '').trim().toLowerCase();
}

function obterBaseEsporte(valor = '') {
    const texto = String(valor || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/(^-|-$)/g, '');

    if (!texto) {
        return '';
    }

    return texto
        .replace(/-(masculino|feminino)$/g, '')
        .replace(/\s+(masculino|feminino)$/g, '')
        .replace(/(^masculino$|^feminino$)/g, '')
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

function formatarModalidadesParaHome(modalidadesBanco = [], generoAtivo = '', modalidadeAtiva = '') {
    const generoFiltro = String(generoAtivo || '').trim().toLowerCase();
    const modalidadeAtivaSlug = String(modalidadeAtiva || '').trim().toLowerCase();
    
    // Quando há esporte selecionado, retornar TODAS as modalidades daquele esporte (ambos os gêneros)
    if (modalidadeAtivaSlug && !generoFiltro) {
        const baseEsporte = obterBaseEsporte(modalidadeAtivaSlug);
        return (Array.isArray(modalidadesBanco) ? modalidadesBanco : [])
            .map((mod, index) => {
                const nome = String(mod.nome || '').trim() || `Modalidade ${index + 1}`;
                const nomeBase = normalizarNomeBase(nome);
                const genero = String(mod.genero || '').trim();
                const slugBase = gerarSlugBase(nomeBase);
                const slugMod = String(mod.slug || `${slugBase}-${String(genero || 'geral').trim().toLowerCase()}`).trim();
                return {
                    ...mod,
                    nome: nomeBase,
                    nomeBase,
                    slug: slugMod,
                    slugBase,
                    dia: String(mod.dia || mod.data || '').trim(),
                    imagem: String(mod.imagem || mod.icone || mapearImagemModalidade(nome)).trim() || '/imagens/atletismo1.svg',
                    genero
                };
            })
            .filter(mod => obterBaseEsporte(String(mod.slug || mod.slugBase || '')) === baseEsporte || obterBaseEsporte(String(mod.nome || '')) === baseEsporte)
            .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || '')));
    }
    
    // Quando não há filtro nenhum, retornar UMA modalidade por esporte (sem filtro de gênero)
    if (!generoFiltro && !modalidadeAtivaSlug) {
        const mapa = new Map();
        (Array.isArray(modalidadesBanco) ? modalidadesBanco : []).forEach((mod, index) => {
            const nome = String(mod.nome || '').trim() || `Modalidade ${index + 1}`;
            const nomeBase = normalizarNomeBase(nome);
            const genero = String(mod.genero || '').trim();
            const slugBase = gerarSlugBase(nomeBase);
            const slugMod = String(mod.slug || `${slugBase}-${String(genero || 'geral').trim().toLowerCase()}`).trim();
            const chave = slugBase;
            const item = {
                ...mod,
                nome: nomeBase,
                nomeBase,
                slug: slugMod,
                slugBase,
                dia: String(mod.dia || mod.data || '').trim(),
                imagem: String(mod.imagem || mod.icone || mapearImagemModalidade(nome)).trim() || '/imagens/atletismo1.svg',
                genero
            };

            if (!mapa.has(chave)) {
                mapa.set(chave, item);
            }
        });
        return Array.from(mapa.values()).sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || '')));
    }
    
    // Com filtro de gênero, usar comportamento original
    const mapa = new Map();

    (Array.isArray(modalidadesBanco) ? modalidadesBanco : []).forEach((mod, index) => {
        const nome = String(mod.nome || '').trim() || `Modalidade ${index + 1}`;
        const nomeBase = normalizarNomeBase(nome);
        const genero = String(mod.genero || '').trim();
        const slugBase = gerarSlugBase(nomeBase);
        const slugMod = String(mod.slug || `${slugBase}-${String(genero || 'geral').trim().toLowerCase()}`).trim();
        const chave = slugBase;
        const item = {
            ...mod,
            nome: nomeBase,
            nomeBase,
            slug: slugMod,
            slugBase,
            dia: String(mod.dia || mod.data || '').trim(),
            imagem: String(mod.imagem || mod.icone || mapearImagemModalidade(nome)).trim() || '/imagens/atletismo1.svg',
            genero
        };

        const slugComparavel = String(slugMod || slugBase || '').trim().toLowerCase();
        const baseSemGenero = slugBase.replace(/-(masculino|feminino)$/i, '');
        const modalidadeAtivaBase = modalidadeAtivaSlug.replace(/-(masculino|feminino)$/i, '');
        const coincideComAtiva = Boolean(modalidadeAtivaSlug) && (
            slugComparavel === modalidadeAtivaSlug ||
            slugBase === modalidadeAtivaSlug ||
            baseSemGenero === modalidadeAtivaBase
        );

        if (generoFiltro && String(genero || '').trim().toLowerCase() !== generoFiltro && !coincideComAtiva) {
            return;
        }

        if (!mapa.has(chave)) {
            mapa.set(chave, item);
            return;
        }

        const atual = mapa.get(chave);
        if ((String(atual.genero || '').trim().toLowerCase() === 'masculino' && String(genero || '').trim().toLowerCase() === 'feminino') ||
            (String(atual.genero || '').trim().toLowerCase() === 'feminino' && String(genero || '').trim().toLowerCase() === 'masculino')) {
            const itemPreferido = generoFiltro
                ? (String(genero || '').trim().toLowerCase() === generoFiltro ? item : atual)
                : atual;
            mapa.set(chave, itemPreferido);
        }
    });

    return Array.from(mapa.values()).sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || '')));
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
    const config = configuracoes && typeof configuracoes === 'object' ? configuracoes : {};
    const inicioEvento = String(config.inicio_evento || '').trim();
    const fimEvento = String(config.fim_evento || '').trim();

    if (!inicioEvento || !fimEvento) {
        return ['24/06', '25/06', '26/06'];
    }

    const inicio = new Date(`${inicioEvento}T00:00:00`);
    const fim = new Date(`${fimEvento}T00:00:00`);

    if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime()) || inicio > fim) {
        return ['24/06', '25/06', '26/06'];
    }

    const dias = [];
    const cursor = new Date(inicio);

    while (cursor <= fim) {
        const dia = String(cursor.getDate()).padStart(2, '0');
        const mes = String(cursor.getMonth() + 1).padStart(2, '0');
        dias.push(`${dia}/${mes}`);
        cursor.setDate(cursor.getDate() + 1);
    }

    return dias.length ? dias : ['24/06', '25/06', '26/06'];
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
        const generoSelecionadoSolicitado = String(req.query.genero || '').trim();
        const modalidadesBanco = await adminModel.getModalidadesBanco();
        const configuracoesBanco = await adminModel.getConfiguracoesBanco();
        const configuracoesAtuais = configuracoesBanco || adminModel.getConfiguracoes();
        const generosDisponiveis = [...new Set((Array.isArray(modalidadesBanco) ? modalidadesBanco : []).map((mod) => String(mod.genero || '').trim()).filter(Boolean))];
        const jogosPublicadosBase = await adminModel.getJogosPublicados({});
        const diasDisponiveisBase = [...new Set((Array.isArray(jogosPublicadosBase) ? jogosPublicadosBase : []).map((jogo) => String(jogo.data || '').trim()).filter(Boolean))].sort((a, b) => {
            const [diaA, mesA] = a.split('/').map(Number);
            const [diaB, mesB] = b.split('/').map(Number);
            return (mesA * 100 + diaA) - (mesB * 100 + diaB);
        });
        const diasDisponiveisEvento = gerarDiasDoEvento(configuracoesAtuais);
        const diasDisponiveis = [...new Set([...(Array.isArray(diasDisponiveisEvento) ? diasDisponiveisEvento : []), ...(Array.isArray(diasDisponiveisBase) ? diasDisponiveisBase : [])])].sort((a, b) => {
            const [diaA, mesA] = a.split('/').map(Number);
            const [diaB, mesB] = b.split('/').map(Number);
            return (mesA * 100 + diaA) - (mesB * 100 + diaB);
        });

        const hoje = new Date();
        const hojeFormatado = `${hoje.getDate()}/${String(hoje.getMonth() + 1).padStart(2, '0')}`;
        let diaPadraoAutomatico = diasDisponiveis.length ? diasDisponiveis[0] : '26/08';
        if (diasDisponiveis.length >= 3) {
            const [diaAtual, mesAtual] = hojeFormatado.split('/').map(Number);
            const [dia26, mes26] = (diasDisponiveis[0] || '26/08').split('/').map(Number);
            const [dia28, mes28] = (diasDisponiveis[diasDisponiveis.length - 1] || '28/08').split('/').map(Number);
            const dataAtual = mesAtual * 100 + diaAtual;
            const dataPrimeira = mes26 * 100 + dia26;
            const dataUltima = mes28 * 100 + dia28;
            diaPadraoAutomatico = dataAtual < dataPrimeira ? diasDisponiveis[0] : diasDisponiveis[diasDisponiveis.length - 1];
        }

        const diaSelecionado = diasDisponiveis.includes(diaSelecionadoSolicitado)
            ? diaSelecionadoSolicitado
            : '';

        let generoSelecionado = generosDisponiveis.find((generoDisponivel) =>
            normalizarGeneroTexto(generoDisponivel) === normalizarGeneroTexto(generoSelecionadoSolicitado)
        ) || '';

        // Sempre manter TODAS as modalidades para exibir nos filtros
        const todasAsModalidades = formatarModalidadesParaHome(modalidadesBanco, '', '');
        
        // Modalidades para tabela (apenas do esporte selecionado se houver)
        const modalidadesDisponiveis = formatarModalidadesParaHome(modalidadesBanco, generoSelecionado, modalidadeSelecionada);
        const modalidadesDoGeneroSelecionado = generoSelecionado
            ? modalidadesDisponiveis.filter((mod) => normalizarGeneroTexto(mod.genero) === normalizarGeneroTexto(generoSelecionado))
            : modalidadesDisponiveis;

        const modalidadeBaseSelecionadaSolicitada = obterBaseEsporte(modalidadeSelecionada);
        let modalidadeSelecionadaValida = modalidadesDisponiveis.some((mod) => {
            const slugAtual = String(mod.slug || mod.slugBase || '').trim();
            const slugBaseAtual = String(mod.slugBase || mod.slug || '').trim();
            const nomeBaseAtual = obterBaseEsporte(String(mod.nome || mod.nomeBase || ''));
            return slugAtual === modalidadeSelecionada || slugBaseAtual === modalidadeSelecionada || nomeBaseAtual === modalidadeBaseSelecionadaSolicitada;
        })
            ? modalidadeSelecionada
            : '';

        if (!modalidadeSelecionadaValida && modalidadeBaseSelecionadaSolicitada && modalidadesDisponiveis.some((mod) => {
            const slugAtual = String(mod.slug || mod.slugBase || '').trim();
            const nomeBaseAtual = obterBaseEsporte(String(mod.nome || mod.nomeBase || ''));
            return obterBaseEsporte(slugAtual) === modalidadeBaseSelecionadaSolicitada || nomeBaseAtual === modalidadeBaseSelecionadaSolicitada;
        })) {
            modalidadeSelecionadaValida = modalidadeSelecionada;
        }

        if (modalidadeSelecionadaValida && generoSelecionado && !modalidadesDoGeneroSelecionado.some((mod) => {
            const slugAtual = String(mod.slug || mod.slugBase || '').trim();
            const slugBaseAtual = String(mod.slugBase || mod.slug || '').trim();
            return slugAtual === modalidadeSelecionadaValida || slugBaseAtual === modalidadeSelecionadaValida;
        })) {
            modalidadeSelecionadaValida = '';
        }

        const modalidadeSelecionadaObjeto = modalidadesDisponiveis.find((mod) => {
            const slugAtual = String(mod.slug || mod.slugBase || '').trim();
            const slugBaseAtual = String(mod.slugBase || mod.slug || '').trim();
            return slugAtual === modalidadeSelecionadaValida || slugBaseAtual === modalidadeSelecionadaValida;
        }) || null;

        const modalidadeBaseSelecionada = (() => {
            const valorBase = modalidadeSelecionadaValida || modalidadeSelecionada || '';
            if (!valorBase) {
                return '';
            }

            const baseDireta = obterBaseEsporte(valorBase);
            if (baseDireta) {
                return baseDireta;
            }

            if (modalidadeSelecionadaObjeto) {
                return obterBaseEsporte(String(modalidadeSelecionadaObjeto.nome || modalidadeSelecionadaObjeto.nomeBase || modalidadeSelecionadaObjeto.slug || ''));
            }

            return '';
        })();

        const modalidadesEmExibicao = (() => {
            if (modalidadeBaseSelecionada) {
                const relacionadas = modalidadesDisponiveis.filter((mod) => {
                    const slugModelo = String(mod.slug || mod.slugBase || '').trim();
                    const nomeModelo = String(mod.nome || mod.nomeBase || '').trim();
                    return obterBaseEsporte(slugModelo) === modalidadeBaseSelecionada || obterBaseEsporte(nomeModelo) === modalidadeBaseSelecionada;
                });

                if (generoSelecionado) {
                    return relacionadas.filter((mod) => normalizarGeneroTexto(mod.genero) === normalizarGeneroTexto(generoSelecionado));
                }

                return relacionadas;
            }

            if (generoSelecionado) {
                return modalidadesDisponiveis.filter((mod) => normalizarGeneroTexto(mod.genero) === normalizarGeneroTexto(generoSelecionado));
            }

            return modalidadesDisponiveis;
        })();

        const modalidadeSlugFiltro = modalidadeBaseSelecionada || modalidadeSelecionadaValida || '';

        const jogos = await adminModel.getJogosPublicados({
            genero: generoSelecionado || undefined,
            dia: diaSelecionado || undefined,
            modalidadeSlug: modalidadeSlugFiltro || undefined
        });

        let classificacao = [];
        let grupos = [];
        const modalidadesParaTabela = modalidadesEmExibicao.length
            ? modalidadesEmExibicao
            : (modalidadeSelecionadaObjeto ? [modalidadeSelecionadaObjeto] : []);

        if (modalidadesParaTabela.length) {
            for (const modalidadeTabela of modalidadesParaTabela) {
                if (!modalidadeTabela || !modalidadeTabela.id) {
                    continue;
                }

                const tabelaClassificacao = await adminModel.getClassificacaoModalidade(modalidadeTabela.id);
                const tabelaGrupos = await adminModel.getChavesModalidade(modalidadeTabela.id);

                if (Array.isArray(tabelaClassificacao) && tabelaClassificacao.length) {
                    classificacao.push(...tabelaClassificacao.map((item) => ({
                        ...item,
                        genero_modalidade: String(modalidadeTabela.genero || item.genero || '').trim(),
                        nome_modalidade: String(modalidadeTabela.nome || item.nome_modalidade || '').trim(),
                        grupo_label: item.numero_chave ? `Grupo ${item.numero_chave}` : (tabelaGrupos?.[0]?.letra || '')
                    })));
                }

                if (Array.isArray(tabelaGrupos) && tabelaGrupos.length) {
                    grupos.push(...tabelaGrupos.map((grupo) => ({
                        ...grupo,
                        genero_modalidade: String(modalidadeTabela.genero || '').trim(),
                        nome_modalidade: String(modalidadeTabela.nome || '').trim()
                    })));
                }
            }

            if (!classificacao.length && grupos.length) {
                classificacao = grupos.flatMap((grupo) => {
                    const participantes = Array.isArray(grupo.integrantes) ? grupo.integrantes : [];
                    return participantes.map((participante, indice) => ({
                        id: participante.id || `${grupo.id || 'grupo'}-${indice}`,
                        participante_nome: String(participante.nome || participante.nomeCampus || 'Participante').trim() || `Participante ${indice + 1}`,
                        pontos: 0,
                        jogos_jogados: 0,
                        vitorias: 0,
                        empates: 0,
                        derrotas: 0,
                        pontos_pro: 0,
                        pontos_contra: 0,
                        saldo_pontuacao: 0,
                        chave_id: grupo.id,
                        numero_chave: grupo.numero_chave || grupo.letra || 1
                    }));
                });
            }
        }

        res.locals.modalidades = todasAsModalidades;
        res.render('user', {
            title: 'JIFC - Início',
            usuarioLogado: req.session?.usuario || null,
            mostrarFiltros: true,
            modalidades: todasAsModalidades,
            diasDisponiveis,
            generosDisponiveis,
            diaSelecionado,
            generoSelecionado,
            modalidadeSelecionada: modalidadeSelecionadaValida || modalidadeSelecionada || null,
            jogos,
            classificacao,
            grupos,
            esporteAtivo: Boolean(modalidadeSelecionadaValida || modalidadeSelecionada)
        });
    } catch (error) {
        console.error('Erro ao carregar home pública:', error);
        res.locals.modalidades = [];
        const modalidadeSelecionada = String(req.query.modalidade || '').trim();
        const diaSelecionadoSolicitado = String(req.query.dia || '').trim();
        const generoSelecionadoSolicitado = String(req.query.genero || '').trim();
        const modalidadesDisponiveis = formatarModalidadesParaHome([]);
        const diasDisponiveis = montarDiasDisponiveis(modalidadesDisponiveis);
        const generosDisponiveis = [];
        const diaSelecionado = diasDisponiveis.includes(diaSelecionadoSolicitado)
            ? diaSelecionadoSolicitado
            : '';
        const generoSelecionado = '';
        const modalidadeSelecionadaValida = '';
        const lista = filtrarModalidadesParaHome(modalidadesDisponiveis, {
            modalidade: modalidadeSelecionadaValida,
            dia: diaSelecionado,
            genero: generoSelecionado
        });

        res.render('user', {
            title: 'JIFC - Início',
            usuarioLogado: req.session?.usuario || null,
            mostrarFiltros: true,
            modalidades: lista,
            diasDisponiveis,
            generosDisponiveis,
            diaSelecionado,
            generoSelecionado,
            modalidadeSelecionada: modalidadeSelecionadaValida || null,
            jogos: [],
            classificacao: [],
            grupos: [],
            esporteAtivo: Boolean(modalidadeSelecionadaValida)
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