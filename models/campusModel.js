// Inscrições e atletas dos campus com o MySQL como fonte única de verdade.
// O módulo mantém um cache em memória (read model) carregado do banco no startup
// e atualizado a cada escrita, preservando a API síncrona usada pelos controllers.
const db = require('../config/db');
const { listarCampi } = require('./campiCatalog');
const { readState, writeState } = require('./stateStore');

const cache = {
  inscricoesCampus: {},
  atletasCampus: []
};

const modalidadesBase = [
  'Futsal Masculino',
  'Futsal Feminino',
  'Vôlei Masculino',
  'Vôlei Feminino',
  'Basquete Masculino',
  'Basquete Feminino'
];

const STATUS_ATLETA = ['Analise', 'Regular', 'Reprovado'];

function normalizarCPFParaBanco(valor) {
  return String(valor || '').replace(/\D/g, '').slice(0, 11);
}

function normalizarNomeModalidadeParaBanco(nome) {
  return String(nome || '')
    .trim()
    .replace(/^Tênis$/i, 'Tênis de Mesa')
    .replace(/^V[oô]leibol(\s*(Masculino|Feminino))?$/i, 'Vôlei $2')
    .trim();
}

const { inferirGeneroModalidade, inferirTipoConfrontoModalidade, inferirFormatoDisputaModalidade } = require('../utils/modalidadeHelpers');
const { gerarSlug } = require('../utils/slug');

