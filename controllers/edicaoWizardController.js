const rascunhoEdicaoService = require('../services/rascunhoEdicaoService');
const wizardService = require('../services/edicaoWizardService');
const exemploEdicaoService = require('../services/exemploEdicaoService');
const edicaoService = require('../services/edicaoService');
const { listarCampi } = require('../models/campiCatalog');
const { obterRegras, obterPadraoEliminatoria } = require('../utils/sportClassificationRules');
const { normalizarImagemUpload } = require('../models/profileImageStore');

function chaveAdmin(req) {
  return String((req.user && req.user.email) || '').trim().toLowerCase();
}

function numeroOuNull(valor) {
  if (valor === '' || valor === null || valor === undefined) return null;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
}

function lerResultadoJogo(req, id) {
  const prefix = `jogo_${id}`;
  const dadosJogo = {
    data: String(req.body[`${prefix}_data`] || '').trim(),
    horario: String(req.body[`${prefix}_horario`] || '').trim(),
    local: String(req.body[`${prefix}_local`] || '').trim(),
    rodada: numeroOuNull(req.body[`${prefix}_rodada`]),
    status: String(req.body[`${prefix}_status`] || '').trim() || 'Agendado',
    wo: Boolean(req.body[`${prefix}_wo`]),
    placarA: numeroOuNull(req.body[`${prefix}_placarA`]),
    placarB: numeroOuNull(req.body[`${prefix}_placarB`]),
    vencedorId: numeroOuNull(req.body[`${prefix}_vencedor`])
  };

  const setsA = req.body[`${prefix}_setA`];
  const setsB = req.body[`${prefix}_setB`];
  const aArr = Array.isArray(setsA) ? setsA : (setsA != null && setsA !== '' ? [setsA] : []);
  const bArr = Array.isArray(setsB) ? setsB : (setsB != null && setsB !== '' ? [setsB] : []);
  const total = Math.max(aArr.length, bArr.length);
  dadosJogo.sets = [];
  for (let i = 0; i < total; i += 1) {
    const p1 = numeroOuNull(aArr[i]);
    const p2 = numeroOuNull(bArr[i]);
    if (p1 != null && p2 != null && p1 !== 0 && p2 !== 0) {
      dadosJogo.sets.push({ numero: i + 1, pontosA: p1, pontosB: p2 });
    }
  }

  if (!dadosJogo.wo) {
    dadosJogo.vencedorId = null;
  }
  if (dadosJogo.status === 'Agendado' && (dadosJogo.placarA != null || dadosJogo.placarB != null)) {
    dadosJogo.status = 'Encerrado';
  }
  return dadosJogo;
}

function campusNome(dados, id) {
  const campi = dados.campi || [];
  const c = campi.find((x) => Number(x.id) === Number(id));
  return (c && (c.nomeExibicao || c.nome)) || `Campus ${id}`;
}

/* Recalcula campeão/vice/3º de modalidades que fecham sem eliminatória:
   xadrez (classificação), atletismo (classificação geral) e coletivos
   de chave única (o pódio sai da própria tabela de grupos). */
function aplicarPodio(mod) {
  if (/xadrez/i.test(mod.nome || '')) {
    const rank = [...(mod.resultadosXadrez || [])].sort((a, b) =>
      (Number(b.pontuacao || 0) - Number(a.pontuacao || 0))
      || (Number(b.vitorias || 0) - Number(a.vitorias || 0)));
    mod.campeao = rank[0] && rank[0].campus != null ? rank[0].campus : null;
    mod.vice = rank[1] && rank[1].campus != null ? rank[1].campus : null;
    mod.terceiro = rank[2] && rank[2].campus != null ? rank[2].campus : null;
  } else if (/atletismo/i.test(mod.nome || '')) {
    const topo = (mod.tabelaAtletismo || []).slice().sort((a, b) => Number(a.posicao || 0) - Number(b.posicao || 0));
    mod.campeao = topo[0] && topo[0].campus != null ? topo[0].campus : null;
    mod.vice = topo[1] && topo[1].campus != null ? topo[1].campus : null;
    mod.terceiro = topo[2] && topo[2].campus != null ? topo[2].campus : null;
  } else if (!mod.eliminatoria && (mod.grupos || []).length <= 1) {
    const linhas = (mod.tabela || []).slice().sort((a, b) => Number(a.posicao || 0) - Number(b.posicao || 0));
    mod.campeao = linhas[0] && linhas[0].campus != null ? linhas[0].campus : null;
    mod.vice = linhas[1] && linhas[1].campus != null ? linhas[1].campus : null;
    mod.terceiro = linhas[2] && linhas[2].campus != null ? linhas[2].campus : null;
  }
}

function definirProximaEtapa(dados) {
  const naoFinalizadas = (dados.modalidades || []).filter((m) => !m.finalizada);
  if (naoFinalizadas.length) {
    dados.modalidadeFoco = dados.modalidades.findIndex((m) => Number(m.id) === Number(naoFinalizadas[0].id));
    dados.etapa = 'modalidade';
    return;
  }
  dados.etapa = 'revisao';
}

