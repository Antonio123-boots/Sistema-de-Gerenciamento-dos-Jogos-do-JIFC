const adminModel = require('../models/adminModel');

async function renderTabelas(req, res) {
  try {
    const jogos = await adminModel.getJogos();

    res.render('juiz/tabelas', {
      title: 'Painel do Juiz',
      usuarioLogado: req.session?.usuario || null,
      mostrarFiltros: false,
      jogos
    });
  } catch (error) {
    console.error(error);
    res.status(500).send('Erro ao carregar o painel do juiz.');
  }
}

async function renderPlacar(req, res) {
  try {
    const jogos = await adminModel.getJogos();
    const jogo = jogos.find((item) => item.id === Number(req.params.jogoId)) || null;

    res.render('juiz/placares', {
      title: 'Atualizar Placar',
      usuarioLogado: req.session?.usuario || null,
      mostrarFiltros: false,
      jogoId: req.params.jogoId,
      jogo
    });
  } catch (error) {
    console.error(error);
    res.status(500).send('Erro ao carregar placar do jogo.');
  }
}

async function salvarPlacar(req, res) {
  try {
    await adminModel.salvarPlacar(req.params.jogoId, req.body);
    res.redirect('/juiz/tabelas');
  } catch (error) {
    console.error(error);
    res.status(500).send('Erro ao salvar o placar.');
  }
}

module.exports = {
  renderTabelas,
  renderPlacar,
  salvarPlacar
};
