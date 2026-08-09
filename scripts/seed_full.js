const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const dbPassword = process.env.DB_PASSWORD === '""' || process.env.DB_PASSWORD === "''" || !process.env.DB_PASSWORD ? '' : process.env.DB_PASSWORD;

const campusBase = [
  { nome: 'IFC Abelardo Luz', nomeExibicao: 'Abelardo Luz', cidade: 'Abelardo Luz', slug: 'abelardo-luz', cor: '#00bcd4' },
  { nome: 'IFC Araquari', nomeExibicao: 'Araquari', cidade: 'Araquari', slug: 'araquari', cor: '#2ecc71' },
  { nome: 'IFC Blumenau', nomeExibicao: 'Blumenau', cidade: 'Blumenau', cor: '#f39c12' },
  { nome: 'IFC Brusque', nomeExibicao: 'Brusque', cidade: 'Brusque', cor: '#9b59b6' },
  { nome: 'IFC Camboriú', nomeExibicao: 'Camboriú', cidade: 'Camboriú', cor: '#e67e22' },
  { nome: 'IFC Concórdia', nomeExibicao: 'Concórdia', cidade: 'Concórdia', cor: '#1abc9c' },
  { nome: 'IFC Fraiburgo', nomeExibicao: 'Fraiburgo', cidade: 'Fraiburgo', cor: '#3498db' },
  { nome: 'IFC Ibirama', nomeExibicao: 'Ibirama', cidade: 'Ibirama', cor: '#e74c3c' },
  { nome: 'IFC Luzerna', nomeExibicao: 'Luzerna', cidade: 'Luzerna', cor: '#16a085' },
  { nome: 'IFC Rio do Sul', nomeExibicao: 'Rio do Sul', cidade: 'Rio do Sul', cor: '#8e44ad' },
  { nome: 'IFC Santa Rosa do Sul', nomeExibicao: 'Santa Rosa do Sul', cidade: 'Santa Rosa do Sul', cor: '#d35400' },
  { nome: 'IFC São Bento do Sul', nomeExibicao: 'São Bento do Sul', cidade: 'São Bento do Sul', cor: '#2980b9' },
  { nome: 'IFC São Francisco do Sul', nomeExibicao: 'São Francisco do Sul', cidade: 'São Francisco do Sul', cor: '#27ae60' },
  { nome: 'IFC Sombrio', nomeExibicao: 'Sombrio', cidade: 'Sombrio', cor: '#c0392b' },
  { nome: 'IFC Videira', nomeExibicao: 'Videira', cidade: 'Videira', cor: '#2c3e50' }
];

const modalidadesBase = [
  { nome: 'Futsal', genero: 'Masculino', tipo_confronto: 'Coletivo', formato_disputa: 'Grupos + Mata-Mata' },
  { nome: 'Futsal', genero: 'Feminino', tipo_confronto: 'Coletivo', formato_disputa: 'Grupos + Mata-Mata' },
  { nome: 'Vôlei', genero: 'Masculino', tipo_confronto: 'Coletivo', formato_disputa: 'Grupos + Mata-Mata' },
  { nome: 'Vôlei', genero: 'Feminino', tipo_confronto: 'Coletivo', formato_disputa: 'Grupos + Mata-Mata' },
  { nome: 'Basquete', genero: 'Masculino', tipo_confronto: 'Coletivo', formato_disputa: 'Grupos + Mata-Mata' },
  { nome: 'Basquete', genero: 'Feminino', tipo_confronto: 'Coletivo', formato_disputa: 'Grupos + Mata-Mata' },
  { nome: 'Handebol', genero: 'Masculino', tipo_confronto: 'Coletivo', formato_disputa: 'Grupos + Mata-Mata' },
  { nome: 'Handebol', genero: 'Feminino', tipo_confronto: 'Coletivo', formato_disputa: 'Grupos + Mata-Mata' },
  { nome: 'Atletismo', genero: 'Masculino', tipo_confronto: 'Individual', formato_disputa: 'Baterias por Tempo' },
  { nome: 'Atletismo', genero: 'Feminino', tipo_confronto: 'Individual', formato_disputa: 'Baterias por Tempo' },
  { nome: 'Tênis de Mesa', genero: 'Masculino', tipo_confronto: 'Individual', formato_disputa: 'Sistema Suico' },
  { nome: 'Tênis de Mesa', genero: 'Feminino', tipo_confronto: 'Individual', formato_disputa: 'Sistema Suico' },
  { nome: 'Xadrez', genero: 'Masculino', tipo_confronto: 'Individual', formato_disputa: 'Sistema Suico' },
  { nome: 'Xadrez', genero: 'Feminino', tipo_confronto: 'Individual', formato_disputa: 'Sistema Suico' }
];