function agruparJogosPorChave(mod, mapCampusId) {
  const grupos = mod.grupos || [];
  return grupos.map((grupo, gi) => {
    const jogos = (mod.jogos || [])
      .filter((j) => Number(j.chaveIndice) === gi)
      .sort((a, b) => Number(a.rodada || 0) - Number(b.rodada || 0));
    return {
      grupo,
      jogos,
      numero: gi,
      letra: grupo.letra,
      nomeDoParticipante: (id) => {
        const c = mapCampusId.get(Number(id));
        return (c && c.nomeExibicao) || `Campus ${id}`;
      }
    };
  });
}

/* Tênis de mesa: a modalidade percorre o fluxo coletivo duas vezes (Individual e Em dupla).
   As sub-etapas ficam em mod.subEtapasTenis e os campos de trabalho (grupos/jogos/tabela/pódio)
   espelham a sub-etapa ativa para o restante do wizard funcionar sem branchs. */
function espelharSubEtapaTenis(mod) {
  if (!wizardService.ehTenisDeMesa(mod.nome)) return false;
  const bags = mod.subEtapasTenis || (mod.subEtapasTenis = wizardService.criarSubEtapasTenis());
  const bag = bags[mod.subEtapa] || (bags[mod.subEtapa] = { grupos: [], jogos: [], tabela: [], campeao: null, vice: null, terceiro: null, finalizada: false, eliminatoria: null });
  mod.grupos = bag.grupos || [];
  mod.jogos = bag.jogos || [];
  mod.tabela = bag.tabela || [];
  mod.eliminatoria = bag.eliminatoria || null;
  mod.campeao = bag.campeao || null;
  mod.vice = bag.vice || null;
  mod.terceiro = bag.terceiro || null;
  mod.finalizada = Boolean(bag.finalizada);
  if (bag.etapaModalidade) mod.etapaModalidade = bag.etapaModalidade;
  return true;
}

function gravarSubEtapaTenis(mod) {
  if (!wizardService.ehTenisDeMesa(mod.nome)) return;
  const bags = mod.subEtapasTenis || (mod.subEtapasTenis = wizardService.criarSubEtapasTenis());
  const bag = bags[mod.subEtapa] || (bags[mod.subEtapa] = { grupos: [], jogos: [], tabela: [], campeao: null, vice: null, terceiro: null, finalizada: false, eliminatoria: null });
  bag.grupos = mod.grupos || [];
  bag.jogos = mod.jogos || [];
  bag.tabela = mod.tabela || [];
  bag.eliminatoria = mod.eliminatoria || null;
  bag.campeao = mod.campeao || null;
  bag.vice = mod.vice || null;
  bag.terceiro = mod.terceiro || null;
  bag.finalizada = Boolean(mod.finalizada);
  bag.etapaModalidade = String(mod.etapaModalidade || '');
}

/* Contexto da eliminatória para a view (estrutura + pódio parcial + nomes). */
function prepararContextoEliminatoria(mod, mapCampusId) {
  const elim = mod.eliminatoria || {
    avancantes: [], jogos: [], fases: [], jogoTerceiro: null, campeao: null, vice: null, terceiro: null, finalizada: false
  };
  const regras = obterRegras(mod.nome);
  return {
    eliminatoria: elim,
    temEliminatoria: Boolean(mod.eliminatoria),
    elimPodio: wizardService.obterPodioEliminatoria(elim, regras),
    nomeElim: (id) => {
      if (!id) return null;
      const campus = (mapCampusId || new Map()).get(Number(id));
      return (campus && campus.nomeExibicao) || `Campus ${id}`;
    }
  };
}

async function renderizar(res, req, erros) {
  try {
    const admin = chaveAdmin(req);
    const rascunho = await rascunhoEdicaoService.obterRascunho(admin);
    const dados = rascunho ? rascunho.dados : rascunhoEdicaoService.criarDadosVazios();
    const passo = dados.etapa || 'dados';

    const contexto = {
      title: 'Nova edição JIFC',
      passo,
      dados,
      erros: erros || [],
      mensagem: String(req.query.sucesso || req.query.erro || '') || ''
    };

    const campiAtuais = await listarCampi();
    contexto.campiAtuais = campiAtuais;
    contexto.mapCampusId = new Map((dados.campi || []).map((c) => [Number(c.id), c]));
    contexto.modalidades = dados.modalidades || [];
    contexto.periodDates = wizardService.gerarListaDatas(dados.dataInicio, dados.dataFim);

    if (passo === 'modalidade') {
      const foco = Math.min(
        Number(dados.modalidadeFoco || 0),
        Math.max(0, (dados.modalidades || []).length - 1)
      );
      const mod = dados.modalidades[foco] || null;
      contexto.modFoco = foco;
      contexto.mod = mod;
      if (mod) {
        if (espelharSubEtapaTenis(mod)) {
          const bags = mod.subEtapasTenis || {};
          contexto.subEtapaTenis = {
            ehTenis: true,
            atual: mod.subEtapa,
            atualLabel: mod.subEtapa === 'individual' ? 'Individual' : 'Em dupla',
            individualConcluida: Boolean((bags.individual || {}).finalizada),
            duplaConcluida: Boolean((bags.dupla || {}).finalizada)
          };
        }
        contexto.regras = obterRegras(mod.nome);
        contexto.subPasso = mod.etapaModalidade;
        contexto.grupos = mod.grupos || [];
        contexto.jogosAgrupados = agruparJogosPorChave(mod, contexto.mapCampusId);
        contexto.tabela = (mod.tabela || []);
        contexto.classificacaoGeral = (mod.tabela || []).length
          ? wizardService.calcularClassificacaoGeral(mod)
          : [];
        contexto.eliminatoriaCtx = prepararContextoEliminatoria(mod, contexto.mapCampusId);
      } else {
        contexto.regras = {};
        contexto.subPasso = 'participantes';
        contexto.grupos = [];
        contexto.jogosAgrupados = [];
        contexto.tabela = [];
        contexto.eliminatoriaCtx = null;
      }
    }

    if (passo === 'revisao') {
      contexto.dadosFinais = wizardService.construirDadosEdicao(dados);
      contexto.revisaoModalidades = wizardService.construirRevisaoDasModalidades(dados);
    }

    return res.render('adm/edicaoWizard', contexto);
  } catch (error) {
    console.error('Erro ao renderizar wizard de edição:', error);
    return res.status(500).send('Erro interno ao abrir o assistente: ' + error.message);
  }
}

