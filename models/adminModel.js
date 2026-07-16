// Importação da conexão ativa com o banco de dados MySQL/MariaDB
const db = require('../config/db');
const { readState, writeState, cloneState } = require('./stateStore');

// Configurações padrão usadas quando ainda não existe estado persistido em disco.
const configuracoesPadrao = {
  ano_evento: 2026,
  inicio_evento: '',
  fim_evento: '',
  inicio_inscricao_modalidades: '',
  fim_inscricao_modalidades: '',
  inicio_inscricao_atletas: '',
  fim_inscricao_atletas: '',
  inicio_sorteio_chaves: '',
  fim_sorteio_chaves: '',
  limite_atletas_total_campus: 0
};

function carregarConfiguracoes() {
  const estado = readState();
  return { ...configuracoesPadrao, ...(estado.configuracoes || {}) };
}

const atletasPendentes = [];

/**
 * Retorna as configurações locais guardadas em memória.
 */
function getConfiguracoes() {
  return cloneState(carregarConfiguracoes());
}

/**
 * Atualiza e mescla as novas datas configuradas pelo administrador em memória.
 */
function salvarConfiguracoes(novosDados) {
  const estadoAtual = readState();
  const configuracoesAtuais = { ...configuracoesPadrao, ...(estadoAtual.configuracoes || {}) };
  const inicioEvento = novosDados.inicio_evento || configuracoesAtuais.inicio_evento || '';
  const anoDerivado = Number(
    novosDados.ano_evento ||
    novosDados.anoEvento ||
    (inicioEvento ? new Date(`${inicioEvento}T00:00:00`).getFullYear() : configuracoesAtuais.ano_evento)
  );

  estadoAtual.configuracoes = {
    ...configuracoesAtuais,
    ...novosDados,
    ano_evento: Number.isFinite(anoDerivado) ? anoDerivado : configuracoesAtuais.ano_evento,
    limite_atletas_total_campus: Number(
      novosDados.limite_atletas_total_campus ?? configuracoesAtuais.limite_atletas_total_campus ?? 0
    )
  };

  writeState(estadoAtual);
  return getConfiguracoes();
}

function getAnoJifc() {
  const configuracoes = getConfiguracoes();
  const anoBase = Number(configuracoes.ano_evento) || new Date().getFullYear();

  if (!configuracoes.fim_evento) {
    return anoBase;
  }

  const limiteEvento = new Date(`${configuracoes.fim_evento}T23:59:59`);
  if (Number.isNaN(limiteEvento.getTime())) {
    return anoBase;
  }

  return new Date() > limiteEvento ? anoBase + 1 : anoBase;
}

/**
 * Retorna a lista de atletas pendentes em memória (contingência).
 */
function getAtletasPendentes() {
  return atletasPendentes.map((item) => ({ ...item }));
}

/**
 * Valida o status técnico/médico de um competidor local para 'Regular'.
 */
function validarAtleta(atletaId) {
  const atleta = atletasPendentes.find((item) => item.id === Number(atletaId));
  if (atleta) atleta.status = 'Regular';
  return atleta;
}

/**
 * FUNÇÃO DE COMPATIBILIDADE: Evita quebras em rotas legadas que buscam dados crus em memória
 */
async function getJogos() {
  try {
    const query = `
      SELECT j.id, j.fase, j.status,
             COALESCE(rc.placar_1, 0) AS placar_casa,
             COALESCE(rc.placar_2, 0) AS placar_fora,
             DATE_FORMAT(j.data_hora, '%d/%m') AS data,
             DATE_FORMAT(j.data_hora, '%H:%i') AS horario,
             c1.nome AS casa, c2.nome AS fora,
             a1.nome AS atletaCasa, a2.nome AS atletaFora,
             m.nome AS modalidade,
             m.tipo_confronto
      FROM jogos j
      JOIN modalidades m ON j.modalidade_id = m.id
      LEFT JOIN campus c1 ON j.campus_1_id = c1.id
      LEFT JOIN campus c2 ON j.campus_2_id = c2.id
      LEFT JOIN atletas a1 ON j.atleta_1_id = a1.id
      LEFT JOIN atletas a2 ON j.atleta_2_id = a2.id
      LEFT JOIN resultados_coletivos rc ON rc.jogo_id = j.id
      ORDER BY j.id ASC`;
    const [linhas] = await db.query(query);
    return linhas;
  } catch (error) {
    console.error('Erro ao buscar jogos:', error);
    return [];
  }
}

