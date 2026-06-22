const adminModel = require('../models/adminModel');
const campusModel = require('../models/campusModel');
const { listarCampi } = require('../models/campiCatalog');

function renderConfigurar(req, res) {
  res.render('adm/configEvento', {
    title: 'Configurar Prazos',
    usuarioLogado: req.session?.usuario || null,
    mostrarFiltros: false,
    configuracoes: adminModel.getConfiguracoes()
  });
}

function salvarConfiguracoes(req, res) {
  adminModel.salvarConfiguracoes({
    inicio_evento: req.body.inicio_evento,
    fim_evento: req.body.fim_evento,
    inicio_inscricao_modalidades: req.body.inicioInscricoesModalidades,
    fim_inscricao_modalidades: req.body.fimInscricoesModalidades,
    inicio_inscricao_atletas: req.body.inicioInscricoesAtletas,
    fim_inscricao_atletas: req.body.fimInscricoesAtletas,
    inicio_sorteio_chaves: req.body.inicioSorteio,
    fim_sorteio_chaves: req.body.fimSorteio,
    limite_atletas_total_campus: req.body.limite_atletas_total_campus
  });
  res.redirect('/admin/configurar');
}

async function renderChaveamento(req, res) {
  try {
    const modalidadeIdParam = req.query.modalidade;
    // Alterado o padrão para bater com o ENUM 'Individual' ou 'Coletivo' do banco de dados
    const subCategoria = req.query.sub || 'Individual'; 

    const listaModalidades = await adminModel.getModalidadesBanco();
    if (listaModalidades.length === 0) {
      return res.send("Nenhuma modalidade cadastrada no banco de dados.");
    }

    let modalidadeAtiva = listaModalidades[0];
    if (modalidadeIdParam) {
      const buscada = listaModalidades.find(m => m.id === Number(modalidadeIdParam));
      if (buscada) modalidadeAtiva = buscada;
    }

    // Criando um slug temporário para a view identificar o esporte sem quebrar as queries do Model
    const nomeNormalizado = modalidadeAtiva.nome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    let categoriaSlug = nomeNormalizado;
    if (nomeNormalizado.includes("atletismo")) categoriaSlug = "atletismo";
    if (nomeNormalizado.includes("xadrez")) categoriaSlug = "xadrez";
    if (nomeNormalizado.includes("tenis de mesa")) categoriaSlug = "tenis-de-mesa";
    
    // Injeta com segurança para a View ler se necessário
    modalidadeAtiva.categoriaSlug = categoriaSlug; 

    const icones = { futsal: '⚽', volei: '🏐', basquete: '🏀', handebol: '🤾', atletismo: '🏃', 'tenis-de-mesa': '🏓', xadrez: '♟️' };
    const modalidadesComIcone = listaModalidades.map(m => {
      const norm = m.nome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      let icone = '🏆';
      for (let k in icones) { if (norm.includes(k)) icone = icones[k]; }
      return { ...m, icone };
    });

    const modAtivaFormatada = modalidadesComIcone.find(m => m.id === modalidadeAtiva.id);
    
    // Passa os parâmetros corretos para o seu Model adaptado
    const inscritos = await adminModel.getInscritosModalidade(modalidadeAtiva.id, subCategoria);
    const chaves = await adminModel.getChavesModalidade(modalidadeAtiva.id, subCategoria);
    const jogos = await adminModel.getJogosModalidade(modalidadeAtiva.id, subCategoria);

    let provasAtletismo = [];
    if (categoriaSlug === 'atletismo') {
      provasAtletismo = [
        { nomeProva: "Provas de Pista e Campo", atletas: inscritos }
      ];
    }

    res.render('adm/chaveamento', {
      title: 'Chaveamento dos Jogos — JIFC',
      usuarioLogado: req.session?.usuario || { tipo: 'admin' },
      mostrarFiltros: false,
      inscricoesAbertas: false, 
      listaModalidadesCompleta: modalidadesComIcone,
      modalidadeAtiva: modAtivaFormatada,
      subCategoriaAtiva: subCategoria,
      inscritosPendentes: inscritos,
      chavesGeradas: chaves,
      provasAtletismo: provasAtletismo,
      jogosProgramados: jogos
    });

  } catch (error) {
    console.error(error);
    res.status(500).send("Erro ao carregar painel de chaveamento.");
  }
}

