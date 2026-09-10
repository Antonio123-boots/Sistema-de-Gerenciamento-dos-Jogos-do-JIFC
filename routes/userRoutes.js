const express = require('express');
const router = express.Router();
const adminModel = require('../models/adminModel');
const db = require('../config/db');
const campusModel = require('../models/campusModel');
const { listarCampi, obterCampusPorSlug, atualizarCampus } = require('../models/campiCatalog');
const { salvarFotoPerfilUsuario } = require('../models/authUsers');
const { filtrarModalidadesParaHome } = require('../utils/homeFilters');
const { ehTenisDeMesa, normalizarSubCategoriaFiltro } = require('../services/jogoService');
const resultadosIndividuaisService = require('../services/resultadosIndividuaisService');
const mataMataService = require('../services/mataMataService');

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
        .replace(/-(masculino|feminino|misto)$/g, '')
        .replace(/\s+(masculino|feminino|misto)$/g, '')
        .replace(/(^masculino$|^feminino$|^misto$)/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
}

function mapearImagemModalidade(nome) {
    const nomeNormalizado = String(nome || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    if (nomeNormalizado.includes('futsal')) return '/imagens/futsal1.svg';
    if (nomeNormalizado.includes('praia') || nomeNormalizado.includes('areia') || (nomeNormalizado.includes('volei') && nomeNormalizado.includes('praia'))) return '/imagens/areia1.svg';
    if (nomeNormalizado.includes('volei') || nomeNormalizado.includes('vôlei')) return '/imagens/volei1.svg';
    if (nomeNormalizado.includes('basquete')) return '/imagens/basquete1.svg';
    if (nomeNormalizado.includes('handebol')) return '/imagens/handebol1.svg';
    if (nomeNormalizado.includes('tenis')) return '/imagens/tenisdemesa1.svg';
    if (nomeNormalizado.includes('xadrez')) return '/imagens/xadrez1.svg';
    if (nomeNormalizado.includes('badminton')) return '/imagens/badminton.png';
    if (nomeNormalizado.includes('atletismo')) return '/imagens/atletismo1.svg';

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
            const genero = String(mod.genero || '').trim();
            const baseSlug = obterBaseEsporte(nome);
            if (!baseSlug) {
                return;
            }
            const chave = baseSlug;
            if (mapa.has(chave)) {
                return;
            }
            const nomeExibicao = String(nome).replace(/\s+(masculino|feminino|misto|masc\.?|fem\.?)$/i, '').trim() || nome;
            const slugMod = String(mod.slug || `${baseSlug}-${String(genero || 'geral').trim().toLowerCase()}`).trim();
            const item = {
                ...mod,
                nome: nomeExibicao,
                nomeBase: nomeExibicao,
                slug: baseSlug,
                slugBase: baseSlug,
                dia: String(mod.dia || mod.data || '').trim(),
                imagem: String(mod.imagem || mod.icone || mapearImagemModalidade(nome)).trim() || '/imagens/atletismo1.svg',
                genero
            };
            mapa.set(chave, item);
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
        const baseSemGenero = slugBase.replace(/-(masculino|feminino|misto)$/i, '');
        const modalidadeAtivaBase = modalidadeAtivaSlug.replace(/-(masculino|feminino|misto)$/i, '');
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

        const generoAtual = String(atual.genero || '').trim().toLowerCase();
        const generoNovo = String(genero || '').trim().toLowerCase();
        const cruzadoMascFem = (generoAtual === 'masculino' && generoNovo === 'feminino') ||
            (generoAtual === 'feminino' && generoNovo === 'masculino');
        const filtroPrefereNovo = Boolean(generoFiltro) && generoNovo === generoFiltro && generoAtual !== generoFiltro;
        if (cruzadoMascFem || filtroPrefereNovo) {
            const itemPreferido = generoFiltro
                ? (generoNovo === generoFiltro ? item : atual)
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

/* GET home page (Usuário Comum) */
router.get('/', async function(req, res, next) {
    try {
        const modalidadeSelecionada = String(req.query.modalidade || '').trim();
        const diaSelecionadoSolicitado = String(req.query.dia || '').trim();
        const generoSelecionadoSolicitado = String(req.query.genero || '').trim();
        const subCategoriaSolicitada = String(req.query.sub || '').trim();
        const modalidadesBanco = await adminModel.getModalidadesBanco();
        const configuracoesBanco = await adminModel.getConfiguracoesBanco();
        const configuracoesAtuais = configuracoesBanco || adminModel.getConfiguracoes();
        const modalidadesBancoLista = Array.isArray(modalidadesBanco) ? modalidadesBanco : [];
        const baseEsporteFiltro = obterBaseEsporte(modalidadeSelecionada);
        const baseEsporteExisteNoCatalogo = baseEsporteFiltro && modalidadesBancoLista.some((mod) =>
            obterBaseEsporte(String(mod.slug || mod.slugBase || '')) === baseEsporteFiltro ||
            obterBaseEsporte(String(mod.nome || mod.nomeBase || '')) === baseEsporteFiltro
        );
        const modalidadesParaFiltroGenero = baseEsporteExisteNoCatalogo
            ? modalidadesBancoLista.filter((mod) =>
                obterBaseEsporte(String(mod.slug || mod.slugBase || '')) === baseEsporteFiltro ||
                obterBaseEsporte(String(mod.nome || mod.nomeBase || '')) === baseEsporteFiltro)
            : modalidadesBancoLista;
        const generosDisponiveis = [...new Set(modalidadesParaFiltroGenero.map((mod) => String(mod.genero || '').trim()).filter(Boolean))];
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

        const ehTenisMesaAtivo = modalidadeBaseSelecionada === 'tenis-de-mesa';
        const subCategoriaSelecionada = ehTenisMesaAtivo ? normalizarSubCategoriaFiltro(subCategoriaSolicitada) : '';

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
            modalidadeSlug: modalidadeSlugFiltro || undefined,
            subCategoria: subCategoriaSelecionada || undefined
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

                const ehIndividualMod = resultadosIndividuaisService.ehAtletismo(String(modalidadeTabela.nome || '')) || resultadosIndividuaisService.ehXadrez(String(modalidadeTabela.nome || ''));
                if (ehIndividualMod) {
                    continue;
                }
                const [modPublicado] = await db.query('SELECT 1 FROM jogos WHERE modalidade_id = ? AND publicado = 1 LIMIT 1', [modalidadeTabela.id]);
                const temJogosPublicados = modPublicado.length > 0;
                if (!temJogosPublicados) {
                    continue;
                }

                const subCategoriaTabela = ehTenisDeMesa(String(modalidadeTabela.nome || modalidadeTabela.nomeBase || '')) ? subCategoriaSelecionada : '';
                const tabelaClassificacao = await adminModel.getClassificacaoModalidade(modalidadeTabela.id, null, { subCategoria: subCategoriaTabela });
                const tabelaGrupos = await adminModel.getChavesModalidade(modalidadeTabela.id, subCategoriaTabela);

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

        let classificacaoIndividual = [];
        let tipoClassificacaoIndividual = null;
        let provasAtletismo = [];
        let provaFiltroSelecionada = '';
        let provasPorGenero = {};
        let classificacaoAtletismoPorGenero = null;
        let classificacaoXadrezPorGenero = null;
        let resultadosFinaisAtletismo = {};
        if (modalidadesParaTabela.length) {
            const resultadosIndividuaisService = require('../services/resultadosIndividuaisService');
            const temAtletismo = modalidadesParaTabela.some((modalidadeTabela) => resultadosIndividuaisService.ehAtletismo(String(modalidadeTabela.nome || '')));
            if (temAtletismo) {
                try {
                    const generosAlvo = generoSelecionado ? [generoSelecionado] : ['Masculino', 'Feminino'];
                    classificacaoAtletismoPorGenero = {};
                    for (const generoAlvo of generosAlvo) {
                        const [temPublicado] = await db.query('SELECT 1 FROM provas p JOIN modalidades m ON m.id = p.modalidade_id WHERE LOWER(m.nome) LIKE \'%atletismo%\' AND p.publicado = 1 LIMIT 1');
                        if (temPublicado.length === 0) {
                            classificacaoAtletismoPorGenero[generoAlvo] = [];
                        } else {
                            classificacaoAtletismoPorGenero[generoAlvo] = await resultadosIndividuaisService.obterClassificacaoGeralCampi(generoAlvo);
                        }
                    }
                } catch (e) {
                    console.error('Erro ao carregar classificação geral do atletismo:', e);
                    classificacaoAtletismoPorGenero = null;
                }
                const { montarProvasComAtletasEDetalhes, obterResultadosFinaisPorProva, PROVAS_ATLETISMO_EXIBICAO } = require('../utils/atletismoProvas');

                let atletismoPublicado = false;
                try {
                    const [pubCheck] = await db.query('SELECT 1 FROM provas p JOIN modalidades m ON m.id = p.modalidade_id WHERE LOWER(m.nome) LIKE \'%atletismo%\' AND p.publicado = 1 LIMIT 1');
                    atletismoPublicado = pubCheck.length > 0;
                } catch (_) { atletismoPublicado = false; }

                tipoClassificacaoIndividual = atletismoPublicado ? 'atletismo' : null;

                if (atletismoPublicado) {
                // Resultados oficiais das provas com Final (100m), por gênero
                try {
                    const generoFiltroFinal = (generoSelecionado && normalizarGeneroTexto(generoSelecionado))
                        ? generoSelecionado
                        : (modalidadeSelecionadaObjeto && normalizarGeneroTexto(modalidadeSelecionadaObjeto.genero)
                            ? modalidadeSelecionadaObjeto.genero
                            : '');
                    const finaisPorGenero = await obterResultadosFinaisPorProva();
                    resultadosFinaisAtletismo = {};
                    for (const [generoChave, porSlug] of finaisPorGenero.entries()) {
                        if (normalizarGeneroTexto(generoFiltroFinal) && normalizarGeneroTexto(generoChave) !== normalizarGeneroTexto(generoFiltroFinal)) continue;
                        resultadosFinaisAtletismo[generoChave] = Object.fromEntries(porSlug);
                    }
                } catch (e) {
                    console.error('Erro ao carregar resultados finais do atletismo:', e);
                    resultadosFinaisAtletismo = {};
                }

                // Inscritos separados por gênero da modalidade de origem
                const inscritosPorGeneroAtletismo = {};
                for (const modalidadeTabela of modalidadesParaTabela) {
                    if (!modalidadeTabela || !modalidadeTabela.id) continue;
                    if (!resultadosIndividuaisService.ehAtletismo(String(modalidadeTabela.nome || ''))) continue;
                    const chaveGeneroInscritos = String(modalidadeTabela.genero || '').trim() || 'Geral';
                    let listaModalidade = await adminModel.getInscritosModalidade(modalidadeTabela.id);
                    const [atletasDasEquipes] = await db.query(
                        `SELECT DISTINCT a.id, a.nome AS nome_atleta, c.nome AS campus_nome, c.nome_exibicao
                         FROM campus_modalidade cm
                         JOIN atletas a ON a.campus_id = cm.campus_id
                         JOIN campus c ON c.id = a.campus_id
                         WHERE cm.modalidade_id = ? AND a.genero = ?
                         ORDER BY c.nome ASC, a.nome ASC`,
                        [modalidadeTabela.id, modalidadeTabela.genero]
                    );
                    if (atletasDasEquipes.length > 0) {
                        listaModalidade = atletasDasEquipes.map((atleta) => ({
                            id: atleta.id,
                            nomeAtleta: atleta.nome_atleta,
                            nomeCampus: atleta.nome_exibicao || atleta.campus_nome,
                            campus: atleta.nome_exibicao || atleta.campus_nome
                        }));
                    }
                    inscritosPorGeneroAtletismo[chaveGeneroInscritos] = inscritosPorGeneroAtletismo[chaveGeneroInscritos] || [];
                    const idsJaVistos = new Set(inscritosPorGeneroAtletismo[chaveGeneroInscritos].map((i) => String(i.id || `${i.nomeAtleta}-${i.nomeCampus}`)));
                    (Array.isArray(listaModalidade) ? listaModalidade : []).forEach((inscrito) => {
                        const chaveId = String(inscrito.id || `${inscrito.nomeAtleta}-${inscrito.nomeCampus}`);
                        if (idsJaVistos.has(chaveId)) return;
                        idsJaVistos.add(chaveId);
                        inscritosPorGeneroAtletismo[chaveGeneroInscritos].push(inscrito);
                    });
                }

                provasPorGenero = {};
                for (const [generoChave, listaGenero] of Object.entries(inscritosPorGeneroAtletismo)) {
                    const provasMontadas = await montarProvasComAtletasEDetalhes(listaGenero);
                    const temAtletasEmAlgumaProva = provasMontadas.some((prova) => prova.atletas.length > 0);
                    const garantirEquipeRevezamento = (atletas) => {
                        const porCampus = new Map();
                        atletas.forEach((atleta) => {
                            const campus = atleta.campus || 'Campus não informado';
                            if (!porCampus.has(campus)) porCampus.set(campus, []);
                            porCampus.get(campus).push(atleta);
                        });
                        return [...porCampus.values()].flatMap((atletasCampus) =>
                            atletasCampus.slice(0, Math.floor(atletasCampus.length / 4) * 4)
                        );
                    };
                    if (temAtletasEmAlgumaProva) {
                        provasPorGenero[generoChave] = provasMontadas
                            .filter((prova) => prova.atletas.length > 0)
                            .map((prova) => ({
                                ...prova,
                                atletas: ['4x100m', '4x400m'].includes(prova.slug)
                                    ? garantirEquipeRevezamento(prova.atletas.slice(0, 200))
                                    : prova.atletas.slice(0, 200)
                            }));
                    } else {
                        const atletasLimitados = listaGenero.slice(0, 200).map((atleta) => ({
                            id: atleta.id,
                            nome: atleta.nomeAtleta || atleta.nome || '',
                            campus: atleta.nomeCampus || atleta.campus || '',
                            pontos: 0,
                            posicao: null,
                            resultado: ''
                        }));
                        provasPorGenero[generoChave] = provasMontadas.map((prova, indiceProva) => ({
                            ...prova,
                            atletas: ['4x100m', '4x400m'].includes(prova.slug)
                                ? garantirEquipeRevezamento(atletasLimitados)
                                : atletasLimitados.filter((_, indiceAtleta) => indiceAtleta % provasMontadas.length === indiceProva)
                        })).filter((prova) => prova.atletas.length > 0);
                    }
                }

                // União das provas dos dois gêneros (uma única linha de filtros na home)
                const ordemSlugsProvas = PROVAS_ATLETISMO_EXIBICAO.map((provaBase) => provaBase.slug);
                const mapaProvasUniao = new Map();
                Object.values(provasPorGenero).flat().forEach((prova) => {
                    if (prova && prova.slug && !mapaProvasUniao.has(prova.slug)) {
                        mapaProvasUniao.set(prova.slug, { slug: prova.slug, nome: prova.nome });
                    }
                });
                provasAtletismo = [
                    ...ordemSlugsProvas.filter((slugOrdem) => mapaProvasUniao.has(slugOrdem)).map((slugOrdem) => mapaProvasUniao.get(slugOrdem)),
                    ...[...mapaProvasUniao.values()].filter((prova) => !ordemSlugsProvas.includes(prova.slug))
                ];

                const provaSolicitada = String(req.query.prova || '').trim().toLowerCase();
                if (provaSolicitada && provasAtletismo.some((prova) => prova.slug === provaSolicitada)) {
                    provaFiltroSelecionada = provaSolicitada;
                } else if (provasAtletismo.length > 0) {
                    provaFiltroSelecionada = provasAtletismo[0].slug;
                }

                classificacaoIndividual = Object.values(classificacaoAtletismoPorGenero || {}).flat();
                } else {
                    provasAtletismo = [];
                    provasPorGenero = {};
                    resultadosFinaisAtletismo = {};
                }
            }
            for (const modalidadeTabela of modalidadesParaTabela) {
                if (!modalidadeTabela || !modalidadeTabela.id) continue;
                if (resultadosIndividuaisService.ehXadrez(String(modalidadeTabela.nome || ''))) {
                    const [xadrezPub] = await db.query('SELECT 1 FROM resultados_xadrez WHERE modalidade_id = ? AND publicado = 1 LIMIT 1', [modalidadeTabela.id]);
                    if (xadrezPub.length === 0) continue;
                    const classif = await resultadosIndividuaisService.obterClassificacaoXadrez(modalidadeTabela.id);
                    if (!classif.length) continue;
                    const linhasMapeadas = classif.map((linha) => ({ ...linha, pontos: Number(linha.pontuacao) || 0 }));
                    if (!tipoClassificacaoIndividual) tipoClassificacaoIndividual = 'xadrez';
                    classificacaoIndividual = classificacaoIndividual.concat(linhasMapeadas);
                    const generoChave = String(modalidadeTabela.genero || 'Geral').trim() || 'Geral';
                    if (!classificacaoXadrezPorGenero) classificacaoXadrezPorGenero = {};
                    classificacaoXadrezPorGenero[generoChave] = (classificacaoXadrezPorGenero[generoChave] || []).concat(linhasMapeadas);
                }
            }
        }

        res.locals.modalidades = todasAsModalidades;
        const { obterRegras: obterRegrasClassificacao } = require('../utils/sportClassificationRules');
        const nomeModalidadeFiltro = modalidadeSelecionadaValida || modalidadeSelecionada || '';
        const regrasClassificacao = obterRegrasClassificacao(nomeModalidadeFiltro);
        
        res.render('user', {
            title: 'JIFC - Início',
            usuarioLogado: req.user,
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
            classificacaoIndividual,
            tipoClassificacaoIndividual,
            provasAtletismo,
            provaFiltroSelecionada,
            provasPorGenero,
            classificacaoAtletismoPorGenero,
            classificacaoXadrezPorGenero,
            resultadosFinaisAtletismo,
            esporteAtivo: Boolean(modalidadeSelecionadaValida || modalidadeSelecionada),
            subCategoriaAtiva: subCategoriaSelecionada,
            mostrarSubFiltroTenis: ehTenisMesaAtivo,
            regrasClassificacao
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
            usuarioLogado: req.user,
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
            classificacaoIndividual: [],
            tipoClassificacaoIndividual: null,
            provasAtletismo: [],
            provaFiltroSelecionada: '',
            provasPorGenero: {},
            classificacaoAtletismoPorGenero: null,
            esporteAtivo: Boolean(modalidadeSelecionadaValida),
            subCategoriaAtiva: '',
            mostrarSubFiltroTenis: false,
            regrasClassificacao: { temSets: false, temCartoes: false, colunasTabela: ['Pts', 'PJ', 'V', 'E', 'D', 'GP', 'GC', 'SG'] }
        });
    }
});

/* GET login page */
router.get('/login', async function(req, res, next) {
    if (req.user) {
        return res.redirect('/perfil');
    }
    res.render('login', {
        title: 'JIFC - Login',
        usuarioLogado: null,
        mostrarFiltros: false,
        erro: null
    });
});

/* GET profile page */
router.post('/perfil/foto', async function(req, res, next) {
    if (!req.user) {
        return res.redirect('/login');
    }

    const fotoPerfil = String(req.body.fotoPerfil || '').trim() || '/imagens/avatar.svg';

    try {
        if (req.user.tipo === 'campus' && req.user.campusSlug) {
            await atualizarCampus(req.user.campusSlug, {
                fotoPerfil
            });
        } else {
            salvarFotoPerfilUsuario(req.user.email, fotoPerfil);
        }

        return res.redirect('/perfil');
    } catch (error) {
        console.error('Erro ao salvar foto de perfil:', error);
        return res.redirect('/perfil');
    }
});

router.post('/perfil/editar', async function(req, res, next) {
    if (!req.user) {
        return res.redirect('/login');
    }

    if (req.user.tipo !== 'campus' || !req.user.campusSlug) {
        return res.redirect('/perfil?erro=' + encodeURIComponent('A edição de perfil está disponível apenas para campi.'));
    }

    try {
        await atualizarCampus(req.user.campusSlug, {
            nome: req.body.nome,
            nomeExibicao: req.body.nomeExibicao,
            email: req.body.email,
            senha: req.body.senha,
            cidade: req.body.cidade,
            fotoPerfil: req.body.fotoPerfil || '/imagens/avatar.svg'
        });

        return res.redirect('/perfil?sucesso=' + encodeURIComponent('Perfil atualizado com sucesso.'));
    } catch (error) {
        console.error('Erro ao editar perfil do campus:', error);
        return res.redirect('/perfil?erro=' + encodeURIComponent(error.message || 'Não foi possível atualizar o perfil.'));
    }
});

router.get('/perfil', async function(req, res, next) {
    if (!req.user) {
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

    const campusNome = req.user.nome;
    const atletasCampus = campusModel.getAtletas(campusNome);
    const modalidadesCampus = campusModel.getInscricoes(campusNome);
    const jogos = await adminModel.getJogosPublicados({});
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
        usuarioLogado: req.user,
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
            const nomeNormalizado = nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
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

        let provasAtletismo = [];
        let atletasAtletismo = [];
        let classificadosXadrez = [];
        let chavesGeradas = [];
        let jogosProgramados = [];

        try {
            if (modalidadeAtiva.categoria === 'atletismo') {
                const [atletismoPub] = await db.query('SELECT 1 FROM provas WHERE modalidade_id = ? AND publicado = 1 LIMIT 1', [modalidadeAtiva.id]);
                if (atletismoPub.length === 0) {
                    chavesGeradas = [];
                    jogosProgramados = [];
                } else {
                const resultadosIndividuaisService = require('../services/resultadosIndividuaisService');
                const [atletasInscritos] = await db.query(
                    `SELECT DISTINCT a.nome, c.nome_exibicao, c.nome AS campus_nome
                     FROM campus_modalidade cm
                     JOIN atletas a ON a.campus_id = cm.campus_id
                     JOIN campus c ON c.id = a.campus_id
                     WHERE cm.modalidade_id = ? AND a.genero = ?
                     ORDER BY c.nome ASC, a.nome ASC`,
                    [modalidadeAtiva.id, modalidadeAtiva.genero]
                );
                atletasAtletismo = atletasInscritos.map((atleta) => ({
                    nome: atleta.nome,
                    campus: atleta.nome_exibicao || atleta.campus_nome
                }));
                const provas = await resultadosIndividuaisService.obterProvasPorModalidade(modalidadeAtiva.id);
                for (const prova of provas) {
                    const resultados = await resultadosIndividuaisService.obterResultadosPorProva(prova.id);
                    if (!resultados.length) continue;
                    const ordenados = resultados.slice().sort((a, b) => {
                        const etapaA = String(a.etapa) === 'final' ? 1 : 0;
                        const etapaB = String(b.etapa) === 'final' ? 1 : 0;
                        if (etapaA !== etapaB) return etapaB - etapaA;
                        if (Number(b.pontos || 0) !== Number(a.pontos || 0)) return Number(b.pontos || 0) - Number(a.pontos || 0);
                        return Number(a.posicao_final || 9999) - Number(b.posicao_final || 9999);
                    });
                    provasAtletismo.push({
                        nomeProva: prova.nome,
                        atletas: ordenados.map((r) => ({
                            nome: r.atleta_nome,
                            campus: r.campus_nome || '',
                            detalhe: r.resultado_tempo_exibicao
                                || (r.resultado_medida != null && r.resultado_medida !== '' ? `${r.resultado_medida} m` : '')
                        }))
                    });
                }
                }
            } else if (modalidadeAtiva.categoria === 'xadrez') {
                const [xadrezPub] = await db.query('SELECT 1 FROM resultados_xadrez WHERE modalidade_id = ? AND publicado = 1 LIMIT 1', [modalidadeAtiva.id]);
                if (xadrezPub.length > 0) {
                const resultadosIndividuaisService = require('../services/resultadosIndividuaisService');
                const linhas = await resultadosIndividuaisService.obterClassificacaoXadrez(modalidadeAtiva.id);
                classificadosXadrez = (linhas || []).map((l) => {
                    const vitorias = Number(l.vitorias) || 0;
                    const empates = Number(l.empates) || 0;
                    const derrotas = Number(l.derrotas) || 0;
                    return {
                        nomeAtleta: l.atleta_nome,
                        nomeCampus: l.campus_nome || '',
                        pontuacaoAtual: Number(l.pontuacao) || 0,
                        vitorias,
                        empates,
                        derrotas,
                        jogos: vitorias + empates + derrotas
                    };
                });
                }
            } else {
                const chaves = await adminModel.getChavesModalidade(modalidadeAtiva.id, subCategoria);
                const jogos = await adminModel.getJogosModalidade(modalidadeAtiva.id, subCategoria);
                const jogosPublicados = jogos.filter((jogo) => Number(jogo.publicado) === 1);

                if (jogosPublicados.length > 0) {
                    jogosProgramados = jogosPublicados;
                    chavesGeradas = chaves;

                    try {
                        const classificacao = await adminModel.getClassificacaoModalidade(modalidadeAtiva.id, null, { subCategoria });
                        const mapaPontos = new Map();
                        classificacao.forEach((linha) => {
                            const participanteId = Number(linha.atleta_id || linha.campus_id || 0);
                            if (!participanteId) return;
                            mapaPontos.set(`${Number(linha.chave_id)}:${participanteId}`, Number(linha.pontos) || 0);
                        });

                        chavesGeradas = chaves.map((chave) => ({
                            ...chave,
                            integrantes: chave.integrantes
                                .map((integrante) => ({
                                    ...integrante,
                                    pontosFaseDeGrupos: mapaPontos.get(`${Number(chave.id)}:${Number(integrante.id)}`) || 0
                                }))
                                .sort((a, b) => b.pontosFaseDeGrupos - a.pontosFaseDeGrupos)
                        }));
                    } catch (error) {
                        console.error('Erro ao aplicar pontos na chave pública:', error);
                    }
                }
            }
        } catch (error) {
            console.error('Erro ao carregar dados do chaveamento público:', error);
            provasAtletismo = [];
            classificadosXadrez = [];
            chavesGeradas = [];
            jogosProgramados = [];
        }

        let fasesEliminatoria = [];
        try {
            if (modalidadeAtiva.categoria !== 'atletismo' && modalidadeAtiva.categoria !== 'xadrez') {
                if (jogosProgramados.length > 0) {
                    fasesEliminatoria = await mataMataService.listarEliminatoria(modalidadeAtiva.id, subCategoria);
                }
            }
        } catch (error) {
            console.error('Erro ao carregar eliminatória no chaveamento público:', error);
        }

        res.locals.modalidades = listaModalidadesCompleta;
        res.render('chaveamento', {
            title: 'Chaveamento - JIFC',
            usuarioLogado: req.user,
            mostrarFiltros: false,
            listaModalidadesCompleta,
            modalidadeAtiva,
            subCategoriaAtiva: subCategoria,
            provasAtletismo,
            atletasAtletismo,
            classificadosXadrez,
            chavesGeradas,
            jogosProgramados,
            fasesEliminatoria
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
        usuarioLogado: req.user,
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
    const jogos = await adminModel.getJogosPublicados({});
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
        usuarioLogado: req.user,
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