async function getJogoPorId(jogoId) {
  try {
    const [linhas] = await db.query('SELECT * FROM jogos WHERE id = ?', [jogoId]);
    return linhas[0] || null;
  } catch (error) {
    console.error('Erro ao buscar jogo:', error);
    return null;
  }
}

// =========================================================================
// MÉTODOS REAIS CONECTADOS AO BANCO DE DADOS (CORE DO CHAVEAMENTO)
// =========================================================================

/**
 * Busca a lista de configurações e prazos oficiais diretamente das tabelas do banco.
 */
async function getConfiguracoesBanco() {
  try {
    const [linhas] = await db.query('SELECT * FROM configuracoes_evento ORDER BY id DESC LIMIT 1');
    return linhas[0] || null;
  } catch (error) {
    console.error("Erro ao buscar configurações no banco:", error);
    return null;
  }
}

/**
 * Retorna a listagem completa das 15 modalidades do JIFC para popular o menu superior por gênero.
 */
async function getModalidadesBanco() {
  try {
    const [linhas] = await db.query(`
      SELECT *
      FROM modalidades
      WHERE nome NOT IN ('Tênis', 'Tenis')
      ORDER BY genero DESC, nome ASC
    `);
    return linhas;
  } catch (error) {
    console.error("Erro ao buscar modalidades no banco:", error);
    throw error;
  }
}

async function listarModalidadesConfiguracao() {
  try {
    const [linhas] = await db.query(`
      SELECT id, nome, genero, tipo_confronto, formato_disputa
      FROM modalidades
      WHERE nome NOT IN ('Tênis', 'Tenis')
      ORDER BY nome ASC, FIELD(genero, 'Masculino', 'Feminino', 'Misto') ASC
    `);
    return linhas;
  } catch (error) {
    console.error('Erro ao listar modalidades para configuração:', error);
    throw error;
  }
}

async function adicionarModalidade({ nome, tipoConfronto = 'Coletivo', formatoDisputa = 'Grupos + Mata-Mata', genero = 'Misto' }) {
  const nomeLimpo = String(nome || '').trim();
  if (!nomeLimpo) {
    throw new Error('Informe o nome da modalidade esportiva.');
  }

  const nomeNormalizado = nomeLimpo
    .replace(/^Tênis$/i, 'Tênis de Mesa')
    .replace(/^Basquetebol$/i, 'Basquete')
    .replace(/^Voleibol$/i, 'Vôlei')
    .trim();

  const tipo = String(tipoConfronto || 'Coletivo').trim();
  const formato = String(formatoDisputa || 'Grupos + Mata-Mata').trim();
  const generos = String(genero || 'Misto').toLowerCase() === 'misto' ? ['Misto'] : ['Masculino', 'Feminino'];

  const inseridos = [];
  for (const generoItem of generos) {
    const [existente] = await db.query('SELECT id FROM modalidades WHERE nome = ? AND genero = ?', [nomeNormalizado, generoItem]);
    if (!existente.length) {
      const [resultado] = await db.query(
        'INSERT INTO modalidades (nome, genero, tipo_confronto, formato_disputa) VALUES (?, ?, ?, ?)',
        [nomeNormalizado, generoItem, tipo, formato]
      );
      inseridos.push(resultado.insertId);
    }
  }

  return inseridos;
}

