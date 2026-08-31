const db = require('../config/db');
const { getConfiguracoesBanco } = require('./configService');
const { isModalidadeTenisMesa } = require('./modalidadeService');
const { garantirSubCategoriaChavesJogos } = require('../config/ensureSchema');
const mataMataService = require('./mataMataService');
const { obterPadraoEliminatoria } = require('../utils/sportClassificationRules');
const { statusEfetivo } = require('../utils/jogoStatus');

async function gerarEliminatoriaAposSorteio(modalidadeId, nomeModalidade, subEfetiva) {
  try {
    const padrao = obterPadraoEliminatoria(nomeModalidade, subEfetiva);
    if (!padrao) return;
    const [chavesExistentes] = await db.query(
      'SELECT COUNT(*) AS total FROM chaves WHERE modalidade_id = ? AND sub_categoria = ?',
      [modalidadeId, subEfetiva]
    );
    if (Number(chavesExistentes[0].total) < 2) return;
    const resultado = await mataMataService.gerarEliminatoria(modalidadeId, subEfetiva);
    console.log(`Eliminatória gerada junto ao sorteio: ${nomeModalidade} (${subEfetiva}) — ${resultado.totalJogos} jogos.`);
  } catch (error) {
    console.error(`Eliminatória não gerada para ${nomeModalidade} (${subEfetiva}): ${error.message}`);
  }
}

function resolverSubCategoria(nomeModalidade, subCategoria = '') {
  const subNormalizada = String(subCategoria || '').trim().toLowerCase();
  if (!isModalidadeTenisMesa(nomeModalidade)) {
    return 'geral';
  }
  return subNormalizada === 'dupla' ? 'dupla' : 'individual';
}

function obterNumeroSistema(participante = {}) {
  const valores = [
    participante?.numeroSistema,
    participante?.numero,
    participante?.numeroCampus,
    participante?.campusNumero,
    participante?.campusId,
    participante?.campus_id,
    participante?.id
  ];

  for (const valor of valores) {
    const numero = Number(valor);
    if (Number.isFinite(numero) && numero > 0) {
      return numero;
    }
  }

  return 0;
}

function embaralharArray(lista) {
  const copia = Array.isArray(lista) ? [...lista] : [];
  for (let indice = copia.length - 1; indice > 0; indice -= 1) {
    const indiceAleatorio = Math.floor(Math.random() * (indice + 1));
    [copia[indice], copia[indiceAleatorio]] = [copia[indiceAleatorio], copia[indice]];
  }
  return copia;
}

function ordenarPorNumeroESorteio(lista) {
  const itens = Array.isArray(lista) ? lista : [];
  if (!itens.length) {
    return [];
  }

  return itens
    .map((item, index) => {
      const numero = obterNumeroSistema(item);
      const numeroBase = Number.isFinite(numero) && numero > 0 ? numero : index + 1;
      const randomico = Math.floor(Math.random() * 1_000_000);
      return {
        item,
        prioridade: `${String(randomico).padStart(6, '0')}${String(numeroBase).padStart(8, '0')}`
      };
    })
    .sort((a, b) => a.prioridade.localeCompare(b.prioridade))
    .map(({ item }) => item);
}

function calcularDistribuicaoTamanhoChaves(totalParticipantes, maxTamanho = 3) {
  const total = Number(totalParticipantes || 0);
  const limite = Number(maxTamanho || 3);
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(limite) || limite <= 0) {
    return [];
  }

  if (total <= limite) {
    return [total];
  }

  let quantidadeGrupos = Math.max(1, Math.ceil(total / limite));
  while (quantidadeGrupos > 1 && Math.floor(total / quantidadeGrupos) < 2) {
    quantidadeGrupos -= 1;
  }

  const base = Math.floor(total / quantidadeGrupos);
  const resto = total % quantidadeGrupos;
  const tamanhos = Array.from({ length: quantidadeGrupos }, (_, index) => base + (index < resto ? 1 : 0));
  return tamanhos;
}

function calcularDistribuicaoTenisMesaIndividual(totalParticipantes) {
  const total = Number(totalParticipantes || 0);
  if (!Number.isFinite(total) || total <= 0) {
    return [];
  }

  if (total <= 2) {
    return [total];
  }

  if (total % 3 === 0) {
    return Array.from({ length: total / 3 }, () => 3);
  }

  if (total % 3 === 1) {
    const chavesDeTres = (total - 4) / 3;
    return [4, ...Array.from({ length: chavesDeTres }, () => 3)];
  }

  if (total >= 8) {
    const chavesDeTres = (total - 8) / 3;
    return [4, 4, ...Array.from({ length: chavesDeTres }, () => 3)];
  }

  return [total];
}

function obterCampusDoParticipante(participante) {
  return String(
    participante?.nomeCampus
    || participante?.campusNome
    || participante?.campus_nome
    || participante?.nome_exibicao
    || participante?.campus
    || participante?.nome
    || ''
  ).trim().toLowerCase();
}

function obterFaseParaBanco(rodadaNumero = 1) {
  const rodada = Number(rodadaNumero || 1);
  if (rodada <= 1) return 'Fase de Grupos';
  if (rodada === 2) return 'Oitavas';
  if (rodada === 3) return 'Quartas';
  if (rodada === 4) return 'Semifinal';
  return 'Final';
}