function parseJsonArray(valor) {
  if (!valor) return [];
  try {
    const parsed = JSON.parse(valor);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function normalizarMatricula(matricula) {
  return String(matricula || '')
    .trim()
    .replace(/\D/g, '')
    .slice(0, 12);
}

function formatarCPF(valor) {
  const apenasDigitos = String(valor || '')
    .replace(/\D/g, '')
    .slice(0, 11);

  if (apenasDigitos.length <= 3) {
    return apenasDigitos;
  }

  if (apenasDigitos.length <= 6) {
    return `${apenasDigitos.slice(0, 3)}.${apenasDigitos.slice(3)}`;
  }

  if (apenasDigitos.length <= 9) {
    return `${apenasDigitos.slice(0, 3)}.${apenasDigitos.slice(3, 6)}.${apenasDigitos.slice(6)}`;
  }

  return `${apenasDigitos.slice(0, 3)}.${apenasDigitos.slice(3, 6)}.${apenasDigitos.slice(6, 9)}-${apenasDigitos.slice(9, 11)}`;
}

function normalizarCPF(cpf) {
  return formatarCPF(cpf);
}

function normalizarRG(rg) {
  return String(rg || '')
    .trim()
    .replace(/[^\dXx.-]/g, '')
    .toUpperCase()
    .slice(0, 30);
}

function validarMatricula(matricula) {
  const valor = normalizarMatricula(matricula);

  if (!/^\d{9,12}$/.test(valor)) {
    const erro = new Error('A matrícula deve conter entre 9 e 12 dígitos.');
    erro.code = 'MATRICULA_INVALIDA';
    throw erro;
  }

  return valor;
}

function validarNomeCompleto(nome) {
  const valor = String(nome || '').trim().replace(/\s+/g, ' ');
  return valor.split(' ').filter(Boolean).length >= 2 ? valor : '';
}

function normalizarGenero(genero) {
  const valor = String(genero || '').trim().toLowerCase();
  if (valor === 'f' || valor === 'feminino') {
    return 'Feminino';
  }

  if (valor === 'm' || valor === 'masculino') {
    return 'Masculino';
  }

  return '';
}

function obterAnoAtual() {
  return new Date().getFullYear();
}

function obterAnoNascimento(dataNascimento) {
  const data = new Date(dataNascimento);
  return Number.isNaN(data.getTime()) ? null : data.getFullYear();
}

function obterAnoEvento(opcoes = {}) {
  const anoEvento = Number(opcoes.anoEvento || new Date().getFullYear());
  return Number.isFinite(anoEvento) ? anoEvento : new Date().getFullYear();
}

function normalizarStatusSolicitado(status) {
  const statusNormalizado = String(status || 'Analise').trim().toLowerCase();
  if (statusNormalizado.startsWith('anal') || statusNormalizado.startsWith('pend')) {
    return 'Analise';
  }

  if (statusNormalizado.startsWith('repro') || statusNormalizado.startsWith('irreg') || statusNormalizado.startsWith('nao')) {
    return 'Reprovado';
  }

  return 'Regular';
}

function atletaPodeSerAlteradoPeloCampus(atleta) {
  return Boolean(atleta) && atleta.status === 'Analise';
}

function criarErroAtletaBloqueado() {
  const erro = new Error('Atletas validados ou reprovados não podem ser editados ou excluídos pelo campus.');
  erro.code = 'ATLETA_NAO_EDITAVEL';
  return erro;
}

function normalizarModalidades(valor) {
  const lista = Array.isArray(valor) ? valor : [valor];
  const modalidades = lista
    .map((item) => String(item || '').trim())
    .filter(Boolean);

  return [...new Set(modalidades)].slice(0, 3);
}

function prepararDadosSubstituicao(dados = {}) {
  return {
    genero: normalizarGenero(dados.genero),
    modalidades: normalizarModalidades(dados.modalidades || dados.modalidade),
    atletismoProvas: normalizarListaDetalhes(dados.atletismoProvas || dados.provasAtletismo),
    tenisMesaParticipacoes: normalizarListaDetalhes(dados.tenisMesaParticipacoes || dados.participacoesTenisMesa)
  };
}

function normalizarListaDetalhes(valor) {
  const lista = Array.isArray(valor) ? valor : [valor];
  const detalhes = lista
    .map((item) => String(item || '').trim())
    .filter(Boolean);

  return [...new Set(detalhes)];
}

function normalizarDetalhesAtleta(dados = {}) {
  const modalidades = normalizarModalidades(dados.modalidades || dados.modalidade);
  const temAtletismo = modalidades.some((modalidade) => /atletismo/i.test(modalidade));
  const temTenisMesa = modalidades.some((modalidade) => /tênis de mesa|tenis de mesa/i.test(modalidade));

  return {
    atletismoProvas: temAtletismo ? normalizarListaDetalhes(dados.atletismoProvas || dados.provasAtletismo) : [],
    tenisMesaParticipacoes: temTenisMesa ? normalizarListaDetalhes(dados.tenisMesaParticipacoes || dados.participacoesTenisMesa) : []
  };
}

function validarDetalhesAtleta(dados, modalidadesSelecionadas = []) {
  const detalhes = normalizarDetalhesAtleta(dados);
  const temAtletismo = modalidadesSelecionadas.some((modalidade) => /atletismo/i.test(modalidade));
  const temTenisMesa = modalidadesSelecionadas.some((modalidade) => /tênis de mesa|tenis de mesa/i.test(modalidade));

  if (temAtletismo && detalhes.atletismoProvas.length === 0) {
    const erro = new Error('Selecione pelo menos uma prova de atletismo.');
    erro.code = 'PROVAS_ATLETISMO_OBRIGATORIAS';
    throw erro;
  }

  if (temTenisMesa && detalhes.tenisMesaParticipacoes.length === 0) {
    const erro = new Error('Selecione pelo menos uma participação para tênis de mesa.');
    erro.code = 'PARTICIPACOES_TENIS_MESA_OBRIGATORIAS';
    throw erro;
  }

  return detalhes;
}

function normalizarInscricoesCampus(valor) {
  const lista = Array.isArray(valor) ? valor : [valor];
  const modalidades = lista
    .map((item) => String(item || '').trim())
    .filter(Boolean);

  return [...new Set(modalidades)];
}

function atletaEhSub19(dados, opcoes = {}) {
  const anoNascimento = obterAnoNascimento(dados.dataNascimento);
  const anoEvento = obterAnoEvento(opcoes);
  const anoLimite = anoEvento - 19;

  return anoNascimento !== null && anoNascimento >= anoLimite;
}

function obterModalidadesSalvas(dados) {
  const modalidades = normalizarModalidades(dados.modalidades || dados.modalidade);
  return modalidades.length ? modalidades : [];
}

function validarCamposObrigatoriosAtleta(dados) {
  const nome = String(dados.nome || '').trim();
  const matricula = validarMatricula(dados.matricula);
  const genero = normalizarGenero(dados.genero) || 'Masculino';
  const dataNascimento = String(dados.dataNascimento || '').trim();
  const cpf = normalizarCPF(String(dados.cpf || '').trim());
  const rg = normalizarRG(dados.rg);
  const status = 'Analise';
  const modalidades = obterModalidadesSalvas(dados);
  const detalhesAtleta = normalizarDetalhesAtleta(dados);

  if (!nome || !matricula || !dataNascimento || !modalidades.length) {
    const erro = new Error('Preencha todos os campos antes de inscrever o atleta.');
    erro.code = 'CAMPOS_OBRIGATORIOS';
    throw erro;
  }
  if (!/^\d{11}$/.test(String(dados.cpf || '').replace(/\D/g, ''))) {
    const erro = new Error('CPF deve conter 11 dígitos.');
    erro.code = 'CPF_INVALIDO';
    throw erro;
  }

  return { nome, matricula, genero, dataNascimento, cpf, rg, status, modalidades, ...detalhesAtleta };
}

function normalizarStatusExibicao(status) {
  return normalizarStatusSolicitado(status || 'Analise');
}

function extrairGeneroPorModalidade(modalidades = []) {
  const lista = normalizarModalidades(modalidades);
  if (lista.some((modalidade) => /feminino/i.test(modalidade))) {
    return 'Feminino';
  }

  return 'Masculino';
}

  function montarAtletaCache(linha, modalidades = []) {
  return {
    id: Number(linha.id),
    nome: String(linha.nome || '').trim(),
    matricula: String(linha.matricula || '').trim(),
    modalidades: modalidades.slice(),
    modalidade: modalidades.length ? modalidades.join(', ') : String(linha.modalidade || ''),
    dataNascimento: String(linha.dataNascimento || linha.data_nascimento || '').trim(),
    cpf: formatarCPF(linha.cpf),
    rg: normalizarRG(linha.rg),
    campus: String(linha.campus_nome || linha.campusNome || '').trim(),
    genero: String(linha.genero || 'Masculino').trim(),
    status: normalizarStatusExibicao(linha.status),
    atletismoProvas: parseJsonArray(linha.provas_atletismo),
    tenisMesaParticipacoes: parseJsonArray(linha.tenis_mesa_participacoes),
    substituido: Boolean(linha.substituido),
    substituidoPor: linha.substituido_por || linha.substituidoPor || null,
    substituidoEm: linha.substituido_em || linha.substituidoEm || null
  };
}

/* =====================================================================
   Carga do cache a partir do MySQL (fonte única de verdade)
   ===================================================================== */

async function carregarCacheDeInscricoesEAtletas() {
  try {
    const [campusRows] = await db.query('SELECT id, nome FROM campus');
    const [atletasRows] = await db.query(
            `SELECT a.id, a.nome, a.cpf, a.rg, a.matricula, a.genero, a.data_nascimento,
              a.provas_atletismo, a.tenis_mesa_participacoes, a.status,
              a.substituido, a.substituido_por, a.substituido_em,
              c.nome AS campus_nome
       FROM atletas a
       JOIN campus c ON c.id = a.campus_id
       ORDER BY c.nome ASC, a.nome ASC`
    );
    const [inscricoesRows] = await db.query(
      'SELECT cm.campus_id, m.nome AS modalidade_nome FROM campus_modalidade cm JOIN modalidades m ON m.id = cm.modalidade_id'
    );
    const [atletaModalidadeRows] = await db.query(
      'SELECT am.atleta_id, m.nome AS modalidade_nome FROM atleta_modalidade am JOIN modalidades m ON m.id = am.modalidade_id'
    );

    const nomePorCampusId = new Map(campusRows.map((campus) => [Number(campus.id), String(campus.nome || '').trim()]));

    const inscricoes = {};
    campusRows.forEach((campus) => {
      inscricoes[String(campus.nome || '').trim()] = [];
    });
    inscricoesRows.forEach((linha) => {
      const nomeCampus = nomePorCampusId.get(Number(linha.campus_id));
      if (!nomeCampus || !linha.modalidade_nome) return;
      if (!inscricoes[nomeCampus]) inscricoes[nomeCampus] = [];
      if (!inscricoes[nomeCampus].includes(linha.modalidade_nome)) {
        inscricoes[nomeCampus].push(linha.modalidade_nome);
      }
    });

    const modalidadesPorAtleta = new Map();
    atletaModalidadeRows.forEach((linha) => {
      if (!linha.modalidade_nome) return;
      if (!modalidadesPorAtleta.has(linha.atleta_id)) modalidadesPorAtleta.set(linha.atleta_id, []);
      const lista = modalidadesPorAtleta.get(linha.atleta_id);
      if (!lista.includes(linha.modalidade_nome)) lista.push(linha.modalidade_nome);
    });

    cache.inscricoesCampus = inscricoes;
    cache.atletasCampus = atletasRows.map((linha) => montarAtletaCache(linha, modalidadesPorAtleta.get(linha.id) || []));

    return cache;
  } catch (error) {
    console.error('Erro ao carregar cache de inscrições/atletas do banco:', error.message);
    return cache;
  }
}

/* =====================================================================
   Migração idempotente: dados legados do state store -> MySQL
   (roda no startup; não apaga nada, só preenche lacunas)
   ===================================================================== */

async function buscarCampusIdNoBanco(campusNome) {
  const nome = String(campusNome || '').trim();
  if (!nome) {
    return null;
  }

  try {
    const [linhas] = await db.query(
      'SELECT id FROM campus WHERE nome = ? OR nome_exibicao = ? OR slug = ? LIMIT 1',
      [nome, nome, gerarSlug(nome)]
    );
    return linhas[0]?.id || null;
  } catch (error) {
    return null;
  }
}

async function garantirModalidadeNoBanco(nomeModalidade) {
  const nome = normalizarNomeModalidadeParaBanco(nomeModalidade);
  if (!nome) {
    return null;
  }

  const nomeBase = nome.replace(/\s+(Masculino|Feminino)$/i, '').trim();
  const genero = inferirGeneroModalidade(nome);
  const tipoConfronto = inferirTipoConfrontoModalidade(nome);
  const formatoDisputa = inferirFormatoDisputaModalidade(nome);

  try {
    const [linhas] = await db.query(
      `SELECT id FROM modalidades
       WHERE genero = ? AND (nome = ? OR nome = ?)
       ORDER BY (nome = ?) DESC, id ASC
       LIMIT 1`,
      [genero, nome, nomeBase, nome]
    );

    if (linhas[0]?.id) {
      return linhas[0].id;
    }

    const [resultado] = await db.query(
      'INSERT INTO modalidades (nome, genero, tipo_confronto, formato_disputa) VALUES (?, ?, ?, ?)',
      [nome, genero, tipoConfronto, formatoDisputa]
    );

    return resultado.insertId;
  } catch (error) {
    return null;
  }
}

async function sincronizarLinksCampusModalidade(campusId, modalidades) {
  if (!campusId) {
    return;
  }

  const modalidadesSelecionadas = normalizarInscricoesCampus(modalidades);
  const modalidadeIds = [];

  for (const modalidade of modalidadesSelecionadas) {
    const modalidadeId = await garantirModalidadeNoBanco(modalidade);
    if (modalidadeId) {
      modalidadeIds.push(modalidadeId);
    }
  }

  const idsUnicos = [...new Set(modalidadeIds)];
  await db.query('DELETE FROM campus_modalidade WHERE campus_id = ?', [campusId]);

  for (const modalidadeId of idsUnicos) {
    await db.query('INSERT INTO campus_modalidade (campus_id, modalidade_id) VALUES (?, ?)', [campusId, modalidadeId]);
  }
}

async function garantizarModalidadesDoAtletaNoBanco(atletaId, modalidadesSelecionadas = []) {
  const modalidadeIds = [];

  for (const modalidade of normalizarModalidades(modalidadesSelecionadas)) {
    const modalidadeId = await garantirModalidadeNoBanco(modalidade);
    if (modalidadeId) {
      modalidadeIds.push(modalidadeId);
    }
  }

  await db.query('DELETE FROM atleta_modalidade WHERE atleta_id = ?', [atletaId]);
  for (const modalidadeId of [...new Set(modalidadeIds)]) {
    await db.query('INSERT INTO atleta_modalidade (atleta_id, modalidade_id) VALUES (?, ?)', [atletaId, modalidadeId]);
  }
}

async function sincronizarAtletaNoBanco(campusId, atletaDados, modalidadesSelecionadas = [], extras = {}) {
  if (!campusId) {
    return null;
  }

  const nome = String(atletaDados?.nome || '').trim();
  const matricula = normalizarMatricula(atletaDados?.matricula);
  const cpf = normalizarCPFParaBanco(atletaDados?.cpf);
  const rg = normalizarRG(atletaDados?.rg);
  const genero = normalizarGenero(atletaDados?.genero) || 'Masculino';
  const dataNascimento = String(atletaDados?.dataNascimento || '').trim();
  const modalidades = normalizarModalidades(modalidadesSelecionadas);
  const modalidadeIds = [];

  for (const modalidade of modalidades) {
    const modalidadeId = await garantirModalidadeNoBanco(modalidade);
    if (modalidadeId) {
      modalidadeIds.push(modalidadeId);
    }
  }

  const provasAtletismoJson = Array.isArray(atletaDados?.atletismoProvas) && atletaDados.atletismoProvas.length
    ? JSON.stringify(atletaDados.atletismoProvas)
    : null;

  const tenisMesaJson = Array.isArray(atletaDados?.tenisMesaParticipacoes) && atletaDados.tenisMesaParticipacoes.length
    ? JSON.stringify(atletaDados.tenisMesaParticipacoes)
    : null;

  const statusSolicitado = String(extras.status || 'Analise').trim();
  const status = STATUS_ATLETA.includes(statusSolicitado) ? statusSolicitado : 'Analise';

  const [existente] = await db.query(
    'SELECT id FROM atletas WHERE campus_id = ? AND matricula = ? LIMIT 1',
    [campusId, matricula]
  );

  /*
   * O status enviado pelo campus NUNCA pode ser 'Regular' ou 'Reprovado' (são
   * decisões do admin). 'Analise' devolve o atleta para a fila de laudo, e é
   * esse o estado persistido - o cache e o banco precisam concordar.
   */
  const statusFinal = status;

  let atletaId = existente?.[0]?.id || null;

  if (atletaId) {
    await db.query(
      `UPDATE atletas SET
         nome = ?, cpf = ?, rg = ?, genero = ?, data_nascimento = ?,
         provas_atletismo = COALESCE(?, provas_atletismo),
         tenis_mesa_participacoes = COALESCE(?, tenis_mesa_participacoes),
         status = ?
       WHERE id = ?`,
      [nome, cpf, rg, genero, dataNascimento, provasAtletismoJson, tenisMesaJson, statusFinal, atletaId]
    );
  } else {
    const [resultado] = await db.query(
      `INSERT INTO atletas
         (campus_id, nome, cpf, rg, matricula, genero, data_nascimento, provas_atletismo, tenis_mesa_participacoes, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [campusId, nome, cpf, rg, matricula, genero, dataNascimento, provasAtletismoJson, tenisMesaJson, status]
    );
    atletaId = resultado.insertId;
  }

  await garantizarModalidadesDoAtletaNoBanco(atletaId, modalidadeIds.length ? normalizarModalidades(modalidadesSelecionadas) : []);

  return atletaId;
}

const MIGRACAO_STATE_PARA_BANCO = 'state_campus_para_mysql_v1';

async function migrarDadosCampusDoStateParaBanco() {
  /*
   * Migração one-shot: os dados legados do state store (JSON) são importados
   * para o MySQL uma única vez. Reexecutar a cada boot sobrescrevia decisões
   * já tomadas no MySQL (ex.: status 'Regular' aprovado no laudo do admin).
   */
  let migracaoJaAplicada = false;
  try {
    const { migracaoJaExecutada } = require('../config/migrationGuard');
    migracaoJaAplicada = await migracaoJaExecutada(MIGRACAO_STATE_PARA_BANCO);
  } catch (error) {
    console.error('Aviso: não foi possível verificar o registro de migrações (o state store será lido):', error.message);
  }

  if (migracaoJaAplicada) {
    return 0;
  }

  const estado = readState();
  const campusState = estado.campus || {};
  const inscricoesState = campusState.inscricoesCampus || campusState.inscricoes || {};
  const atletasState = Array.isArray(campusState.atletasCampus)
    ? campusState.atletasCampus
    : (Array.isArray(campusState.atletas) ? campusState.atletas : []);

  const nomesDeCampusEstado = [
    ...Object.keys(inscricoesState),
    ...new Set(atletasState.map((atleta) => String(atleta.campus || '').trim()).filter(Boolean))
  ].filter(Boolean);

  let atletasMigrados = 0;

  try {
    const campi = await listarCampi();
    for (const campus of campi) {
      const nomesCampus = [...new Set([campus.nome, campus.nomeExibicao, campus.slug].map((valor) => String(valor || '').trim()).filter(Boolean))];
      const bateComEstado = nomesCampus.some((nomeEstado) =>
        nomesDeCampusEstado.includes(nomeEstado) || gerarSlug(nomeEstado) === String(campus.slug || '').trim()
      );
      if (!bateComEstado) continue;

      const inscricoes = nomesCampus
        .map((nomeEstado) => inscricoesState[nomeEstado] || inscricoesState[gerarSlug(nomeEstado)] || null)
        .find((lista) => Array.isArray(lista) && lista.length);
      if (inscricoes && inscricoes.length) {
        const [jaExistem] = await db.query('SELECT COUNT(*) AS total FROM campus_modalidade WHERE campus_id = ?', [campus.id]);
        if (Number(jaExistem[0]?.total || 0) === 0) {
          await sincronizarLinksCampusModalidade(campus.id, inscricoes);
        }
      }

      for (const atleta of atletasState) {
        const nomeAtletaCampus = String(atleta.campus || '').trim();
        const campusBate = nomesCampus.some((nomeEstado) => nomeAtletaCampus === nomeEstado || gerarSlug(nomeAtletaCampus) === String(campus.slug || '').trim());
        if (!campusBate) continue;

        const matricula = normalizarMatricula(atleta.matricula);
        const nome = String(atleta.nome || '').trim();
        if (!matricula || !nome) continue;

        const statusSolicitado = String(atleta.status || '').trim();
        const status = STATUS_ATLETA.includes(statusSolicitado)
          ? statusSolicitado
          : (statusSolicitado ? normalizarStatusSolicitado(atleta.status) : 'Analise');
        const modalidadesSelecionadas = normalizarModalidades(atleta.modalidades || atleta.modalidade);

        const [existente] = await db.query(
          'SELECT id, status FROM atletas WHERE campus_id = ? AND matricula = ? LIMIT 1',
          [campus.id, matricula]
        );

        if (existente[0]) {
          const novosCampos = [];
          const novosValores = [];
          const provasJson = Array.isArray(atleta.atletismoProvas) && atleta.atletismoProvas.length ? JSON.stringify(atleta.atletismoProvas) : null;
          const tenisJson = Array.isArray(atleta.tenisMesaParticipacoes) && atleta.tenisMesaParticipacoes.length ? JSON.stringify(atleta.tenisMesaParticipacoes) : null;

          if (provasJson) {
            novosCampos.push('provas_atletismo = ?');
            novosValores.push(provasJson);
          }
          if (tenisJson) {
            novosCampos.push('tenis_mesa_participacoes = ?');
            novosValores.push(tenisJson);
          }
          /*
           * O status NÃO é sobrescrito aqui: ele é decisão do admin (laudo) e
           * vive no MySQL. Sobrescrever aqui (o state store é legado) faria o
           * status voltar para 'Analise' a cada boot.
           */
          if (novosCampos.length) {
            novosValores.push(existente[0].id);
            await db.query(`UPDATE atletas SET ${novosCampos.join(', ')} WHERE id = ?`, novosValores);
          }

          if (modalidadesSelecionadas.length) {
            await garantizarModalidadesDoAtletaNoBanco(existente[0].id, modalidadesSelecionadas);
          }
        } else {
          const cpfAtleta = normalizarCPFParaBanco(atleta.cpf);
          if (cpfAtleta) {
            const [porCpf] = await db.query('SELECT id FROM atletas WHERE cpf = ? LIMIT 1', [cpfAtleta]);
            if (porCpf[0]) {
              await garantizarModalidadesDoAtletaNoBanco(porCpf[0].id, modalidadesSelecionadas);
              continue;
            }
          }
          await sincronizarAtletaNoBanco(campus.id, atleta, modalidadesSelecionadas, { status });
          atletasMigrados++;
        }
      }
    }
  } catch (error) {
    console.error('Erro ao migrar dados de campus do state para o banco:', error.message);
  }

  try {
    const migracaoAnterior = estado.migracaoCampusParaBanco || {};
    if (!migracaoAnterior.executadaEm || atletasMigrados > 0) {
      estado.migracaoCampusParaBanco = {
        executadaEm: new Date().toISOString(),
        atletasMigrados
      };
      writeState(estado);
    }
  } catch (_) {
    // flag opcional de migração; falha não deve interromper o startup
  }

  try {
    const { registrarMigracao } = require('../config/migrationGuard');
    await registrarMigracao(MIGRACAO_STATE_PARA_BANCO);
  } catch (error) {
    console.error('Aviso: não foi possível registrar a migração do state store (ela poderá rodar novamente):', error.message);
  }

  return atletasMigrados;
}

/* =====================================================================
   Leituras (fonte: cache carregado do MySQL)
   ===================================================================== */

function getInscricoes(campusNome) {
  return (cache.inscricoesCampus[campusNome] || []).slice();
}

function getAtletas(campusNome) {
  return cache.atletasCampus
    .filter((item) => item.campus === campusNome && !item.substituido)
    .map((item) => ({ ...item }));
}

function getAtletasParaAnalise(campusNome = null) {
  const base = campusNome
    ? cache.atletasCampus.filter((item) => item.campus === campusNome && !item.substituido)
    : cache.atletasCampus.filter((item) => !item.substituido);

  return base
    .map((item) => ({ ...item }))
    .sort((a, b) => a.campus.localeCompare(b.campus) || a.nome.localeCompare(b.nome));
}

function getAtletaPorId(atletaId) {
  const atleta = cache.atletasCampus.find((item) => item.id === Number(atletaId));
  return atleta ? { ...atleta } : null;
}

function getQuantidadeRegulares(campusNome) {
  return cache.atletasCampus.filter((item) => item.campus === campusNome && !item.substituido && item.status === 'Regular').length;
}

function getQuantidadePendentes(campusNome) {
  return getQuantidadeAnalise(campusNome);
}

function getQuantidadeAnalise(campusNome) {
  return cache.atletasCampus.filter((item) => item.campus === campusNome && !item.substituido && item.status === 'Analise').length;
}

function getQuantidadeReprovados(campusNome) {
  return cache.atletasCampus.filter((item) => item.campus === campusNome && !item.substituido && item.status === 'Reprovado').length;
}

function getQuantidadeTotal(campusNome) {
  return cache.atletasCampus.filter((item) => item.campus === campusNome && !item.substituido).length;
}

function getQuantidadeDisponivelRegular(campusNome, limiteRegularTotalCampus) {
  const limite = Number(limiteRegularTotalCampus);

  if (!Number.isFinite(limite) || limite <= 0) {
    return Infinity;
  }

  return Math.max(limite - getQuantidadeTotal(campusNome), 0);
}

async function buscarModalidadeParaLimite(nomeModalidade) {
  const nome = normalizarNomeModalidadeParaBanco(nomeModalidade);
  if (!nome) {
    return null;
  }

  const nomeBase = nome.replace(/\s+(Masculino|Feminino)$/i, '').trim();
  const genero = inferirGeneroModalidade(nome);

  const [linhas] = await db.query(
    `SELECT id, limite_inscritos FROM modalidades
     WHERE genero = ? AND (nome = ? OR nome = ?)
     ORDER BY (nome = ?) DESC, id ASC
     LIMIT 1`,
    [genero, nome, nomeBase, nome]
  );

  return linhas[0] || null;
}

async function validarLimiteModalidadeCampus({ campusId, modalidadesSelecionadas = [], atletaIdExcluir = null }) {
  if (!campusId) {
    return;
  }

  for (const modalidade of normalizarModalidades(modalidadesSelecionadas)) {
    const modalidadeBanco = await buscarModalidadeParaLimite(modalidade);
    const limite = Number(modalidadeBanco?.limite_inscritos || 0);

    if (!modalidadeBanco || !Number.isFinite(limite) || limite <= 0) {
      continue;
    }

    const params = [modalidadeBanco.id, campusId];
    let sql = `SELECT COUNT(*) AS total
               FROM atleta_modalidade am
               JOIN atletas a ON a.id = am.atleta_id
               WHERE am.modalidade_id = ? AND a.campus_id = ? AND a.status <> 'Reprovado'`;

    if (atletaIdExcluir) {
      sql += ' AND a.id <> ?';
      params.push(Number(atletaIdExcluir));
    }

    const [linhas] = await db.query(sql, params);
    const total = Number(linhas[0]?.total || 0);

    if (total >= limite) {
      const erro = new Error(`Você já atingiu o limite de inscritos em ${modalidade}`);
      erro.code = 'LIMITE_MODALIDADE_EXCEDIDO';
      throw erro;
    }
  }
}

/* =====================================================================
   Escritas (MySQL + atualização do cache)
   ===================================================================== */

async function salvarInscricoes(campusNome, modalidades) {
  const listaNormalizada = normalizarInscricoesCampus(modalidades);
  cache.inscricoesCampus[campusNome] = listaNormalizada;

  const campusId = await buscarCampusIdNoBanco(campusNome);
  if (campusId) {
    await sincronizarLinksCampusModalidade(campusId, listaNormalizada);
  }

  return getInscricoes(campusNome);
}

function removerCampusDoEstado(campusAtual) {
  const nomesCampus = [campusAtual?.nome, campusAtual?.nomeExibicao, campusAtual?.slug]
    .filter((valor) => typeof valor === 'string' && valor.trim())
    .map((valor) => valor.trim())
    .filter((valor, index, lista) => lista.indexOf(valor) === index);

  if (cache.inscricoesCampus && typeof cache.inscricoesCampus === 'object') {
    for (const nomeCampus of nomesCampus) {
      delete cache.inscricoesCampus[nomeCampus];
      delete cache.inscricoesCampus[gerarSlug(nomeCampus)];
    }
  }

  cache.atletasCampus = cache.atletasCampus.filter((atleta) => {
    const campusNome = String(atleta?.campus || '').trim();
    const campusSlug = String(atleta?.campusSlug || '').trim();
    return (
      campusNome !== String(campusAtual?.nome || '').trim() &&
      campusNome !== String(campusAtual?.nomeExibicao || '').trim() &&
      campusSlug !== String(campusAtual?.slug || '').trim()
    );
  });

  return true;
}

function validarDadosCadastroAtleta({ campos, dados, opcoes = {}, matriculaDuplicada = false, limiteRegularTotalCampus = 0, contagemParaLimite = 0 }) {
  const modalidadesSelecionadas = campos.modalidades;
  const detalhesAtleta = validarDetalhesAtleta(dados, modalidadesSelecionadas);
  const nomeCompleto = validarNomeCompleto(campos.nome);

  if (matriculaDuplicada) {
    const erro = new Error('Já existe um atleta cadastrado com esta matrícula neste campus.');
    erro.code = 'MATRICULA_DUPLICADA';
    throw erro;
  }

  if (obterAnoNascimento(campos.dataNascimento) === null) {
    const erro = new Error('Data de nascimento inválida.');
    erro.code = 'DATA_INVALIDA';
    throw erro;
  }

  if (!nomeCompleto) {
    const erro = new Error('Informe o nome completo do atleta, com nome e sobrenome.');
    erro.code = 'NOME_INCOMPLETO';
    throw erro;
  }

  if (!atletaEhSub19(campos, opcoes)) {
    const erro = new Error('A idade do atleta excede o limite permitido para esta categoria');
    erro.code = 'IDADE_LIMITE_EXCEDIDO';
    throw erro;
  }

  if (!modalidadesSelecionadas.length) {
    const erro = new Error('Selecione ao menos uma modalidade para este atleta.');
    erro.code = 'MODALIDADES_OBRIGATORIAS';
    throw erro;
  }

  if (modalidadesSelecionadas.length > 3) {
    const erro = new Error('O atleta pode participar de no máximo 3 esportes.');
    erro.code = 'MODALIDADES_EXCEDIDAS';
    throw erro;
  }

  if (limiteRegularTotalCampus > 0 && contagemParaLimite >= limiteRegularTotalCampus) {
    const erro = new Error('O campus atingiu o limite total de atletas permitido.');
    erro.code = 'LIMITE_REGULAR_EXCEDIDO';
    throw erro;
  }

  return { nomeCompleto, detalhesAtleta, modalidadesSelecionadas, matriculaNormalizada: normalizarMatricula(campos.matricula) };
}

async function cadastrarAtleta(campusNome, dados, opcoes = {}) {
  const campos = validarCamposObrigatoriosAtleta(dados);
  const matriculaNormalizada = normalizarMatricula(campos.matricula);
  const matriculaExistente = cache.atletasCampus.some((atleta) => atleta.campus === campusNome && normalizarMatricula(atleta.matricula) === matriculaNormalizada);
  const statusSolicitado = 'Analise';
  const limiteRegularTotalCampus = Number(opcoes.limiteRegularTotalCampus || 0);
  const { nomeCompleto, detalhesAtleta, modalidadesSelecionadas } = validarDadosCadastroAtleta({
    campos,
    dados,
    opcoes,
    matriculaDuplicada: matriculaExistente,
    limiteRegularTotalCampus,
    contagemParaLimite: getQuantidadeTotal(campusNome)
  });

  const campusId = await buscarCampusIdNoBanco(campusNome);
  if (!campusId) {
    const erro = new Error('Campus não localizado no banco de dados.');
    erro.code = 'CAMPUS_NAO_ENCONTRADO';
    throw erro;
  }

  await validarLimiteModalidadeCampus({ campusId, modalidadesSelecionadas });

  const atleta = {
    nome: nomeCompleto,
    matricula: matriculaNormalizada,
    modalidades: modalidadesSelecionadas,
    dataNascimento: campos.dataNascimento,
    cpf: campos.cpf,
    rg: campos.rg,
    campus: campusNome,
    genero: campos.genero,
    atletismoProvas: detalhesAtleta.atletismoProvas,
    tenisMesaParticipacoes: detalhesAtleta.tenisMesaParticipacoes
  };

  const atletaId = await sincronizarAtletaNoBanco(campusId, atleta, modalidadesSelecionadas, { status: statusSolicitado });
  const novoAtleta = montarAtletaCache({
    id: atletaId,
    nome: nomeCompleto,
    cpf: campos.cpf,
    rg: campos.rg,
    matricula: matriculaNormalizada,
    genero: campos.genero,
    dataNascimento: campos.dataNascimento,
    provas_atletismo: detalhesAtleta.atletismoProvas.length ? JSON.stringify(detalhesAtleta.atletismoProvas) : null,
    tenis_mesa_participacoes: detalhesAtleta.tenisMesaParticipacoes.length ? JSON.stringify(detalhesAtleta.tenisMesaParticipacoes) : null,
    status: statusSolicitado,
    campus_nome: campusNome
  }, modalidadesSelecionadas);

  cache.atletasCampus.push(novoAtleta);

  return novoAtleta;
}

async function atualizarAtleta(atletaId, campusNome, dados, opcoes = {}) {
  const atleta = localizarAtletaPorId(atletaId);
  if (!atleta || atleta.campus !== campusNome) {
    return null;
  }

  if (!atletaPodeSerAlteradoPeloCampus(atleta)) {
    throw criarErroAtletaBloqueado();
  }

  const campos = validarCamposObrigatoriosAtleta(dados);
  const matriculaNormalizada = normalizarMatricula(campos.matricula);
  const matriculaExistente = cache.atletasCampus.some((item) => item.campus === campusNome && item.id !== Number(atletaId) && normalizarMatricula(item.matricula) === matriculaNormalizada);
  const statusSolicitado = 'Analise';
  const limiteRegularTotalCampus = Number(opcoes.limiteRegularTotalCampus || 0);
  const totalSemAtletaAtual = cache.atletasCampus.filter((item) => item.campus === campusNome && item.id !== Number(atletaId)).length;
  const { nomeCompleto, detalhesAtleta, modalidadesSelecionadas } = validarDadosCadastroAtleta({
    campos,
    dados,
    opcoes,
    matriculaDuplicada: matriculaExistente,
    limiteRegularTotalCampus,
    contagemParaLimite: totalSemAtletaAtual
  });

  const campusId = await buscarCampusIdNoBanco(campusNome);
  if (!campusId) {
    const erro = new Error('Campus não localizado no banco de dados.');
    erro.code = 'CAMPUS_NAO_ENCONTRADO';
    throw erro;
  }

  await validarLimiteModalidadeCampus({ campusId, modalidadesSelecionadas, atletaIdExcluir: Number(atletaId) });

  await sincronizarAtletaNoBanco(campusId, {
    nome: nomeCompleto,
    matricula: matriculaNormalizada,
    cpf: campos.cpf,
    rg: campos.rg,
    genero: campos.genero,
    dataNascimento: campos.dataNascimento,
    atletismoProvas: detalhesAtleta.atletismoProvas,
    tenisMesaParticipacoes: detalhesAtleta.tenisMesaParticipacoes
  }, modalidadesSelecionadas, { status: statusSolicitado });

  const atualizado = montarAtletaCache({
    id: Number(atletaId),
    nome: nomeCompleto,
    cpf: campos.cpf,
    rg: campos.rg,
    matricula: matriculaNormalizada,
    genero: campos.genero,
    dataNascimento: campos.dataNascimento,
    provas_atletismo: detalhesAtleta.atletismoProvas.length ? JSON.stringify(detalhesAtleta.atletismoProvas) : null,
    tenis_mesa_participacoes: detalhesAtleta.tenisMesaParticipacoes.length ? JSON.stringify(detalhesAtleta.tenisMesaParticipacoes) : null,
    status: statusSolicitado,
    campus_nome: campusNome
  }, modalidadesSelecionadas);

  const indice = cache.atletasCampus.findIndex((item) => item.id === Number(atletaId));
  if (indice >= 0) {
    cache.atletasCampus[indice] = atualizado;
  }

  return { ...atualizado };
}

function localizarAtletaPorId(atletaId) {
  return cache.atletasCampus.find((item) => item.id === Number(atletaId)) || null;
}

async function atualizarStatusAtleta(atletaId, novoStatus) {
  const atleta = localizarAtletaPorId(atletaId);

  if (!atleta) {
    return null;
  }

  const statusNormalizado = normalizarStatusSolicitado(novoStatus);
  if (statusNormalizado === 'Regular' && !atletaEhSub19(atleta)) {
    return null;
  }

  const indice = cache.atletasCampus.findIndex((item) => item.id === Number(atletaId));
  if (indice >= 0) {
    cache.atletasCampus[indice].status = statusNormalizado;
  }

  try {
    await db.query('UPDATE atletas SET status = ? WHERE id = ?', [statusNormalizado, Number(atletaId)]);
  } catch (error) {
    console.error('Erro ao persistir status do atleta no banco:', error.message);
  }

  return { ...cache.atletasCampus[indice] || atleta };
}

async function excluirAtleta(atletaId, campusNome) {
  const indice = cache.atletasCampus.findIndex((item) => item.id === Number(atletaId) && item.campus === campusNome);
  if (indice === -1) {
    return false;
  }

  if (!atletaPodeSerAlteradoPeloCampus(cache.atletasCampus[indice])) {
    throw criarErroAtletaBloqueado();
  }

  const [atleta] = cache.atletasCampus.splice(indice, 1);
  const campusId = await buscarCampusIdNoBanco(campusNome);
  if (campusId && atleta) {
    try {
      await db.query('DELETE FROM atleta_modalidade WHERE atleta_id = ?', [Number(atleta.id)]);
      await db.query('DELETE FROM atletas WHERE id = ? AND campus_id = ?', [Number(atleta.id), campusId]);
    } catch (error) {
      console.error('Erro ao excluir atleta do banco:', error.message);
    }
  }

  return true;
}

async function substituirAtleta(campusNome, dados) {
  const atletaSubstituidoId = Number(dados.atletaSubstituidoId || dados.atleta_substituido_id || 0);
  if (!Number.isInteger(atletaSubstituidoId) || atletaSubstituidoId <= 0) {
    const erro = new Error('Selecione o atleta que será substituído.');
    erro.code = 'ATLETA_SUBSTITUICAO_INVALIDA';
    throw erro;
  }

  await carregarCacheDeInscricoesEAtletas();

  const atletaSubstituido = cache.atletasCampus.find(
    (item) => item.id === atletaSubstituidoId && item.campus === campusNome && !item.substituido
  );
  if (!atletaSubstituido) {
    const erro = new Error('O atleta selecionado não pertence ao campus ou já foi substituído.');
    erro.code = 'ATLETA_SUBSTITUICAO_INVALIDA';
    throw erro;
  }

  const nomeCompleto = validarNomeCompleto(dados.nome);
  if (!nomeCompleto) {
    const erro = new Error('Informe o nome completo do atleta, com nome e sobrenome.');
    erro.code = 'NOME_INCOMPLETO';
    throw erro;
  }

  const dadosNovoAtleta = prepararDadosSubstituicao(dados);
  if (!dadosNovoAtleta.genero) {
    const erro = new Error('Selecione o gênero do novo atleta.');
    erro.code = 'GENERO_INVALIDO';
    throw erro;
  }
  const modalidadesSelecionadas = dadosNovoAtleta.modalidades;
  if (!modalidadesSelecionadas.length) {
    const erro = new Error('Selecione ao menos uma modalidade para o novo atleta.');
    erro.code = 'MODALIDADES_OBRIGATORIAS';
    throw erro;
  }
  const detalhesAtleta = validarDetalhesAtleta(dadosNovoAtleta, modalidadesSelecionadas);
  const matricula = normalizarMatricula(dados.matricula || dados.matriculaNovo || '');
  const cpfNormalizado = normalizarCPFParaBanco(dados.cpf);
  const rgNormalizado = normalizarRG(dados.rg);
  const dataNascimento = String(dados.dataNascimento || dados.data_nascimento || '').trim();

  if (!matricula) {
    const erro = new Error('Matrícula inválida.');
    erro.code = 'MATRICULA_INVALIDA';
    throw erro;
  }

  if (!/^\d{11}$/.test(cpfNormalizado)) {
    const erro = new Error('CPF deve conter 11 dígitos.');
    erro.code = 'CPF_INVALIDO';
    throw erro;
  }

  if (!dataNascimento) {
    const erro = new Error('Data de nascimento inválida.');
    erro.code = 'DATA_INVALIDA';
    throw erro;
  }

  if (obterAnoNascimento(dataNascimento) === null) {
    const erro = new Error('Data de nascimento inválida.');
    erro.code = 'DATA_INVALIDA';
    throw erro;
  }

  if (!atletaEhSub19({ dataNascimento }, {})) {
    const erro = new Error('A idade do atleta excede o limite permitido para esta categoria');
    erro.code = 'IDADE_LIMITE_EXCEDIDO';
    throw erro;
  }

  const campusId = await buscarCampusIdNoBanco(campusNome);
  if (!campusId) {
    const erro = new Error('Campus não localizado no banco de dados.');
    erro.code = 'CAMPUS_NAO_ENCONTRADO';
    throw erro;
  }

  const atletaExistenteMatricula = cache.atletasCampus.find(
    (item) => item.campus === campusNome && !item.substituido && normalizarMatricula(item.matricula) === matricula
  );
  if (atletaExistenteMatricula) {
    const erro = new Error('Já existe um atleta cadastrado com esta matrícula neste campus.');
    erro.code = 'MATRICULA_DUPLICADA';
    throw erro;
  }

  await validarLimiteModalidadeCampus({
    campusId,
    modalidadesSelecionadas,
    atletaIdExcluir: atletaSubstituido ? Number(atletaSubstituido.id) : null
  });

  const documentoPath = String(dados.documentoPath || '').trim();
  if (!documentoPath) {
    const erro = new Error('Anexe o comprovante da substituição.');
    erro.code = 'DOCUMENTO_SUBSTITUICAO_OBRIGATORIO';
    throw erro;
  }

  const atleta = {
    nome: nomeCompleto,
    matricula,
    modalidade: Array.isArray(modalidadesSelecionadas) ? modalidadesSelecionadas.join(', ') : modalidadesSelecionadas.join(', '),
    genero: dadosNovoAtleta.genero,
    cpf: formatarCPF(cpfNormalizado),
    rg: rgNormalizado,
    dataNascimento,
    campus: campusNome,
    atletismoProvas: detalhesAtleta.atletismoProvas,
    tenisMesaParticipacoes: detalhesAtleta.tenisMesaParticipacoes
  };

  const atletaId = await db.withTransaction(async () => {
    const novoId = await sincronizarAtletaNoBanco(campusId, atleta, modalidadesSelecionadas, { status: 'Analise' });
    for (const modalidade of modalidadesSelecionadas) {
      const modalidadeId = await garantirModalidadeNoBanco(modalidade);
      if (modalidadeId) {
        await db.query('INSERT IGNORE INTO campus_modalidade (campus_id, modalidade_id) VALUES (?, ?)', [campusId, modalidadeId]);
      }
    }
    const [atualizacao] = await db.query(
      'UPDATE atletas SET substituido = 1, substituido_por = ?, substituido_em = NOW() WHERE id = ? AND campus_id = ? AND substituido = 0',
      [novoId, atletaSubstituidoId, campusId]
    );
    if (atualizacao.affectedRows !== 1) {
      const erro = new Error('O atleta selecionado já não pode ser substituído. Atualize a página e tente novamente.');
      erro.code = 'ATLETA_SUBSTITUICAO_INVALIDA';
      throw erro;
    }
    await db.query('DELETE FROM atleta_modalidade WHERE atleta_id = ?', [atletaSubstituidoId]);

    await db.query(
      'INSERT INTO substituicoes_atletas (campus_id, atleta_substituido_id, atleta_novo_id, motivo, documento_path, dados_novo_atleta) VALUES (?, ?, ?, ?, ?, ?)',
      [campusId, atletaSubstituidoId, novoId, String(dados.motivo || dados.alunoSubstituindo || 'Substituição'), documentoPath, JSON.stringify({ nome: nomeCompleto, matricula, cpf: formatarCPF(cpfNormalizado), rg: rgNormalizado, genero: dadosNovoAtleta.genero, modalidades: modalidadesSelecionadas })]
    );
    return novoId;
  });

  const idx = cache.atletasCampus.findIndex((item) => item.id === atletaSubstituidoId);
  if (idx >= 0) {
    cache.atletasCampus[idx].substituido = true;
    cache.atletasCampus[idx].substituidoPor = atletaId;
    cache.atletasCampus[idx].substituidoEm = new Date().toISOString();
  }

  const novoAtleta = montarAtletaCache({
    id: atletaId,
    nome: nomeCompleto,
    cpf: cpfNormalizado,
    rg: rgNormalizado,
    matricula,
    genero: dadosNovoAtleta.genero,
    dataNascimento,
    provas_atletismo: detalhesAtleta.atletismoProvas.length ? JSON.stringify(detalhesAtleta.atletismoProvas) : null,
    tenis_mesa_participacoes: detalhesAtleta.tenisMesaParticipacoes.length ? JSON.stringify(detalhesAtleta.tenisMesaParticipacoes) : null,
    status: 'Analise',
    campus_nome: campusNome
  }, modalidadesSelecionadas);

  cache.atletasCampus.push(novoAtleta);

  return novoAtleta;
}

/* Mantido por compatibilidade: o antigo "sincronizar do state" agora é a
   migração idempotente do state store em direção ao MySQL. */
async function sincronizarAtletasComProvasNoBanco() {
  return migrarDadosCampusDoStateParaBanco();
}

module.exports = {
  normalizarCPF,
  normalizarMatricula,
  prepararDadosSubstituicao,
  validarCamposObrigatoriosAtleta,
  validarDadosCadastroAtleta,
  getInscricoes,
  salvarInscricoes,
  removerCampusDoEstado,
  getAtletas,
  getAtletasParaAnalise,
  getAtletaPorId,
  getQuantidadeRegulares,
  getQuantidadePendentes,
  getQuantidadeAnalise,
  getQuantidadeReprovados,
  getQuantidadeTotal,
  getQuantidadeDisponivelRegular,
  cadastrarAtleta,
  atualizarAtleta,
  atualizarStatusAtleta,
  excluirAtleta,
  substituirAtleta,
  sincronizarAtletasComProvasNoBanco,
  carregarCacheDeInscricoesEAtletas,
  migrarDadosCampusDoStateParaBanco
};