async function renderWizard(req, res) {
  try {
    const admin = chaveAdmin(req);
    let rascunho = await rascunhoEdicaoService.obterRascunho(admin);
    if (!rascunho) {
      await rascunhoEdicaoService.criarRascunho(admin);
    }
    return renderizar(res, req, []);
  } catch (error) {
    console.error('Erro ao abrir wizard de edição:', error);
    return res.status(500).send('Erro interno ao abrir o assistente: ' + error.message);
  }
}

async function salvarDadosGerais(req, res) {
  try {
    const admin = chaveAdmin(req);
    const dados = (await rascunhoEdicaoService.obterRascunho(admin)).dados;

    const { ano, dataInicio, dataFim } = wizardService.validarDadosGerais({
      ano: req.body.ano,
      dataInicio: req.body.dataInicio,
      dataFim: req.body.dataFim
    });

    const existente = await edicaoService.obterEdicao(ano);
    if (existente) {
      throw new Error(`Já existe uma edição salva para o ano ${ano}.`);
    }

    dados.ano = ano;
    dados.titulo = `JIFC ${ano}`;
    dados.dataInicio = dataInicio;
    dados.dataFim = dataFim;
    dados.campi = [];
    dados.modalidades = wizardService.montarModalidadesPadrao();
    if (!dados.modalidades.some((modalidade) => /basquete/i.test(modalidade.nome))) {
      const proximoIdBasquete = wizardService.ID_INICIAL_MODALIDADE + dados.modalidades.length;
      ['Masculino', 'Feminino'].forEach((genero, indice) => {
        dados.modalidades.push({
          id: proximoIdBasquete + indice,
          nome: `Basquete ${genero}`,
          base: 'Basquete',
          genero,
          tipoConfronto: 'Coletivo',
          icone: '/imagens/basquete1.svg',
          formatoDisputa: 'grupos',
          etapaModalidade: 'participantes',
          finalizada: false,
          participantes: [], grupos: [], jogos: [], tabela: [],
          atletas: [], provas: [], resultadosXadrez: [],
          campeao: null, vice: null, terceiro: null
        });
      });
    }
    dados._proximoIdModalidade = wizardService.ID_INICIAL_MODALIDADE + dados.modalidades.length;
    dados.modalidadeFoco = 0;
    dados.etapa = 'campi';
    await rascunhoEdicaoService.salvarRascunho(admin, dados);
    return res.redirect('/admin/edicoes/nova');
  } catch (error) {
    return renderizar(res, req, [error.message]);
  }
}

async function salvarCampi(req, res) {
  try {
    const admin = chaveAdmin(req);
    const dados = (await rascunhoEdicaoService.obterRascunho(admin)).dados;

    const selecionados = req.body['campi_atual'] || [];
    const customForms = [];
    const nomes = req.body['custom_nome'] || [];
    const cidades = req.body['custom_cidade'] || [];
    const cores = req.body['custom_cor'] || [];
    const fotos = req.body['custom_foto'] || [];
    const slugs = req.body['custom_slug'] || [];
    for (let i = 0; i < nomes.length; i += 1) {
      customForms.push({
        nome: nomes[i],
        cidade: cidades[i],
        cor: cores[i],
        foto: fotos[i],
        slug: slugs[i]
      });
    }

    const campiAtuais = await listarCampi();
    dados.campi = wizardService.montarCampiSelecionados(campiAtuais, selecionados, customForms);
    if (!dados.campi.length) {
      throw new Error('Selecione ou cadastre pelo menos um campus participante.');
    }
    dados.etapa = 'modalidades';
    await rascunhoEdicaoService.salvarRascunho(admin, dados);
    return res.redirect('/admin/edicoes/nova');
  } catch (error) {
    return renderizar(res, req, [error.message]);
  }
}