function formatarDataHoraLocal(data) {
  const pad = (valor) => String(valor).padStart(2, '0');
  return `${data.getFullYear()}-${pad(data.getMonth() + 1)}-${pad(data.getDate())} ${pad(data.getHours())}:${pad(data.getMinutes())}:${pad(data.getSeconds())}`;
}

function criarParId(participante, tipoParticipante = 'campus') {
  const primeiroId = tipoParticipante === 'atleta'
    ? Number(participante?.atleta1Id || participante?.atleta_id || participante?.id || 0)
    : Number(participante?.campus1Id || participante?.campus_id || participante?.id || 0);
  const segundoId = tipoParticipante === 'atleta'
    ? Number(participante?.atleta2Id || participante?.id || 0)
    : Number(participante?.campus2Id || participante?.id || 0);

  if (!primeiroId || !segundoId) {
    return null;
  }

  return `${Math.min(primeiroId, segundoId)}-${Math.max(primeiroId, segundoId)}`;
}

function gerarRodadasRoundRobin(participantes, { tipoParticipante = 'campus' } = {}) {
  const lista = Array.isArray(participantes) ? participantes.filter(Boolean) : [];
  if (lista.length < 2) {
    return [];
  }

  const paresParaRodada = (size) => {
    if (size === 2) {
      return [
        [[0, 1]]
      ];
    }
    if (size === 3) {
      return [
        [[0, 1]],
        [[0, 2]],
        [[1, 2]]
      ];
    }
    if (size === 4) {
      return [
        [[0, 2], [1, 3]],
        [[0, 1], [2, 3]],
        [[0, 3], [1, 2]]
      ];
    }
    const players = [...lista];
    const evenSize = players.length % 2 === 0 ? players.length : players.length + 1;
    const extended = players.length % 2 === 1 ? [...players, null] : [...players];
    const rounds = [];
    const rotacao = [...extended];
    for (let rodada = 0; rodada < extended.length - 1; rodada += 1) {
      const pares = [];
      for (let i = 0; i < extended.length / 2; i += 1) {
        const primeiro = rotacao[i];
        const segundo = rotacao[extended.length - 1 - i];
        if (!primeiro || !segundo) continue;
        pares.push([i, extended.length - 1 - i]);
      }
      rounds.push(pares);
      const ultimo = rotacao.pop();
      rotacao.splice(1, 0, ultimo);
    }
    return rounds;
  };

  const pairsByRound = paresParaRodada(lista.length);
  const partidas = [];

  pairsByRound.forEach((pairs, rodadaIndex) => {
    const rodada = rodadaIndex + 1;
    pairs.forEach(([primeiroIndex, segundoIndex]) => {
      const primeiro = lista[primeiroIndex];
      const segundo = lista[segundoIndex];
      if (!primeiro || !segundo) return;

      if (tipoParticipante === 'atleta') {
        partidas.push({
          rodada,
          atleta1Id: primeiro?.id || null,
          atleta2Id: segundo?.id || null,
          atleta1Nome: primeiro?.nomeAtleta || primeiro?.nome || null,
          atleta2Nome: segundo?.nomeAtleta || segundo?.nome || null,
          chaveNome: null
        });
      } else {
        partidas.push({
          rodada,
          campus1Id: primeiro?.id || null,
          campus2Id: segundo?.id || null,
          campus1Nome: primeiro?.nomeCampus || primeiro?.nome || null,
          campus2Nome: segundo?.nomeCampus || segundo?.nome || null,
          chaveNome: null
        });
      }
    });
  });

  return partidas;
}

function montarConfrontosDaChave(participantes, { tipoParticipante = 'campus' } = {}) {
  const lista = Array.isArray(participantes) ? participantes.filter(Boolean) : [];
  if (lista.length < 2) {
    return [];
  }

  return gerarRodadasRoundRobin(lista, { tipoParticipante });
}

