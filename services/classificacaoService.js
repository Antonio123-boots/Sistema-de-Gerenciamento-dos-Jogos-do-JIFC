const db = require('../config/db');
const { obterRegras, normalizarNome } = require('../utils/sportClassificationRules');
const { garantirSubCategoriaChavesJogos } = require('../config/ensureSchema');
const { isModalidadeTenisMesa } = require('./modalidadeService');

async function buscarJogosDoGrupo(modalidadeId, chaveId) {
  const [jogos] = await db.query(`
    SELECT j.campus_1_id, j.campus_2_id, j.atleta_1_id, j.atleta_2_id, j.wo, j.vencedor_campus_id,
           rc.placar_1, rc.placar_2
    FROM jogos j
    LEFT JOIN resultados_coletivos rc ON rc.jogo_id = j.id
    WHERE j.modalidade_id = ? AND j.chave_id = ?
      AND ((j.campus_1_id IS NOT NULL AND j.campus_2_id IS NOT NULL)
        OR (j.atleta_1_id IS NOT NULL AND j.atleta_2_id IS NOT NULL))
      AND rc.jogo_id IS NOT NULL
      AND (j.status IS NULL OR j.status <> 'Cancelado')
  `, [modalidadeId, chaveId]);
  return jogos || [];
}

function construirMapaConfrontos(jogos) {
  const mapa = new Map();
  for (const jogo of jogos) {
    const c1 = Number(jogo.campus_1_id || jogo.atleta_1_id);
    const c2 = Number(jogo.campus_2_id || jogo.atleta_2_id);
    const p1 = Number(jogo.placar_1 || 0);
    const p2 = Number(jogo.placar_2 || 0);

    const key1 = `${c1}-${c2}`;
    const key2 = `${c2}-${c1}`;

    if (!mapa.has(key1)) mapa.set(key1, { vitorias: 0, empates: 0, derrotas: 0, golsPro: 0, golsContra: 0 });
    if (!mapa.has(key2)) mapa.set(key2, { vitorias: 0, empates: 0, derrotas: 0, golsPro: 0, golsContra: 0 });

    const s1 = mapa.get(key1);
    const s2 = mapa.get(key2);

    s1.golsPro += p1;
    s1.golsContra += p2;
    s2.golsPro += p2;
    s2.golsContra += p1;

    if (p1 > p2) {
      s1.vitorias++;
      s2.derrotas++;
    } else if (p1 < p2) {
      s1.derrotas++;
      s2.vitorias++;
    } else {
      s1.empates++;
      s2.empates++;
    }
  }
  return mapa;
}

function calcularSaldoGolsEmpatadas(campusIds, jogos) {
  const saldoMap = new Map();
  for (const cid of campusIds) {
    saldoMap.set(Number(cid), { golsPro: 0, golsContra: 0, saldo: 0 });
  }
  for (const jogo of jogos) {
    const c1 = Number(jogo.campus_1_id);
    const c2 = Number(jogo.campus_2_id);
    const p1 = Number(jogo.placar_1 || 0);
    const p2 = Number(jogo.placar_2 || 0);
    if (saldoMap.has(c1) && saldoMap.has(c2)) {
      const s1 = saldoMap.get(c1);
      const s2 = saldoMap.get(c2);
      s1.golsPro += p1;
      s1.golsContra += p2;
      s2.golsPro += p2;
      s2.golsContra += p1;
    }
  }
  for (const [, s] of saldoMap) {
    s.saldo = s.golsPro - s.golsContra;
  }
  return saldoMap;
}

function obterIdParticipante(participante) {
  return Number(participante.campus_id || participante.atleta_id || 0);
}

function compararComDesempate(a, b, regras, mapaConfrontos, jogos, criterios = regras.criteriosDesempate, participantesEmpatados = null) {
  const criteriosAplicaveis = criterios || ['pontos', 'vitorias', 'saldo_gols'];

  for (const criterio of criteriosAplicaveis) {
    const resultado = aplicarCriterio(a, b, criterio, regras, mapaConfrontos, jogos, participantesEmpatados);
    if (resultado !== 0) return resultado;
  }
  return 0;
}

