const db = require('../config/db');
const { obterRegras, normalizarNome } = require('../utils/sportClassificationRules');

async function sincronizarClassificacaoGruposModalidade(modalidadeId) {
  const id = Number(modalidadeId || 0);
  if (!id) {
    return;
  }

  const [chaves] = await db.query('SELECT id, numero_chave FROM chaves WHERE modalidade_id = ? ORDER BY numero_chave ASC', [id]);
  if (!chaves.length) {
    return;
  }

  const [modalidadeRows] = await db.query('SELECT nome, tipo_confronto FROM modalidades WHERE id = ?', [id]);
  const modalidade = modalidadeRows[0] || {};
  const nomeModalidade = String(modalidade.nome || '');
  const modalidadeIndividual = String(modalidade.tipo_confronto || '').trim() === 'Individual'
    || /atletismo/i.test(nomeModalidade)
    || /xadrez/i.test(nomeModalidade);

  for (const chave of chaves) {
    await db.query('DELETE FROM classificacao_grupos WHERE modalidade_id = ? AND chave_id = ?', [id, chave.id]);

    if (modalidadeIndividual) {
      const [participantes] = await db.query(`
        SELECT DISTINCT a.id AS id, a.nome AS nome, a.campus_id, c.nome AS campus_nome, c.nome_exibicao
        FROM jogos j
        JOIN atletas a ON a.id = j.atleta_1_id OR a.id = j.atleta_2_id
        JOIN campus c ON c.id = a.campus_id
        WHERE j.modalidade_id = ? AND j.chave_id = ?
        ORDER BY a.nome ASC
      `, [id, chave.id]);

      for (const participante of participantes) {
        await db.query(`
          INSERT INTO classificacao_grupos (
            modalidade_id, chave_id, campus_id, atleta_id,
            pontos, jogos_jogados, vitorias, empates, derrotas,
            pontos_pro, pontos_contra,
            cartoes_amarelos, cartoes_vermelhos, sets_ganhos, sets_perdidos
          ) VALUES (?, ?, ?, ?, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)
        `, [id, chave.id, participante.campus_id || null, participante.id || null]);
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
  }

  await atualizarContadoresCartoes(jogo.modalidade_id, jogo.chave_id, id);
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

async function getClassificacaoModalidade(modalidadeId, chaveId = null) {
  try {
    const [modalidadeRows] = await db.query('SELECT nome FROM modalidades WHERE id = ?', [modalidadeId]);
    const nomeModalidade = modalidadeRows[0]?.nome || '';
    const regras = obterRegras(nomeModalidade);

    const query = chaveId
      ? `SELECT cg.*, 
              COALESCE(c.nome, a.nome) AS participante_nome,
              COALESCE(c.nome_exibicao, a.nome) AS participante_exibicao,
              COALESCE(c.foto_perfil, '/imagens/avatar.svg') AS participante_foto,
              ch.numero_chave
         FROM classificacao_grupos cg
         LEFT JOIN campus c ON c.id = cg.campus_id
         LEFT JOIN atletas a ON a.id = cg.atleta_id
         LEFT JOIN chaves ch ON ch.id = cg.chave_id
         WHERE cg.modalidade_id = ? AND cg.chave_id = ?
         ORDER BY cg.pontos DESC, cg.saldo_pontuacao DESC, cg.pontos_pro DESC`
      : `SELECT cg.*, 
              COALESCE(c.nome, a.nome) AS participante_nome,
              COALESCE(c.nome_exibicao, a.nome) AS participante_exibicao,
              COALESCE(c.foto_perfil, '/imagens/avatar.svg') AS participante_foto,
              ch.numero_chave
         FROM classificacao_grupos cg
         LEFT JOIN campus c ON c.id = cg.campus_id
         LEFT JOIN atletas a ON a.id = cg.atleta_id
         LEFT JOIN chaves ch ON ch.id = cg.chave_id
         WHERE cg.modalidade_id = ?
         ORDER BY ch.numero_chave ASC, cg.pontos DESC, cg.saldo_pontuacao DESC, cg.pontos_pro DESC`;

    const params = chaveId ? [modalidadeId, chaveId] : [modalidadeId];
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
    for (const [, grupo] of gruposMap) {
      grupo.sort(regras.ordenarPor);
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
            j.wo, j.vencedor_campus_id,
            m.nome AS modalidade_nome
     FROM jogos j
     JOIN modalidades m ON j.modalidade_id = m.id
     WHERE j.id = ?`,
    [id]
  );
  const jogo = jogoRows[0];
  if (!jogo || !jogo.campus_1_id || !jogo.campus_2_id) return;

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
  const vencedorId = Number(jogo.vencedor_campus_id || 0);

  let campus1Resultado;
  let campus2Resultado;

  if (ehWO && vencedorId) {
    const campus1Venceu = vencedorId === jogo.campus_1_id;
    campus1Resultado = campus1Venceu
      ? { pontos: regras.pontuacaoVitoria, vitorias: 1, empates: 0, derrotas: 0 }
      : { pontos: regras.pontuacaoDerrota, vitorias: 0, empates: 0, derrotas: 1 };
    campus2Resultado = campus1Venceu
      ? { pontos: regras.pontuacaoDerrota, vitorias: 0, empates: 0, derrotas: 1 }
      : { pontos: regras.pontuacaoVitoria, vitorias: 1, empates: 0, derrotas: 0 };
  } else {
    if (placar1 > placar2) {
      campus1Resultado = { pontos: regras.pontuacaoVitoria, vitorias: 1, empates: 0, derrotas: 0 };
      campus2Resultado = { pontos: regras.pontuacaoDerrota, vitorias: 0, empates: 0, derrotas: 1 };
    } else if (placar1 < placar2) {
      campus1Resultado = { pontos: regras.pontuacaoDerrota, vitorias: 0, empates: 0, derrotas: 1 };
      campus2Resultado = { pontos: regras.pontuacaoVitoria, vitorias: 1, empates: 0, derrotas: 0 };
    } else {
      campus1Resultado = { pontos: regras.pontuacaoEmpate, vitorias: 0, empates: 1, derrotas: 0 };
      campus2Resultado = { pontos: regras.pontuacaoEmpate, vitorias: 0, empates: 1, derrotas: 0 };
    }
  }

  const atualizarCampus = async (campusId, resultadoCampus, placarPro, placarContra, setsGanhos, setsPerdidos) => {
    const [existe] = await db.query(
      'SELECT id FROM classificacao_grupos WHERE modalidade_id = ? AND chave_id = ? AND campus_id = ?',
      [modalidadeId, chaveId, campusId]
    );

    if (!existe.length) {
      await db.query(`
        INSERT INTO classificacao_grupos (
          modalidade_id, chave_id, campus_id, atleta_id,
          pontos, jogos_jogados, vitorias, empates, derrotas,
          pontos_pro, pontos_contra,
          cartoes_amarelos, cartoes_vermelhos, sets_ganhos, sets_perdidos
        ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, 0, 0, ?, ?)
      `, [modalidadeId, chaveId, campusId, null,
          resultadoCampus.pontos, resultadoCampus.vitorias, resultadoCampus.empates, resultadoCampus.derrotas,
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
      `, [resultadoCampus.pontos, resultadoCampus.vitorias, resultadoCampus.empates, resultadoCampus.derrotas,
          placarPro, placarContra, setsGanhos, setsPerdidos,
          modalidadeId, chaveId, campusId]);
    }
  };

  await atualizarCampus(jogo.campus_1_id, campus1Resultado, placar1, placar2, sets1, sets2);
  await atualizarCampus(jogo.campus_2_id, campus2Resultado, placar2, placar1, sets2, sets1);
}

async function recalcularClassificacaoModalidade(modalidadeId) {
  const id = Number(modalidadeId || 0);
  if (!id) return;

  await sincronizarClassificacaoGruposModalidade(id);

  const [jogos] = await db.query(
    `SELECT j.id
     FROM jogos j
     INNER JOIN resultados_coletivos rc ON rc.jogo_id = j.id
     WHERE j.modalidade_id = ? AND j.campus_1_id IS NOT NULL AND j.campus_2_id IS NOT NULL`,
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
  sincronizarClassificacaoGruposModalidade,
  getResumoInscricoes,
  getClassificacaoModalidade,
  atualizarClassificacaoAposJogo,
  registrarCartoes,
  recalcularClassificacaoModalidade,
  recalcularTodasClassificacoes
};