async function buscarParticipantesModalidade(modalidadeId, subCategoria = '') {
  const id = Number(modalidadeId || 0);
  if (!id) {
    return [];
  }

  const subCategoriaNormalizada = String(subCategoria || '').trim().toLowerCase();

  try {
    const [modalidadeRows] = await db.query('SELECT id, nome, tipo_confronto, genero FROM modalidades WHERE id = ?', [id]);
    const modalidade = modalidadeRows[0];
    if (!modalidade) {
      return [];
    }

    const nomeModalidade = String(modalidade.nome || '');
    const tipoConfronto = String(modalidade.tipo_confronto || '').trim();
    const modalidadeIndividual = tipoConfronto === 'Individual' || /atletismo/i.test(nomeModalidade) || /xadrez/i.test(nomeModalidade) || isModalidadeTenisMesa(nomeModalidade) || subCategoriaNormalizada === 'individual' || subCategoriaNormalizada === 'dupla';

    if (!modalidadeIndividual) {
      const [linhas] = await db.query(
        `SELECT c.id, c.nome, c.nome_exibicao, c.slug
         FROM campus_modalidade cm
         JOIN campus c ON c.id = cm.campus_id
         WHERE cm.modalidade_id = ?
         ORDER BY c.id ASC, c.nome ASC`,
        [id]
      );

      return linhas.map((campus) => ({
        id: campus.id,
        nome: campus.nome_exibicao || campus.nome,
        nomeCampus: campus.nome_exibicao || campus.nome,
        nomeAtleta: campus.nome_exibicao || campus.nome,
        numeroSistema: Number(campus.id || 0),
        subCategoria: String(subCategoria || '').trim() || 'geral'
      }));
    }

    const [linhas] = await db.query(
      `SELECT a.id, a.nome AS nome_atleta, a.campus_id, c.nome AS campus_nome, c.nome_exibicao, c.slug
       FROM atletas a
       JOIN campus c ON c.id = a.campus_id
       JOIN atleta_modalidade am ON am.atleta_id = a.id
       WHERE am.modalidade_id = ? AND a.genero = ?
       ORDER BY c.id ASC, a.id ASC`,
      [id, modalidade.genero]
    );

    const participantesPorCampus = new Map();
    linhas.forEach((linha) => {
      const campusId = Number(linha.campus_id || 0);
      if (!participantesPorCampus.has(campusId)) {
        participantesPorCampus.set(campusId, {
          campusId,
          campusNome: String(linha.nome_exibicao || linha.campus_nome || 'Campus').trim(),
          atletas: []
        });
      }

      participantesPorCampus.get(campusId).atletas.push({
        id: linha.id,
        nome: String(linha.nome_atleta || '').trim(),
        campusId,
        campusNome: String(linha.nome_exibicao || linha.campus_nome || 'Campus').trim()
      });
    });

    const participantes = [];
    participantesPorCampus.forEach((grupo) => {
      const atletas = (grupo.atletas || []).slice().sort((a, b) => a.nome.localeCompare(b.nome));

      if (subCategoriaNormalizada === 'dupla' && isModalidadeTenisMesa(nomeModalidade)) {
        if (atletas.length < 2) {
          return;
        }

        const primeiro = atletas[0];
        const segundo = atletas[1];
        participantes.push({
          id: `${primeiro.id}-${segundo.id}`,
          nome: `${primeiro.nome} e ${segundo.nome}`,
          nomeAtleta: `${primeiro.nome} e ${segundo.nome}`,
          nomeCampus: grupo.campusNome,
          numeroInscrito: 1,
          campusId: grupo.campusId,
          numeroSistema: Number(grupo.campusId || 0),
          subCategoria: 'dupla'
        });
        return;
      }

      atletas.forEach((atleta, indice) => {
        const numeroInscrito = indice + 1;
        const etiqueta = /atletismo/i.test(nomeModalidade) || /xadrez/i.test(nomeModalidade)
          ? atleta.nome
          : isModalidadeTenisMesa(nomeModalidade)
            ? `${atleta.nome} ${grupo.campusNome} ${numeroInscrito}`
            : `${atleta.nome} ${grupo.campusNome} ${numeroInscrito}`;

        participantes.push({
          id: atleta.id,
          nome: etiqueta,
          nomeAtleta: etiqueta,
          nomeCampus: grupo.campusNome,
          numeroInscrito,
          campusId: grupo.campusId,
          numeroSistema: Number(grupo.campusId || 0),
          subCategoria: subCategoriaNormalizada || 'individual'
        });
      });
    });

    return participantes;
  } catch (error) {
    return [];
  }
}

async function montarParesDuplasPorCampus(modalidadeId) {
  const id = Number(modalidadeId || 0);
  const [modalidadeRows] = await db.query('SELECT genero FROM modalidades WHERE id = ?', [id]);
  const generoModalidade = modalidadeRows[0] ? modalidadeRows[0].genero : null;

  const [linhas] = await db.query(
    `SELECT a.id, a.nome AS nome_atleta, a.campus_id
     FROM atletas a
     JOIN atleta_modalidade am ON am.atleta_id = a.id
     WHERE am.modalidade_id = ? AND (? IS NULL OR a.genero = ?)
     ORDER BY a.campus_id ASC, a.nome ASC`,
    [id, generoModalidade, generoModalidade]
  );

  const atletasPorCampus = new Map();
  linhas.forEach((linha) => {
    const campusId = Number(linha.campus_id || 0);
    if (!atletasPorCampus.has(campusId)) {
      atletasPorCampus.set(campusId, []);
    }
    atletasPorCampus.get(campusId).push(String(linha.nome_atleta || '').trim());
  });

  const pares = new Map();
  atletasPorCampus.forEach((nomes, campusId) => {
    if (nomes.length >= 2) {
      pares.set(campusId, `${nomes[0]} e ${nomes[1]}`);
    }
  });
  return pares;
}