function aplicarCriterio(a, b, criterio, regras, mapaConfrontos, jogos, participantesEmpatados = null) {
  switch (criterio) {
    case 'pontos':
      return (b.pontos || 0) - (a.pontos || 0);

    case 'confronto_direto': {
      const idA = obterIdParticipante(a);
      const idB = obterIdParticipante(b);
      const kAB = `${idA}-${idB}`;
      const kBA = `${idB}-${idA}`;
      const sAB = mapaConfrontos.get(kAB);
      const sBA = mapaConfrontos.get(kBA);
      if (!sAB || !sBA) return 0;
      if (sAB.vitorias !== sBA.vitorias) return sBA.vitorias - sAB.vitorias;
      const saldoAB = sAB.golsPro - sAB.golsContra;
      const saldoBA = sBA.golsPro - sBA.golsContra;
      if (saldoAB !== saldoBA) return saldoBA - saldoAB;
      if (sAB.golsPro !== sBA.golsPro) return sBA.golsPro - sAB.golsPro;
      return 0;
    }

    case 'vitorias':
      return (b.vitorias || 0) - (a.vitorias || 0);

    case 'sets_average': {
      const qsA = (a.sets_perdidos || 0) > 0 ? (a.sets_ganhos || 0) / a.sets_perdidos : (a.sets_ganhos || 0);
      const qsB = (b.sets_perdidos || 0) > 0 ? (b.sets_ganhos || 0) / b.sets_perdidos : (b.sets_ganhos || 0);
      return qsB - qsA;
    }

    case 'pontos_average': {
      const pqA = (a.pontos_contra || 0) > 0 ? (a.pontos_pro || 0) / a.pontos_contra : (a.pontos_pro || 0);
      const pqB = (b.pontos_contra || 0) > 0 ? (b.pontos_pro || 0) / b.pontos_contra : (b.pontos_pro || 0);
      return pqB - pqA;
    }

    case 'saldo_gols_empatadas': {
      const campusIds = participantesEmpatados && participantesEmpatados.length
        ? participantesEmpatados.map(obterIdParticipante)
        : [obterIdParticipante(a), obterIdParticipante(b)];
      const saldoMap = calcularSaldoGolsEmpatadas(campusIds, jogos);
      const sA = saldoMap.get(obterIdParticipante(a)) || { saldo: 0 };
      const sB = saldoMap.get(obterIdParticipante(b)) || { saldo: 0 };
      return sB.saldo - sA.saldo;
    }

    case 'saldo_gols':
      return ((b.pontos_pro || 0) - (b.pontos_contra || 0)) - ((a.pontos_pro || 0) - (a.pontos_contra || 0));

    case 'menor_gols_sofridos':
      return (a.pontos_contra || 0) - (b.pontos_contra || 0);

    case 'maior_gols_feitos':
      return (b.pontos_pro || 0) - (a.pontos_pro || 0);

    case 'media_gols': {
      const mediaA = (a.pontos_contra || 0) > 0 ? (a.pontos_pro || 0) / a.pontos_contra : (a.pontos_pro || 0);
      const mediaB = (b.pontos_contra || 0) > 0 ? (b.pontos_pro || 0) / b.pontos_contra : (b.pontos_pro || 0);
      return mediaB - mediaA;
    }

    case 'sancoes': {
      const pontuacaoSancao = (r) => (r.cartoes_amarelos || 0) * 1 + (r.cartoes_vermelhos || 0) * 3 + (r.excluicoes_2min || 0) * 1;
      return pontuacaoSancao(a) - pontuacaoSancao(b);
    }

    case 'menor_cartoes_vermelhos':
      return (a.cartoes_vermelhos || 0) - (b.cartoes_vermelhos || 0);

    case 'menor_cartoes_amarelos':
      return (a.cartoes_amarelos || 0) - (b.cartoes_amarelos || 0);

    case 'sorteio':
      return 0;

    default:
      return 0;
  }
}

