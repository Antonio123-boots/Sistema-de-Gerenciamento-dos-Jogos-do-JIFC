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
      SELECT j.id, j.fase, j.status, j.placar_casa, j.placar_fora,
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
    const [linhas] = await db.query('SELECT * FROM modalidades ORDER BY genero DESC, nome ASC');
    return linhas;
  } catch (error) {
    console.error("Erro ao buscar modalidades no banco:", error);
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
    const [mod] = await db.query('SELECT tipo_confronto, categoria, slug FROM modalidades WHERE id = ?', [modalidadeId]);
    if (!mod.length) return [];

    const m = mod[0];
    const isInd = (m.tipo_confronto === 'Individual' || m.categoria === 'atletismo' || m.categoria === 'xadrez' || subCategoria === 'individual');

    if (isInd) {
      const query = `
        SELECT a.id, a.nome AS nomeAtleta, c.nome AS nomeCampus, ia.numero_inscrito
        FROM inscricoes_atletas ia
        JOIN atletas a ON ia.atleta_id = a.id
        JOIN campus c ON a.campus_id = c.id
        WHERE ia.modalidade_id = ? AND ia.sub_categoria = ? AND a.status = 'Regular'
        ORDER BY a.nome ASC`;
      const [atletas] = await db.query(query, [modalidadeId, subCategoria]);
      return atletas;
    } else {
      const query = `
        SELECT c.nome AS nomeCampus, c.id AS campus_id
        FROM campus_modalidade cm
        JOIN campus c ON cm.campus_id = c.id
        WHERE cm.modalidade_id = ?
        ORDER BY c.nome ASC`;
      const [campi] = await db.query(query, [modalidadeId]);
      return campi;
    }
  } catch (error) {
    console.error("Erro ao buscar inscritos da modalidade:", error);
    throw error;
  }
}
/**
 * Busca a divisão atual de grupos/chaves salvos no banco para exibição na área central.
 */
async function getChavesModalidade(modalidadeId, subCategoria = 'geral') {
  try {
    const [chaves] = await db.query('SELECT * FROM chaves WHERE modalidade_id = ? AND sub_categoria = ? ORDER BY letra ASC', [modalidadeId, subCategoria]);
    
    for (let chave of chaves) {
      const query = `
        SELECT hc.*, c.nome AS nomeCampus, a.nome AS nomeAtleta
        FROM historico_confrontos hc
        LEFT JOIN campus c ON hc.campus_id = c.id
        LEFT JOIN atletas a ON hc.atleta_id = a.id
        WHERE hc.chave_id = ?
        ORDER BY hc.pontos DESC, hc.saldo_pontuacao DESC, hc.pontos_pro DESC`;
      const [integrantes] = await db.query(query, [chave.id]);
      chave.integrantes = integrantes;
    }
    return chaves;
  } catch (error) {
    console.error("Erro ao coletar chaves do banco:", error);
    throw error;
  }
}

/**
 * Retorna os confrontos agendados ou finalizados de uma modalidade para alimentar a malha de cards.
 */
async function getJogosModalidade(modalidadeId, subCategoria = 'geral') {
  try {
    const query = `
      SELECT j.id, j.fase, j.status, j.placar_casa, j.placar_fora, 
             DATE_FORMAT(j.data_hora, '%d/%m') AS data, DATE_FORMAT(j.data_hora, '%H:%i') AS horario, 
             c1.nome AS casa, c2.nome AS fora, a1.nome AS atletaCasa, a2.nome AS atletaFora, m.tipo_confronto 
      FROM jogos j 
      JOIN modalidades m ON j.modalidade_id = m.id 
      LEFT JOIN campus c1 ON j.campus_1_id = c1.id 
      LEFT JOIN campus c2 ON j.campus_2_id = c2.id 
      LEFT JOIN atletas a1 ON j.atleta_1_id = a1.id 
      LEFT JOIN atletas a2 ON j.atleta_2_id = a2.id 
      WHERE j.modalidade_id = ? AND (j.fase LIKE ? OR ? = 'geral')
      ORDER BY j.id ASC`;
    const [jogos] = await db.query(query, [modalidadeId, `%${subCategoria}%`, subCategoria]);
    return jogos;
  } catch (error) {
    console.error("Erro ao buscar jogos da modalidade:", error);
    throw error;
  }
}