function agruparParticipantesEmChaves(participantes, tamanhoChave = 4, opcoes = {}) {
  const lista = Array.isArray(participantes) ? [...participantes] : [];
  if (!lista.length) {
    return [];
  }

  const nomeModalidade = String(opcoes?.modalidadeNome || '').trim();
  const subCategoria = String(opcoes?.subCategoria || '').trim().toLowerCase();
  const usarRegraTenisIndividual = isModalidadeTenisMesa(nomeModalidade) && subCategoria === 'individual';

  const listaOrdenada = ordenarPorNumeroESorteio(lista);

  if (!usarRegraTenisIndividual) {
    const tamanhosDesejados = calcularDistribuicaoTamanhoChaves(listaOrdenada.length, tamanhoChave);
    const grupos = Array.from({ length: tamanhosDesejados.length }, () => []);

    listaOrdenada.forEach((participante) => {
      let grupoEscolhido = -1;
      for (let indiceGrupo = 0; indiceGrupo < grupos.length; indiceGrupo += 1) {
        const grupo = grupos[indiceGrupo];
        const restante = (tamanhosDesejados[indiceGrupo] || 0) - grupo.length;
        if (restante > 0) {
          grupoEscolhido = indiceGrupo;
          break;
        }
      }

      if (grupoEscolhido === -1) {
        grupos.push([participante]);
      } else {
        grupos[grupoEscolhido].push(participante);
      }
    });

    return grupos.map((grupo) => grupo.slice());
  }

  const tamanhosDesejados = usarRegraTenisIndividual
    ? calcularDistribuicaoTenisMesaIndividual(listaOrdenada.length)
    : calcularDistribuicaoTamanhoChaves(listaOrdenada.length);
  const grupos = Array.from({ length: tamanhosDesejados.length }, () => []);
  const frequenciaCampus = new Map();

  listaOrdenada.forEach((participante) => {
    const campus = obterCampusDoParticipante(participante);
    frequenciaCampus.set(campus, (frequenciaCampus.get(campus) || 0) + 1);
  });

  const participantesOrdenados = ordenarPorNumeroESorteio(listaOrdenada.slice());

  participantesOrdenados.forEach((participante) => {
    const campus = obterCampusDoParticipante(participante);
    let grupoEscolhido = -1;

    for (let indiceGrupo = 0; indiceGrupo < grupos.length; indiceGrupo += 1) {
      const grupo = grupos[indiceGrupo];
      const restante = (tamanhosDesejados[indiceGrupo] || 0) - grupo.length;
      if (restante <= 0) {
        continue;
      }

      const possuiMesmoCampus = grupo.some((item) => obterCampusDoParticipante(item) === campus);
      if (!possuiMesmoCampus) {
        grupoEscolhido = indiceGrupo;
        break;
      }
    }

    if (grupoEscolhido === -1) {
      for (let indiceGrupo = 0; indiceGrupo < grupos.length; indiceGrupo += 1) {
        const grupo = grupos[indiceGrupo];
        const restante = (tamanhosDesejados[indiceGrupo] || 0) - grupo.length;
        if (restante > 0) {
          grupoEscolhido = indiceGrupo;
          break;
        }
      }
    }

    if (grupoEscolhido === -1) {
      grupos.push([participante]);
    } else {
      grupos[grupoEscolhido].push(participante);
    }
  });

  return grupos.map((grupo) => grupo.slice());
}

