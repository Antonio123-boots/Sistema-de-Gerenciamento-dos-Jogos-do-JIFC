const assert = require('assert');
const http = require('http');
const path = require('path');
const express = require('express');
const expressLayouts = require('express-ejs-layouts');

const adminModel = require('../models/adminModel');
const edicaoService = require('../services/edicaoService');
const userRoutes = require('../routes/userRoutes');

const chamadas = {
  getJogosPublicados: 0,
  getDiasDisponiveis: 0
};

adminModel.getModalidadesBanco = async () => [];
adminModel.getConfiguracoesBanco = async () => null;
adminModel.getJogosPublicados = async () => {
  chamadas.getJogosPublicados++;
  return [];
};
adminModel.getDiasDisponiveis = async () => {
  chamadas.getDiasDisponiveis++;
  return [];
};
edicaoService.listarAnosEdicoes = async () => [];
edicaoService.obterEdicao = async () => null;

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
app.use(expressLayouts);
app.set('layout', 'layout');

app.use((req, res, next) => {
  req.user = null;
  res.locals.usuarioLogado = null;
  res.locals.mostrarFiltros = false;
  res.locals.configuracoes = adminModel.getConfiguracoes();
  res.locals.anoJifc = adminModel.getAnoJifc();
  res.locals.csrfToken = 'teste';
  next();
});

app.use('/', userRoutes);

function requisitar(porta, caminho) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: porta, path: caminho }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    }).on('error', reject);
  });
}

(async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.on('listening', resolve));
  const porta = server.address().port;
  try {
    const status = await requisitar(porta, '/');
    assert.strictEqual(status, 200, 'A home deveria responder 200.');

    assert.strictEqual(
      chamadas.getJogosPublicados,
      1,
      'REGRESSÃO DE PERFORMANCE: getJogosPublicados não pode ser chamado 2x por request na home (era usado para os dias + para os jogos).'
    );
    assert.strictEqual(
      chamadas.getDiasDisponiveis,
      1,
      'Os dias disponíveis devem vir da consulta leve getDiasDisponiveis.'
    );
  } finally {
    server.close();
  }
  console.log('Teste de integração da rota / (home) concluído com sucesso.');
})().catch((erro) => {
  console.error(erro);
  process.exit(1);
});