async function salvarModalidades(req, res) {
  try {
    const admin = chaveAdmin(req);
    const dados = (await rascunhoEdicaoService.obterRascunho(admin)).dados;

    const nomes = req.body['mod_nome'] || [];
    const generos = req.body['mod_genero'] || [];
    const icones = req.body['mod_icone'] || [];

    const linhas = [];
    for (let i = 0; i < nomes.length; i += 1) {
      const nome = String(nomes[i] || '').trim();
      if (!nome) continue;
      let icone = String(icones[i] || '').trim() || null;
      if (icone && icone.startsWith('data:')) {
        try {
          icone = normalizarImagemUpload(icone) || icone;
        } catch (error) {
          throw new Error(`Erro no ícone de "${nome}": ${error.message}`);
        }
      }
      linhas.push({
        nome,
        genero: generos[i],
        icone
      });
    }
    if (!linhas.length) {
      throw new Error('Adicione ao menos uma modalidade.');
    }

    const proximoId = Number(dados._proximoIdModalidade || wizardService.ID_INICIAL_MODALIDADE);
    const { modalidades, proximoId: novoProximo } = wizardService.montarModalidadesDoForm(linhas, proximoId);
    dados._proximoIdModalidade = novoProximo;
    dados.modalidades = modalidades;
    dados.modalidadeFoco = 0;

    definirProximaEtapa(dados);
    await rascunhoEdicaoService.salvarRascunho(admin, dados);
    return res.redirect('/admin/edicoes/nova');
  } catch (error) {
    return renderizar(res, req, [error.message]);
  }
}

/* 1. Admin marca quais campi participaram da modalidade. */
async function salvarParticipantes(req, res) {
  try {
    const admin = chaveAdmin(req);
    const dados = (await rascunhoEdicaoService.obterRascunho(admin)).dados;
    const idx = Number(req.params.idx);
    const mod = dados.modalidades[idx];
    if (!mod) throw new Error('Modalidade não encontrada.');

    const participantesCampo = req.body['participantes'] || [];
    const participantes = (Array.isArray(participantesCampo) ? participantesCampo : [participantesCampo])
      .map((p) => numeroOuNull(p))
      .filter((p) => p != null);
    if (!wizardService.ehModalidadeIndividual(mod.nome) && participantes.length < 2) {
      throw new Error('Uma modalidade coletiva precisa de pelo menos 2 participantes.');
    }

    mod.participantes = participantes;
    mod.grupos = [];
    mod.jogos = [];
    mod.tabela = [];
    mod.campeao = null;
    mod.vice = null;
    mod.terceiro = null;
    mod.finalizada = false;
    mod.eliminatoria = null;

    if (wizardService.ehModalidadeIndividual(mod.nome)) {
      const atletasNomesCampo = req.body['atleta_nome'] || [];
      const atletasCampiCampo = req.body['atleta_campus'] || [];
      const atletasNomes = Array.isArray(atletasNomesCampo) ? atletasNomesCampo : [atletasNomesCampo];
      const atletasCampi = Array.isArray(atletasCampiCampo) ? atletasCampiCampo : [atletasCampiCampo];
      const atletas = [];
      for (let i = 0; i < atletasNomes.length; i += 1) {
        const nome = String(atletasNomes[i] || '').trim();
        const campusId = numeroOuNull(atletasCampi[i]);
        if (nome && campusId != null) atletas.push({ id: i + 1, nome, campusId });
      }
      if (/atletismo/i.test(mod.nome)) {
        const campusPorId = new Map((dados.campi || []).map((campus) => [Number(campus.id), campus]));
        const selecionadasCampo = req.body['prova_selecionada'] || [];
        const selecionadas = new Set((Array.isArray(selecionadasCampo) ? selecionadasCampo : [selecionadasCampo]).map(Number));
        const toArray = (valor) => (Array.isArray(valor) ? valor : (valor != null && valor !== '' ? [valor] : []));

        const provas = wizardService.criarProvasAtletismoWizard().map((prova, pi) => {
          const nomes = toArray(req.body[`atl_${pi}_nome`]);
          const campi = toArray(req.body[`atl_${pi}_campus`]);
          const baterias = toArray(req.body[`atl_${pi}_bateria`]);
          const valores = toArray(req.body[`atl_${pi}_valor`]);
          return {
            ...prova,
            selecionada: selecionadas.has(prova.id),
            resultados: nomes.map((nome, ri) => {
              const campusId = numeroOuNull(campi[ri]);
              const campusRef = campusId != null ? (campusPorId.get(campusId) || {}) : {};
              return {
                id: ri + 1,
                atleta: String(nome || '').trim(),
                campusId,
                campus: campusRef.nomeExibicao || campusRef.nome || '',
                bateria: numeroOuNull(baterias[ri]),
                valor: numeroOuNull(valores[ri]),
                valorFinal: null,
                posicao: null,
                pontos: 0
              };
            })
          };
        });

        mod.provas = wizardService.calcularResultadosAtletismoWizard({ ...mod, provas });

        mod.provas.forEach((prova, pi) => {
          if (!prova.final) return;
          const finais = toArray(req.body[`atl_${pi}_final`]);
          (prova.finalistas || []).forEach((finalista, fi) => {
            const valorFinal = finais[fi] != null && String(finais[fi]).trim() !== ''
              ? String(finais[fi]).trim()
              : null;
            finalista.valorFinal = valorFinal;
            const origem = (prova.resultados || []).find((r) => Number(r.id) === Number(finalista.id));
            if (origem) origem.valorFinal = valorFinal;
          });
        });

        mod.provas = wizardService.calcularResultadosAtletismoWizard({ ...mod, provas: mod.provas });

        mod.atletas = [];
        let atletaSeq = 0;
        mod.provas.forEach((prova) => {
          if (!prova.selecionada) return;
          const fila = prova.final ? (prova.finalistas || []) : (prova.resultados || []);
          for (const resultadoDeFila of fila) {
            if (!resultadoDeFila.atleta || resultadoDeFila.campusId == null) continue;
            const existente = mod.atletas.find((a) => a.nome === resultadoDeFila.atleta && Number(a.campusId) === Number(resultadoDeFila.campusId));
            if (existente) {
              resultadoDeFila.atletaId = existente.id;
            } else {
              atletaSeq += 1;
              resultadoDeFila.atletaId = atletaSeq;
              mod.atletas.push({ id: atletaSeq, nome: resultadoDeFila.atleta, campusId: resultadoDeFila.campusId, campus: resultadoDeFila.campus || '' });
            }
          }
        });
        mod.tabelaAtletismo = wizardService.calcularClassificacaoAtletismoWizard(mod);
        aplicarPodio(mod);

        mod.etapaModalidade = 'participantes';
        mod.finalizada = mod.atletas.length > 0;
        definirProximaEtapa(dados);
        await rascunhoEdicaoService.salvarRascunho(admin, dados);
        return res.redirect('/admin/edicoes/nova');
      }
      if (/t[êe]nis de mesa/i.test(mod.nome)) {
        mod.atletas = [];
        mod.duplas = [];
        mod.subEtapa = 'individual';
        mod.subEtapasTenis = wizardService.criarSubEtapasTenis();
        mod.etapaModalidade = 'grupos';
        await rascunhoEdicaoService.salvarRascunho(admin, dados);
        return res.redirect('/admin/edicoes/nova');
      }

      mod.atletas = atletas;
      mod.resultadosXadrez = atletas.map((atleta, atletaIndex) => ({
        ...atleta,
        pontuacao: numeroOuNull(req.body[`xadrez_pontuacao_${atletaIndex}`]) || 0,
        vitorias: numeroOuNull(req.body[`xadrez_vitorias_${atletaIndex}`]) || 0,
        derrotas: numeroOuNull(req.body[`xadrez_derrotas_${atletaIndex}`]) || 0,
        empates: numeroOuNull(req.body[`xadrez_empates_${atletaIndex}`]) || 0
      }));
      aplicarPodio(mod);
      mod.etapaModalidade = 'participantes';
      mod.finalizada = atletas.length > 0;
      definirProximaEtapa(dados);
      await rascunhoEdicaoService.salvarRascunho(admin, dados);
      return res.redirect('/admin/edicoes/nova');
    }

    if (wizardService.ehTenisDeMesa(mod.nome)) {
      const bags = mod.subEtapasTenis || (mod.subEtapasTenis = wizardService.criarSubEtapasTenis());
      const temChaves = ['individual', 'dupla'].some((s) => (bags[s].jogos || []).length > 0 || (bags[s].grupos || []).length > 0);
      if (temChaves) {
        /* Já existem chaves/resultados: preserva as duas sub-etapas (Individual e Em dupla)
           e continua na etapa da sub-etapa ativa em vez de limpar o progresso. */
        espelharSubEtapaTenis(mod);
        mod.etapaModalidade = (bags[mod.subEtapa] && bags[mod.subEtapa].etapaModalidade) || 'grupos';
      } else {
        mod.subEtapa = 'individual';
        mod.subEtapasTenis = wizardService.criarSubEtapasTenis();
        mod.etapaModalidade = 'grupos';
      }
    } else {
      mod.etapaModalidade = 'grupos';
    }

    await rascunhoEdicaoService.salvarRascunho(admin, dados);
    return res.redirect('/admin/edicoes/nova');
  } catch (error) {
    const admin = chaveAdmin(req);
    const rascunho = await rascunhoEdicaoService.obterRascunho(admin);
    if (rascunho && Number.isInteger(Number(req.params.idx))) {
      rascunho.dados.modalidadeFoco = Number(req.params.idx);
      await rascunhoEdicaoService.salvarRascunho(admin, rascunho.dados);
    }
    return renderizar(res, req, [error.message]);
  }
}

