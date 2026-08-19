const pool = require('../config/db');
const { gerarSlug } = require('../utils/slug');

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
      foto_perfil VARCHAR(255) DEFAULT '/imagens/avatar.svg',
      banned TINYINT(1) DEFAULT 0,
      ban_motivo TEXT DEFAULT NULL,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const [columns] = await pool.query(
    "SELECT COLUMN_NAME AS column_name, COLUMN_TYPE AS column_type FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'campus'"
  );
  const existingColumns = new Set(columns.map((column) => column.column_name));
  const fotoPerfilColumn = columns.find((column) => column.column_name === 'foto_perfil');

  if (fotoPerfilColumn) {
    const columnType = String(fotoPerfilColumn.column_type || '').toLowerCase();
    if (!columnType.includes('varchar') && !columnType.includes('char')) {
      await pool.query("ALTER TABLE campus MODIFY COLUMN foto_perfil VARCHAR(255) DEFAULT '/imagens/avatar.svg'");
    }
  }

  const alterStatements = [
    ['nome_exibicao', "ALTER TABLE campus ADD COLUMN nome_exibicao VARCHAR(100) DEFAULT NULL"],
    ['cidade', "ALTER TABLE campus ADD COLUMN cidade VARCHAR(100) DEFAULT NULL"],
    ['slug', "ALTER TABLE campus ADD COLUMN slug VARCHAR(100) DEFAULT NULL"],
    ['cor', "ALTER TABLE campus ADD COLUMN cor VARCHAR(20) DEFAULT '#2980b9'"],
    ['foto_perfil', "ALTER TABLE campus ADD COLUMN foto_perfil VARCHAR(255) DEFAULT '/imagens/avatar.svg'"],
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

async function ensureJogoPublicadoColumn() {
  try {
    await pool.query(`ALTER TABLE jogos ADD COLUMN publicado TINYINT(1) DEFAULT 0`);
  } catch (error) {
    if (!/Duplicate column|already exists/i.test(error.message || '')) {
      throw error;
    }
  }
}

async function ensureJuizModalidadeTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS juiz_modalidade (
      juiz_id INT NOT NULL,
      esporte_nome VARCHAR(100) NOT NULL,
      PRIMARY KEY (juiz_id, esporte_nome),
      FOREIGN KEY (juiz_id) REFERENCES juizes(id) ON DELETE CASCADE
    )
  `);
}

async function ensureSchema() {
  await ensureCampusTable();
  await ensureJogoPublicadoColumn();
  await ensureJuizModalidadeTable();
}

module.exports = { ensureSchema, ensureCampusTable, ensureJogoPublicadoColumn, ensureJuizModalidadeTable };
