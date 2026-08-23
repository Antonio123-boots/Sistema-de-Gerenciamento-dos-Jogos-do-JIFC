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

async function ensureJogoWoColumn() {
  try {
    await pool.query(`ALTER TABLE jogos ADD COLUMN wo TINYINT(1) DEFAULT 0`);
  } catch (error) {
    if (!/Duplicate column|already exists/i.test(error.message || '')) {
      throw error;
    }
  }
}

let subCategoriaGarantida = false;

async function garantirSubCategoriaChavesJogos() {
  if (subCategoriaGarantida) return;

  for (const tabela of ['chaves', 'jogos']) {
    try {
      await pool.query(`ALTER TABLE ${tabela} ADD COLUMN sub_categoria VARCHAR(20) DEFAULT 'geral'`);
    } catch (error) {
      if (!/Duplicate column|already exists/i.test(error.message || '')) {
        throw error;
      }
    }
  }

  try {
    await pool.query('ALTER TABLE chaves DROP INDEX uq_modalidade_numero_chave');
  } catch (_) {}

  try {
    await pool.query('ALTER TABLE chaves ADD UNIQUE KEY uq_modalidade_sub_numero (modalidade_id, sub_categoria, numero_chave)');
  } catch (error) {
    if (!/Duplicate key name|already exists/i.test(error.message || '')) {
      throw error;
    }
  }

  try {
    await pool.query(`
      UPDATE jogos j
      JOIN modalidades m ON m.id = j.modalidade_id
      SET j.sub_categoria = CASE
        WHEN LOWER(m.nome) LIKE '%tenis%' AND (j.atleta_1_id IS NOT NULL OR j.atleta_2_id IS NOT NULL) THEN 'individual'
        WHEN LOWER(m.nome) LIKE '%tenis%' THEN 'dupla'
        ELSE 'geral'
      END
      WHERE j.sub_categoria IS NULL OR j.sub_categoria = ''
    `);
    await pool.query(`
      UPDATE chaves c
      LEFT JOIN jogos j ON j.chave_id = c.id
      SET c.sub_categoria = COALESCE((
        SELECT MAX(j2.sub_categoria)
        FROM jogos j2
        WHERE j2.chave_id = c.id AND j2.sub_categoria IS NOT NULL
      ), 'geral')
      WHERE c.sub_categoria IS NULL OR c.sub_categoria = ''
    `);
    subCategoriaGarantida = true;
  } catch (error) {
    console.error('Erro ao preencher sub_categoria de chaves/jogos:', error.message);
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

async function ensureCartoesTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cartoes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      jogo_id INT NOT NULL,
      campus_id INT NOT NULL,
      tipo ENUM('amarelo', 'vermelho') NOT NULL,
      jogador_nome VARCHAR(100) DEFAULT NULL,
      minuto INT DEFAULT NULL,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (jogo_id) REFERENCES jogos(id) ON DELETE CASCADE,
      FOREIGN KEY (campus_id) REFERENCES campus(id) ON DELETE CASCADE
    )
  `);
}

async function ensureResultadosPorSetsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS resultados_por_sets (
      id INT AUTO_INCREMENT PRIMARY KEY,
      jogo_id INT NOT NULL,
      numero_set INT NOT NULL,
      pontos_1 INT NOT NULL DEFAULT 0,
      pontos_2 INT NOT NULL DEFAULT 0,
      FOREIGN KEY (jogo_id) REFERENCES jogos(id) ON DELETE CASCADE,
      UNIQUE KEY uq_jogo_set (jogo_id, numero_set)
    )
  `);
}

async function ensureClassificacaoCartoesColumns() {
  const [columns] = await pool.query(
    "SELECT COLUMN_NAME AS column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'classificacao_grupos'"
  );
  const existing = new Set(columns.map((c) => c.column_name));

  const novasColunas = [
    ['cartoes_amarelos', 'ALTER TABLE classificacao_grupos ADD COLUMN cartoes_amarelos INT DEFAULT 0'],
    ['cartoes_vermelhos', 'ALTER TABLE classificacao_grupos ADD COLUMN cartoes_vermelhos INT DEFAULT 0'],
    ['sets_ganhos', 'ALTER TABLE classificacao_grupos ADD COLUMN sets_ganhos INT DEFAULT 0'],
    ['sets_perdidos', 'ALTER TABLE classificacao_grupos ADD COLUMN sets_perdidos INT DEFAULT 0']
  ];

  for (const [name, sql] of novasColunas) {
    if (!existing.has(name)) {
      try {
        await pool.query(sql);
      } catch (error) {
        if (error && error.code !== 'ER_DUP_FIELDNAME') {
          throw error;
        }
      }
    }
  }
}

