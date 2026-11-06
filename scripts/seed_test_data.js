const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('path');
const argon2 = require('argon2');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

let dbPassword = process.env.DB_PASSWORD;
if (dbPassword === '""' || dbPassword === "''" || !dbPassword) dbPassword = '';

/* A senha dos campi vem SEMPRE do ambiente e é gravada com hash argon2. */
const SENHA_CAMPUS = String(process.env.DEFAULT_CAMPUS_PASSWORD || '').trim();
if (!SENHA_CAMPUS) {
  console.error('DEFAULT_CAMPUS_PASSWORD não definida no .env.');
  process.exit(1);
}
let senhaCampus = null;

const campusList = [
  'IFC Abelardo Luz','IFC Araquari','IFC Blumenau','IFC Brusque','IFC Camboriú','IFC Concórdia','IFC Fraiburgo','IFC Ibirama','IFC Luzerna','IFC Rio do Sul','IFC Santa Rosa do Sul','IFC São Bento do Sul','IFC São Francisco do Sul','IFC Sombrio','IFC Videira'
];

const modalidadesList = [
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
  { nome: 'Xadrez', genero: 'Feminino', tipo_confronto: 'Individual', formato_disputa: 'Sistema Suico' },
];

(async () => {
  senhaCampus = await argon2.hash(SENHA_CAMPUS);
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'root',
    password: dbPassword,
    database: process.env.DB_NAME || 'jifc'
  });

  try {
    await conn.query('CREATE TABLE IF NOT EXISTS campus (id INT AUTO_INCREMENT PRIMARY KEY, nome VARCHAR(100) NOT NULL UNIQUE, nome_exibicao VARCHAR(100) DEFAULT NULL, cidade VARCHAR(100) DEFAULT NULL, email VARCHAR(100) NOT NULL UNIQUE, senha VARCHAR(255) NOT NULL, slug VARCHAR(100) NOT NULL UNIQUE, cor VARCHAR(20) DEFAULT "#2980b9", foto_perfil VARCHAR(255) DEFAULT "/imagens/avatar.svg", banned TINYINT(1) DEFAULT 0, ban_motivo TEXT DEFAULT NULL, criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP)');
    await conn.query('CREATE TABLE IF NOT EXISTS modalidades (id INT AUTO_INCREMENT PRIMARY KEY, nome VARCHAR(100) NOT NULL, genero ENUM(\'Masculino\', \'Feminino\') NOT NULL, tipo_confronto ENUM(\'Coletivo\', \'Individual\') NOT NULL, formato_disputa ENUM(\'Grupos + Mata-Mata\', \'Sistema Suico\', \'Baterias por Tempo\') NOT NULL, icone VARCHAR(255) DEFAULT NULL, UNIQUE KEY uq_modalidade_genero (nome, genero))');
    await conn.query('CREATE TABLE IF NOT EXISTS atletas (id INT AUTO_INCREMENT PRIMARY KEY, campus_id INT NOT NULL, nome VARCHAR(100) NOT NULL, cpf CHAR(11) NOT NULL UNIQUE, rg VARCHAR(30) DEFAULT NULL, matricula VARCHAR(30) NOT NULL UNIQUE, genero ENUM(\'Masculino\', \'Feminino\') NOT NULL, data_nascimento DATE NOT NULL, criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (campus_id) REFERENCES campus(id) ON DELETE CASCADE)');
    await conn.query('CREATE TABLE IF NOT EXISTS atleta_modalidade (atleta_id INT NOT NULL, modalidade_id INT NOT NULL, PRIMARY KEY (atleta_id, modalidade_id), FOREIGN KEY (atleta_id) REFERENCES atletas(id) ON DELETE CASCADE, FOREIGN KEY (modalidade_id) REFERENCES modalidades(id) ON DELETE CASCADE)');
    await conn.query('CREATE TABLE IF NOT EXISTS campus_modalidade (campus_id INT NOT NULL, modalidade_id INT NOT NULL, chave_id INT DEFAULT NULL, PRIMARY KEY (campus_id, modalidade_id), FOREIGN KEY (campus_id) REFERENCES campus(id) ON DELETE CASCADE, FOREIGN KEY (modalidade_id) REFERENCES modalidades(id) ON DELETE CASCADE)');
    const [columns] = await conn.query("SELECT COLUMN_NAME FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'campus'");
    const existingColumns = new Set(columns.map((column) => column.COLUMN_NAME));
    for (const [columnName, statement] of [
      ['nome_exibicao', "ALTER TABLE campus ADD COLUMN nome_exibicao VARCHAR(100) DEFAULT NULL"],
      ['cidade', "ALTER TABLE campus ADD COLUMN cidade VARCHAR(100) DEFAULT NULL"],
      ['slug', "ALTER TABLE campus ADD COLUMN slug VARCHAR(100) DEFAULT NULL"],
      ['cor', "ALTER TABLE campus ADD COLUMN cor VARCHAR(20) DEFAULT '#2980b9'"],
      ['foto_perfil', "ALTER TABLE campus ADD COLUMN foto_perfil VARCHAR(255) DEFAULT '/imagens/avatar.svg'"],
      ['banned', "ALTER TABLE campus ADD COLUMN banned TINYINT(1) DEFAULT 0"],
      ['ban_motivo', "ALTER TABLE campus ADD COLUMN ban_motivo TEXT DEFAULT NULL"]
    ]) {
      if (!existingColumns.has(columnName)) {
        await conn.query(statement);
        existingColumns.add(columnName);
      }
    }

    for (const nomeCampus of campusList) {
      const slug = nomeCampus.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const email = `${slug}@ifc.edu.br`;
      const [existing] = await conn.query('SELECT id FROM campus WHERE nome = ? OR email = ?', [nomeCampus, email]);
      if (existing.length === 0) {
        await conn.query('INSERT INTO campus (nome, nome_exibicao, cidade, email, senha, slug, cor, banned, ban_motivo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [nomeCampus, nomeCampus, nomeCampus, email, senhaCampus, slug, '#2980b9', 0, '']);
      }
    }

    for (const modalidade of modalidadesList) {
      const [existing] = await conn.query('SELECT id FROM modalidades WHERE nome = ? AND genero = ?', [modalidade.nome, modalidade.genero]);
      if (existing.length === 0) {
        await conn.query('INSERT INTO modalidades (nome, genero, tipo_confronto, formato_disputa) VALUES (?, ?, ?, ?)', [modalidade.nome, modalidade.genero, modalidade.tipo_confronto, modalidade.formato_disputa]);
      }
    }

    const [campusRows] = await conn.query('SELECT id, nome FROM campus ORDER BY id');
    const [modalidadeRows] = await conn.query('SELECT id, nome, genero FROM modalidades ORDER BY id');
    const modalityMap = new Map(modalidadeRows.map(row => [`${row.nome}:${row.genero}`, row.id]));

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
      const matricula = String(atletaCounter).padStart(9, '0');
      const [existingAtleta] = await conn.query('SELECT id FROM atletas WHERE cpf = ?', [cpf]);
      if (existingAtleta.length === 0) {
        await conn.query('INSERT INTO atletas (campus_id, nome, cpf, matricula, genero, data_nascimento) VALUES (?, ?, ?, ?, ?, ?)', [campus.id, atletaNome, cpf, matricula, genero, '2006-01-01']);
      }
      atletaCounter += 1;
    }

    const [allAtletas] = await conn.query('SELECT id, campus_id, genero FROM atletas ORDER BY id');
    const [allModalidades] = await conn.query('SELECT id, nome, genero FROM modalidades ORDER BY id');
    for (const atleta of allAtletas) {
      for (const modalidade of allModalidades) {
        const [hasLink] = await conn.query('SELECT 1 FROM atleta_modalidade WHERE atleta_id = ? AND modalidade_id = ?', [atleta.id, modalidade.id]);
        if (hasLink.length === 0) {
          await conn.query('INSERT INTO atleta_modalidade (atleta_id, modalidade_id) VALUES (?, ?)', [atleta.id, modalidade.id]);
        }
      }
    }

    console.log('seed-ok');
  } finally {
    await conn.end();
  }
})();
