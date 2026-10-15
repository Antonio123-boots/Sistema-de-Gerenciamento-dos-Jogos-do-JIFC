const pool = require('../config/db');
const { gerarSlug } = require('../utils/slug');

const COLUNAS_DISPUTA_PONTOS = ['disputa_pontos_1', 'disputa_pontos_2'];
const TABELAS_SUB_CATEGORIA = ['chaves', 'jogos'];

function interpolarNomeSeguro(valor, permitidos, contexto) {
  if (!permitidos.includes(valor)) {
    throw new Error(`Nome não permitido para ${contexto}: ${valor}`);
  }
  return valor;
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

let mataMataGarantido = false;

async function ensureMataMataColumns() {
  if (mataMataGarantido) return;

  const [columns] = await pool.query(
    "SELECT COLUMN_NAME AS column_name, IS_NULLABLE AS is_nullable, COLUMN_TYPE AS column_type FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'jogos'"
  );
  const existing = new Set(columns.map((column) => column.column_name));

  const alterStatements = [
    ['rotulo_casa', "ALTER TABLE jogos ADD COLUMN rotulo_casa VARCHAR(24) DEFAULT NULL"],
    ['rotulo_fora', "ALTER TABLE jogos ADD COLUMN rotulo_fora VARCHAR(24) DEFAULT NULL"],
    ['numero_jogo', "ALTER TABLE jogos ADD COLUMN numero_jogo INT DEFAULT NULL"]
  ];

  for (const [columnName, statement] of alterStatements) {
    if (existing.has(columnName)) {
      continue;
    }
    try {
      await pool.query(statement);
      existing.add(columnName);
    } catch (error) {
      if (!/Duplicate column|already exists/i.test(error.message || '')) {
        throw error;
      }
    }
  }

  const dataHora = columns.find((column) => column.column_name === 'data_hora');
  if (dataHora && String(dataHora.is_nullable).toUpperCase() === 'NO') {
    await pool.query('ALTER TABLE jogos MODIFY COLUMN data_hora DATETIME NULL');
  }

  const faseColumn = columns.find((column) => column.column_name === 'fase');
  if (faseColumn && !String(faseColumn.column_type || '').includes('Terceiro Lugar')) {
    await pool.query(
      "ALTER TABLE jogos MODIFY COLUMN fase ENUM('Fase de Grupos','Oitavas','Quartas','Semifinal','Final','Bateria Única','Eliminatória','Terceiro Lugar') NOT NULL"
    );
  }

  for (const nome of COLUNAS_DISPUTA_PONTOS) {
    if (!columns.find((column) => column.column_name === nome)) {
      await pool.query(`ALTER TABLE jogos ADD COLUMN ${interpolarNomeSeguro(nome, COLUNAS_DISPUTA_PONTOS, 'coluna de disputa')} INT DEFAULT NULL`);
    }
  }

  mataMataGarantido = true;
}

async function ensureModalidadeLimiteColumn() {
  try {
    await pool.query('ALTER TABLE modalidades ADD COLUMN limite_inscritos INT DEFAULT NULL');
  } catch (error) {
    if (!/Duplicate column|already exists/i.test(error.message || '')) {
      throw error;
    }
  }
}

let subCategoriaGarantida = false;

async function garantirSubCategoriaChavesJogos() {
  if (subCategoriaGarantida) return;

  for (const tabela of TABELAS_SUB_CATEGORIA) {
    try {
      await pool.query(`ALTER TABLE ${interpolarNomeSeguro(tabela, TABELAS_SUB_CATEGORIA, 'tabela')} ADD COLUMN sub_categoria VARCHAR(20) DEFAULT 'geral'`);
    } catch (error) {
      if (!/Duplicate column|already exists/i.test(error.message || '')) {
        throw error;
      }
    }
  }

  try {
    await pool.query('ALTER TABLE chaves DROP INDEX uq_modalidade_numero_chave');
  } catch (_) {
    // Índice antigo já removido/inexistente: ignora silenciosamente
  }

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

async function ensureProvasFormatoColumn() {
  try {
    await pool.query("ALTER TABLE provas ADD COLUMN formato VARCHAR(20) DEFAULT 'direta'");
  } catch (error) {
    if (!/Duplicate column|already exists/i.test(error.message || '')) {
      throw error;
    }
  }
}

async function ensureProvasPublicadoColumn() {
  try {
    await pool.query("ALTER TABLE provas ADD COLUMN publicado TINYINT(1) DEFAULT 0");
  } catch (error) {
    if (!/Duplicate column|already exists/i.test(error.message || '')) {
      throw error;
    }
  }
}

async function ensureResultadosXadrezPublicadoColumn() {
  try {
    await pool.query("ALTER TABLE resultados_xadrez ADD COLUMN publicado TINYINT(1) DEFAULT 0");
  } catch (error) {
    if (!/Duplicate column|already exists/i.test(error.message || '')) {
      throw error;
    }
  }
}

let bateriasGarantidas = false;

/* Colunas de baterias nas corridas: número da bateria e etapa (prova/final).
   O índice único passa a permitir um resultado por etapa do atleta na mesma prova
   (bateria + final no 100m rasos). */
async function garantirColunasBateriasResultados() {
  if (bateriasGarantidas) return;

  const alterStatements = [
    "ALTER TABLE resultados_atletismo ADD COLUMN numero_bateria INT DEFAULT 1",
    "ALTER TABLE resultados_atletismo ADD COLUMN numero_raia INT DEFAULT NULL",
    "ALTER TABLE resultados_atletismo ADD COLUMN etapa VARCHAR(10) DEFAULT 'prova'"
  ];

  for (const statement of alterStatements) {
    try {
      await pool.query(statement);
    } catch (error) {
      if (!/Duplicate column|already exists/i.test(error.message || '')) {
        throw error;
      }
    }
  }

  try {
    await pool.query('UPDATE resultados_atletismo SET etapa = \'prova\' WHERE etapa IS NULL OR etapa = \'\'');
  } catch (_) {
    console.warn('Aviso: Falha ao atualizar etapa em resultados_atletismo:', _.message || _);
  }

  try {
    await pool.query('ALTER TABLE resultados_atletismo DROP INDEX uq_prova_atleta');
  } catch (error) {
    if (!/check that column\/key|exists/i.test(error.message || '') && !/Unknown|doesn.t exist/i.test(error.message || '')) {
      throw error;
    }
  }

  try {
    await pool.query('ALTER TABLE resultados_atletismo ADD UNIQUE KEY uq_prova_atleta_etapa (prova_id, atleta_id, etapa)');
  } catch (error) {
    if (!/Duplicate key name|already exists/i.test(error.message || '')) {
      throw error;
    }
  }

  bateriasGarantidas = true;
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
      numero_bateria INT DEFAULT 1,
      numero_raia INT DEFAULT NULL,
      etapa VARCHAR(10) DEFAULT 'prova',
      FOREIGN KEY (prova_id) REFERENCES provas(id) ON DELETE CASCADE,
      FOREIGN KEY (atleta_id) REFERENCES atletas(id) ON DELETE CASCADE,
      UNIQUE KEY uq_prova_atleta_etapa (prova_id, atleta_id, etapa)
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
    } catch (_) {
      console.warn('Aviso: Falha ao preparar colunas de resultados_atletismo:', _.message || _);
    }
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

async function ensureBoletinsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS boletins_finais (
      id INT AUTO_INCREMENT PRIMARY KEY,
      ano_jifc INT NOT NULL,
      resumo_json JSON DEFAULT NULL,
      modalidades_json JSON DEFAULT NULL,
      ranking_json JSON DEFAULT NULL,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_ano_jifc (ano_jifc)
    )
  `);
}

async function ensureRascunhoEdicoesTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rascunho_edicoes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      admin_email VARCHAR(150) NOT NULL,
      ano_jifc INT DEFAULT NULL,
      etapa VARCHAR(40) DEFAULT 'dados',
      dados_json LONGTEXT NOT NULL,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_rascunho_admin (admin_email)
    )
  `);
}

async function ensureEdicoesAnterioresTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS edicoes_anteriores (
      id INT AUTO_INCREMENT PRIMARY KEY,
      ano_jifc INT NOT NULL,
      titulo VARCHAR(150) DEFAULT NULL,
      origem ENUM('auto','importada') NOT NULL DEFAULT 'auto',
      dados_json LONGTEXT NOT NULL,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_edicao_ano (ano_jifc)
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

/* Status de validação do atleta (Analise/Regular/Reprovado) e participações
   no tênis de mesa, que antes viviam apenas no state store. */
async function ensureAtletasStatusColumns() {
  const novasColunas = [
    ['status', "ALTER TABLE atletas ADD COLUMN status VARCHAR(20) DEFAULT 'Analise'"],
    ['tenis_mesa_participacoes', 'ALTER TABLE atletas ADD COLUMN tenis_mesa_participacoes TEXT DEFAULT NULL']
  ];

  const [columns] = await pool.query(
    "SELECT COLUMN_NAME AS column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'atletas'"
  );
  const existing = new Set(columns.map((c) => c.column_name));

  for (const [columnName, statement] of novasColunas) {
    if (existing.has(columnName)) {
      continue;
    }
    try {
      await pool.query(statement);
      existing.add(columnName);
    } catch (error) {
      if (error && error.code !== 'ER_DUP_FIELDNAME') {
        throw error;
      }
    }
  }
}

/* Cria a tabela de configurações do evento (se ainda não existir) com as
   colunas legadas do state store, e relaxa datas de inscrição p/ estados
   parciais em bancos que já tenham a tabela com NOT NULL. */
async function ensureConfiguracoesEventoTable() {
  const [tabela] = await pool.query(
    "SELECT COUNT(*) AS total FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'configuracoes_evento'"
  );

  if (Number(tabela[0]?.total || 0) === 0) {
    await pool.query(`
      CREATE TABLE configuracoes_evento (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ano_evento INT NOT NULL DEFAULT 2026,
        inicio_evento DATE NULL,
        fim_evento DATE NULL,
        inicio_inscricao_modalidades DATE NULL,
        fim_inscricao_modalidades DATE NULL,
        inicio_inscricao_atletas DATE NULL,
        fim_inscricao_atletas DATE NULL,
        inicio_sorteio_chaves DATE NULL,
        fim_sorteio_chaves DATE NULL,
        limite_atletas_total_campus INT NOT NULL DEFAULT 0,
        CONSTRAINT chk_fluxo_cronologico CHECK (
          inicio_inscricao_modalidades <= fim_inscricao_modalidades AND
          fim_inscricao_modalidades <= inicio_inscricao_atletas AND
          inicio_inscricao_atletas <= fim_inscricao_atletas AND
          fim_inscricao_atletas <= inicio_sorteio_chaves AND
          inicio_sorteio_chaves <= fim_sorteio_chaves
        )
      )
    `);
    return;
  }

  const [columns] = await pool.query(
    "SELECT COLUMN_NAME AS column_name, IS_NULLABLE AS is_nullable FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'configuracoes_evento'"
  );
  const porNome = new Map(columns.map((c) => [c.column_name, c]));

  const novasColunas = [
    ['inicio_evento', 'ALTER TABLE configuracoes_evento ADD COLUMN inicio_evento DATE NULL'],
    ['fim_evento', 'ALTER TABLE configuracoes_evento ADD COLUMN fim_evento DATE NULL'],
    ['limite_atletas_total_campus', 'ALTER TABLE configuracoes_evento ADD COLUMN limite_atletas_total_campus INT NOT NULL DEFAULT 0']
  ];

  for (const [columnName, statement] of novasColunas) {
    if (porNome.has(columnName)) {
      continue;
    }
    try {
      await pool.query(statement);
      porNome.set(columnName, {});
    } catch (error) {
      if (error && error.code !== 'ER_DUP_FIELDNAME') {
        throw error;
      }
    }
  }

  const colunasDatas = [
    'inicio_inscricao_modalidades', 'fim_inscricao_modalidades',
    'inicio_inscricao_atletas', 'fim_inscricao_atletas',
    'inicio_sorteio_chaves', 'fim_sorteio_chaves'
  ];

  for (const columnName of colunasDatas) {
    const info = porNome.get(columnName);
    if (info && String(info.is_nullable || '').toUpperCase() === 'NO') {
      try {
        await pool.query(`ALTER TABLE configuracoes_evento MODIFY COLUMN ${columnName} DATE NULL`);
      } catch (_) {
        // coluna ausente ou já alterada; ignora
      }
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
   (Masculino/Feminino). O juiz NÃO cadastra provas — apenas lança resultados.
   Também define/atualiza o formato das provas padrão (baterias nas corridas,
   sendo o 100m rasos o único com final). */
async function sincronizarProvasPadraoAtletismo() {
  try {
    const {
      PROVAS_ATLETISMO_EXIBICAO,
      MAPA_PROVAS_INSCRICAO,
      normalizarTextoProva,
      resolverSlugDaProva
    } = require('../utils/atletismoProvas');
    const [modalidades] = await pool.query("SELECT id FROM modalidades WHERE LOWER(nome) LIKE '%atletismo%'");
    if (!modalidades.length) return;

    /* Gera variações normalizadas do nome ("100m" ≡ "100m rasos") para
       evitar recriar provas já existentes com grafia diferente. */
    const gerarVariantesNome = (nomes) => {
      const conjunto = new Set();
      (Array.isArray(nomes) ? nomes : []).forEach((nome) => {
        const norm = normalizarTextoProva(nome);
        if (!norm) return;
        conjunto.add(norm);
        const semRasos = norm.replace(/\brasos\b/g, '').replace(/\s+/g, ' ').trim();
        if (semRasos) conjunto.add(semRasos);
      });
      return conjunto;
    };

    const definirFormato = (tipoResultado, slugProva) => {
      if (tipoResultado !== 'tempo') return 'direta';
      return String(slugProva || '').toLowerCase() === '100m' ? 'baterias_com_final' : 'final_por_tempo';
    };

    for (const modalidade of modalidades) {
      const [existentes] = await pool.query(
        'SELECT id, nome, tipo_resultado, formato FROM provas WHERE modalidade_id = ?',
        [modalidade.id]
      );

      const nomesExistentes = new Set();
      existentes.forEach((p) => {
        gerarVariantesNome([p.nome]).forEach((variante) => nomesExistentes.add(variante));
        Object.keys(MAPA_PROVAS_INSCRICAO).forEach((slug) => {
          const aceitos = MAPA_PROVAS_INSCRICAO[slug];
          if (gerarVariantesNome(aceitos).has(normalizarTextoProva(p.nome))) {
            gerarVariantesNome(aceitos).forEach((variante) => nomesExistentes.add(variante));
          }
        });
      });

      let inseridas = 0;
      for (let i = 0; i < PROVAS_ATLETISMO_EXIBICAO.length; i++) {
        const prova = PROVAS_ATLETISMO_EXIBICAO[i];
        const aceitos = MAPA_PROVAS_INSCRICAO[prova.slug] || [];
        const variaveisProva = gerarVariantesNome([prova.nome, ...aceitos]);
        if ([...variaveisProva].some((variante) => nomesExistentes.has(variante))) continue;

        const tipoResultado = ['Corrida', 'Revezamento'].includes(prova.grupo) ? 'tempo' : 'medida';
        await pool.query(
          'INSERT INTO provas (modalidade_id, nome, tipo_resultado, ordem, formato) VALUES (?, ?, ?, ?, ?)',
          [modalidade.id, prova.nome, tipoResultado, i + 1, definirFormato(tipoResultado, prova.slug)]
        );
        gerarVariantesNome([prova.nome, ...aceitos]).forEach((variante) => nomesExistentes.add(variante));
        inseridas++;
      }

      // Atualiza o formato das provas padrão já criadas (ex.: corridas passam a ter baterias)
      for (const p of existentes) {
        const slugResolvido = resolverSlugDaProva(p.nome);
        if (!slugResolvido) continue;
        const formatoEsperado = definirFormato(String(p.tipo_resultado || ''), slugResolvido);
        if ((p.formato || '') !== formatoEsperado) {
          await pool.query('UPDATE provas SET formato = ? WHERE id = ?', [formatoEsperado, p.id]);
        }
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
  await ensureConfiguracoesEventoTable();
  await ensureJogoPublicadoColumn();
  await ensureJogoWoColumn();
  await ensureModalidadeLimiteColumn();
  await garantirSubCategoriaChavesJogos();
  await ensureJuizModalidadeTable();
  await ensureCartoesTable();
  await ensureResultadosPorSetsTable();
  await ensureClassificacaoCartoesColumns();
  await ensureProvasTable();
  await ensureProvasFormatoColumn();
  await ensureProvasPublicadoColumn();
  await ensureResultadosAtletismoTable();
  await garantirColunasBateriasResultados();
  await ensureResultadosXadrezTable();
  await ensureResultadosXadrezPublicadoColumn();
  await ensureBoletinsTable();
  await ensureRascunhoEdicoesTable();
  await ensureEdicoesAnterioresTable();
  await ensureAtletasProvasColumn();
  await ensureAtletasStatusColumns();
  await sincronizarProvasPadraoAtletismo();

  // Migração única de dados legados do state store -> MySQL e carga do cache
  const campusModel = require('../models/campusModel');
  await campusModel.migrarDadosCampusDoStateParaBanco();
  await campusModel.carregarCacheDeInscricoesEAtletas();

  // Migra as configurações do state store para a tabela configuracoes_evento
  const { persistirConfiguracoesParaBanco } = require('../services/configService');
  try {
    await persistirConfiguracoesParaBanco();
  } catch (error) {
    console.error('Aviso: não foi possível espelhar as configurações no banco (valores atuais ignoram a ordem cronológica das etapas):', error.message);
  }

  try {
    const { recalcularTodasClassificacoes } = require('../services/classificacaoService');
    await recalcularTodasClassificacoes();
  } catch (error) {
    console.error('Erro ao recalcular classificações no startup:', error.message);
  }
}

module.exports = { ensureSchema, ensureCampusTable, ensureConfiguracoesEventoTable, ensureJogoPublicadoColumn, ensureJogoWoColumn, ensureMataMataColumns, garantirSubCategoriaChavesJogos, ensureJuizModalidadeTable, ensureCartoesTable, ensureResultadosPorSetsTable, ensureClassificacaoCartoesColumns, ensureProvasTable, ensureResultadosAtletismoTable, ensureResultadosXadrezTable, ensureAtletasProvasColumn, ensureProvasPublicadoColumn, ensureResultadosXadrezPublicadoColumn, ensureEdicoesAnterioresTable, ensureRascunhoEdicoesTable, sincronizarProvasAtletismoDoState, sincronizarProvasPadraoAtletismo };