/**
 * Insere chaves organizadas e faz a montagem de partidas automatizadas (Round-Robin).
 */
async function persistirEstruturaChaveamento(modalidadeId, subCategoria, chavesMapeadas) {
  try {
    const [mod] = await db.query('SELECT tipo_confronto, categoria FROM modalidades WHERE id = ?', [modalidadeId]);
    const isInd = mod[0].tipo_confronto === 'Individual';

    for (let letraChave in chavesMapeadas) {
      const nomeGrupo = `Grupo ${letraChave}`;
      const [resChave] = await db.query(
        'INSERT INTO chaves (modalidade_id, sub_categoria, letra, nome_chave) VALUES (?, ?, ?, ?)',
        [modalidadeId, subCategoria, letraChave, nomeGrupo]
      );
      const chaveId = resChave.insertId;

      const grupoAtual = chavesMapeadas[letraChave];
      for (let participante of grupoAtual) {
        await db.query(
          `INSERT INTO historico_confrontos (modalidade_id, chave_id, campus_id, atleta_id) VALUES (?, ?, ?, ?)`,
          [modalidadeId, chaveId, isInd ? null : participante.campus_id || participante.id, isInd ? participante.id : null]
        );
        
        if (!isInd) {
          await db.query(
            'UPDATE campus_modalidade SET chave_id = ? WHERE campus_id = ? AND modalidade_id = ?',
            [chaveId, participante.campus_id || participante.id, modalidadeId]
          );
        }
      }

      for (let x = 0; x < grupoAtual.length; x++) {
        for (let y = x + 1; y < grupoAtual.length; y++) {
          const tA = grupoAtual[x];
          const tB = grupoAtual[y];

          await db.query(
            `INSERT INTO jogos (modalidade_id, fase, campus_1_id, campus_2_id, atleta_1_id, atleta_2_id, data_hora, local_jogo, status) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              modalidadeId, 
              `Fase de Grupos (${subCategoria})`, 
              isInd ? null : tA.campus_id || tA.id, 
              isInd ? null : tB.campus_id || tB.id, 
              isInd ? tA.id : null, 
              isInd ? tB.id : null, 
              new Date(), 
              'Ginásio Central', 
              'Agendado'
            ]
          );
        }
      }
    }
  } catch (error) {
    console.error("Erro na transação de gravação de chaves:", error);
    throw error;
  }
}

/**
 * Remove todos os dados gerados de chaveamento e jogos de uma modalidade específica.
 */
async function resetarChaveamentoModalidade(modalidadeId, subCategoria = 'geral') {
  try {
    await db.query('DELETE j FROM jogos j WHERE j.modalidade_id = ?', [modalidadeId]);
    await db.query('DELETE FROM historico_confrontos WHERE modalidade_id = ?', [modalidadeId]);
    await db.query('DELETE FROM chaves WHERE modalidade_id = ? AND sub_categoria = ?', [modalidadeId, subCategoria]);
  } catch (error) {
    console.error("Erro ao redefinir tabelas de chaveamento:", error);
    throw error;
  }
}

/**
 * Atualiza o placar final e estado de uma partida usando as novas colunas separadas.
 */
async function atualizarPlacarJogo(jogoId, placarCasa, placarFora, status) {
  try {
    await db.query('UPDATE jogos SET placar_casa = ?, placar_fora = ?, status = ? WHERE id = ?', [placarCasa, placarFora, status, jogoId]);
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
  getInscritosModalidade,
  getChavesModalidade,
  getJogosModalidade,
  persistirEstruturaChaveamento,
  resetarChaveamentoModalidade,
  atualizarPlacarJogo,
  salvarPlacar
};