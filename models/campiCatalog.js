const { readState, writeState } = require('./stateStore');
const pool = require('../config/db');
const argon2 = require('argon2');
const { normalizarFotoPerfil, fotoPadrao } = require('./profileImageStore');

let campusModel;
function getCampusModel() {
  if (!campusModel) {
    campusModel = require('./campusModel');
  }

  return campusModel;
}

const senhaPadraoCampus = process.env.DEFAULT_CAMPUS_PASSWORD ? String(process.env.DEFAULT_CAMPUS_PASSWORD).trim() : '';

async function prepararSenhaParaSalvar(senhaInformada) {
  const senha = String(senhaInformada || senhaPadraoCampus).trim();
  if (!senha || senha.startsWith('$argon2')) {
    return senha;
  }
  return argon2.hash(senha);
}

const campiDefault = [
  { slug: 'abelardo-luz', nome: 'IFC Abelardo Luz', nomeExibicao: 'Abelardo Luz', cor: '#00bcd4' },
  { slug: 'araquari', nome: 'IFC Araquari', nomeExibicao: 'Araquari', cor: '#2ecc71' },
  { slug: 'blumenau', nome: 'IFC Blumenau', nomeExibicao: 'Blumenau', cor: '#f39c12' },
  { slug: 'brusque', nome: 'IFC Brusque', nomeExibicao: 'Brusque', cor: '#9b59b6' },
  { slug: 'camboriu', nome: 'IFC Camboriú', nomeExibicao: 'Camboriú', cor: '#e67e22' },
  { slug: 'concordia', nome: 'IFC Concórdia', nomeExibicao: 'Concórdia', cor: '#1abc9c' },
  { slug: 'fraiburgo', nome: 'IFC Fraiburgo', nomeExibicao: 'Fraiburgo', cor: '#3498db' },
  { slug: 'ibirama', nome: 'IFC Ibirama', nomeExibicao: 'Ibirama', cor: '#e74c3c' },
  { slug: 'luzerna', nome: 'IFC Luzerna', nomeExibicao: 'Luzerna', cor: '#16a085' },
  { slug: 'rio-do-sul', nome: 'IFC Rio do Sul', nomeExibicao: 'Rio do Sul', cor: '#8e44ad' },
  { slug: 'santa-rosa-do-sul', nome: 'IFC Santa Rosa do Sul', nomeExibicao: 'Santa Rosa do Sul', cor: '#d35400' },
  { slug: 'sao-bento-do-sul', nome: 'IFC São Bento do Sul', nomeExibicao: 'São Bento do Sul', cor: '#2980b9' },
  { slug: 'sao-francisco-do-sul', nome: 'IFC São Francisco do Sul', nomeExibicao: 'São Francisco do Sul', cor: '#27ae60' },
  { slug: 'sombrio', nome: 'IFC Sombrio', nomeExibicao: 'Sombrio', cor: '#c0392b' },
  { slug: 'videira', nome: 'IFC Videira', nomeExibicao: 'Videira', cor: '#2c3e50' }
];

/*
 * Contas reservadas do sistema (models/authUsers.js). Um campus não pode
 * reivindicar esses e-mails: no login, os hashes base têm precedência
 * absoluta e a identidade do campus seria trocada pela conta reservada.
 */
const EMAILS_RESERVADOS = new Set([
  'admin@ifc.edu.br',
  'juiz@ifc.edu.br',
  'instituicao@ifc.edu.br'
]);

function normalizarEmail(email) {
  return String(email || '').trim().toLowerCase();
}

/*
 * Remove marcação e caracteres de controle dos textos preenchidos pelo campus.
 * Esses valores são exibidos em várias telas e arrivei a ser injetados via
 * innerHTML em scripts do painel do admin, então restringimos o formato aqui.
 */
function sanearTextoCampus(valor) {
  return String(valor == null ? '' : valor)
    .replace(/<[^>]*>/g, '')          // remove tags HTML
    .replace(/[<>]/g, '')             // remove angle brackets residuais
    .replace(/[\u0000-\u001F\u007F]/g, '') // remove controles
    .replace(/\s+/g, ' ')
    .trim();
}