async function voltarParticipantes(req, res) {
  const admin = chaveAdmin(req);
  const dados = (await rascunhoEdicaoService.obterRascunho(admin)).dados;
  const idx = Number(req.params.idx);
  const mod = dados.modalidades[idx];
  if (mod) {
    espelharSubEtapaTenis(mod);
    mod.etapaModalidade = 'participantes';
    gravarSubEtapaTenis(mod);
  }
  dados.etapa = 'modalidade';
  dados.modalidadeFoco = idx;
  await rascunhoEdicaoService.salvarRascunho(admin, dados);
  return res.redirect('/admin/edicoes/nova');
}

/* 2. Admin define as chaves (grupos). */
async function salvarGrupos(req, res) {
  try {
    const admin = chaveAdmin(req);
    const dados = (await rascunhoEdicaoService.obterRascunho(admin)).dados;
    const idx = Number(req.params.idx);
    const mod = dados.modalidades[idx];
    if (!mod) throw new Error('Modalidade não encontrada.');
    if (!(mod.participantes || []).length) {
      throw new Error('Defina os participantes antes das chaves.');
    }
    espelharSubEtapaTenis(mod);

    const nomes = req.body['grupo_nome'] || [];
    const mapaCampusGrupo = {};
    for (const id of mod.participantes) {
      mapaCampusGrupo[String(id)] = req.body[`grupo_campus_${id}`];
    }
    mod.grupos = wizardService.montarGruposDoForm(nomes, mapaCampusGrupo, mod.participantes);

    let gi = 0;
    mod.jogos = mod.jogos || [];
    if (!mod.jogos.length) {
      mod.jogos = wizardService.gerarJogosDasChaves(mod.grupos);
    } else {
      for (const jogo of mod.jogos) {
        const alvo = mod.grupos.findIndex((g) => Number(g.indice) === Number(jogo.chaveIndice));
        jogo.chaveIndice = alvo >= 0 ? alvo : gi;
      }
    }

    mod.tabela = [];
    mod.campeao = null;
    mod.vice = null;
    mod.terceiro = null;
    mod.finalizada = false;
    mod.eliminatoria = null;
    mod.etapaModalidade = 'confrontos';
    gravarSubEtapaTenis(mod);

    await rascunhoEdicaoService.salvarRascunho(admin, dados);
    return res.redirect('/admin/edicoes/nova');
  } catch (error) {
    return renderizar(res, req, [error.message]);
  }
}

