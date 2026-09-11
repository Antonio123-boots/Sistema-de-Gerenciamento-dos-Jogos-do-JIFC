const db = require('../config/db');

function normalizarAdmin(chave) {
  return String(chave || '').trim().toLowerCase();
}

function criarDadosVazios() {
  return {
    formatoVersao: 1,
    etapa: 'dados',
    status: 'rascunho',
    ano: null,
    titulo: '',
    dataInicio: null,
    dataFim: null,
    campi: [],
    modalidades: [],
    atletismo: [],
    xadrez: [],
    modalidadeFoco: 0
  };
}

async function obterRascunho(adminChave) {
  const email = normalizarAdmin(adminChave);
  if (!email) return null;

  const [rows] = await db.query(
    'SELECT id, admin_email, ano_jifc, etapa, dados_json FROM rascunho_edicoes WHERE admin_email = ? LIMIT 1',
    [email]
  );
  const linha = rows && rows[0];
  if (!linha) return null;

  let dados = criarDadosVazios();
  try {
    const parseado = JSON.parse(linha.dados_json || '{}');
    dados = { ...dados, ...parseado };
  } catch (_) {
    /* dados corrompidos: mantém rascunho vazio */
  }

  return {
    id: linha.id,
    adminEmail: linha.admin_email,
    ano: linha.ano_jifc ? Number(linha.ano_jifc) : null,
    etapa: linha.etapa,
    dados
  };
}

async function criarRascunho(adminChave) {
  const email = normalizarAdmin(adminChave);
  if (!email) return null;

  await db.query(
    'INSERT IGNORE INTO rascunho_edicoes (admin_email, ano_jifc, etapa, dados_json) VALUES (?, NULL, ?, ?)',
    [email, 'dados', JSON.stringify(criarDadosVazios())]
  );
  return obterRascunho(email);
}

async function salvarRascunho(adminChave, dados) {
  const email = normalizarAdmin(adminChave);
  const rascunho = await obterRascunho(email || adminChave);
  if (!rascunho) return null;

  const etapa = String((dados && dados.etapa) || rascunho.etapa || 'dados');
  const ano = Number((dados && dados.ano) || 0) || null;

  await db.query(
    'UPDATE rascunho_edicoes SET dados_json = ?, etapa = ?, ano_jifc = ? WHERE id = ?',
    [JSON.stringify(dados || {}), etapa, ano, rascunho.id]
  );
  return { id: rascunho.id, etapa, ano };
}

async function excluirRascunho(adminChave) {
  const email = normalizarAdmin(adminChave);
  if (!email) return false;

  const [resultado] = await db.query('DELETE FROM rascunho_edicoes WHERE admin_email = ?', [email]);
  return Boolean(resultado && resultado.affectedRows);
}

module.exports = { obterRascunho, criarRascunho, salvarRascunho, excluirRascunho, criarDadosVazios };