async function ensureProvasTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS provas (
      id INT AUTO_INCREMENT PRIMARY KEY,
      modalidade_id INT NOT NULL,
      nome VARCHAR(150) NOT NULL,
      tipo_resultado ENUM('tempo', 'medida') NOT NULL DEFAULT 'medida',
      ordem INT DEFAULT 0,
      FOREIGN KEY (modalidade_id) REFERENCES modalidades(id) ON DELETE CASCADE
    )
  `);
}

async function ensureResultadosAtletismoTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS resultados_atletismo (
      id INT AUTO_INCREMENT PRIMARY KEY,
      prova_id INT NOT NULL,
      atleta_id INT NOT NULL,
      resultado_tempo TIME(3) DEFAULT NULL,
      resultado_medida DECIMAL(10,2) DEFAULT NULL,
      posicao_final INT DEFAULT NULL,
      pontos INT DEFAULT 0,
      FOREIGN KEY (prova_id) REFERENCES provas(id) ON DELETE CASCADE,
      FOREIGN KEY (atleta_id) REFERENCES atletas(id) ON DELETE CASCADE,
      UNIQUE KEY uq_prova_atleta (prova_id, atleta_id)
    )
  `);

  const [columns] = await pool.query(
    "SELECT COLUMN_NAME AS column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'resultados_atletismo'"
  );
  const existing = new Set(columns.map((c) => c.column_name));

  if (!existing.has('prova_id')) {
    try {
      await pool.query('ALTER TABLE resultados_atletismo ADD COLUMN prova_id INT DEFAULT NULL');
      await pool.query('ALTER TABLE resultados_atletismo ADD COLUMN pontos INT DEFAULT 0');
      await pool.query('ALTER TABLE resultados_atletismo DROP FOREIGN KEY resultados_atletismo_ibfk_1');
      await pool.query('ALTER TABLE resultados_atletismo DROP COLUMN jogo_id');
      await pool.query('ALTER TABLE resultados_atletismo ADD UNIQUE KEY uq_prova_atleta (prova_id, atleta_id)');
    } catch (_) {}
  }
}