async function efetuarChaveamentoMatematico(modalidadeId, subCategoria = '') {
  const id = Number(modalidadeId || 0);
  if (!id) {
    throw new Error('Modalidade inválida para sorteio.');
  }

  try {
    await garantirSubCategoriaChavesJogos();

    try {
      await db.query(`
        ALTER TABLE campus_modalidade
        ADD COLUMN ordem_sorteio INT DEFAULT NULL
      `);
    } catch (error) {
      if (!/Duplicate column|already exists/i.test(error.message || '')) {
        throw error;
      }
    }

    const [modalidadeRows] = await db.query('SELECT id, nome, tipo_confronto, genero FROM modalidades WHERE id = ?', [id]);
    const modalidade = modalidadeRows[0];
    if (!modalidade) {
      return { chaves: [], jogos: [] };
    }

    const nomeModalidade = String(modalidade?.nome || '');
    const subCategoriaNormalizada = String(subCategoria || '').trim().toLowerCase();
    const subEfetiva = resolverSubCategoria(nomeModalidade, subCategoriaNormalizada);
    const usarRegraTenisIndividual = isModalidadeTenisMesa(nomeModalidade) && subEfetiva === 'individual';

    const configuracoesEvento = await getConfiguracoesBanco();
    const inicioEvento = String(configuracoesEvento?.inicio_evento || '').trim();
    const dataBaseJogo = inicioEvento ? new Date(`${inicioEvento}T08:00:00`) : new Date();

    if (subEfetiva !== 'individual') {
      await db.query('UPDATE campus_modalidade SET chave_id = NULL, ordem_sorteio = NULL WHERE modalidade_id = ?', [id]);
    }
    await db.query('DELETE FROM jogos WHERE modalidade_id = ? AND sub_categoria = ?', [id, subEfetiva]);
    await db.query('DELETE FROM chaves WHERE modalidade_id = ? AND sub_categoria = ?', [id, subEfetiva]);

    if (usarRegraTenisIndividual) {
      const [participantes] = await db.query(
        `SELECT a.id, a.nome AS nome_atleta, c.id AS campus_id, c.nome AS campus_nome, c.nome_exibicao, c.slug
         FROM atletas a
         JOIN campus c ON c.id = a.campus_id
         JOIN atleta_modalidade am ON am.atleta_id = a.id
         WHERE am.modalidade_id = ? AND a.genero = ?
         ORDER BY c.nome ASC, a.nome ASC`,
        [id, modalidade.genero]
      );

      if (!participantes.length) {
        return { chaves: [], jogos: [] };
      }

      const participantesNormalizados = participantes.map((atleta) => ({
        id: Number(atleta.id || 0),
        nome: String(atleta.nome_atleta || '').trim(),
        nomeAtleta: String(atleta.nome_atleta || '').trim(),
        campusId: Number(atleta.campus_id || 0),
        campusNome: String(atleta.nome_exibicao || atleta.campus_nome || 'Campus').trim(),
        numeroSistema: Number(atleta.campus_id || 0)
      }));

      const grupos = agruparParticipantesEmChaves(participantesNormalizados, 3, {
        modalidadeNome: nomeModalidade,
        subCategoria: subCategoriaNormalizada
      });

      const chavesCriadas = [];
      const jogosGerados = [];

      for (let index = 0; index < grupos.length; index += 1) {
        const grupo = grupos[index];
        const [resultadoChave] = await db.query(
          'INSERT INTO chaves (modalidade_id, numero_chave, sub_categoria) VALUES (?, ?, ?)',
          [id, index + 1, 'individual']
        );
        const chaveId = resultadoChave.insertId;
        chavesCriadas.push({ id: chaveId, numero_chave: index + 1 });

        const confrontos = montarConfrontosDaChave(grupo, { tipoParticipante: 'atleta' });
        for (const [indiceConfronto, confronto] of confrontos.entries()) {
        const faseJogo = 'Fase de Grupos';
          const dataHoraJogo = new Date(dataBaseJogo.getTime() + indiceConfronto * 60 * 60 * 1000);
          const dataHoraSql = formatarDataHoraLocal(dataHoraJogo);
          const [resultadoJogo] = await db.query(
            `INSERT INTO jogos (
               modalidade_id, chave_id, fase, rodada, atleta_1_id, atleta_2_id,
               data_hora, local_jogo, status, sub_categoria
             ) VALUES (?, ?, ?, ?, ?, ?, ?, 'A definir', 'Agendado', 'individual')`,
            [id, chaveId, faseJogo, confronto.rodada || 1, confronto.atleta1Id, confronto.atleta2Id, dataHoraSql]
          );
          jogosGerados.push({ id: resultadoJogo.insertId, chaveId });
        }
      }

      await gerarEliminatoriaAposSorteio(id, nomeModalidade, subEfetiva);
      return { chaves: chavesCriadas, jogos: jogosGerados };
    }

    const [inscritos] = await db.query(
      `SELECT c.id, c.nome, c.nome_exibicao, c.slug
       FROM campus_modalidade cm
       JOIN campus c ON c.id = cm.campus_id
       WHERE cm.modalidade_id = ?
       ORDER BY c.id ASC, c.nome ASC`,
      [id]
    );

    if (!inscritos.length) {
      return { chaves: [], jogos: [] };
    }

    const tamanhoChave = 4;
    const grupos = agruparParticipantesEmChaves(inscritos.map((inscrito) => ({ ...inscrito, numeroSistema: Number(inscrito.id || 0) })), tamanhoChave);

    for (let index = 0; index < grupos.length; index += 1) {
      const grupo = grupos[index];
      const [resultadoChave] = await db.query(
        'INSERT INTO chaves (modalidade_id, numero_chave, sub_categoria) VALUES (?, ?, ?)',
        [id, index + 1, subEfetiva]
      );
      const chaveId = resultadoChave.insertId;

      for (const [index, inscrito] of grupo.entries()) {
        await db.query(
          'UPDATE campus_modalidade SET chave_id = ?, ordem_sorteio = ? WHERE campus_id = ? AND modalidade_id = ?',
          [chaveId, index + 1, inscrito.id, id]
        );
      }
    }

    const [chavesCriadas] = await db.query('SELECT id, numero_chave FROM chaves WHERE modalidade_id = ? AND sub_categoria = ? ORDER BY numero_chave ASC', [id, subEfetiva]);
    const jogosGerados = [];
    for (const chave of chavesCriadas) {
      const [participantes] = await db.query(
        `SELECT cm.campus_id AS id, c.nome AS nome, c.nome_exibicao, c.slug, cm.ordem_sorteio
         FROM campus_modalidade cm
         JOIN campus c ON c.id = cm.campus_id
         WHERE cm.modalidade_id = ? AND cm.chave_id = ?
         ORDER BY cm.ordem_sorteio IS NULL, cm.ordem_sorteio ASC, c.id ASC, c.nome ASC`,
        [id, chave.id]
      );

      const confrontos = montarConfrontosDaChave(participantes, { tipoParticipante: 'campus' });
      for (const [index, confronto] of confrontos.entries()) {
        const dataHoraJogo = new Date(dataBaseJogo.getTime() + index * 60 * 60 * 1000);
        const dataHoraSql = formatarDataHoraLocal(dataHoraJogo);

        const faseJogo = 'Fase de Grupos';
        const [resultadoJogo] = await db.query(
          `INSERT INTO jogos (
             modalidade_id, chave_id, fase, rodada, campus_1_id, campus_2_id,
             data_hora, local_jogo, status, sub_categoria
           ) VALUES (?, ?, ?, ?, ?, ?, ?, 'A definir', 'Agendado', ?)`,
          [id, chave.id, faseJogo, confronto.rodada || 1, confronto.campus1Id, confronto.campus2Id, dataHoraSql, subEfetiva]
        );
        jogosGerados.push({ id: resultadoJogo.insertId, chaveId: chave.id });
      }
    }

    await gerarEliminatoriaAposSorteio(id, nomeModalidade, subEfetiva);
    return { chaves: chavesCriadas, jogos: jogosGerados };
  } catch (error) {
    throw error;
  }
}