async function voltarGrupos(req, res) {
  const admin = chaveAdmin(req);
  const dados = (await rascunhoEdicaoService.obterRascunho(admin)).dados;
  const idx = Number(req.params.idx);
  const mod = dados.modalidades[idx];
  if (mod) {
    espelharSubEtapaTenis(mod);
    mod.etapaModalidade = 'grupos';
    gravarSubEtapaTenis(mod);
  }
  dados.etapa = 'modalidade';
  dados.modalidadeFoco = idx;
  await rascunhoEdicaoService.salvarRascunho(admin, dados);
  return res.redirect('/admin/edicoes/nova');
}

/* 3. Admin define os confrontos. */
async function salvarConfrontos(req, res) {
  try {
    const admin = chaveAdmin(req);
    const dados = (await rascunhoEdicaoService.obterRascunho(admin)).dados;
    const idx = Number(req.params.idx);
    const mod = dados.modalidades[idx];
    if (!mod) throw new Error('Modalidade não encontrada.');
    if (!(mod.grupos || []).length) {
      throw new Error('Defina as chaves antes dos confrontos.');
    }
    espelharSubEtapaTenis(mod);

    mod.jogos = wizardService.montarConfrontosDoForm(req.body, mod.grupos);
    mod.tabela = [];
    mod.campeao = null;
    mod.vice = null;
    mod.terceiro = null;
    mod.finalizada = false;
    mod.eliminatoria = null;
    mod.etapaModalidade = 'resultados';
    gravarSubEtapaTenis(mod);

    await rascunhoEdicaoService.salvarRascunho(admin, dados);
    return res.redirect('/admin/edicoes/nova');
  } catch (error) {
    return renderizar(res, req, [error.message]);
  }
}

async function voltarConfrontos(req, res) {
  const admin = chaveAdmin(req);
  const dados = (await rascunhoEdicaoService.obterRascunho(admin)).dados;
  const idx = Number(req.params.idx);
  const mod = dados.modalidades[idx];
  if (mod) {
    espelharSubEtapaTenis(mod);
    mod.etapaModalidade = 'confrontos';
    gravarSubEtapaTenis(mod);
  }
  dados.etapa = 'modalidade';
  dados.modalidadeFoco = idx;
  await rascunhoEdicaoService.salvarRascunho(admin, dados);
  return res.redirect('/admin/edicoes/nova');
}

/* 4. Admin lança os resultados; pontuação é calculada automaticamente. */
async function salvarResultados(req, res) {
  try {
    const admin = chaveAdmin(req);
    const dados = (await rascunhoEdicaoService.obterRascunho(admin)).dados;
    const idx = Number(req.params.idx);
    const mod = dados.modalidades[idx];
    if (!mod) throw new Error('Modalidade não encontrada.');
    if (!(mod.jogos || []).length) {
      throw new Error('Defina os confrontos antes dos resultados.');
    }
    const ehTenis = espelharSubEtapaTenis(mod);

    const regras = obterRegras(mod.nome);
    for (const jogo of mod.jogos || []) {
      const valores = lerResultadoJogo(req, jogo.id);
      jogo.data = valores.data;
      jogo.horario = valores.horario;
      jogo.local = valores.local;
      jogo.rodada = valores.rodada;
      jogo.status = valores.status;
      jogo.wo = valores.wo;
      jogo.placarA = valores.placarA;
      jogo.placarB = valores.placarB;
      jogo.sets = valores.sets;
      jogo.vencedorId = valores.vencedorId;
    }

    const mapCampusId = new Map((dados.campi || []).map((c) => [Number(c.id), c]));
    mod.tabela = [];
    for (const grupo of mod.grupos || []) {
      const jogosDoGrupo = (mod.jogos || []).filter((j) => Number(j.chaveIndice) === Number(grupo.indice));
      const linhas = wizardService.calcularTabelaDoGrupo(
        jogosDoGrupo,
        grupo.participantes,
        mapCampusId,
        regras,
        grupo.indice
      );
      mod.tabela.push(...linhas);
    }

    const grupoCompleto = (mod.jogos || []).length > 0
      && (mod.jogos || []).every((j) => wizardService.jogoComResultado(j));

    if (wizardService.ehModalidadeIndividual(mod.nome)) {
      /* Atletismo e xadrez não têm eliminatória: encerram nos resultados. */
      if (grupoCompleto) {
        const podio = wizardService.obterPodioDaModalidade(mod, regras);
        mod.campeao = podio.campeao;
        mod.vice = podio.vice;
        mod.terceiro = podio.terceiro;
        mod.finalizada = Boolean(podio.completa);
        if (mod.finalizada && ehTenis) {
          gravarSubEtapaTenis(mod);
          if (mod.subEtapa === 'individual') {
            mod.subEtapa = 'dupla';
            espelharSubEtapaTenis(mod);
            mod.etapaModalidade = 'participantes';
            gravarSubEtapaTenis(mod);
          } else {
            definirProximaEtapa(dados);
          }
        } else if (mod.finalizada) {
          definirProximaEtapa(dados);
        } else {
          mod.etapaModalidade = 'resultados';
          gravarSubEtapaTenis(mod);
        }
      } else {
        mod.etapaModalidade = 'resultados';
        gravarSubEtapaTenis(mod);
      }
    } else if (grupoCompleto && !mod.eliminatoria) {
      if ((mod.grupos || []).length <= 1) {
        /* Chave única: não há eliminatória; o pódio sai da tabela de grupos. */
        aplicarPodio(mod);
        mod.finalizada = true;
        mod.etapaModalidade = 'resultados';
        gravarSubEtapaTenis(mod);
        definirProximaEtapa(dados);
      } else {
        /* Coletivos: com o fim da fase de grupos, gera a eliminatória. */
        const subEtapa = ehTenis ? mod.subEtapa : '';
        const padrao = obterPadraoEliminatoria(mod.nome, subEtapa) || regras.padraoEliminatoria;
        mod.eliminatoria = wizardService.gerarEliminatoriaWizard(mod, regras, padrao);
        mod.etapaModalidade = 'eliminatorias';
        gravarSubEtapaTenis(mod);
      }
    } else {
      mod.etapaModalidade = 'resultados';
      gravarSubEtapaTenis(mod);
    }

    await rascunhoEdicaoService.salvarRascunho(admin, dados);
    return res.redirect('/admin/edicoes/nova');
  } catch (error) {
    return renderizar(res, req, [error.message]);
  }
}