function ordenarGrupoComDesempate(grupo, regras, jogos) {
  if (!regras.criteriosDesempate) {
    return grupo.sort(regras.ordenarPor);
  }

  const mapaConfrontos = construirMapaConfrontos(jogos);
  const pontos = new Map(grupo.map((item) => [item, Number(item.pontos || 0)]));
  const gruposPorPontos = [];

  for (const item of grupo) {
    const pontosItem = pontos.get(item);
    let grupoPontos = gruposPorPontos.find((itens) => pontos.get(itens[0]) === pontosItem);
    if (!grupoPontos) {
      grupoPontos = [];
      gruposPorPontos.push(grupoPontos);
    }
    grupoPontos.push(item);
  }

  gruposPorPontos.sort((a, b) => pontos.get(b[0]) - pontos.get(a[0]));
  const criteriosSemConfronto = regras.criteriosDesempate.filter((criterio) => criterio !== 'confronto_direto');
  for (const grupoPontos of gruposPorPontos) {
    const criterios = grupoPontos.length >= 3 ? criteriosSemConfronto : regras.criteriosDesempate;
    grupoPontos.sort((a, b) => {
      const resultado = compararComDesempate(a, b, regras, mapaConfrontos, jogos, criterios, grupoPontos);
      if (resultado !== 0) return resultado;
      return obterIdParticipante(a) - obterIdParticipante(b);
    });
  }

  grupo.length = 0;
  gruposPorPontos.forEach((grupoPontos) => grupo.push(...grupoPontos));
  return grupo;
}

async function sincronizarClassificacaoGruposModalidade(modalidadeId) {
  const id = Number(modalidadeId || 0);
  if (!id) {
    return;
  }

  await garantirSubCategoriaChavesJogos();

  const [chaves] = await db.query('SELECT id, numero_chave, sub_categoria FROM chaves WHERE modalidade_id = ? ORDER BY numero_chave ASC', [id]);
  if (!chaves.length) {
    return;
  }

  const [modalidadeRows] = await db.query('SELECT nome, tipo_confronto, genero FROM modalidades WHERE id = ?', [id]);
  const modalidade = modalidadeRows[0] || {};
  const nomeModalidade = String(modalidade.nome || '');
  const generoModalidade = String(modalidade.genero || '').trim();
  const modalidadeIndividual = String(modalidade.tipo_confronto || '').trim() === 'Individual'
    || /atletismo/i.test(nomeModalidade)
    || /xadrez/i.test(nomeModalidade)
    || isModalidadeTenisMesa(nomeModalidade);

  for (const chave of chaves) {
    await db.query('DELETE FROM classificacao_grupos WHERE modalidade_id = ? AND chave_id = ?', [id, chave.id]);

    const tratarComoIndividual = modalidadeIndividual && String(chave.sub_categoria || 'geral') !== 'dupla';

    if (tratarComoIndividual) {
      const [participantes] = await db.query(`
        SELECT DISTINCT a.id AS id, a.nome AS nome, a.campus_id, c.nome AS campus_nome, c.nome_exibicao
        FROM jogos j
        JOIN atletas a ON a.id = j.atleta_1_id OR a.id = j.atleta_2_id
        JOIN campus c ON c.id = a.campus_id
        JOIN modalidades m ON m.id = j.modalidade_id
        WHERE j.modalidade_id = ? AND j.chave_id = ?
          AND (m.genero IS NULL OR m.genero = '' OR a.genero = m.genero)
        ORDER BY a.nome ASC
      `, [id, chave.id]);

      for (const participante of participantes) {
        await db.query(`
          INSERT INTO classificacao_grupos (
            modalidade_id, chave_id, campus_id, atleta_id,
            pontos, jogos_jogados, vitorias, empates, derrotas,
            pontos_pro, pontos_contra,
            cartoes_amarelos, cartoes_vermelhos, sets_ganhos, sets_perdidos
          ) VALUES (?, ?, NULL, ?, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)
        `, [id, chave.id, participante.id || null]);
      }
      continue;
    }

    const [participantes] = await db.query(`
      SELECT cm.campus_id AS id, c.nome AS nome, c.nome_exibicao
      FROM campus_modalidade cm
      JOIN campus c ON c.id = cm.campus_id
      WHERE cm.modalidade_id = ? AND cm.chave_id = ?
      ORDER BY cm.ordem_sorteio IS NULL, cm.ordem_sorteio ASC, c.id ASC, c.nome ASC
    `, [id, chave.id]);

    for (const participante of participantes) {
      await db.query(`
        INSERT INTO classificacao_grupos (
          modalidade_id, chave_id, campus_id, atleta_id,
          pontos, jogos_jogados, vitorias, empates, derrotas,
          pontos_pro, pontos_contra,
          cartoes_amarelos, cartoes_vermelhos, sets_ganhos, sets_perdidos
        ) VALUES (?, ?, ?, ?, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)
      `, [id, chave.id, participante.id || null, null]);
    }
  }
}