async function atualizarJogoChaveamento(jogoId, dados = {}) {
  const id = Number(jogoId || 0);
  if (!id) {
    throw new Error('ID do jogo inválido.');
  }

  const dataInformada = String(dados.dataJogo || dados.data || '').trim();
  const horarioInformado = String(dados.horarioJogo || dados.horario || '').trim();
  const localInformado = String(dados.localJogo || dados.local || '').trim();
  const statusInformado = typeof dados.status === 'undefined'
    ? null
    : String(dados.status || '').trim();

  let dataHoraSql = null;
  if (dataInformada) {
    const partesData = dataInformada.split(/[/-]/).map((item) => Number(item));
    if (partesData.length === 3 && partesData.every((item) => Number.isFinite(item))) {
      let dia = partesData[0];
      let mes = partesData[1];
      let ano = partesData[2];

      if (String(dataInformada).includes('-') && partesData[0] > 31) {
        ano = partesData[0];
        mes = partesData[1];
        dia = partesData[2];
      }

      const hora = horarioInformado ? Number(String(horarioInformado).split(':')[0]) : 0;
      const minuto = horarioInformado ? Number(String(horarioInformado).split(':')[1]) : 0;
      const dataLocal = new Date(ano, mes - 1, dia, hora || 0, minuto || 0, 0);
      dataHoraSql = formatarDataHoraLocal(dataLocal);
    }
  }

  const campos = [];
  const valores = [];

  if (statusInformado) {
    campos.push('status = ?');
    valores.push(statusInformado);
  }

  if (localInformado) {
    campos.push('local_jogo = ?');
    valores.push(localInformado);
  }

  if (dataHoraSql) {
    campos.push('data_hora = ?');
    valores.push(dataHoraSql);
  }

  if (!campos.length) {
    return null;
  }

  valores.push(id);
  await db.query(`UPDATE jogos SET ${campos.join(', ')} WHERE id = ?`, valores);
  return { id };
}

async function getInscritosModalidade(modalidadeId, subCategoria = '') {
  const participantes = await buscarParticipantesModalidade(modalidadeId, subCategoria);
  return participantes.map((participante) => ({
    ...participante,
    subCategoria: String(subCategoria || '').trim() || 'geral'
  }));
}

async function getChavesModalidade(modalidadeId, subCategoria = '') {
  const id = Number(modalidadeId || 0);
  if (!id) {
    return [];
  }

  try {
    await garantirSubCategoriaChavesJogos();

    try {
      await db.query(`
        ALTER TABLE campus_modalidade
        ADD COLUMN ordem_sorteio INT DEFAULT NULL
      `);
    } catch (error) {
      if (!/Duplicate column|already exists/i.test(error.message || '')) {
        throw error;
      }
    }

    const [modalidadeRows] = await db.query('SELECT id, nome, tipo_confronto FROM modalidades WHERE id = ?', [id]);
    const modalidade = modalidadeRows[0];
    if (!modalidade) {
      return [];
    }

    const nomeModalidade = String(modalidade?.nome || '');
    const tipoConfronto = String(modalidade?.tipo_confronto || '').trim();
    const subCategoriaNormalizada = String(subCategoria || '').trim().toLowerCase();
    const modalidadeIndividual = tipoConfronto === 'Individual' || /atletismo/i.test(nomeModalidade) || /xadrez/i.test(nomeModalidade) || isModalidadeTenisMesa(nomeModalidade) || subCategoriaNormalizada === 'individual' || subCategoriaNormalizada === 'dupla';

    const subFiltravel = isModalidadeTenisMesa(nomeModalidade) && ['individual', 'dupla'].includes(subCategoriaNormalizada);
    const [chavesRows] = subFiltravel
      ? await db.query('SELECT id, numero_chave FROM chaves WHERE modalidade_id = ? AND sub_categoria = ? ORDER BY numero_chave ASC', [id, subCategoriaNormalizada])
      : await db.query('SELECT id, numero_chave FROM chaves WHERE modalidade_id = ? ORDER BY numero_chave ASC', [id]);
    if (!chavesRows.length) {
      return [];
    }

    const duplaTenisMesa = subCategoriaNormalizada === 'dupla' && isModalidadeTenisMesa(nomeModalidade);
    const exibirPorAtleta = modalidadeIndividual && !duplaTenisMesa;

    const grupos = [];
    for (const chave of chavesRows) {
      const [participantes] = exibirPorAtleta
        ? await db.query(
            `SELECT DISTINCT a.id AS id, a.nome AS nome_atleta, c.nome AS campus_nome, c.nome_exibicao
             FROM jogos j
             JOIN atletas a ON a.id = j.atleta_1_id OR a.id = j.atleta_2_id
             JOIN campus c ON c.id = a.campus_id
             WHERE j.modalidade_id = ? AND j.chave_id = ?
             ORDER BY a.nome ASC`,
            [id, chave.id]
          )
        : await db.query(
            `SELECT cm.campus_id AS id, c.nome AS nome, c.nome_exibicao, c.slug, cm.ordem_sorteio
             FROM campus_modalidade cm
             JOIN campus c ON c.id = cm.campus_id
             WHERE cm.modalidade_id = ? AND cm.chave_id = ?
             ORDER BY cm.ordem_sorteio IS NULL, cm.ordem_sorteio ASC, c.id ASC, c.nome ASC`,
            [id, chave.id]
          );

      grupos.push({
        id: chave.id,
        modalidade_id: Number(id || 0),
        numero_chave: chave.numero_chave || grupos.length + 1,
        nome_chave: `Chave ${chave.numero_chave || grupos.length + 1}`,
        letra: String.fromCharCode(64 + (chave.numero_chave || grupos.length + 1)),
        subCategoria: String(subCategoria || '').trim() || 'geral',
        integrantes: participantes.map((participante) => ({
          id: participante.id,
          nomeCampus: participante.nome_exibicao || participante.nome || participante.nome_atleta || 'Campus sem nome',
          nome: participante.nome_exibicao || participante.nome || participante.nome_atleta || 'Campus sem nome',
          nomeAtleta: participante.nome_atleta || participante.nome_exibicao || participante.nome || 'Campus sem nome',
          numeroInscrito: 0,
          pontosFaseDeGrupos: 0
        }))
      });
    }

    if (duplaTenisMesa) {
      const paresDuplas = await montarParesDuplasPorCampus(id);
      grupos.forEach((grupo) => {
        grupo.integrantes.forEach((integrante) => {
          const par = paresDuplas.get(Number(integrante.id));
          if (par) {
            integrante.nomeAtleta = par;
            integrante.nome = par;
          }
        });
      });
    }

    try {
      const classificacaoService = require('./classificacaoService');
      const classificacao = await classificacaoService.getClassificacaoModalidade(id, null, {});
      const mapaPontos = new Map();
      classificacao.forEach((linha) => {
        const participanteId = Number(linha.atleta_id || linha.campus_id || 0);
        if (!participanteId) return;
        mapaPontos.set(`${Number(linha.chave_id)}:${participanteId}`, Number(linha.pontos) || 0);
      });
      grupos.forEach((grupo) => {
        grupo.integrantes.forEach((integrante) => {
          const pontos = mapaPontos.get(`${Number(grupo.id)}:${Number(integrante.id)}`);
          if (typeof pontos === 'number') {
            integrante.pontosFaseDeGrupos = pontos;
          }
        });
        grupo.integrantes.sort((a, b) =>
          (b.pontosFaseDeGrupos - a.pontosFaseDeGrupos)
          || String(a.nomeCampus || '').localeCompare(String(b.nomeCampus || ''), 'pt-BR')
        );
      });
    } catch (_) {
      console.warn('Aviso: Falha ao ordenar integrantes do grupo em chaveamentoService:', _.message || _);
    }

    return grupos;
  } catch (error) {
    return [];
  }
}