function gerarSigla(nomeExibicao) {
  return String(nomeExibicao || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((parte) => parte[0])
    .join('')
    .slice(0, 3)
    .toUpperCase();
}

const { gerarSlug } = require('../utils/slug');

function obterEstadoCatalogo() {
  const estado = readState();
  if (!estado.campiCatalog || typeof estado.campiCatalog !== 'object') {
    estado.campiCatalog = {};
  }

  return estado;
}

function persistirEstadoCatalogo(estado) {
  writeState(estado);
}

async function limparDependenciasCampusNoBanco(connection, campusId) {
  const consultas = [
    { sql: 'DELETE FROM classificacao_grupos WHERE campus_id = ?', params: [campusId] },
    { sql: 'DELETE FROM resultados_coletivos WHERE jogo_id IN (SELECT id FROM jogos WHERE campus_1_id = ? OR campus_2_id = ?)', params: [campusId, campusId] },
    { sql: 'DELETE FROM resultados_por_sets WHERE jogo_id IN (SELECT id FROM jogos WHERE campus_1_id = ? OR campus_2_id = ?)', params: [campusId, campusId] },
    { sql: 'DELETE FROM resultados_atletismo WHERE jogo_id IN (SELECT id FROM jogos WHERE campus_1_id = ? OR campus_2_id = ?) OR atleta_id IN (SELECT id FROM atletas WHERE campus_id = ?)', params: [campusId, campusId, campusId] },
    { sql: 'DELETE FROM jogos WHERE campus_1_id = ? OR campus_2_id = ?', params: [campusId, campusId] },
    { sql: 'DELETE FROM atleta_modalidade WHERE atleta_id IN (SELECT id FROM atletas WHERE campus_id = ?)', params: [campusId] },
    { sql: 'DELETE FROM campus_modalidade WHERE campus_id = ?', params: [campusId] },
    { sql: 'DELETE FROM atletas WHERE campus_id = ?', params: [campusId] }
  ];

  for (const consulta of consultas) {
    try {
      await connection.query(consulta.sql, consulta.params);
    } catch (error) {
      const mensagem = String(error?.message || '');
      if (/doesn't exist|unknown table|base table|table .* doesn't exist/i.test(mensagem)) {
        continue;
      }
      throw error;
    }
  }
}

function limparEstadoCampusRemovido(campusAtual) {
  const estado = obterEstadoCatalogo();
  const nomesCampus = [campusAtual.nome, campusAtual.nomeExibicao, campusAtual.slug]
    .filter((valor) => typeof valor === 'string' && valor.trim())
    .map((valor) => valor.trim())
    .filter((valor, index, lista) => lista.indexOf(valor) === index);

  const estadoCampus = estado.campus || {};
  estado.campus = estadoCampus;

  if (estadoCampus.inscricoesCampus && typeof estadoCampus.inscricoesCampus === 'object') {
    for (const nomeCampus of nomesCampus) {
      delete estadoCampus.inscricoesCampus[nomeCampus];
      delete estadoCampus.inscricoesCampus[gerarSlug(nomeCampus)];
    }
  }

  if (Array.isArray(estadoCampus.atletasCampus)) {
    estadoCampus.atletasCampus = estadoCampus.atletasCampus.filter((atleta) => {
      const campusNome = String(atleta?.campus || '').trim();
      const campusSlug = String(atleta?.campusSlug || '').trim();
      return (
        campusNome !== String(campusAtual.nome || '').trim() &&
        campusNome !== String(campusAtual.nomeExibicao || '').trim() &&
        campusSlug !== String(campusAtual.slug || '').trim()
      );
    });
  }

  if (estado.usuarios && typeof estado.usuarios === 'object') {
    delete estado.usuarios[normalizarEmail(campusAtual.email)];
  }

  if (estado.campiCatalog && Array.isArray(estado.campiCatalog.campi)) {
    estado.campiCatalog.campi = estado.campiCatalog.campi.filter((campus) => {
      const slug = String(campus?.slug || '').trim();
      const email = normalizarEmail(campus?.email);
      const nome = String(campus?.nome || '').trim();
      return (
        slug !== String(campusAtual.slug || '').trim() &&
        email !== normalizarEmail(campusAtual.email) &&
        nome !== String(campusAtual.nome || '').trim()
      );
    });
  }

  const campusModelInstancia = getCampusModel();
  if (campusModelInstancia && typeof campusModelInstancia.removerCampusDoEstado === 'function') {
    campusModelInstancia.removerCampusDoEstado(campusAtual);
  }

  estado.campiCatalog.defaultCampiSeeded = true;
  persistirEstadoCatalogo(estado);
}

function montarCampus(campus) {
  const slugBase = String(campus.slug || '').trim() || gerarSlug(campus.nomeExibicao || campus.nome || '');
  return {
    id: campus.id || null,
    ...campus,
    slug: slugBase,
    nome: String(campus.nome || '').trim(),
    nomeExibicao: String(campus.nomeExibicao || campus.nome || '').trim(),
    cidade: String(campus.cidade || '').trim(),
    email: normalizarEmail(campus.email) || `${slugBase}@ifc.edu.br`,
    senha: String(campus.senha || senhaPadraoCampus).trim(),
    cor: String(campus.cor || '#2980b9').trim(),
    fotoPerfil: normalizarFotoPerfil(campus.fotoPerfil || campus.foto_perfil || fotoPadrao),
    banned: Boolean(campus.banned),
    banMotivo: String(campus.banMotivo || '').trim(),
    logoTexto: gerarSigla(campus.nomeExibicao || campus.nome || '')
  };
}

function montarCampusDB(row) {
  return montarCampus({
    id: row.id,
    slug: row.slug,
    nome: row.nome,
    nomeExibicao: row.nome_exibicao || row.nome,
    cidade: row.cidade,
    email: row.email,
    senha: row.senha,
    cor: row.cor,
    fotoPerfil: normalizarFotoPerfil(row.foto_perfil || row.fotoPerfil || fotoPadrao),
    banned: row.banned,
    banMotivo: row.ban_motivo
  });
}

function listarCampiSync() {
  const estado = readState();
  if (!estado.campiCatalog || !Array.isArray(estado.campiCatalog.campi)) {
    return campiDefault.map(montarCampus);
  }

  const campiPersistidos = estado.campiCatalog.campi.map(montarCampus);
  const campiPadrao = campiDefault.map(montarCampus);
  const campiPersistidosMap = new Map(campiPersistidos.map((campus) => [campus.slug, montarCampus(campus)]));

  const campiPadraoAtualizados = campiPadrao.map((campus) => campiPersistidosMap.get(campus.slug) || campus);
  const campiExtras = campiPersistidos
    .filter((campus) => !campiPadrao.some((padrao) => padrao.slug === campus.slug))
    .map(montarCampus);

  return [...campiPadraoAtualizados, ...campiExtras].sort((a, b) => a.nomeExibicao.localeCompare(b.nomeExibicao));
}

async function seedDefaultCampi() {
  const estado = obterEstadoCatalogo();
  if (estado.campiCatalog.defaultCampiSeeded) {
    return;
  }

  if (!senhaPadraoCampus) {
    throw new Error('DEFAULT_CAMPUS_PASSWORD não configurado no .env. Configure-o para popular os campi padrão.');
  }

  const [rows] = await pool.query('SELECT COUNT(*) AS total FROM campus');
  const total = Number(rows?.[0]?.total || 0);
  if (total > 0) {
    estado.campiCatalog.defaultCampiSeeded = true;
    persistirEstadoCatalogo(estado);
    return;
  }

  const senhaPadraoHash = await argon2.hash(senhaPadraoCampus);
  for (const campus of campiDefault) {
    const slug = String(campus.slug || '').trim() || gerarSlug(campus.nomeExibicao || campus.nome || '');
    const nome = String(campus.nome || '').trim();
    const nomeExibicao = String(campus.nomeExibicao || campus.nome || '').trim();
    const email = `${slug}@ifc.edu.br`;
    await pool.query(
      'INSERT INTO campus (nome, nome_exibicao, cidade, email, senha, slug, cor, banned, ban_motivo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [nome, nomeExibicao, nomeExibicao, email, senhaPadraoHash, slug, campus.cor || '#2980b9', 0, '']
    );
  }

  estado.campiCatalog.defaultCampiSeeded = true;
  persistirEstadoCatalogo(estado);
}

async function listarCampi() {
  try {
    await seedDefaultCampi();
    const [rows] = await pool.query(
      'SELECT id, nome, nome_exibicao, cidade, email, senha, slug, cor, foto_perfil, banned, ban_motivo FROM campus ORDER BY nome_exibicao ASC, nome ASC'
    );

    return rows.map(montarCampusDB).sort((a, b) => a.nomeExibicao.localeCompare(b.nomeExibicao));
  } catch (error) {
    return listarCampiSync();
  }
}

async function obterCampusPorSlug(slug) {
  const campi = await listarCampi();
  return campi.find((campus) => campus.slug === String(slug || '').trim()) || null;
}

async function obterCampusPorEmail(email) {
  const emailNormalizado = normalizarEmail(email);
  const campi = await listarCampi();
  return campi.find((campus) => campus.email === emailNormalizado) || null;
}

async function listarCredenciaisCampus() {
  const campi = await listarCampi();
  return campi.map((campus) => ({
    nomeExibicao: campus.nomeExibicao,
    email: campus.email,
    banned: Boolean(campus.banned)
  }));
}

async function buscarCampusPorIdentificador(identificador) {
  const valor = String(identificador || '').trim();
  if (!valor) return null;

  const [rows] = await pool.query(
    'SELECT id, nome, nome_exibicao, cidade, email, senha, slug, cor, foto_perfil, banned, ban_motivo FROM campus ORDER BY id ASC'
  );

  const valorNormalizado = normalizarEmail(valor);
  const valorSlug = gerarSlug(valor);
  const valorNome = valor.toLowerCase();
  const valorNomeSemCampus = valorNome.replace(/^campus[\s-]+/i, '');
  const candidatos = new Set([
    valor,
    valorNormalizado,
    valorSlug,
    valorNome,
    valorNomeSemCampus,
    normalizarEmail(`${valor}@ifc.edu.br`)
  ]);

  for (const row of rows) {
    const campus = montarCampusDB(row);
    const comparacoes = [
      String(campus.id || '').trim().toLowerCase(),
      String(campus.slug || '').trim().toLowerCase(),
      String(campus.email || '').trim().toLowerCase(),
      String(campus.nome || '').trim().toLowerCase(),
      String(campus.nomeExibicao || '').trim().toLowerCase(),
      String(campus.nome || '').trim().replace(/^campus[\s-]+/i, '').toLowerCase(),
      String(campus.nomeExibicao || '').trim().replace(/^campus[\s-]+/i, '').toLowerCase(),
      gerarSlug(campus.nome || ''),
      gerarSlug(campus.nomeExibicao || campus.nome || ''),
      gerarSlug(campus.email || '')
    ].filter(Boolean);

    const encontrou = comparacoes.some((item) => candidatos.has(item) || candidatos.has(gerarSlug(item)));
    if (encontrou) {
      return row;
    }
  }

  return null;
}

async function banCampus(slug, motivo) {
  const slugNormalizado = String(slug || '').trim();
  const motivoFormatado = String(motivo || 'Motivo não informado').trim();
  const campusAtual = await buscarCampusPorIdentificador(slugNormalizado);

  if (!campusAtual) {
    const erro = new Error('Campus não encontrado para punição.');
    erro.code = 'CAMPUS_NAO_ENCONTRADO';
    throw erro;
  }

  const [result] = await pool.query('UPDATE campus SET banned = 1, ban_motivo = ? WHERE id = ?', [motivoFormatado, campusAtual.id]);

  if (!result.affectedRows) {
    const erro = new Error('Campus não encontrado para punição.');
    erro.code = 'CAMPUS_NAO_ENCONTRADO';
    throw erro;
  }

  return montarCampusDB({ ...campusAtual, banned: true, ban_motivo: motivoFormatado });
}

async function desbanirCampus(slug) {
  const slugNormalizado = String(slug || '').trim();
  const campusAtual = await buscarCampusPorIdentificador(slugNormalizado);

  if (!campusAtual) {
    const erro = new Error('Campus não encontrado para desbanir.');
    erro.code = 'CAMPUS_NAO_ENCONTRADO';
    throw erro;
  }

  const [result] = await pool.query('UPDATE campus SET banned = 0, ban_motivo = ? WHERE id = ?', ['', campusAtual.id]);

  if (!result.affectedRows) {
    const erro = new Error('Campus não encontrado para desbanir.');
    erro.code = 'CAMPUS_NAO_ENCONTRADO';
    throw erro;
  }

  return montarCampusDB({ ...campusAtual, banned: false, ban_motivo: '' });
}

async function removerCampus(slug) {
  const slugNormalizado = String(slug || '').trim();
  if (!slugNormalizado) {
    const erro = new Error('Informe o identificador do campus a ser excluído.');
    erro.code = 'SLUG_CAMPUS_OBRIGATORIO';
    throw erro;
  }

  const campusAtual = await buscarCampusPorIdentificador(slugNormalizado);
  if (!campusAtual) {
    const erro = new Error('Campus não encontrado para exclusão.');
    erro.code = 'CAMPUS_NAO_ENCONTRADO';
    throw erro;
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    await limparDependenciasCampusNoBanco(connection, campusAtual.id);

    const [result] = await connection.query('DELETE FROM campus WHERE id = ?', [campusAtual.id]);
    if (!result.affectedRows) {
      await connection.rollback();
      const erro = new Error('Campus não encontrado para exclusão.');
      erro.code = 'CAMPUS_NAO_ENCONTRADO';
      throw erro;
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  limparEstadoCampusRemovido(campusAtual);
  return true;
}

async function atualizarCampus(identificador, dados) {
  const campusAtual = await buscarCampusPorIdentificador(String(identificador || '').trim());
  if (!campusAtual) {
    const erro = new Error('Campus não encontrado para atualização.');
    erro.code = 'CAMPUS_NAO_ENCONTRADO';
    throw erro;
  }

  const nome = sanearTextoCampus(dados.nome || campusAtual.nome || '');
  const nomeExibicao = sanearTextoCampus(dados.nomeExibicao || campusAtual.nome_exibicao || campusAtual.nome || '');
  const email = normalizarEmail(dados.email || campusAtual.email);
  const senhaInformada = String(dados.senha || '').trim();
  const senha = await prepararSenhaParaSalvar(senhaInformada || campusAtual.senha || senhaPadraoCampus);
  const cidade = sanearTextoCampus(dados.cidade || campusAtual.cidade || '') || 'Não informado';
  const fotoPerfil = normalizarFotoPerfil(dados.fotoPerfil || dados.foto_perfil || campusAtual.foto_perfil || campusAtual.fotoPerfil || fotoPadrao);

  if (!nome) {
    const erro = new Error('Informe o nome completo do campus.');
    erro.code = 'NOME_CAMPUS_OBRIGATORIO';
    throw erro;
  }

  if (!nomeExibicao) {
    const erro = new Error('Informe o nome de exibição do campus.');
    erro.code = 'NOME_EXIBICAO_OBRIGATORIO';
    throw erro;
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const erro = new Error('Informe um e-mail válido para o campus.');
    erro.code = 'EMAIL_CAMPUS_INVALIDO';
    throw erro;
  }

  if (EMAILS_RESERVADOS.has(email)) {
    const erro = new Error('Este e-mail é reservado pelo sistema e não pode ser usado por um campus.');
    erro.code = 'EMAIL_RESERVADO';
    throw erro;
  }

  const campiExistentes = await listarCampi();
  const outrosCampi = campiExistentes.filter((campus) => String(campus.id) !== String(campusAtual.id));
  if (outrosCampi.some((campus) => campus.email === email)) {
    const erro = new Error('Já existe um campus cadastrado com este e-mail.');
    erro.code = 'EMAIL_DUPLICADO';
    throw erro;
  }

  if (outrosCampi.some((campus) => campus.nome === nome || campus.nomeExibicao === nomeExibicao)) {
    const erro = new Error('Já existe um campus cadastrado com este nome.');
    erro.code = 'NOME_DUPLICADO';
    throw erro;
  }

  const slug = String(dados.slug || campusAtual.slug || gerarSlug(nomeExibicao || nome)).trim() || gerarSlug(nomeExibicao || nome);
  const [result] = await pool.query(
    'UPDATE campus SET nome = ?, nome_exibicao = ?, cidade = ?, email = ?, senha = ?, slug = ?, foto_perfil = ? WHERE id = ?',
    [nome, nomeExibicao, cidade, email, senha, slug, fotoPerfil, campusAtual.id]
  );

  if (!result.affectedRows) {
    const erro = new Error('Não foi possível atualizar o campus.');
    erro.code = 'ERRO_ATUALIZAR_CAMPUS';
    throw erro;
  }

  return montarCampus({
    id: campusAtual.id,
    slug,
    nome,
    nomeExibicao,
    cidade,
    email,
    senha,
    cor: campusAtual.cor || '#2980b9',
    fotoPerfil,
    banned: Boolean(campusAtual.banned),
    banMotivo: campusAtual.ban_motivo || ''
  });
}

async function atualizarSenhaCampus(campusId, senhaHash) {
  await pool.query('UPDATE campus SET senha = ? WHERE id = ?', [senhaHash, campusId]);
}

async function adicionarCampus(dados) {
  const nome = sanearTextoCampus(dados.nome || '');
  const nomeExibicao = sanearTextoCampus(dados.nomeExibicao || '');
  const email = normalizarEmail(dados.email);
  const senha = await prepararSenhaParaSalvar(dados.senha);
  const cidade = sanearTextoCampus(dados.cidade || '') || 'Não informado';
  const fotoPerfil = normalizarFotoPerfil(dados.fotoPerfil || dados.foto_perfil || fotoPadrao);

  if (!nome) {
    const erro = new Error('Informe o nome completo do campus.');
    erro.code = 'NOME_CAMPUS_OBRIGATORIO';
    throw erro;
  }

  if (!nomeExibicao) {
    const erro = new Error('Informe o nome de exibição do campus.');
    erro.code = 'NOME_EXIBICAO_OBRIGATORIO';
    throw erro;
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const erro = new Error('Informe um e-mail válido para o campus.');
    erro.code = 'EMAIL_CAMPUS_INVALIDO';
    throw erro;
  }

  if (EMAILS_RESERVADOS.has(email)) {
    const erro = new Error('Este e-mail é reservado pelo sistema e não pode ser usado por um campus.');
    erro.code = 'EMAIL_RESERVADO';
    throw erro;
  }

  if (!senha) {
    const erro = new Error('Informe uma senha para o campus.');
    erro.code = 'SENHA_CAMPUS_OBRIGATORIA';
    throw erro;
  }

  const campiExistentes = await listarCampi();
  if (campiExistentes.some((campus) => campus.email === email)) {
    const erro = new Error('Já existe um campus cadastrado com este e-mail.');
    erro.code = 'EMAIL_DUPLICADO';
    throw erro;
  }

  if (campiExistentes.some((campus) => campus.nome === nome || campus.nomeExibicao === nomeExibicao)) {
    const erro = new Error('Já existe um campus cadastrado com este nome.');
    erro.code = 'NOME_DUPLICADO';
    throw erro;
  }

  const slugBase = gerarSlug(nomeExibicao || nome);
  let slug = slugBase || `campus-${Date.now()}`;
  let contador = 1;
  while (campiExistentes.some((campus) => campus.slug === slug)) {
    slug = `${slugBase || 'campus'}-${contador++}`;
  }

  const [result] = await pool.query(
    'INSERT INTO campus (nome, nome_exibicao, cidade, email, senha, slug, cor, foto_perfil, banned, ban_motivo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [nome, nomeExibicao, cidade, email, senha, slug, '#2980b9', fotoPerfil, 0, '']
  );

  return montarCampus({
    id: result.insertId,
    slug,
    nome,
    nomeExibicao,
    cidade,
    email,
    senha,
    cor: '#2980b9',
    fotoPerfil,
    banned: false,
    banMotivo: ''
  });
}

module.exports = {
  listarCampi,
  listarCampiSync,
  obterCampusPorSlug,
  obterCampusPorEmail,
  listarCredenciaisCampus,
  atualizarCampus,
  atualizarSenhaCampus,
  adicionarCampus,
  banCampus,
  desbanirCampus,
  removerCampus
};
