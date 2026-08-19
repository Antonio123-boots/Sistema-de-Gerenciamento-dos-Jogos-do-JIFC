const db = require('../config/db');

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
            pontos_pro, pontos_contra
          ) VALUES (?, ?, ?, ?, 0, 0, 0, 0, 0, 0, 0)
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
          pontos_pro, pontos_contra
        ) VALUES (?, ?, ?, ?, 0, 0, 0, 0, 0, 0, 0)
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

async function getClassificacaoModalidade(modalidadeId, chaveId = null) {
  try {
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
    return linhas || [];
  } catch (error) {
    return [];
  }
}

module.exports = {
  sincronizarClassificacaoGruposModalidade,
  getResumoInscricoes,
  getClassificacaoModalidade
};
