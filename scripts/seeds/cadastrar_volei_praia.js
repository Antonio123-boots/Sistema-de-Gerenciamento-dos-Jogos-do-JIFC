const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const dbPassword = process.env.DB_PASSWORD === '""' || process.env.DB_PASSWORD === "''" || !process.env.DB_PASSWORD ? '' : process.env.DB_PASSWORD;

const QUANTIDADE_CAMPIS = 14;

const NOMES_MASCULINOS = [
  'Gabriel Ferreira', 'Lucas Almeida', 'Matheus Ribeiro', 'Pedro Henrique Souza',
  'Rafael Costa', 'Thiago Barbosa', 'Bruno Martins', 'Diego Cardoso',
  'Felipe Rocha', 'Andre Nunes', 'Caio Ramos', 'Vinicius Teixeira',
  'Eduardo Moreira', 'Leonardo Pinto'
];

const NOMES_FEMININOS = [
  'Ana Clara Vieira', 'Beatriz Lopes', 'Camila Fernandes', 'Larissa Duarte',
  'Mariana Freitas', 'Sofia Barros', 'Isabela Machado', 'Rafaela Gomes',
  'Fernanda Azevedo', 'Luana Cunha', 'Bruna Melo', 'Carolina Batista',
  'Amanda Correia', 'Gabriela Siqueira'
];

const MODALIDADES_PRAIA = [
  { nome: 'Vôlei de Praia', genero: 'Masculino', nomes: NOMES_MASCULINOS, prefixoMatricula: 'PRAIAM', baseCpf: 20000000000 },
  { nome: 'Vôlei de Praia', genero: 'Feminino', nomes: NOMES_FEMININOS, prefixoMatricula: 'PRAIAF', baseCpf: 30000000000 }
];

const pad = (valor) => String(valor).padStart(2, '0');

async function cadastrarNoBanco(conn) {
  const [campis] = await conn.query('SELECT id, nome, nome_exibicao FROM campus ORDER BY id LIMIT ?', [QUANTIDADE_CAMPIS]);
  const resumo = [];

  for (const modalidade of MODALIDADES_PRAIA) {
    const [modalidades] = await conn.query('SELECT id FROM modalidades WHERE nome = ? AND genero = ? LIMIT 1', [modalidade.nome, modalidade.genero]);
    let modalidadeId;
    if (modalidades.length === 0) {
      const [criada] = await conn.query(
        'INSERT INTO modalidades (nome, genero, tipo_confronto, formato_disputa) VALUES (?, ?, ?, ?)',
        [modalidade.nome, modalidade.genero, 'Coletivo', 'Grupos + Mata-Mata']
      );
      modalidadeId = criada.insertId;
    } else {
      modalidadeId = modalidades[0].id;
    }

    for (let indice = 0; indice < campis.length; indice += 1) {
      const campus = campis[indice];
      await conn.query(
        'INSERT IGNORE INTO campus_modalidade (campus_id, modalidade_id) VALUES (?, ?)',
        [campus.id, modalidadeId]
      );

      const nomeAtleta = modalidade.nomes[indice];
      const cpf = String(modalidade.baseCpf + indice + 1);
      const matricula = `${modalidade.prefixoMatricula}${pad(indice + 1)}`;

      const [existente] = await conn.query('SELECT id FROM atletas WHERE cpf = ? OR matricula = ?', [cpf, matricula]);
      let atletaId;
      if (existente.length > 0) {
        atletaId = existente[0].id;
      } else {
        const dataNascimento = `${2007 - (indice % 2)}-${pad((indice % 12) + 1)}-${pad((indice % 27) + 1)}`;
        const [resultado] = await conn.query(
          'INSERT INTO atletas (campus_id, nome, cpf, matricula, genero, data_nascimento) VALUES (?, ?, ?, ?, ?, ?)',
          [campus.id, nomeAtleta, cpf, matricula, modalidade.genero, dataNascimento]
        );
        atletaId = resultado.insertId;
      }

      await conn.query(
        'INSERT IGNORE INTO atleta_modalidade (atleta_id, modalidade_id) VALUES (?, ?)',
        [atletaId, modalidadeId]
      );
    }

    resumo.push(`${modalidade.nome} ${modalidade.genero} (id ${modalidadeId})`);
  }

  return { campis, resumo };
}

function atualizarStateJson(campis) {
  const caminhoState = path.resolve(__dirname, '..', 'data', 'jifc-state.json');
  if (!fs.existsSync(caminhoState)) {
    console.log('state-json: arquivo nao encontrado, pulando');
    return;
  }

  const state = JSON.parse(fs.readFileSync(caminhoState, 'utf8'));
  if (!state.inscricoesCampus || typeof state.inscricoesCampus !== 'object') {
    state.inscricoesCampus = {};
  }

  let alteracoes = 0;
  for (const campus of campis) {
    const chaveExistente = Object.keys(state.inscricoesCampus).find((chave) =>
      chave === campus.nome || chave === campus.nome_exibicao
    ) || campus.nome;

    const listaAtual = Array.isArray(state.inscricoesCampus[chaveExistente]) ? state.inscricoesCampus[chaveExistente] : [];

    for (const modalidade of MODALIDADES_PRAIA) {
      const nomeCompleto = `${modalidade.nome} ${modalidade.genero}`;
      if (!listaAtual.includes(nomeCompleto)) {
        listaAtual.push(nomeCompleto);
        alteracoes += 1;
      }
    }

    state.inscricoesCampus[chaveExistente] = listaAtual;
  }

  fs.writeFileSync(caminhoState, JSON.stringify(state, null, 2), 'utf8');
  console.log(`state-json: ${alteracoes} inscricoes adicionadas`);
}

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'root',
    password: dbPassword,
    database: process.env.DB_NAME || 'jifc'
  });

  try {
    const { campis, resumo } = await cadastrarNoBanco(conn);

    const [contagem] = await conn.query(
      `SELECT m.genero, COUNT(*) AS equipes FROM campus_modalidade cm
       JOIN modalidades m ON m.id = cm.modalidade_id
       WHERE REPLACE(LOWER(m.nome), 'ê', 'e') = 'volei de praia' GROUP BY m.genero`
    );
    const [atletasPraia] = await conn.query(
      `SELECT m.genero, COUNT(*) AS total FROM atleta_modalidade am
       JOIN modalidades m ON m.id = am.modalidade_id
       WHERE REPLACE(LOWER(m.nome), 'ê', 'e') = 'volei de praia' GROUP BY m.genero`
    );

    console.log('Inscricoes criadas em:', resumo.join(' | '));
    contagem.forEach((linha) => console.log(`Equipes inscritas ${linha.genero}: ${linha.equipes}`));
    atletasPraia.forEach((linha) => console.log(`Atletas vinculados ${linha.genero}: ${linha.total}`));

    atualizarStateJson(campis);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
})();