async function ensureResultadosXadrezTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS resultados_xadrez (
      id INT AUTO_INCREMENT PRIMARY KEY,
      modalidade_id INT NOT NULL,
      atleta_id INT NOT NULL,
      pontuacao DECIMAL(4,1) DEFAULT 0,
      vitorias INT DEFAULT 0,
      derrotas INT DEFAULT 0,
      empates INT DEFAULT 0,
      FOREIGN KEY (modalidade_id) REFERENCES modalidades(id) ON DELETE CASCADE,
      FOREIGN KEY (atleta_id) REFERENCES atletas(id) ON DELETE CASCADE,
      UNIQUE KEY uq_modalidade_atleta (modalidade_id, atleta_id)
    )
  `);
}

async function ensureAtletasProvasColumn() {
  try {
    await pool.query("ALTER TABLE atletas ADD COLUMN provas_atletismo TEXT DEFAULT NULL");
  } catch (error) {
    if (!/Duplicate column|already exists/i.test(error.message || '')) {
      throw error;
    }
  }
}

/* Garante que as provas de atletismo escolhidas na inscrição estejam no banco:
   1) sincroniza atletas do state store que não existem no banco;
   2) preenche a coluna provas_atletismo de quem já existe (por campus + matrícula) */
async function sincronizarProvasAtletismoDoState() {
  try {
    const campusModel = require('../models/campusModel');
    const sincronizados = await campusModel.sincronizarAtletasComProvasNoBanco();
    if (sincronizados > 0) {
      console.log(`Atletas com provas de atletismo sincronizados no banco: ${sincronizados}`);
    }
  } catch (error) {
    console.error('Erro ao sincronizar atletas do state store:', error.message);
  }

  let atletasState = [];
  try {
    const campusModel = require('../models/campusModel');
    atletasState = campusModel.getAtletasParaAnalise() || [];
  } catch (error) {
    console.error('Erro ao ler atletas do state store:', error.message);
    return;
  }

  const lista = atletasState.filter((atleta) =>
    Array.isArray(atleta.atletismoProvas) && atleta.atletismoProvas.length
    && String(atleta.matricula || '').trim()
    && String(atleta.campus || '').trim()
  );

  for (const atleta of lista) {
    try {
      const [campusRows] = await pool.query(
        'SELECT id FROM campus WHERE nome = ? OR nome_exibicao = ? LIMIT 1',
        [atleta.campus, atleta.campus]
      );
      const campusId = campusRows[0] ? campusRows[0].id : null;
      if (!campusId) continue;

      await pool.query(
        'UPDATE atletas SET provas_atletismo = ? WHERE campus_id = ? AND matricula = ?',
        [JSON.stringify(atleta.atletismoProvas), campusId, String(atleta.matricula).replace(/\D/g, '')]
      );
    } catch (error) {
      console.error('Erro ao sincronizar provas de atletismo do atleta:', error.message);
    }
  }
}

/* Garante que as 15 provas padrão de atletismo existam no banco para cada modalidade
   (Masculino/Feminino). O juiz NÃO cadastra provas — apenas lança resultados. */
async function sincronizarProvasPadraoAtletismo() {
  try {
    const { PROVAS_ATLETISMO_EXIBICAO, MAPA_PROVAS_INSCRICAO, normalizarTextoProva } = require('../utils/atletismoProvas');
    const [modalidades] = await pool.query("SELECT id FROM modalidades WHERE LOWER(nome) LIKE '%atletismo%'");
    if (!modalidades.length) return;

    for (const modalidade of modalidades) {
      const [existentes] = await pool.query('SELECT nome FROM provas WHERE modalidade_id = ?', [modalidade.id]);
      const nomesExistentes = new Set();
      existentes.forEach((p) => {
        nomesExistentes.add(normalizarTextoProva(p.nome));
        (MAPA_PROVAS_INSCRICAO[Object.keys(MAPA_PROVAS_INSCRICAO).find((slug) => (MAPA_PROVAS_INSCRICAO[slug] || []).some((n) => normalizarTextoProva(n) === normalizarTextoProva(p.nome)))] || [])
          .forEach((n) => nomesExistentes.add(normalizarTextoProva(n)));
      });

      let inseridas = 0;
      for (let i = 0; i < PROVAS_ATLETISMO_EXIBICAO.length; i++) {
        const prova = PROVAS_ATLETISMO_EXIBICAO[i];
        const aceitos = MAPA_PROVAS_INSCRICAO[prova.slug] || [];
        if (aceitos.some((nome) => nomesExistentes.has(normalizarTextoProva(nome)))) continue;

        const tipoResultado = ['Corrida', 'Revezamento'].includes(prova.grupo) ? 'tempo' : 'medida';
        await pool.query(
          'INSERT INTO provas (modalidade_id, nome, tipo_resultado, ordem) VALUES (?, ?, ?, ?)',
          [modalidade.id, prova.nome, tipoResultado, i + 1]
        );
        aceitos.forEach((nome) => nomesExistentes.add(normalizarTextoProva(nome)));
        inseridas++;
      }

      if (inseridas > 0) {
        console.log(`Provas padrão de atletismo criadas para a modalidade ${modalidade.id}: ${inseridas}`);
      }
    }
  } catch (error) {
    console.error('Erro ao sincronizar provas padrão de atletismo:', error.message);
  }
}

async function ensureSchema() {
  await ensureCampusTable();
  await ensureJogoPublicadoColumn();
  await ensureJogoWoColumn();
  await garantirSubCategoriaChavesJogos();
  await ensureJuizModalidadeTable();
  await ensureCartoesTable();
  await ensureResultadosPorSetsTable();
  await ensureClassificacaoCartoesColumns();
  await ensureProvasTable();
  await ensureResultadosAtletismoTable();
  await ensureResultadosXadrezTable();
  await ensureAtletasProvasColumn();
  await sincronizarProvasPadraoAtletismo();
  await sincronizarProvasAtletismoDoState();

  try {
    const { recalcularTodasClassificacoes } = require('../services/classificacaoService');
    await recalcularTodasClassificacoes();
  } catch (error) {
    console.error('Erro ao recalcular classificações no startup:', error.message);
  }
}

module.exports = { ensureSchema, ensureCampusTable, ensureJogoPublicadoColumn, ensureJogoWoColumn, garantirSubCategoriaChavesJogos, ensureJuizModalidadeTable, ensureCartoesTable, ensureResultadosPorSetsTable, ensureClassificacaoCartoesColumns, ensureProvasTable, ensureResultadosAtletismoTable, ensureResultadosXadrezTable, ensureAtletasProvasColumn, sincronizarProvasAtletismoDoState, sincronizarProvasPadraoAtletismo };