async function getJogosModalidade(modalidadeId, subCategoria = '') {
  const id = Number(modalidadeId || 0);
  if (!id) {
    return [];
  }

  try {
    await garantirSubCategoriaChavesJogos();

    const [modalidadeRows] = await db.query('SELECT id, nome, tipo_confronto FROM modalidades WHERE id = ?', [id]);
    const modalidade = modalidadeRows[0] || {};
    const nomeModalidade = String(modalidade.nome || '');
    const tipoConfronto = String(modalidade.tipo_confronto || '').trim();
    const subCategoriaNormalizada = String(subCategoria || '').trim().toLowerCase();
    const modalidadeIndividual = tipoConfronto === 'Individual' || /atletismo/i.test(nomeModalidade) || /xadrez/i.test(nomeModalidade) || isModalidadeTenisMesa(nomeModalidade) || subCategoriaNormalizada === 'individual' || subCategoriaNormalizada === 'dupla';
    const duplaTenisMesaJogos = subCategoriaNormalizada === 'dupla' && isModalidadeTenisMesa(nomeModalidade);
    const tratarComoIndividual = modalidadeIndividual && !duplaTenisMesaJogos;
    const filtroSubJogos = isModalidadeTenisMesa(nomeModalidade) && ['individual', 'dupla'].includes(subCategoriaNormalizada)
      ? 'AND j.sub_categoria = ?'
      : '';
    const paramsSubJogos = filtroSubJogos ? [id, subCategoriaNormalizada] : [id];

    let paresDuplasJogos = null;
    if (duplaTenisMesaJogos) {
      paresDuplasJogos = await montarParesDuplasPorCampus(id);
    }

    const [participantesPorChaveDados] = await db.query(
      tratarComoIndividual
        ? `SELECT j.chave_id, a.id AS atleta_id, a.nome AS nome_atleta, c.id AS campus_id, c.nome AS campus_nome, c.nome_exibicao
           FROM jogos j
           JOIN atletas a ON a.id = j.atleta_1_id OR a.id = j.atleta_2_id
           JOIN campus c ON c.id = a.campus_id
           WHERE j.modalidade_id = ? ${filtroSubJogos}
           ORDER BY j.chave_id ASC, c.id ASC, a.nome ASC`
        : `SELECT cm.chave_id, c.id AS campus_id, c.nome AS nome, c.nome_exibicao, c.slug, cm.ordem_sorteio
           FROM campus_modalidade cm
           JOIN campus c ON c.id = cm.campus_id
           WHERE cm.modalidade_id = ? AND cm.chave_id IS NOT NULL
           ORDER BY cm.chave_id ASC, cm.ordem_sorteio IS NULL, cm.ordem_sorteio ASC, c.id ASC`,
      paramsSubJogos
    );

    const participantesPorChave = new Map();
    participantesPorChaveDados.forEach((linha) => {
      const chaveId = Number(linha.chave_id || 0);
      if (!chaveId) return;
      if (!participantesPorChave.has(chaveId)) {
        participantesPorChave.set(chaveId, []);
      }

      if (tratarComoIndividual) {
        const atletaId = Number(linha.atleta_id || 0);
        if (!atletaId) return;
        const chaveParticipantes = participantesPorChave.get(chaveId);
        if (chaveParticipantes.some((p) => Number(p.id) === atletaId)) {
          return;
        }
        participantesPorChave.get(chaveId).push({
          id: atletaId,
          nome: linha.nome_atleta || '',
          nomeAtleta: linha.nome_atleta || '',
          nomeCampus: linha.nome_exibicao || linha.campus_nome || ''
        });
      } else {
        participantesPorChave.get(chaveId).push({
          id: linha.campus_id,
          nome: String(linha.nome_exibicao || linha.nome || ''),
          nomeCampus: String(linha.nome_exibicao || linha.nome || ''),
          numeroSistema: Number(linha.campus_id || 0)
        });
      }
    });

    const rodadasPorChave = new Map();
    participantesPorChave.forEach((participantesLista, chaveId) => {
      if (!Array.isArray(participantesLista) || participantesLista.length < 2) {
        return;
      }

      const tipoParticipante = tratarComoIndividual ? 'atleta' : 'campus';
      const partidas = gerarRodadasRoundRobin(participantesLista, { tipoParticipante });
      const mapaRodadas = new Map();
      partidas.forEach((partida) => {
        const parId = criarParId(partida, tipoParticipante);
        if (parId) {
          mapaRodadas.set(parId, Number(partida.rodada || 1));
        }
      });
      rodadasPorChave.set(chaveId, mapaRodadas);
    });

    const [linhas] = await db.query(
      `SELECT j.id, j.modalidade_id, j.chave_id, j.fase, j.rodada, j.status, j.data_hora, j.local_jogo, j.publicado,
              j.campus_1_id, j.campus_2_id, j.atleta_1_id, j.atleta_2_id,
              chv.numero_chave AS chave_numero,
              c1.nome AS campus_1_nome,
              c1.nome_exibicao AS campus_1_nome_exibicao,
              c2.nome AS campus_2_nome,
              c2.nome_exibicao AS campus_2_nome_exibicao,
              a1.nome AS atleta_1_nome,
              a2.nome AS atleta_2_nome
       FROM jogos j
       LEFT JOIN campus c1 ON c1.id = j.campus_1_id
       LEFT JOIN campus c2 ON c2.id = j.campus_2_id
       LEFT JOIN atletas a1 ON a1.id = j.atleta_1_id
       LEFT JOIN atletas a2 ON a2.id = j.atleta_2_id
       LEFT JOIN chaves chv ON chv.id = j.chave_id
       WHERE j.modalidade_id = ? ${filtroSubJogos}
       ORDER BY j.data_hora ASC, j.id ASC`,
      paramsSubJogos
    );

    return linhas.map((jogo) => {
      const chaveId = Number(jogo.chave_id || 0);
      const parId = tratarComoIndividual
        ? criarParId({ atleta1Id: jogo.atleta_1_id, atleta2Id: jogo.atleta_2_id }, 'atleta')
        : criarParId({ campus1Id: jogo.campus_1_id, campus2Id: jogo.campus_2_id }, 'campus');
      const rodadaNumero = Number(jogo.rodada || 1);
      const dataHora = jogo.data_hora ? new Date(jogo.data_hora) : null;
      const dataInput = dataHora ? `${String(dataHora.getFullYear()).padStart(4, '0')}-${String(dataHora.getMonth() + 1).padStart(2, '0')}-${String(dataHora.getDate()).padStart(2, '0')}` : '';
      const horarioInput = dataHora ? `${String(dataHora.getHours()).padStart(2, '0')}:${String(dataHora.getMinutes()).padStart(2, '0')}` : '';
      const tipoIndividual = Boolean(jogo.atleta_1_id || jogo.atleta_2_id);
      const casaNome = tipoIndividual
        ? (jogo.atleta_1_nome || 'Atleta não informado')
        : ((paresDuplasJogos && paresDuplasJogos.get(Number(jogo.campus_1_id))) || jogo.campus_1_nome_exibicao || jogo.campus_1_nome || 'Campus não informado');
      const foraNome = tipoIndividual
        ? (jogo.atleta_2_nome || 'Atleta não informado')
        : ((paresDuplasJogos && paresDuplasJogos.get(Number(jogo.campus_2_id))) || jogo.campus_2_nome_exibicao || jogo.campus_2_nome || 'Campus não informado');

      return {
        ...jogo,
        subCategoria: String(subCategoria || '').trim() || 'geral',
        data: dataHora ? `${String(dataHora.getDate()).padStart(2, '0')}/${String(dataHora.getMonth() + 1).padStart(2, '0')}` : '—',
        horario: dataHora ? `${String(dataHora.getHours()).padStart(2, '0')}:${String(dataHora.getMinutes()).padStart(2, '0')}` : '—',
        dataInput,
        horarioInput,
        localJogo: jogo.local_jogo || 'A definir',
        casa: casaNome,
        fora: foraNome,
        atletaCasa: jogo.atleta_1_nome || 'Atleta não informado',
        atletaFora: jogo.atleta_2_nome || 'Atleta não informado',
        tipoIndividual,
        placar: jogo.placar || 'vs',
        chaveNumero: jogo.chave_numero || null,
        rodadaNumero,
        status: statusEfetivo(jogo.status, jogo.data_hora)
      };
    });
  } catch (error) {
    return [];
  }
}

module.exports = {
  resolverSubCategoria,
  obterNumeroSistema,
  embaralharArray,
  ordenarPorNumeroESorteio,
  calcularDistribuicaoTamanhoChaves,
  calcularDistribuicaoTenisMesaIndividual,
  obterCampusDoParticipante,
  obterFaseParaBanco,
  criarParId,
  gerarRodadasRoundRobin,
  montarConfrontosDaChave,
  buscarParticipantesModalidade,
  agruparParticipantesEmChaves,
  efetuarChaveamentoMatematico,
  atualizarJogoChaveamento,
  getInscritosModalidade,
  getChavesModalidade,
  getJogosModalidade
};