/* 5. Admin lança os resultados da eliminatória (mata-mata). */
async function salvarEliminatoria(req, res) {
  try {
    const admin = chaveAdmin(req);
    const dados = (await rascunhoEdicaoService.obterRascunho(admin)).dados;
    const idx = Number(req.params.idx);
    const mod = dados.modalidades[idx];
    if (!mod) throw new Error('Modalidade não encontrada.');
    espelharSubEtapaTenis(mod);
    if (wizardService.ehModalidadeIndividual(mod.nome)) {
      throw new Error('Esta modalidade não possui eliminatória.');
    }
    if (!mod.eliminatoria) throw new Error('A eliminatória ainda não foi gerada.');

    const regras = obterRegras(mod.nome);
    const elim = mod.eliminatoria;
    for (const jogo of elim.jogos || []) {
      const valores = lerResultadoJogo(req, jogo.id);
      jogo.data = valores.data;
      jogo.horario = valores.horario;
      jogo.local = valores.local;
      jogo.status = valores.status;
      jogo.wo = valores.wo;
      jogo.placarA = valores.placarA;
      jogo.placarB = valores.placarB;
      jogo.sets = valores.sets;
      jogo.vencedorId = valores.vencedorId;
    }

    wizardService.avancarEliminatoria(elim, regras);
    const podio = wizardService.obterPodioEliminatoria(elim, regras);
    if (podio.completa) {
      mod.campeao = podio.campeao;
      mod.vice = podio.vice;
      mod.terceiro = podio.terceiro;
      mod.finalizada = true;
      elim.campeao = podio.campeao;
      elim.vice = podio.vice;
      elim.terceiro = podio.terceiro;
      elim.finalizada = true;
      const conv = (id) => (id != null ? campusNome(dados, id) : null);
      mod.campeao = conv(podio.campeao);
      mod.vice = conv(podio.vice);
      mod.terceiro = conv(podio.terceiro);
    }
    mod.etapaModalidade = 'eliminatorias';
    gravarSubEtapaTenis(mod);

    if (mod.finalizada && wizardService.ehTenisDeMesa(mod.nome)) {
      gravarSubEtapaTenis(mod);
      if (mod.subEtapa === 'individual') {
        mod.subEtapa = 'dupla';
        espelharSubEtapaTenis(mod);
        mod.etapaModalidade = 'participantes';
        gravarSubEtapaTenis(mod);
      } else {
        definirProximaEtapa(dados);
      }
    } else if (mod.finalizada) {
      definirProximaEtapa(dados);
    }

    await rascunhoEdicaoService.salvarRascunho(admin, dados);
    return res.redirect('/admin/edicoes/nova');
  } catch (error) {
    return renderizar(res, req, [error.message]);
  }
}

async function voltarEliminatoria(req, res) {
  const admin = chaveAdmin(req);
  const dados = (await rascunhoEdicaoService.obterRascunho(admin)).dados;
  const idx = Number(req.params.idx);
  const mod = dados.modalidades[idx];
  if (mod) {
    espelharSubEtapaTenis(mod);
    mod.etapaModalidade = 'resultados';
    gravarSubEtapaTenis(mod);
  }
  dados.etapa = 'modalidade';
  dados.modalidadeFoco = idx;
  await rascunhoEdicaoService.salvarRascunho(admin, dados);
  return res.redirect('/admin/edicoes/nova');
}