async function getResumoInscricoes() {
  try {
    const [campiLinhas] = await db.query(
      `SELECT id, nome
       FROM campus
       ORDER BY nome ASC`
    );

    const [linksModalidades] = await db.query(
      `SELECT cm.campus_id, m.id AS modalidade_id, m.nome AS modalidade_nome, m.genero AS modalidade_genero
       FROM campus_modalidade cm
       JOIN modalidades m ON m.id = cm.modalidade_id
       ORDER BY cm.campus_id, m.nome ASC`
    );

    const [atletasLinhas] = await db.query(
      `SELECT a.id, a.nome, a.matricula, a.data_nascimento, a.cpf, a.genero, a.campus_id, am.modalidade_id
       FROM atletas a
       LEFT JOIN atleta_modalidade am ON am.atleta_id = a.id
       ORDER BY a.campus_id, a.nome ASC`
    );

    const campi = campiLinhas.map((campus) => ({
      id: campus.id,
      nome: campus.nome,
      slug: '',
      modalidades: []
    }));

    const campusPorId = new Map(campi.map((campus) => [campus.id, campus]));

    linksModalidades.forEach((link) => {
      const campus = campusPorId.get(link.campus_id);
      if (!campus) {
        return;
      }

      const existente = campus.modalidades.find((modalidade) => Number(modalidade.id) === Number(link.modalidade_id));
      if (existente) {
        return;
      }

      campus.modalidades.push({
        id: link.modalidade_id,
        nome: link.modalidade_nome,
        genero: link.modalidade_genero || 'Masculino',
        atletasMasculino: [],
        atletasFeminino: [],
        atletas: []
      });
    });

    atletasLinhas.forEach((atleta) => {
      const campus = campusPorId.get(atleta.campus_id);
      if (!campus || !atleta.modalidade_id) {
        return;
      }

      const modalidade = campus.modalidades.find((item) => Number(item.id) === Number(atleta.modalidade_id));
      if (!modalidade) {
        return;
      }

      const atletaResumo = {
        id: atleta.id,
        nome: atleta.nome,
        matricula: atleta.matricula,
        dataNascimento: atleta.data_nascimento,
        cpf: atleta.cpf,
        status: 'Analise',
        genero: atleta.genero || 'Masculino'
      };

      modalidade.atletas.push(atletaResumo);
      if (String(atleta.genero || '').toLowerCase() === 'feminino') {
        modalidade.atletasFeminino.push(atletaResumo);
      } else {
        modalidade.atletasMasculino.push(atletaResumo);
      }
    });

    return { campi };
  } catch (error) {
    return { campi: [] };
  }
}

async function atualizarClassificacaoAposJogo(jogoId) {
  const id = Number(jogoId || 0);
  if (!id) return;

  const [jogoRows] = await db.query(
    'SELECT modalidade_id FROM jogos WHERE id = ?',
    [id]
  );
  const jogo = jogoRows[0];
  if (!jogo) return;

  await recalcularClassificacaoModalidade(jogo.modalidade_id);
}

async function registrarCartoes(jogoId, cartoes = []) {
  const id = Number(jogoId || 0);
  if (!id || !Array.isArray(cartoes) || !cartoes.length) return;

  const [jogoRows] = await db.query(
    'SELECT modalidade_id, chave_id, campus_1_id, campus_2_id FROM jogos WHERE id = ?',
    [id]
  );
  const jogo = jogoRows[0];
  if (!jogo) return;

  let inseriuNovoCartao = false;

  for (const cartao of cartoes) {
    const campusId = Number(cartao.campus_id || 0);
    const tipo = String(cartao.tipo || '').trim().toLowerCase();
    if (!campusId || !['amarelo', 'vermelho'].includes(tipo)) continue;

    const [existe] = await db.query(
      'SELECT id FROM cartoes WHERE jogo_id = ? AND campus_id = ? AND tipo = ? AND jogador_nome = ? AND minuto = ?',
      [id, campusId, tipo, cartao.jogador_nome || null, cartao.minuto || null]
    );
    if (existe.length) continue;

    await db.query(
      'INSERT INTO cartoes (jogo_id, campus_id, tipo, jogador_nome, minuto) VALUES (?, ?, ?, ?, ?)',
      [id, campusId, tipo, cartao.jogador_nome || null, cartao.minuto || null]
    );
    inseriuNovoCartao = true;
  }

  if (inseriuNovoCartao) {
    await atualizarContadoresCartoes(jogo.modalidade_id, jogo.chave_id, id);
  }
}