async function gerarChaveamento(req, res) {
  try {
    const { modalidadeId, subCategoria } = req.body;
    await adminModel.efetuarChaveamentoMatematico(modalidadeId, subCategoria);
    res.redirect(`/admin/chaveamento?modalidade=${modalidadeId}&sub=${subCategoria || 'geral'}`);
  } catch (error) {
    console.error(error);
    res.status(500).send("Erro ao processar sorteio automático.");
  }
}

async function limparChaveamento(req, res) {
  try {
    const { modalidadeId, subCategoria } = req.body;
    const db = require('../config/db');
    await db.query('DELETE FROM jogos WHERE modalidade_id = ?', [modalidadeId]);
    await db.query('DELETE FROM chaves WHERE modalidade_id = ?', [modalidadeId]);
    res.redirect(`/admin/chaveamento?modalidade=${modalidadeId}&sub=${subCategoria || 'geral'}`);
  } catch (error) {
    console.error(error);
    res.status(500).send("Erro ao limpar dados do chaveamento.");
  }
}

function renderAnalise(req, res) {
  const campusSelecionado = req.query.campus || '';
  const atletas = campusModel.getAtletasParaAnalise(campusSelecionado || null);

  res.render('adm/analiseAtletas', {
    title: 'Análise de Atletas',
    usuarioLogado: req.session?.usuario || null,
    mostrarFiltros: false,
    campi: listarCampi(),
    campusSelecionado,
    atletas
  });
}

function validarAtleta(req, res) {
  const atleta = campusModel.atualizarStatusAtleta(req.params.atletaId, 'Regular');
  if (!atleta) {
    return res.redirect('/admin/laudos?erro=' + encodeURIComponent('Atleta não encontrado para validação.'));
  }

  res.redirect('/admin/laudos?campus=' + encodeURIComponent(atleta.campus) + '&sucesso=' + encodeURIComponent('Atleta validado com sucesso.') + '#lista-atletas');
}

function marcarIrregular(req, res) {
  const atleta = campusModel.atualizarStatusAtleta(req.params.atletaId, 'Reprovado');
  if (!atleta) {
    return res.redirect('/admin/laudos?erro=' + encodeURIComponent('Atleta não encontrado para reprovação.'));
  }

  res.redirect('/admin/laudos?campus=' + encodeURIComponent(atleta.campus) + '&sucesso=' + encodeURIComponent('Atleta reprovado com sucesso.') + '#lista-atletas');
}

async function renderPlacar(req, res) {
  try {
    const jogos = await adminModel.getJogos();
    const jogo = jogos.find((item) => item.id === Number(req.params.jogoId)) || null;

    res.render('adm/placares', {
      title: 'Lançar Resultado',
      usuarioLogado: req.session?.usuario || null,
      mostrarFiltros: false,
      jogoId: req.params.jogoId,
      jogo
    });
  } catch (error) {
    console.error(error);
    res.status(500).send('Erro ao carregar o placar do jogo.');
  }
}

async function salvarPlacar(req, res) {
  try {
    await adminModel.salvarPlacar(req.params.jogoId, req.body);
    res.redirect('/admin/chaveamento');
  } catch (error) {
    console.error(error);
    res.status(500).send('Erro ao salvar o placar.');
  }
}

module.exports = {
  renderConfigurar,
  salvarConfiguracoes,
  renderChaveamento,
  gerarChaveamento,
  limparChaveamento,
  renderAnalise,
  validarAtleta,
  marcarIrregular,
  renderPlacar,
  salvarPlacar
};