function gerarSlug(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function ensureTableColumns(conn) {
  const [columns] = await conn.query("SELECT COLUMN_NAME FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'campus'");
  const existingColumns = new Set(columns.map((column) => column.COLUMN_NAME));
  const statements = [
    ['nome_exibicao', "ALTER TABLE campus ADD COLUMN nome_exibicao VARCHAR(100) DEFAULT NULL"],
    ['cidade', "ALTER TABLE campus ADD COLUMN cidade VARCHAR(100) DEFAULT NULL"],
    ['slug', "ALTER TABLE campus ADD COLUMN slug VARCHAR(100) DEFAULT NULL"],
    ['cor', "ALTER TABLE campus ADD COLUMN cor VARCHAR(20) DEFAULT '#2980b9'"],
    ['foto_perfil', "ALTER TABLE campus ADD COLUMN foto_perfil VARCHAR(255) DEFAULT '/imagens/avatar.svg'"],
    ['banned', "ALTER TABLE campus ADD COLUMN banned TINYINT(1) DEFAULT 0"],
    ['ban_motivo', "ALTER TABLE campus ADD COLUMN ban_motivo TEXT DEFAULT NULL"]
  ];

  for (const [columnName, statement] of statements) {
    if (!existingColumns.has(columnName)) {
      try {
        await conn.query(statement);
      } catch (error) {
        if (!String(error.message).includes('Duplicate column name')) {
          throw error;
        }
      }
      existingColumns.add(columnName);
    }
  }
}

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'root',
    password: dbPassword,
    database: process.env.DB_NAME || 'jifc'
  });

  try {
    await conn.query('CREATE TABLE IF NOT EXISTS campus (id INT AUTO_INCREMENT PRIMARY KEY, nome VARCHAR(100) NOT NULL UNIQUE, nome_exibicao VARCHAR(100) DEFAULT NULL, cidade VARCHAR(100) DEFAULT NULL, email VARCHAR(100) NOT NULL UNIQUE, senha VARCHAR(255) NOT NULL, slug VARCHAR(100) DEFAULT NULL, cor VARCHAR(20) DEFAULT "#2980b9", foto_perfil VARCHAR(255) DEFAULT "/imagens/avatar.svg", banned TINYINT(1) DEFAULT 0, ban_motivo TEXT DEFAULT NULL, criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP)');
    await conn.query('CREATE TABLE IF NOT EXISTS modalidades (id INT AUTO_INCREMENT PRIMARY KEY, nome VARCHAR(100) NOT NULL, genero ENUM("Masculino", "Feminino") NOT NULL, tipo_confronto ENUM("Coletivo", "Individual") NOT NULL, formato_disputa ENUM("Grupos + Mata-Mata", "Sistema Suico", "Baterias por Tempo") NOT NULL, icone VARCHAR(255) DEFAULT NULL, UNIQUE KEY uq_modalidade_genero (nome, genero))');
    await conn.query('CREATE TABLE IF NOT EXISTS atletas (id INT AUTO_INCREMENT PRIMARY KEY, campus_id INT NOT NULL, nome VARCHAR(100) NOT NULL, cpf CHAR(11) NOT NULL UNIQUE, matricula VARCHAR(30) NOT NULL UNIQUE, genero ENUM("Masculino", "Feminino") NOT NULL, data_nascimento DATE NOT NULL, criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (campus_id) REFERENCES campus(id) ON DELETE CASCADE)');
    await conn.query('CREATE TABLE IF NOT EXISTS atleta_modalidade (atleta_id INT NOT NULL, modalidade_id INT NOT NULL, PRIMARY KEY (atleta_id, modalidade_id), FOREIGN KEY (atleta_id) REFERENCES atletas(id) ON DELETE CASCADE, FOREIGN KEY (modalidade_id) REFERENCES modalidades(id) ON DELETE CASCADE)');
    await conn.query('CREATE TABLE IF NOT EXISTS campus_modalidade (campus_id INT NOT NULL, modalidade_id INT NOT NULL, chave_id INT DEFAULT NULL, PRIMARY KEY (campus_id, modalidade_id), FOREIGN KEY (campus_id) REFERENCES campus(id) ON DELETE CASCADE, FOREIGN KEY (modalidade_id) REFERENCES modalidades(id) ON DELETE CASCADE)');

    await ensureTableColumns(conn);

    for (const campus of campusBase) {
      const slug = campus.slug || gerarSlug(campus.nome);
      const email = `${slug}@ifc.edu.br`;
      const nomeExibicao = campus.nomeExibicao || campus.nome;
      const [existing] = await conn.query('SELECT id FROM campus WHERE nome = ? OR email = ?', [campus.nome, email]);
      if (existing.length === 0) {
        await conn.query(
          'INSERT INTO campus (nome, nome_exibicao, cidade, email, senha, slug, cor, banned, ban_motivo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [campus.nome, nomeExibicao, campus.cidade || nomeExibicao, email, 'jifc2026', slug, campus.cor || '#2980b9', 0, '']
        );
      } else {
        await conn.query(
          'UPDATE campus SET nome_exibicao = ?, cidade = ?, slug = ?, cor = ?, email = ? WHERE id = ?',
          [nomeExibicao, campus.cidade || nomeExibicao, slug, campus.cor || '#2980b9', email, existing[0].id]
        );
      }
    }

    for (const modalidade of modalidadesBase) {
      const [existing] = await conn.query('SELECT id FROM modalidades WHERE nome = ? AND genero = ?', [modalidade.nome, modalidade.genero]);
      if (existing.length === 0) {
        await conn.query('INSERT INTO modalidades (nome, genero, tipo_confronto, formato_disputa) VALUES (?, ?, ?, ?)', [modalidade.nome, modalidade.genero, modalidade.tipo_confronto, modalidade.formato_disputa]);
      }
    }

    const [campusRows] = await conn.query('SELECT id, nome FROM campus ORDER BY id');
    const [modalidadeRows] = await conn.query('SELECT id, nome, genero FROM modalidades ORDER BY id');

    for (const campus of campusRows) {
      for (const modalidade of modalidadeRows) {
        const [hasCampusMod] = await conn.query('SELECT 1 FROM campus_modalidade WHERE campus_id = ? AND modalidade_id = ?', [campus.id, modalidade.id]);
        if (hasCampusMod.length === 0) {
          await conn.query('INSERT INTO campus_modalidade (campus_id, modalidade_id) VALUES (?, ?)', [campus.id, modalidade.id]);
        }
      }
    }

    let atletaCounter = 1;
    for (const campus of campusRows) {
      const genero = atletaCounter % 2 === 0 ? 'Feminino' : 'Masculino';
      const atletaNome = `${campus.nome.replace('IFC ', '')} Atleta ${atletaCounter}`;
      const cpf = String(10000000000 + atletaCounter).slice(-11);
      const matricula = `MAT${String(atletaCounter).padStart(4, '0')}`;
      const [existingAtleta] = await conn.query('SELECT id FROM atletas WHERE cpf = ? OR matricula = ?', [cpf, matricula]);
      if (existingAtleta.length === 0) {
        const [insertResult] = await conn.query('INSERT INTO atletas (campus_id, nome, cpf, matricula, genero, data_nascimento) VALUES (?, ?, ?, ?, ?, ?)', [campus.id, atletaNome, cpf, matricula, genero, '2006-01-01']);
        const atletaId = insertResult.insertId;
        for (const modalidade of modalidadeRows) {
          const [hasLink] = await conn.query('SELECT 1 FROM atleta_modalidade WHERE atleta_id = ? AND modalidade_id = ?', [atletaId, modalidade.id]);
          if (hasLink.length === 0) {
            await conn.query('INSERT INTO atleta_modalidade (atleta_id, modalidade_id) VALUES (?, ?)', [atletaId, modalidade.id]);
          }
        }
      }
      atletaCounter += 1;
    }

    console.log('seed-full-ok');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
})();
