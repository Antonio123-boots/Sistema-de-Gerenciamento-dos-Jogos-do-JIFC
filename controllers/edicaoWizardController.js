const rascunhoEdicaoService = require('../services/rascunhoEdicaoService');
const wizardService = require('../services/edicaoWizardService');
const edicaoService = require('../services/edicaoService');
const { listarCampi } = require('../models/campiCatalog');
const { obterRegras } = require('../utils/sportClassificationRules');

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

    if (passo === 'modalidade') {
      const foco = Math.min(
        Number(dados.modalidadeFoco || 0),
        Math.max(0, (dados.modalidades || []).length - 1)
      );
      const mod = dados.modalidades[foco] || null;
      contexto.modFoco = foco;
      contexto.mod = mod;
      if (mod) {
        contexto.regras = obterRegras(mod.nome);
        contexto.subPasso = mod.etapaModalidade;
        contexto.grupos = mod.grupos || [];
        contexto.jogosAgrupados = agruparJogosPorChave(mod, contexto.mapCampusId);
        contexto.tabela = (mod.tabela || []);
      } else {
        contexto.regras = {};
        contexto.subPasso = 'participantes';
        contexto.grupos = [];
        contexto.jogosAgrupados = [];
        contexto.tabela = [];
      }
    }

    if (passo === 'revisao') {
      contexto.dadosFinais = wizardService.construirDadosEdicao(dados);
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
    dados.modalidades = [];
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
      linhas.push({
        nome,
        genero: generos[i],
        icone: icones[i]
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

    const participantes = (req.body['participantes'] || [])
      .map((p) => numeroOuNull(p))
      .filter((p) => p != null);
    if (participantes.length < 2) {
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
    mod.etapaModalidade = 'grupos';

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
    mod.etapaModalidade = 'participantes';
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

    const nomes = req.body['grupo_nome'] || [];
    const mapaCampusGrupo = {};
    for (const id of mod.participantes) {
      mapaCampusGrupo[String(id)] = req.body[`grupo_campus_${id}`];
    }
    mod.grupos = wizardService.montarGruposDoForm(nomes, mapaCampusGrupo, mod.participantes);

    let gi = 0;
    mod.jogos = mod.jogos || [];
    for (const jogo of mod.jogos) {
      const alvo = mod.grupos.findIndex((g) => Number(g.indice) === Number(jogo.chaveIndice));
      jogo.chaveIndice = alvo >= 0 ? alvo : gi;
    }

    mod.tabela = [];
    mod.campeao = null;
    mod.vice = null;
    mod.terceiro = null;
    mod.finalizada = false;
    mod.etapaModalidade = 'confrontos';

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
    mod.etapaModalidade = 'grupos';
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

    mod.jogos = wizardService.montarConfrontosDoForm(req.body, mod.grupos);
    mod.tabela = [];
    mod.campeao = null;
    mod.vice = null;
    mod.terceiro = null;
    mod.finalizada = false;
    mod.etapaModalidade = 'resultados';

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
    mod.etapaModalidade = 'confrontos';
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

    const regras = obterRegras(mod.nome);
    for (const jogo of mod.jogos || []) {
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

    const podio = wizardService.obterPodioDaModalidade(mod, regras);
    mod.campeao = podio.campeao;
    mod.vice = podio.vice;
    mod.terceiro = podio.terceiro;
    mod.finalizada = Boolean(podio.completa);

    if (mod.finalizada) {
      definirProximaEtapa(dados);
    } else {
      mod.etapaModalidade = 'resultados';
    }

    await rascunhoEdicaoService.salvarRascunho(admin, dados);
    return res.redirect('/admin/edicoes/nova');
  } catch (error) {
    return renderizar(res, req, [error.message]);
  }
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
  irParaModalidade,
  voltarEtapa,
  salvarFinal,
  cancelar
};