async function atualizarContadoresCartoes(modalidadeId, chaveId, jogoId) {
  const [campusIds] = await db.query(
    'SELECT DISTINCT campus_id FROM cartoes WHERE jogo_id = ?',
    [jogoId]
  );

  for (const { campus_id: campusId } of campusIds) {
    const [contagem] = await db.query(
      `SELECT
         SUM(CASE WHEN tipo = 'amarelo' THEN 1 ELSE 0 END) AS amarelos,
         SUM(CASE WHEN tipo = 'vermelho' THEN 1 ELSE 0 END) AS vermelhos
       FROM cartoes
       WHERE campus_id = ? AND jogo_id = ?`,
      [campusId, jogoId]
    );

    const amarelos = Number(contagem[0]?.amarelos || 0);
    const vermelhos = Number(contagem[0]?.vermelhos || 0);

    await db.query(
      `UPDATE classificacao_grupos
       SET cartoes_amarelos = cartoes_amarelos + ?,
           cartoes_vermelhos = cartoes_vermelhos + ?
       WHERE modalidade_id = ? AND chave_id = ? AND campus_id = ?`,
      [amarelos, vermelhos, modalidadeId, chaveId, campusId]
    );
  }
}

async function getClassificacaoModalidade(modalidadeId, chaveId = null, opcoes = {}) {
  try {
    const [modalidadeRows] = await db.query('SELECT nome FROM modalidades WHERE id = ?', [modalidadeId]);
    const nomeModalidade = modalidadeRows[0]?.nome || '';
    const regras = obterRegras(nomeModalidade);

    const filtroSubCategoria = ['individual', 'dupla'].includes(String(opcoes?.subCategoria || '').trim().toLowerCase())
      ? String(opcoes.subCategoria).trim().toLowerCase()
      : '';

    const query = chaveId
      ? `SELECT cg.*, 
              COALESCE(c.nome, a.nome) AS participante_nome,
              COALESCE(c.nome_exibicao, a.nome) AS participante_exibicao,
              COALESCE(c.foto_perfil, '/imagens/avatar.svg') AS participante_foto,
              ch.numero_chave,
              ch.sub_categoria
         FROM classificacao_grupos cg
         LEFT JOIN campus c ON c.id = cg.campus_id
         LEFT JOIN atletas a ON a.id = cg.atleta_id
         LEFT JOIN chaves ch ON ch.id = cg.chave_id
         WHERE cg.modalidade_id = ? AND cg.chave_id = ? ${filtroSubCategoria ? 'AND ch.sub_categoria = ?' : ''}`
      : `SELECT cg.*, 
              COALESCE(c.nome, a.nome) AS participante_nome,
              COALESCE(c.nome_exibicao, a.nome) AS participante_exibicao,
              COALESCE(c.foto_perfil, '/imagens/avatar.svg') AS participante_foto,
              ch.numero_chave,
              ch.sub_categoria
         FROM classificacao_grupos cg
         LEFT JOIN campus c ON c.id = cg.campus_id
         LEFT JOIN atletas a ON a.id = cg.atleta_id
         LEFT JOIN chaves ch ON ch.id = cg.chave_id
         WHERE cg.modalidade_id = ? ${filtroSubCategoria ? 'AND ch.sub_categoria = ?' : ''}`;

    const params = chaveId
      ? (filtroSubCategoria ? [modalidadeId, chaveId, filtroSubCategoria] : [modalidadeId, chaveId])
      : (filtroSubCategoria ? [modalidadeId, filtroSubCategoria] : [modalidadeId]);
    const [linhas] = await db.query(query, params);

    const resultado = (linhas || []).map((linha) => ({
      ...linha,
      nome_modalidade: nomeModalidade,
      colunas: regras.colunasTabela,
      temSets: regras.temSets,
      temCartoes: regras.temCartoes
    }));

    const gruposMap = new Map();
    for (const item of resultado) {
      const chave = Number(item.chave_id || 0);
      if (!gruposMap.has(chave)) {
        gruposMap.set(chave, []);
      }
      gruposMap.get(chave).push(item);
    }

    const resultadoOrdenado = [];
    for (const [chaveIdGrupo, grupo] of gruposMap) {
      const jogos = await buscarJogosDoGrupo(modalidadeId, chaveIdGrupo);
      ordenarGrupoComDesempate(grupo, regras, jogos);
      resultadoOrdenado.push(...grupo);
    }

    return resultadoOrdenado;
  } catch (error) {
    return [];
  }
}

