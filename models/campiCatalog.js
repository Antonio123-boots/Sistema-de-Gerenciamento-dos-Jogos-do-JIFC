const { readState, writeState } = require('./stateStore');
const pool = require('../config/db');

const senhaPadraoCampus = 'jifc2026';

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

function normalizarEmail(email) {
  return String(email || '').trim().toLowerCase();
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

function gerarSlug(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[-]/g, (s) => s)
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 30);
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

async function ensureCampusTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS campus (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nome VARCHAR(100) NOT NULL UNIQUE,
      nome_exibicao VARCHAR(100) DEFAULT NULL,
      cidade VARCHAR(100) DEFAULT NULL,
      email VARCHAR(100) NOT NULL UNIQUE,
      senha VARCHAR(255) NOT NULL,
      slug VARCHAR(100) NOT NULL UNIQUE,
      cor VARCHAR(20) DEFAULT '#2980b9',
      banned TINYINT(1) DEFAULT 0,
      ban_motivo TEXT DEFAULT NULL,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const [columns] = await pool.query(
    "SELECT COLUMN_NAME AS column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'campus'"
  );
  const existingColumns = new Set(columns.map((column) => column.column_name));

  const alterStatements = [
    ['nome_exibicao', "ALTER TABLE campus ADD COLUMN nome_exibicao VARCHAR(100) DEFAULT NULL"],
    ['cidade', "ALTER TABLE campus ADD COLUMN cidade VARCHAR(100) DEFAULT NULL"],
    ['slug', "ALTER TABLE campus ADD COLUMN slug VARCHAR(100) DEFAULT NULL"],
    ['cor', "ALTER TABLE campus ADD COLUMN cor VARCHAR(20) DEFAULT '#2980b9'"],
    ['banned', "ALTER TABLE campus ADD COLUMN banned TINYINT(1) DEFAULT 0"],
    ['ban_motivo', "ALTER TABLE campus ADD COLUMN ban_motivo TEXT DEFAULT NULL"]
  ];

  for (const [columnName, statement] of alterStatements) {
    if (existingColumns.has(columnName)) {
      continue;
    }

    try {
      await pool.query(statement);
      existingColumns.add(columnName);
    } catch (error) {
      if (error && error.code !== 'ER_DUP_FIELDNAME') {
        throw error;
      }
    }
  }

  const [rowsSemSlug] = await pool.query(
    "SELECT id, nome, nome_exibicao, email, slug FROM campus WHERE slug IS NULL OR TRIM(COALESCE(slug, '')) = '' OR nome_exibicao IS NULL OR TRIM(COALESCE(nome_exibicao, '')) = ''"
  );

  for (const row of rowsSemSlug) {
    const nomeExibicao = String(row.nome_exibicao || row.nome || '').trim() || String(row.nome || '').trim();
    const slug = String(row.slug || '').trim() || gerarSlug(nomeExibicao || row.email || `campus-${row.id}`);
    await pool.query('UPDATE campus SET nome_exibicao = ?, slug = ? WHERE id = ?', [nomeExibicao, slug, row.id]);
  }
}

async function seedDefaultCampi() {
  const [rows] = await pool.query('SELECT COUNT(*) AS total FROM campus');
  const total = Number(rows?.[0]?.total || 0);
  if (total > 0) {
    return;
  }

  for (const campus of campiDefault) {
    const slug = String(campus.slug || '').trim() || gerarSlug(campus.nomeExibicao || campus.nome || '');
    const nome = String(campus.nome || '').trim();
    const nomeExibicao = String(campus.nomeExibicao || campus.nome || '').trim();
    const email = `${slug}@ifc.edu.br`;
    await pool.query(
      'INSERT INTO campus (nome, nome_exibicao, cidade, email, senha, slug, cor, banned, ban_motivo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [nome, nomeExibicao, nomeExibicao, email, senhaPadraoCampus, slug, campus.cor || '#2980b9', 0, '']
    );
  }
}

async function listarCampi() {
  try {
    await ensureCampusTable();
    await seedDefaultCampi();
    const [rows] = await pool.query(
      'SELECT id, nome, nome_exibicao, cidade, email, senha, slug, cor, banned, ban_motivo FROM campus ORDER BY nome_exibicao ASC, nome ASC'
    );

    return rows.map(montarCampusDB).sort((a, b) => a.nomeExibicao.localeCompare(b.nomeExibicao));
  } catch (error) {
    console.error('Falha ao listar campus a partir do banco, usando fallback local.', error.message);
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
    senha: campus.senha,
    banned: Boolean(campus.banned)
  }));
}

async function buscarCampusPorIdentificador(identificador) {
  const valor = String(identificador || '').trim();
  if (!valor) return null;

  await ensureCampusTable();
  const [rows] = await pool.query(
    'SELECT id, nome, nome_exibicao, cidade, email, senha, slug, cor, banned, ban_motivo FROM campus ORDER BY id ASC'
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

  const [result] = await pool.query('DELETE FROM campus WHERE id = ?', [campusAtual.id]);
  if (!result.affectedRows) {
    const erro = new Error('Campus não encontrado para exclusão.');
    erro.code = 'CAMPUS_NAO_ENCONTRADO';
    throw erro;
  }

  return true;
}

async function atualizarCampus(identificador, dados) {
  const campusAtual = await buscarCampusPorIdentificador(String(identificador || '').trim());
  if (!campusAtual) {
    const erro = new Error('Campus não encontrado para atualização.');
    erro.code = 'CAMPUS_NAO_ENCONTRADO';
    throw erro;
  }

  const nome = String(dados.nome || campusAtual.nome || '').trim();
  const nomeExibicao = String(dados.nomeExibicao || campusAtual.nome_exibicao || campusAtual.nome || '').trim();
  const email = normalizarEmail(dados.email || campusAtual.email);
  const senhaInformada = String(dados.senha || '').trim();
  const senha = senhaInformada || String(campusAtual.senha || senhaPadraoCampus).trim();
  const cidade = String(dados.cidade || campusAtual.cidade || '').trim() || 'Não informado';

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
    'UPDATE campus SET nome = ?, nome_exibicao = ?, cidade = ?, email = ?, senha = ?, slug = ? WHERE id = ?',
    [nome, nomeExibicao, cidade, email, senha, slug, campusAtual.id]
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
    banned: Boolean(campusAtual.banned),
    banMotivo: campusAtual.ban_motivo || ''
  });
}

async function adicionarCampus(dados) {
  const nome = String(dados.nome || '').trim();
  const nomeExibicao = String(dados.nomeExibicao || '').trim();
  const email = normalizarEmail(dados.email);
  const senha = String(dados.senha || senhaPadraoCampus).trim();
  const cidade = String(dados.cidade || '').trim() || 'Não informado';

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
    'INSERT INTO campus (nome, nome_exibicao, cidade, email, senha, slug, cor, banned, ban_motivo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [nome, nomeExibicao, cidade, email, senha, slug, '#2980b9', 0, '']
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
    banned: false,
    banMotivo: ''
  });
}

module.exports = {
  senhaPadraoCampus,
  listarCampi,
  listarCampiSync,
  obterCampusPorSlug,
  obterCampusPorEmail,
  listarCredenciaisCampus,
  atualizarCampus,
  adicionarCampus,
  banCampus,
  desbanirCampus,
  removerCampus
};