async function removerModalidadePorId(modalidadeId) {
  const [modalidadeRows] = await db.query('SELECT nome FROM modalidades WHERE id = ?', [modalidadeId]);
  if (!modalidadeRows.length) {
    throw new Error('Modalidade não encontrada.');
  }

  const nome = modalidadeRows[0].nome;
  const [linhas] = await db.query('SELECT id FROM modalidades WHERE nome = ?', [nome]);
  const ids = linhas.map((item) => item.id);

  if (!ids.length) return { removidos: 0, nome };

  const placeholders = ids.map(() => '?').join(',');

  await db.query('START TRANSACTION');
  try {
    await db.query(`DELETE FROM atleta_modalidade WHERE modalidade_id IN (${placeholders})`, ids);
    await db.query(`DELETE FROM campus_modalidade WHERE modalidade_id IN (${placeholders})`, ids);
    await db.query(`DELETE FROM chaves WHERE modalidade_id IN (${placeholders})`, ids);
    await db.query(`DELETE FROM jogos WHERE modalidade_id IN (${placeholders})`, ids);
    await db.query(`DELETE FROM modalidades WHERE id IN (${placeholders})`, ids);
    await db.query('COMMIT');
    return { removidos: ids.length, nome };
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}

async function getResumoInscricoes() {
  try {
    const [atletas] = await db.query(`
      SELECT
        am.modalidade_id,
        m.nome AS modalidade_nome,
        m.genero AS modalidade_genero,
        m.tipo_confronto,
        c.id AS campus_id,
        c.nome AS campus_nome,
        a.id AS atleta_id,
        a.nome AS atleta_nome,
        a.matricula,
        a.genero AS atleta_genero,
        DATE_FORMAT(a.data_nascimento, '%Y-%m-%d') AS data_nascimento
      FROM atleta_modalidade am
      JOIN atletas a ON am.atleta_id = a.id
      JOIN campus c ON a.campus_id = c.id
      JOIN modalidades m ON am.modalidade_id = m.id
      WHERE m.nome NOT IN ('Tênis', 'Tenis')
      ORDER BY c.nome ASC, m.genero DESC, m.nome ASC, a.genero ASC, a.nome ASC
    `);

    const [campi] = await db.query(`
      SELECT
        cm.modalidade_id,
        m.nome AS modalidade_nome,
        m.genero AS modalidade_genero,
        m.tipo_confronto,
        c.id AS campus_id,
        c.nome AS campus_nome
      FROM campus_modalidade cm
      JOIN campus c ON cm.campus_id = c.id
      JOIN modalidades m ON cm.modalidade_id = m.id
      WHERE m.nome NOT IN ('Tênis', 'Tenis')
      ORDER BY c.nome ASC, m.genero DESC, m.nome ASC
    `);

    const campusMap = new Map();

    function ensureCampus(campusId, campusNome) {
      const key = String(campusId);
      if (!campusMap.has(key)) {
        campusMap.set(key, {
          id: campusId,
          nome: campusNome,
          modalidades: []
        });
      }
      return campusMap.get(key);
    }

    function ensureModalidade(campus, modalidadeId, nome, genero, tipoConfronto) {
      let modalidade = campus.modalidades.find((item) => Number(item.id) === Number(modalidadeId));
      if (!modalidade) {
        modalidade = {
          id: modalidadeId,
          nome,
          genero,
          tipoConfronto,
          atletas: [],
          atletasMasculino: [],
          atletasFeminino: [],
          hasCampusInscricao: false
        };
        campus.modalidades.push(modalidade);
      }
      return modalidade;
    }

    for (const row of campi) {
      const campus = ensureCampus(row.campus_id, row.campus_nome);
      const modalidade = ensureModalidade(campus, row.modalidade_id, row.modalidade_nome, row.modalidade_genero, row.tipo_confronto);
      modalidade.hasCampusInscricao = true;
    }

    for (const row of atletas) {
      const campus = ensureCampus(row.campus_id, row.campus_nome);
      const modalidade = ensureModalidade(campus, row.modalidade_id, row.modalidade_nome, row.modalidade_genero, row.tipo_confronto);
      const genero = String(row.atleta_genero || 'Masculino');
      const atleta = {
        id: row.atleta_id,
        nome: row.atleta_nome,
        matricula: row.matricula,
        genero,
        dataNascimento: row.data_nascimento,
        status: 'Regular'
      };

      modalidade.atletas.push(atleta);
      if (genero === 'Feminino') {
        modalidade.atletasFeminino.push(atleta);
      } else {
        modalidade.atletasMasculino.push(atleta);
      }
    }

    const campiResumo = Array.from(campusMap.values()).sort((a, b) => a.nome.localeCompare(b.nome));
    campiResumo.forEach((campus) => {
      campus.modalidades.sort((a, b) => {
        const generoCompare = String(b.genero || '').localeCompare(String(a.genero || ''));
        if (generoCompare !== 0) return generoCompare;
        return String(a.nome || '').localeCompare(String(b.nome || ''));
      });
      campus.modalidades.forEach((modalidade) => {
        modalidade.atletas.sort((a, b) => {
          if (a.genero !== b.genero) return String(a.genero).localeCompare(String(b.genero));
          return String(a.nome).localeCompare(String(b.nome));
        });
        modalidade.atletasMasculino.sort((a, b) => String(a.nome).localeCompare(String(b.nome)));
        modalidade.atletasFeminino.sort((a, b) => String(a.nome).localeCompare(String(b.nome)));
      });
    });

    return { campi: campiResumo };
  } catch (error) {
    console.error('Erro ao buscar resumo de inscrições:', error);
    throw error;
  }
}

/**
 * Busca todos os participantes (Campi ou Atletas Nominais) inscritos e confirmados na modalidade.
 * Filtra por subcategoria (individual/dupla) caso a modalidade seja o Tênis de Mesa.
 */
/**
 * Busca todos os participantes (Campi ou Atletas Nominais) inscritos e confirmados na modalidade.
 * Filtra por subcategoria (individual/dupla) caso a modalidade seja o Tênis de Mesa.
 */
async function getInscritosModalidade(modalidadeId, subCategoria = 'geral') {
  try {
    const [mod] = await db.query('SELECT tipo_confronto, nome FROM modalidades WHERE id = ?', [modalidadeId]);
    if (!mod.length) return [];

    const modalidade = mod[0];
    const nomeNormalizado = String(modalidade.nome || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const isInd = modalidade.tipo_confronto === 'Individual' || nomeNormalizado.includes('atletismo') || nomeNormalizado.includes('xadrez') || subCategoria === 'individual';

    if (isInd) {
      const [atletas] = await db.query(`
        SELECT a.id, a.nome AS nomeAtleta, c.nome AS nomeCampus, NULL AS numeroInscrito
        FROM atleta_modalidade am
        JOIN atletas a ON am.atleta_id = a.id
        JOIN campus c ON a.campus_id = c.id
        WHERE am.modalidade_id = ?
        ORDER BY a.nome ASC
      `, [modalidadeId]);
      return atletas;
    }

    const [campi] = await db.query(`
      SELECT c.id AS campus_id, c.nome AS nomeCampus
      FROM campus_modalidade cm
      JOIN campus c ON cm.campus_id = c.id
      WHERE cm.modalidade_id = ?
      ORDER BY c.nome ASC
    `, [modalidadeId]);
    return campi;
  } catch (error) {
    console.error('Erro ao buscar inscritos da modalidade:', error);
    throw error;
  }
}

/**
 * Busca a divisão atual de grupos/chaves salvos no banco para exibição na área central.
 */
async function getChavesModalidade(modalidadeId) {
  try {
    const [mod] = await db.query('SELECT tipo_confronto FROM modalidades WHERE id = ?', [modalidadeId]);
    const isInd = mod[0]?.tipo_confronto === 'Individual';

    const [chaves] = await db.query(
      'SELECT id, modalidade_id, numero_chave AS numeroChave, nome_chave AS nomeChave FROM chaves WHERE modalidade_id = ? ORDER BY numero_chave ASC, id ASC',
      [modalidadeId]
    );

    for (const chave of chaves) {
      let integrantes = [];

      if (isInd) {
        const [atletas] = await db.query(`
          SELECT a.id AS atleta_id, a.nome AS nomeAtleta, c.nome AS nomeCampus, NULL AS numeroInscrito
          FROM jogos j
          JOIN atletas a ON a.id = j.atleta_1_id OR a.id = j.atleta_2_id
          LEFT JOIN campus c ON c.id = a.campus_id
          WHERE j.modalidade_id = ? AND j.chave_id = ?
          GROUP BY a.id, a.nome, c.nome
          ORDER BY a.nome ASC
        `, [modalidadeId, chave.id]);
        integrantes = atletas;
      } else {
        const [campi] = await db.query(`
          SELECT c.id AS campus_id, c.nome AS nomeCampus, NULL AS nomeAtleta, NULL AS numeroInscrito
          FROM campus_modalidade cm
          JOIN campus c ON c.id = cm.campus_id
          WHERE cm.modalidade_id = ? AND cm.chave_id = ?
          ORDER BY c.nome ASC
        `, [modalidadeId, chave.id]);
        integrantes = campi;
      }

      chave.integrantes = integrantes;
    }

    return chaves;
  } catch (error) {
    console.error('Erro ao coletar chaves do banco:', error);
    throw error;
  }
}

/**
 * Retorna os confrontos agendados ou finalizados de uma modalidade para alimentar a malha de cards.
 */
async function getJogosModalidade(modalidadeId, subCategoria = 'geral') {
  try {
    const query = `
      SELECT j.id, j.fase, j.status,
             COALESCE(rc.placar_1, 0) AS placar_casa,
             COALESCE(rc.placar_2, 0) AS placar_fora,
             DATE_FORMAT(j.data_hora, '%d/%m') AS data,
             DATE_FORMAT(j.data_hora, '%H:%i') AS horario,
             c1.nome AS casa,
             c2.nome AS fora,
             a1.nome AS atletaCasa,
             a2.nome AS atletaFora,
             m.tipo_confronto,
             m.tipo_confronto = 'Individual' AS tipoIndividual
      FROM jogos j
      JOIN modalidades m ON j.modalidade_id = m.id
      LEFT JOIN campus c1 ON j.campus_1_id = c1.id
      LEFT JOIN campus c2 ON j.campus_2_id = c2.id
      LEFT JOIN atletas a1 ON j.atleta_1_id = a1.id
      LEFT JOIN atletas a2 ON j.atleta_2_id = a2.id
      LEFT JOIN resultados_coletivos rc ON rc.jogo_id = j.id
      WHERE j.modalidade_id = ? AND (j.fase LIKE ? OR ? = 'geral')
      ORDER BY j.id ASC`;
    const [jogos] = await db.query(query, [modalidadeId, `%${subCategoria}%`, subCategoria]);
    return jogos;
  } catch (error) {
    console.error('Erro ao buscar jogos da modalidade:', error);
    throw error;
  }
}

/**
 * Insere chaves organizadas e faz a montagem de partidas automatizadas (Round-Robin).
 */
async function persistirEstruturaChaveamento(modalidadeId, subCategoria, chavesMapeadas) {
  try {
    const [mod] = await db.query('SELECT tipo_confronto FROM modalidades WHERE id = ?', [modalidadeId]);
    const isInd = mod[0]?.tipo_confronto === 'Individual';

    await db.query('DELETE FROM jogos WHERE modalidade_id = ?', [modalidadeId]);
    await db.query('UPDATE campus_modalidade SET chave_id = NULL WHERE modalidade_id = ?', [modalidadeId]);
    await db.query('DELETE FROM chaves WHERE modalidade_id = ?', [modalidadeId]);

    let numeroChave = 1;
    for (const letraChave of Object.keys(chavesMapeadas)) {
      const nomeGrupo = `Grupo ${letraChave}`;
      const [resChave] = await db.query(
        'INSERT INTO chaves (modalidade_id, numero_chave, nome_chave) VALUES (?, ?, ?)',
        [modalidadeId, numeroChave, nomeGrupo]
      );
      const chaveId = resChave.insertId;

      const grupoAtual = chavesMapeadas[letraChave];
      for (const participante of grupoAtual) {
        if (!isInd) {
          const campusId = participante.campus_id || participante.id;
          if (campusId) {
            await db.query(
              'UPDATE campus_modalidade SET chave_id = ? WHERE campus_id = ? AND modalidade_id = ?',
              [chaveId, campusId, modalidadeId]
            );
          }
        }
      }

      for (let x = 0; x < grupoAtual.length; x++) {
        for (let y = x + 1; y < grupoAtual.length; y++) {
          const tA = grupoAtual[x];
          const tB = grupoAtual[y];

          await db.query(
            `INSERT INTO jogos (modalidade_id, chave_id, fase, campus_1_id, campus_2_id, atleta_1_id, atleta_2_id, data_hora, local_jogo, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              modalidadeId,
              chaveId,
              `Fase de Grupos (${subCategoria})`,
              isInd ? null : (tA.campus_id || tA.id),
              isInd ? null : (tB.campus_id || tB.id),
              isInd ? tA.id : null,
              isInd ? tB.id : null,
              new Date(),
              'Ginásio Central',
              'Agendado'
            ]
          );
        }
      }

      numeroChave += 1;
    }
  } catch (error) {
    console.error('Erro na transação de gravação de chaves:', error);
    throw error;
  }
}

/**
 * Remove todos os dados gerados de chaveamento e jogos de uma modalidade específica.
 */
async function resetarChaveamentoModalidade(modalidadeId, subCategoria = 'geral') {
  try {
    await db.query('DELETE FROM jogos WHERE modalidade_id = ?', [modalidadeId]);
    await db.query('UPDATE campus_modalidade SET chave_id = NULL WHERE modalidade_id = ?', [modalidadeId]);
    await db.query('DELETE FROM chaves WHERE modalidade_id = ?', [modalidadeId]);
  } catch (error) {
    console.error('Erro ao redefinir tabelas de chaveamento:', error);
    throw error;
  }
}

/**
 * Atualiza o placar final e estado de uma partida usando as novas colunas separadas.
 */
async function atualizarPlacarJogo(jogoId, placarCasa, placarFora, status) {
  try {
    await db.query('UPDATE jogos SET status = ? WHERE id = ?', [status, jogoId]);

    const [resultadoExistente] = await db.query('SELECT 1 FROM resultados_coletivos WHERE jogo_id = ?', [jogoId]);
    if (resultadoExistente.length > 0) {
      await db.query('UPDATE resultados_coletivos SET placar_1 = ?, placar_2 = ? WHERE jogo_id = ?', [placarCasa, placarFora, jogoId]);
    } else {
      await db.query('INSERT INTO resultados_coletivos (jogo_id, placar_1, placar_2) VALUES (?, ?, ?)', [jogoId, placarCasa, placarFora]);
    }
  } catch (error) {
    console.error("Erro ao salvar resultado de jogo:", error);
    throw error;
  }
}

async function salvarPlacar(jogoId, dados) {
  try {
    const placarCasa = dados.placar1 ?? 0;
    const placarFora = dados.placar2 ?? 0;
    const status = dados.status || 'Encerrado';
    
    await atualizarPlacarJogo(Number(jogoId), placarCasa, placarFora, status);
    return { jogoId: Number(jogoId), placarCasa, placarFora, status };
  } catch (error) {
    console.error('Erro ao salvar placar via model:', error);
    throw error;
  }
}

/**
 * Realiza a divisão dos inscritos em chaves matemáticas de forma automatizada (Sorteio)
 * e aciona a gravação da estrutura de jogos.
 */
async function efetuarChaveamentoMatematico(modalidadeId, subCategoria = 'geral') {
  try {
    const inscritos = await getInscritosModalidade(modalidadeId, subCategoria);
    
    if (!inscritos || inscritos.length === 0) {
      throw new Error("Não há inscritos suficientes para gerar o chaveamento desta modalidade.");
    }

    const inscritosSorteados = [...inscritos].sort(() => Math.random() - 0.5);
    const tamanhoMaximoGrupo = 4;
    const chavesMapeadas = {};
    const letrasGrupo = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    let indiceLetra = 0;

    for (let i = 0; i < inscritosSorteados.length; i += tamanhoMaximoGrupo) {
      const letraAtual = letrasGrupo[indiceLetra] || `X${indiceLetra}`;
      chavesMapeadas[letraAtual] = inscritosSorteados.slice(i, i + tamanhoMaximoGrupo);
      indiceLetra++;
    }

    await persistirEstruturaChaveamento(modalidadeId, subCategoria, chavesMapeadas);
    return true;
  } catch (error) {
    console.error("Erro interno no algoritmo de chaveamento matemático:", error);
    throw error;
  }
}
// Exportação completa de métodos
module.exports = {
  getConfiguracoes,
  salvarConfiguracoes,
  getAnoJifc,
  getAtletasPendentes,
  validarAtleta,
  getJogos,
  getJogoPorId,
  getConfiguracoesBanco,
  getModalidadesBanco,
  listarModalidadesConfiguracao,
  adicionarModalidade,
  removerModalidadePorId,
  getResumoInscricoes,
  getInscritosModalidade,
  getChavesModalidade,
  getJogosModalidade,
  persistirEstruturaChaveamento,
  resetarChaveamentoModalidade,
  atualizarPlacarJogo,
  salvarPlacar
};