async function _aplicarClassificacaoJogo(jogoId) {
  const id = Number(jogoId || 0);
  if (!id) return;

  const [jogoRows] = await db.query(
    `SELECT j.id, j.modalidade_id, j.chave_id, j.campus_1_id, j.campus_2_id,
            j.atleta_1_id, j.atleta_2_id,
            j.wo, j.vencedor_campus_id, j.vencedor_atleta_id,
            m.nome AS modalidade_nome
     FROM jogos j
     JOIN modalidades m ON j.modalidade_id = m.id
     WHERE j.id = ?`,
    [id]
  );
  const jogo = jogoRows[0];
  if (!jogo) return;

  if (jogo.chave_id == null) return;

  const confrontoIndividual = Boolean(jogo.atleta_1_id && jogo.atleta_2_id);
  if (!confrontoIndividual && (!jogo.campus_1_id || !jogo.campus_2_id)) return;

  const idParticipante1 = Number(confrontoIndividual ? jogo.atleta_1_id : jogo.campus_1_id);
  const idParticipante2 = Number(confrontoIndividual ? jogo.atleta_2_id : jogo.campus_2_id);

  const regras = obterRegras(jogo.modalidade_nome);
  const chaveId = jogo.chave_id;
  const modalidadeId = jogo.modalidade_id;

  const [resultadoRows] = await db.query(
    'SELECT placar_1, placar_2 FROM resultados_coletivos WHERE jogo_id = ?',
    [id]
  );
  const resultado = resultadoRows[0];
  if (!resultado) return;

  const placar1 = Number(resultado.placar_1 || 0);
  const placar2 = Number(resultado.placar_2 || 0);

  let sets1 = 0;
  let sets2 = 0;
  if (regras.temSets) {
    const [setsRows] = await db.query(
      'SELECT numero_set, pontos_1, pontos_2 FROM resultados_por_sets WHERE jogo_id = ? ORDER BY numero_set ASC',
      [id]
    );
    for (const set of setsRows) {
      if (Number(set.pontos_1 || 0) > Number(set.pontos_2 || 0)) sets1++;
      else if (Number(set.pontos_2 || 0) > Number(set.pontos_1 || 0)) sets2++;
    }
  }

  const ehWO = Boolean(jogo.wo);
  const vencedorId = Number((confrontoIndividual ? jogo.vencedor_atleta_id : jogo.vencedor_campus_id) || 0);
  const participante1Venceu = Boolean(vencedorId) && vencedorId === idParticipante1;

  function calcularPontosVolei(setsVencidos, setsPerdidos, isVencedor) {
    if (isVencedor) {
      if (setsPerdidos <= 1) return regras.pontuacaoVitoria3_0_3_1 || 3;
      if (setsPerdidos === 2) return regras.pontuacaoVitoria3_2 || 2;
      return regras.pontuacaoVitoria3_0_3_1 || 3;
    } else {
      if (setsVencidos >= 1 && setsPerdidos === 2) return regras.pontuacaoDerrota2_3 || 1;
      return regras.pontuacaoDerrota0_3_1_3 || 0;
    }
  }

  let participante1Resultado;
  let participante2Resultado;

  if (regras.tipo === 'sets') {
    if (ehWO && vencedorId) {
      participante1Resultado = participante1Venceu
        ? { pontos: regras.pontuacaoVitoria3_0_3_1 || 3, vitorias: 1, empates: 0, derrotas: 0 }
        : { pontos: regras.pontuacaoDerrota0_3_1_3 || 0, vitorias: 0, empates: 0, derrotas: 1 };
      participante2Resultado = participante1Venceu
        ? { pontos: regras.pontuacaoDerrota0_3_1_3 || 0, vitorias: 0, empates: 0, derrotas: 1 }
        : { pontos: regras.pontuacaoVitoria3_0_3_1 || 3, vitorias: 1, empates: 0, derrotas: 0 };
    } else {
      if (sets1 > sets2) {
        participante1Resultado = { pontos: calcularPontosVolei(sets1, sets2, true), vitorias: 1, empates: 0, derrotas: 0 };
        participante2Resultado = { pontos: calcularPontosVolei(sets2, sets1, false), vitorias: 0, empates: 0, derrotas: 1 };
      } else if (sets1 < sets2) {
        participante1Resultado = { pontos: calcularPontosVolei(sets1, sets2, false), vitorias: 0, empates: 0, derrotas: 1 };
        participante2Resultado = { pontos: calcularPontosVolei(sets2, sets1, true), vitorias: 1, empates: 0, derrotas: 0 };
      } else {
        participante1Resultado = { pontos: 0, vitorias: 0, empates: 1, derrotas: 0 };
        participante2Resultado = { pontos: 0, vitorias: 0, empates: 1, derrotas: 0 };
      }
    }
  } else {
    if (ehWO && vencedorId) {
      participante1Resultado = participante1Venceu
        ? { pontos: regras.pontuacaoVitoria, vitorias: 1, empates: 0, derrotas: 0 }
        : { pontos: regras.pontuacaoDerrota, vitorias: 0, empates: 0, derrotas: 1 };
      participante2Resultado = participante1Venceu
        ? { pontos: regras.pontuacaoDerrota, vitorias: 0, empates: 0, derrotas: 1 }
        : { pontos: regras.pontuacaoVitoria, vitorias: 1, empates: 0, derrotas: 0 };
    } else {
      if (placar1 > placar2) {
        participante1Resultado = { pontos: regras.pontuacaoVitoria, vitorias: 1, empates: 0, derrotas: 0 };
        participante2Resultado = { pontos: regras.pontuacaoDerrota, vitorias: 0, empates: 0, derrotas: 1 };
      } else if (placar1 < placar2) {
        participante1Resultado = { pontos: regras.pontuacaoDerrota, vitorias: 0, empates: 0, derrotas: 1 };
        participante2Resultado = { pontos: regras.pontuacaoVitoria, vitorias: 1, empates: 0, derrotas: 0 };
      } else {
        participante1Resultado = { pontos: regras.pontuacaoEmpate, vitorias: 0, empates: 1, derrotas: 0 };
        participante2Resultado = { pontos: regras.pontuacaoEmpate, vitorias: 0, empates: 1, derrotas: 0 };
      }
    }
  }

  const atualizarParticipante = async (participanteId, resultadoParticipante, placarPro, placarContra, setsGanhos, setsPerdidos) => {
    if (!participanteId) return;

    if (confrontoIndividual) {
      const [existe] = await db.query(
        'SELECT id FROM classificacao_grupos WHERE modalidade_id = ? AND chave_id = ? AND atleta_id = ?',
        [modalidadeId, chaveId, participanteId]
      );

      if (!existe.length) {
        await db.query(`
          INSERT INTO classificacao_grupos (
            modalidade_id, chave_id, campus_id, atleta_id,
            pontos, jogos_jogados, vitorias, empates, derrotas,
            pontos_pro, pontos_contra,
            cartoes_amarelos, cartoes_vermelhos, sets_ganhos, sets_perdidos
          ) VALUES (?, ?, NULL, ?, ?, 1, ?, ?, ?, ?, ?, 0, 0, ?, ?)
        `, [modalidadeId, chaveId, participanteId,
            resultadoParticipante.pontos, resultadoParticipante.vitorias, resultadoParticipante.empates, resultadoParticipante.derrotas,
            placarPro, placarContra, setsGanhos, setsPerdidos]);
      } else {
        await db.query(`
          UPDATE classificacao_grupos
          SET pontos = pontos + ?,
              jogos_jogados = jogos_jogados + 1,
              vitorias = vitorias + ?,
              empates = empates + ?,
              derrotas = derrotas + ?,
              pontos_pro = pontos_pro + ?,
              pontos_contra = pontos_contra + ?,
              sets_ganhos = sets_ganhos + ?,
              sets_perdidos = sets_perdidos + ?
          WHERE modalidade_id = ? AND chave_id = ? AND atleta_id = ?
        `, [resultadoParticipante.pontos, resultadoParticipante.vitorias, resultadoParticipante.empates, resultadoParticipante.derrotas,
            placarPro, placarContra, setsGanhos, setsPerdidos,
            modalidadeId, chaveId, participanteId]);
      }
      return;
    }

    const [existe] = await db.query(
      'SELECT id FROM classificacao_grupos WHERE modalidade_id = ? AND chave_id = ? AND campus_id = ?',
      [modalidadeId, chaveId, participanteId]
    );

    if (!existe.length) {
      await db.query(`
        INSERT INTO classificacao_grupos (
          modalidade_id, chave_id, campus_id, atleta_id,
          pontos, jogos_jogados, vitorias, empates, derrotas,
          pontos_pro, pontos_contra,
          cartoes_amarelos, cartoes_vermelhos, sets_ganhos, sets_perdidos
        ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, 0, 0, ?, ?)
      `, [modalidadeId, chaveId, participanteId, null,
          resultadoParticipante.pontos, resultadoParticipante.vitorias, resultadoParticipante.empates, resultadoParticipante.derrotas,
          placarPro, placarContra, setsGanhos, setsPerdidos]);
    } else {
      await db.query(`
        UPDATE classificacao_grupos
        SET pontos = pontos + ?,
            jogos_jogados = jogos_jogados + 1,
            vitorias = vitorias + ?,
            empates = empates + ?,
            derrotas = derrotas + ?,
            pontos_pro = pontos_pro + ?,
            pontos_contra = pontos_contra + ?,
            sets_ganhos = sets_ganhos + ?,
            sets_perdidos = sets_perdidos + ?
        WHERE modalidade_id = ? AND chave_id = ? AND campus_id = ?
      `, [resultadoParticipante.pontos, resultadoParticipante.vitorias, resultadoParticipante.empates, resultadoParticipante.derrotas,
          placarPro, placarContra, setsGanhos, setsPerdidos,
          modalidadeId, chaveId, participanteId]);
    }
  };

  await atualizarParticipante(idParticipante1, participante1Resultado, placar1, placar2, sets1, sets2);
  await atualizarParticipante(idParticipante2, participante2Resultado, placar2, placar1, sets2, sets1);
}

