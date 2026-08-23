const fs = require('fs');
const path = require('path');
const db = require('../config/db');

const ESTADO_PATH = path.join(__dirname, '..', 'data', 'jifc-state.json');

function normalizarTexto(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function apenasDigitos(valor) {
  return String(valor || '').replace(/\D/g, '');
}

async function main() {
  const estado = JSON.parse(fs.readFileSync(ESTADO_PATH, 'utf8'));
  const atletasEstado = Array.isArray(estado.campus && estado.campus.atletasCampus) ? estado.campus.atletasCampus : [];

  const conexao = await db.getConnection();
  const [campi] = await conexao.query('SELECT id, nome FROM campus');
  const mapaCampi = new Map(campi.map((c) => [c.nome, c.id]));

  const [modalidades] = await conexao.query('SELECT id, nome, genero FROM modalidades');
  const mapaModalidades = new Map();
  for (const m of modalidades) {
    mapaModalidades.set(normalizarTexto(`${m.nome} ${m.genero}`), m);
  }

  const [existentes] = await conexao.query('SELECT id, campus_id, matricula, cpf FROM atletas');
  const porCampusMatricula = new Map();
  const matriculasUsadas = new Set();
  const cpfsUsados = new Set();
  for (const a of existentes) {
    const matricula = apenasDigitos(a.matricula);
    const cpf = apenasDigitos(a.cpf);
    porCampusMatricula.set(`${a.campus_id}|${matricula}`, a.id);
    if (matricula) matriculasUsadas.add(matricula);
    if (cpf) cpfsUsados.add(cpf);
  }

  function gerarMatricula() {
    let valor;
    do {
      valor = `32${String(Math.floor(Math.random() * 9000000) + 1000000)}`;
    } while (matriculasUsadas.has(valor));
    matriculasUsadas.add(valor);
    return valor;
  }

  function gerarCpf() {
    let valor;
    do {
      valor = String(70000000000 + Math.floor(Math.random() * 9999999999));
    } while (cpfsUsados.has(valor));
    cpfsUsados.add(valor);
    return valor;
  }

  let inseridos = 0;
  let atualizados = 0;
  let linksCriados = 0;
  let semMapeamento = 0;
  let generoDivergente = 0;
  let campisIgnorados = 0;

  for (const atleta of atletasEstado) {
    const campusId = mapaCampi.get(atleta.campus);
    if (!campusId) {
      campisIgnorados++;
      continue;
    }

    const nome = String(atleta.nome || '').trim() || 'Atleta Sem Nome';
    let matricula = apenasDigitos(atleta.matricula).slice(0, 12);
    if (!matricula || porCampusMatricula.has(`${campusId}|${matricula}`) === false && matriculasUsadas.has(matricula)) {
      const nova = gerarMatricula();
      console.log(`AVISO matricula global duplicada "${matricula}" (${nome}, ${atleta.campus}) -> ${nova}`);
      matricula = nova;
    }
    if (!matricula) matricula = gerarMatricula();

    let cpf = apenasDigitos(atleta.cpf).slice(0, 11);
    if (cpf.length !== 11 || cpfsUsados.has(cpf)) cpf = gerarCpf();

    const genero = atleta.genero === 'Feminino' ? 'Feminino' : 'Masculino';
    const nascimento = /^\d{4}-\d{2}-\d{2}$/.test(String(atleta.dataNascimento || ''))
      ? String(atleta.dataNascimento)
      : '2007-01-01';
    const provas = Array.isArray(atleta.atletismoProvas) && atleta.atletismoProvas.length
      ? JSON.stringify(atleta.atletismoProvas)
      : null;

    const chave = `${campusId}|${matricula}`;
    let atletaId = porCampusMatricula.get(chave) || null;

    if (atletaId) {
      await conexao.query(
        'UPDATE atletas SET nome = ?, cpf = ?, genero = ?, data_nascimento = ?, provas_atletismo = COALESCE(?, provas_atletismo) WHERE id = ?',
        [nome, cpf, genero, nascimento, provas, atletaId]
      );
      atualizados++;
    } else {
      try {
        const [resultado] = await conexao.query(
          'INSERT INTO atletas (campus_id, nome, cpf, matricula, genero, data_nascimento, provas_atletismo) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [campusId, nome, cpf, matricula, genero, nascimento, provas]
        );
        atletaId = resultado.insertId;
        porCampusMatricula.set(chave, atletaId);
        inseridos++;
      } catch (erro) {
        if (erro && erro.code === 'ER_DUP_ENTRY') {
          const novaMatricula = gerarMatricula();
          console.log(`AVISO colisao unica para "${nome}" -> matricula ${novaMatricula}`);
          const [resultado] = await conexao.query(
            'INSERT INTO atletas (campus_id, nome, cpf, matricula, genero, data_nascimento, provas_atletismo) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [campusId, nome, cpf, novaMatricula, genero, nascimento, provas]
          );
          atletaId = resultado.insertId;
          porCampusMatricula.set(`${campusId}|${novaMatricula}`, atletaId);
          inseridos++;
        } else {
          throw erro;
        }
      }
    }
    cpfsUsados.add(cpf);
    matriculasUsadas.add(matricula);

    const idsAlvo = [];
    for (const valor of atleta.modalidades || []) {
      const modalidade = mapaModalidades.get(normalizarTexto(valor));
      if (!modalidade) {
        semMapeamento++;
        continue;
      }
      if (modalidade.genero !== genero) {
        generoDivergente++;
        continue;
      }
      idsAlvo.push(modalidade.id);
    }

    await conexao.query('DELETE FROM atleta_modalidade WHERE atleta_id = ?', [atletaId]);
    for (const modalidadeId of [...new Set(idsAlvo)]) {
      await conexao.query('INSERT INTO atleta_modalidade (atleta_id, modalidade_id) VALUES (?, ?)', [atletaId, modalidadeId]);
      linksCriados++;
    }
  }

  console.log(`\nInseridos: ${inseridos} | Atualizados: ${atualizados} | Links: ${linksCriados}`);
  console.log(`Sem mapeamento: ${semMapeamento} | Genero divergente: ${generoDivergente} | Campis fantasmas: ${campisIgnorados}`);

  const [vazias] = await conexao.query(
    `SELECT c.nome AS campus, m.nome AS mod_nome, m.genero
       FROM campus c
      CROSS JOIN modalidades m
       LEFT JOIN campus_modalidade cm ON cm.campus_id = c.id AND cm.modalidade_id = m.id
       LEFT JOIN atleta_modalidade am2 ON am2.modalidade_id = m.id
       LEFT JOIN atletas a ON a.id = am2.atleta_id AND a.campus_id = c.id
      WHERE cm.campus_id IS NOT NULL
      GROUP BY c.nome, m.id, m.nome, m.genero
     HAVING COUNT(DISTINCT CASE WHEN a.genero = m.genero THEN a.id END) = 0`
  );
  console.log(`Lacunas restantes: ${vazias.length}`);
  for (const v of vazias) console.log(` - ${v.campus}: ${v.mod_nome} ${v.genero}`);

  conexao.release();
}

main()
  .then(() => process.exit(0))
  .catch((erro) => {
    console.error('ERRO:', erro.message);
    process.exit(1);
  });