async function alternarSubEtapa(req, res) {
  const admin = chaveAdmin(req);
  const dados = (await rascunhoEdicaoService.obterRascunho(admin)).dados;
  const idx = Number(req.params.idx);
  const mod = dados.modalidades[idx];
  if (mod && wizardService.ehTenisDeMesa(mod.nome)) {
    const alvo = String(req.body.subEtapa || '');
    if (['individual', 'dupla'].includes(alvo)) {
      mod.subEtapa = alvo;
      espelharSubEtapaTenis(mod);
      gravarSubEtapaTenis(mod);
    }
  }
  dados.etapa = 'modalidade';
  dados.modalidadeFoco = idx;
  await rascunhoEdicaoService.salvarRascunho(admin, dados);
  return res.redirect('/admin/edicoes/nova');
}

async function irParaModalidade(req, res) {
  const admin = chaveAdmin(req);
  const dados = (await rascunhoEdicaoService.obterRascunho(admin)).dados;
  const idx = Number(req.body.modalidadeFoco);
  if (!Number.isInteger(idx) || idx < 0 || idx >= (dados.modalidades || []).length) {
    return res.redirect('/admin/edicoes/nova');
  }
  dados.modalidadeFoco = idx;
  dados.etapa = 'modalidade';
  await rascunhoEdicaoService.salvarRascunho(admin, dados);
  return res.redirect('/admin/edicoes/nova');
}

async function voltarEtapa(req, res) {
  const admin = chaveAdmin(req);
  const rascunho = await rascunhoEdicaoService.obterRascunho(admin);
  if (!rascunho) return res.redirect('/admin/edicoes/nova');
  const etapa = String(req.params.etapa || '');
  if (['dados', 'campi', 'modalidades'].includes(etapa)) {
    rascunho.dados.etapa = etapa;
    rascunho.dados.modalidadeFoco = 0;
    await rascunhoEdicaoService.salvarRascunho(admin, rascunho.dados);
  }
  return res.redirect('/admin/edicoes/nova');
}

/* Voltar da revisão: retorna à última modalidade trabalhada, na sua sub-etapa final,
   preservando todo o progresso (não volta até a lista de modalidades). */
async function voltarRevisao(req, res) {
  const admin = chaveAdmin(req);
  const rascunho = await rascunhoEdicaoService.obterRascunho(admin);
  if (!rascunho) return res.redirect('/admin/edicoes/nova');
  const dados = rascunho.dados;
  const modalidades = dados.modalidades || [];
  let idx = Number(dados.modalidadeFoco);
  if (!Number.isInteger(idx) || idx < 0 || idx >= modalidades.length) {
    idx = Math.max(0, modalidades.length - 1);
  }
  const mod = modalidades[idx];
  if (mod) {
    espelharSubEtapaTenis(mod);
    if (!mod.etapaModalidade) {
      mod.etapaModalidade = wizardService.ehModalidadeIndividual(mod.nome) ? 'participantes' : 'eliminatorias';
      gravarSubEtapaTenis(mod);
    }
  }
  dados.etapa = 'modalidade';
  dados.modalidadeFoco = idx;
  await rascunhoEdicaoService.salvarRascunho(admin, dados);
  return res.redirect('/admin/edicoes/nova');
}

/* Pré-preenche o rascunho com uma edição de exemplo completa, sem confirmar/salvar.
   O admin fica na etapa de revisão para conferir os dados. */
async function preencherExemplo(req, res) {
  try {
    const admin = chaveAdmin(req);
    let rascunho = await rascunhoEdicaoService.obterRascunho(admin);
    if (!rascunho) {
      rascunho = await rascunhoEdicaoService.criarRascunho(admin);
    }
    const dados = rascunho.dados;
    const exemplo = await exemploEdicaoService.montarExemplo({ campi: dados.campi });
    for (const chave of Object.keys(exemplo)) {
      dados[chave] = exemplo[chave];
    }
    await rascunhoEdicaoService.salvarRascunho(admin, dados);
    return res.redirect('/admin/edicoes/nova');
  } catch (error) {
    return renderizar(res, req, [error.message]);
  }
}

async function salvarFinal(req, res) {
  const admin = chaveAdmin(req);
  const rascunho = await rascunhoEdicaoService.obterRascunho(admin);
  if (!rascunho) {
    return res.redirect('/admin/edicoes/nova');
  }

  try {
    const dadosFinais = wizardService.construirDadosEdicao(rascunho.dados);
    const resultado = await edicaoService.importarEdicao(dadosFinais);
    await rascunhoEdicaoService.excluirRascunho(admin);
    return res.redirect(`/admin/edicoes?sucesso=${encodeURIComponent(`Edição JIFC ${resultado.ano} salva com sucesso.`)}`);
  } catch (error) {
    return renderizar(res, req, [error.message]);
  }
}

async function cancelar(req, res) {
  await rascunhoEdicaoService.excluirRascunho(chaveAdmin(req));
  return res.redirect('/admin/edicoes');
}

module.exports = {
  renderWizard,
  salvarDadosGerais,
  salvarCampi,
  salvarModalidades,
  salvarParticipantes,
  voltarParticipantes,
  salvarGrupos,
  voltarGrupos,
  salvarConfrontos,
  voltarConfrontos,
  salvarResultados,
  salvarEliminatoria,
  voltarEliminatoria,
  alternarSubEtapa,
  irParaModalidade,
  voltarEtapa,
  voltarRevisao,
  preencherExemplo,
  salvarFinal,
  cancelar
};