async function recalcularClassificacaoModalidade(modalidadeId) {
  const id = Number(modalidadeId || 0);
  if (!id) return;

  await sincronizarClassificacaoGruposModalidade(id);

  const [jogos] = await db.query(
    `SELECT j.id
     FROM jogos j
     INNER JOIN resultados_coletivos rc ON rc.jogo_id = j.id
     WHERE j.modalidade_id = ? AND (
       (j.campus_1_id IS NOT NULL AND j.campus_2_id IS NOT NULL)
       OR (j.atleta_1_id IS NOT NULL AND j.atleta_2_id IS NOT NULL)
     ) AND (j.status IS NULL OR j.status <> 'Cancelado')`,
    [id]
  );

  for (const jogo of jogos) {
    await _aplicarClassificacaoJogo(jogo.id);
  }

  const [cartoesExistentes] = await db.query(
    `SELECT DISTINCT c.jogo_id
     FROM cartoes c
     JOIN jogos j ON j.id = c.jogo_id
     WHERE j.modalidade_id = ?`,
    [id]
  );

  for (const cartao of cartoesExistentes) {
    const [jogoRows] = await db.query(
      'SELECT modalidade_id, chave_id FROM jogos WHERE id = ?',
      [cartao.jogo_id]
    );
    const jogoInfo = jogoRows[0];
    if (jogoInfo) {
      await atualizarContadoresCartoes(jogoInfo.modalidade_id, jogoInfo.chave_id, cartao.jogo_id);
    }
  }
}

async function recalcularTodasClassificacoes() {
  const [modalidades] = await db.query('SELECT id FROM modalidades');
  for (const mod of modalidades) {
    await recalcularClassificacaoModalidade(mod.id);
  }
}

module.exports = {
  construirMapaConfrontos,
  compararComDesempate,
  ordenarGrupoComDesempate,
  sincronizarClassificacaoGruposModalidade,
  getResumoInscricoes,
  getClassificacaoModalidade,
  atualizarClassificacaoAposJogo,
  registrarCartoes,
  recalcularClassificacaoModalidade,
  recalcularTodasClassificacoes
};
