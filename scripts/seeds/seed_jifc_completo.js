const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const {
  TOTAL_ATLETAS_ATLETISMO,
  distribuirProvasAtletismo
} = require('../utils/atletismoSeed');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const STATE_PATH = path.resolve(__dirname, '..', 'data', 'jifc-state.json');
const dbPassword = process.env.DB_PASSWORD === '""' || process.env.DB_PASSWORD === "''" || !process.env.DB_PASSWORD ? '' : process.env.DB_PASSWORD;

const CAMPUS_IDS = [
  'IFC Abelardo Luz', 'IFC Araquari', 'IFC Concórdia', 'IFC Ibirama', 'IFC Mafra',
  'IFC Luzerna', 'IFC Rio do Sul', 'IFC Santa Rosa do Sul', 'IFC Blumenau', 'IFC Brusque',
  'IFC Camboriú', 'IFC Fraiburgo', 'IFC São Bento do Sul', 'IFC São Francisco do Sul',
  'IFC Sombrio', 'IFC Videira', 'IFC Campos Novos'
];
// índice 0 => id 1 ... índice 16 => id 17

// Modalidades (id -> {nome, genero})
const M = {
  futsalM: 1, basqueteM: 2, atletismoM: 3, handebolF: 4, vpraiaF: 5, atletismoF: 6,
  voleiM: 7, vpraiaM: 8, handebolM: 9, voleiF: 10, futsalF: 11, tenisM: 12,
  xadrezM: 13, xadrezF: 14, basqueteF: 15, tenisF: 16
};

const NOME_MOD = {
  1: 'Futsal Masculino', 2: 'Basquete Masculino', 3: 'Atletismo Masculino',
  4: 'Handebol Feminino', 5: 'Vôlei de Praia Feminino', 6: 'Atletismo Feminino',
  7: 'Vôlei Masculino', 8: 'Volei de Praia Masculino', 9: 'Handebol Masculino',
  10: 'Vôlei Feminino', 11: 'Futsal Feminino', 12: 'Tênis de Mesa Masculino',
  13: 'Xadrez Masculino', 14: 'Xadrez Feminino', 15: 'Basquete Feminino', 16: 'Tênis de Mesa Feminino'
};

// Índices (0-based) dos campi que participam de cada coletivo.
// ordem: [0..16] correspondente a id 1..17
let idx = 0;
const ALL = CAMPUS_IDS.map((_, i) => i); // [0..16]

const MATRIZ = {
  [M.futsalM]: ALL,                                        // 17
  [M.basqueteM]: [0, 1, 2, 3, 4, 5, 6, 7, 16],             // 9
  [M.handebolF]: [0, 1, 2, 3, 4, 5, 6, 7, 8],              // 9
  [M.vpraiaF]: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 16], // 14
  [M.voleiM]: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 16],  // 14
  [M.vpraiaM]: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 16], // 14
  [M.handebolM]: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 15, 16],   // 12
  [M.voleiF]: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16], // 15
  [M.futsalF]: [0, 1, 2, 3, 4, 5, 6, 7, 8, 16],            // 10
  [M.basqueteF]: [0, 1, 2, 3, 4, 5, 6, 7]                  // 8
};

const ATLETISMO_POR_GENERO = 20; // por campus
const XADREZ_M = 30;
const XADREZ_F = 30;
const TENIS_M = 24;
const TENIS_F = 24;
const CAMPUS_CHAVES_TENIS = 8;
const TENIS_ATLETAS_POR_CHAVE = 3;

function gerarCpf(seed) {
  const base = String(10000000000 + seed).slice(-11);
  return `${base.slice(0, 3)}.${base.slice(3, 6)}.${base.slice(6, 9)}-${base.slice(9)}`;
}

function gerarNome(s1idx, num) {
  const nomes = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elisa', 'Felipe', 'Gabriela', 'Henrique',
    'Isabela', 'João', 'Karina', 'Lucas', 'Mariana', 'Nicolas', 'Olívia', 'Pedro',
    'Rafaela', 'Samuel', 'Tatiane', 'Vitor', 'Camila', 'Eduardo', 'Fernanda', 'Gustavo',
    'Helena', 'Igor', 'Juliana', 'Leonardo', 'Michele', 'Otávio', 'Patrícia', 'Renato',
    'Sabrina', 'Tiago', 'Vanessa', 'William', 'Aline', 'Bruno', 'Carolina', 'Daniel'];
  const sobrenomes = ['Silva', 'Souza', 'Oliveira', 'Santos', 'Pereira', 'Costa', 'Rodrigues',
    'Almeida', 'Nascimento', 'Lima', 'Araújo', 'Fernandes', 'Carvalho', 'Gomes', 'Martins',
    'Rocha', 'Ribeiro', 'Alves', 'Monteiro', 'Mendes', 'Barbosa', 'Cardoso', 'Ramos', 'Freitas'];
  const n = nomes[(s1idx + num) % nomes.length];
  const s1 = sobrenomes[(s1idx * 7 + num) % sobrenomes.length];
  const s2 = sobrenomes[(s1idx * 13 + num + 3) % sobrenomes.length];
  return `${n} ${s1} ${s2}`;
}

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'root',
    password: dbPassword,
    database: process.env.DB_NAME || 'jifc'
  });

  const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));

  try {
    // 1) Limpar dados de torneio/atletas anteriores (deixar campus/modalidades)
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const t of ['resultados_xadrez', 'resultados_atletismo', 'resultados_por_sets', 'resultados_coletivos',
      'cartoes', 'classificacao_grupos', 'jogos', 'chaves', 'atleta_modalidade', 'atletas', 'campus_modalidade']) {
      try { await conn.query(`DELETE FROM ${t}`); } catch (e) { /* tabela pode não existir */ }
    }
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    try { await conn.query('ALTER TABLE atletas AUTO_INCREMENT = 1'); } catch (e) {}

    await conn.query("UPDATE campus SET nome = 'IFC Campos Novos' WHERE id = 17");

    // Mapeia id -> nome atual no MySQL
    const [campusRows] = await conn.query('SELECT id, nome FROM campus ORDER BY id');
    const idParaNome = {};
    for (const row of campusRows) idParaNome[row.id] = row.nome;
    const nomeParaId = {};
    for (const row of campusRows) nomeParaId[row.nome] = row.id;

    // 2) Montar inscricao por campus (nome -> array de nomes de modalidade)
    //    Inclui coletivos + individuais para fidelidade do registro.
    const inscricoesCampus = {};
    for (let i = 0; i < CAMPUS_IDS.length; i++) {
      const nome = CAMPUS_IDS[i];
      const lista = [];
      for (const [modId, campi] of Object.entries(MATRIZ)) {
        if (campi.includes(i)) lista.push(NOME_MOD[Number(modId)]);
      }
      // Individuais: todas inscritas (atletas por campus)
      [M.atletismoM, M.atletismoF, M.xadrezM, M.xadrezF, M.tenisM, M.tenisF].forEach((id) => {
        if (!lista.includes(NOME_MOD[id])) lista.push(NOME_MOD[id]);
      });
      inscricoesCampus[nome] = lista;
    }

    // 3) Atualizar JSON inscricoesCampus (campus.inscricoesCampus) e top-level
    state.campus.inscricoesCampus = inscricoesCampus;
    // remover chaves de campi que não existem mais
    // (top-level state.inscricoesCampus também é sincronizado)
    if (state.inscricoesCampus && typeof state.inscricoesCampus === 'object') {
      for (const key of Object.keys(state.inscricoesCampus)) {
        if (!inscricoesCampus[key]) delete state.inscricoesCampus[key];
      }
    }

    // 4) Reconstruir campus_modalidade no MySQL (apenas coletivos)
    await conn.query('DELETE FROM campus_modalidade');
    const inserts = [];
    for (const [modId, campi] of Object.entries(MATRIZ)) {
      for (const i of campi) {
        inserts.push([i + 1, Number(modId)]);
      }
    }
    // tambem inserir individuais para espelhar inscricoesCampus (registro de modalidade)
    const individuaisIds = [M.atletismoM, M.atletismoF, M.xadrezM, M.xadrezF, M.tenisM, M.tenisF];
    for (let i = 0; i < CAMPUS_IDS.length; i++) {
      for (const modId of individuaisIds) {
        inserts.push([i + 1, modId]);
      }
    }
    for (const [cid, mid] of inserts) {
      await conn.query('INSERT IGNORE INTO campus_modalidade (campus_id, modalidade_id) VALUES (?, ?)', [cid, mid]);
    }
    console.log('campus_modalidade rows:', inserts.length);

    // ===== ATLETAS =====
    // Gera a lista de atletas em JSON e grava em MySQL simultaneamente.
    const atletasJSON = [];
    let seed = 1;
    const MODALIDADES_MASC = [M.futsalM, M.voleiM, M.basqueteM, M.handebolM, M.vpraiaM];
    const MODALIDADES_FEM = [M.futsalF, M.voleiF, M.basqueteF, M.handebolF, M.vpraiaF];
    const provasAtletismoPorAtleta = new Map();
    for (const [generoIndex, genero] of ['Masculino', 'Feminino'].entries()) {
      const candidatos = Array.from(
        { length: CAMPUS_IDS.length * ATLETISMO_POR_GENERO },
        (_, indice) => ({
          campusId: Math.floor(indice / ATLETISMO_POR_GENERO) + 1,
          indice: (indice % ATLETISMO_POR_GENERO) + 1
        })
      );
      const distribuicao = distribuirProvasAtletismo(candidatos, 2026 + generoIndex);
      distribuicao.forEach((provas, atleta) => {
        provasAtletismoPorAtleta.set(`${atleta.campusId}|${genero}|${atleta.indice}`, provas);
      });
    }

    // inserir no banco em lote via helper
    async function inserirAtleta(campusId, nome, cpfMascarado, matricula, genero, modalidadeIds, provasAtletismo = null) {
      const cpfBanco = String(cpfMascarado).replace(/[^0-9]/g, '');
      const [res] = await conn.query(
        'INSERT INTO atletas (campus_id, nome, cpf, matricula, genero, data_nascimento, provas_atletismo) VALUES (?,?,?,?,?,?,?)',
        [campusId, nome, cpfBanco, matricula, genero, '2006-03-15', provasAtletismo?.length ? JSON.stringify(provasAtletismo) : null]
      );
      const atletaId = res.insertId;
      const am = [];
      for (const mid of modalidadeIds) {
        am.push([atletaId, mid]);
      }
      if (am.length) {
        await conn.query('INSERT IGNORE INTO atleta_modalidade (atleta_id, modalidade_id) VALUES ?', [am]);
      }
      return atletaId;
    }

    for (let i = 0; i < CAMPUS_IDS.length; i++) {
      const campusNome = CAMPUS_IDS[i];
      const campusId = i + 1;
      for (const genero of ['Masculino', 'Feminino']) {
        const atletismoMod = genero === 'Masculino' ? M.atletismoM : M.atletismoF;
        const coletivos = (genero === 'Masculino' ? MODALIDADES_MASC : MODALIDADES_FEM).filter((mid) => MATRIZ[mid].includes(i));

        // Elenco do campus; apenas 40 atletas por gênero participam do atletismo.
        for (let k = 0; k < ATLETISMO_POR_GENERO; k++) {
          seed += 1;
          const atletismoProvas = provasAtletismoPorAtleta.get(`${campusId}|${genero}|${k + 1}`);
          const modalidades = atletismoProvas.length ? [atletismoMod] : [];
          if (coletivos.length) {
            // cada atleta cobre até 2 coletivos para garantir cobertura
            const c1 = coletivos[(k * 2) % coletivos.length];
            const c2 = coletivos[(k * 2 + 1) % coletivos.length];
            if (c1 !== undefined && !modalidades.includes(c1)) modalidades.push(c1);
            if (c2 !== undefined && c2 !== c1 && !modalidades.includes(c2)) modalidades.push(c2);
          }
          const nome = gerarNome(i * 31 + genero.length, k);
          const cpf = gerarCpf(seed);
          const matricula = String(seed).padStart(9, '0');
          const atletaId = await inserirAtleta(campusId, nome, cpf, matricula, genero, modalidades, atletismoProvas);
          atletasJSON.push({
            id: seed,
            nome,
            matricula,
            modalidade: modalidades.map((m) => NOME_MOD[m]).join(', '),
            modalidades: modalidades.map((m) => NOME_MOD[m]),
            dataNascimento: '2006-03-15',
            cpf,
            campus: campusNome,
            genero,
            status: 'Regular',
            atletismoProvas,
            tenisMesaParticipacoes: [],
            _dbId: atletaId
          });
        }
      }
    }

    // XADREZ: 30M + 30F distribuídos entre campi
    async function distribuirIndividuais(total, genero, modId, prefixo) {
      const porCampus = new Array(CAMPUS_IDS.length).fill(0);
      let restante = total;
      let p = 0;
      while (restante > 0) {
        porCampus[p % CAMPUS_IDS.length] += 1;
        restante -= 1;
        p += 3; // espalha
      }
      for (let i = 0; i < CAMPUS_IDS.length; i++) {
        for (let k = 0; k < porCampus[i]; k++) {
          seed += 1;
          const nome = gerarNome(i * 51 + (genero === 'Feminino' ? 7 : 1), 100 + k);
          const cpf = gerarCpf(seed);
          const matricula = String(seed).padStart(9, '0');
          const atletaId = await inserirAtleta(i + 1, nome, cpf, matricula, genero, [modId]);
          atletasJSON.push({
            id: seed,
            nome, matricula, modalidade: NOME_MOD[modId], modalidades: [NOME_MOD[modId]],
            dataNascimento: '2006-03-15', cpf, campus: CAMPUS_IDS[i], genero,
            status: 'Regular', atletismoProvas: [], tenisMesaParticipacoes: [], _dbId: atletaId
          });
        }
      }
    }

    await distribuirIndividuais(XADREZ_M, 'Masculino', M.xadrezM, 'x');
    await distribuirIndividuais(XADREZ_F, 'Feminino', M.xadrezF, 'x');

    // TÊNIS DE MESA: até 8 chaves de 3 atletas por gênero.
    async function distribuirTenis(total, genero, modId) {
      const alvo = CAMPUS_CHAVES_TENIS;
      if (total > alvo * TENIS_ATLETAS_POR_CHAVE) {
        throw new Error(`O tênis de mesa ${genero} excede o limite de ${alvo} chaves com ${TENIS_ATLETAS_POR_CHAVE} atletas.`);
      }
      const base = Math.floor(total / alvo);
      const resto = total % alvo;
      const porCampus = Array.from({ length: CAMPUS_IDS.length }, () => 0);
      for (let c = 0; c < alvo; c++) {
        porCampus[c] = Math.min(TENIS_ATLETAS_POR_CHAVE, base + (c < resto ? 1 : 0));
      }
      for (let i = 0; i < CAMPUS_IDS.length; i++) {
        for (let k = 0; k < porCampus[i]; k++) {
          seed += 1;
          const nome = gerarNome(i * 71 + (genero === 'Feminino' ? 5 : 3), 200 + k);
          const cpf = gerarCpf(seed);
          const matricula = String(seed).padStart(9, '0');
          const atletaId = await inserirAtleta(i + 1, nome, cpf, matricula, genero, [modId]);
          atletasJSON.push({
            id: seed,
            nome, matricula, modalidade: NOME_MOD[modId], modalidades: [NOME_MOD[modId]],
            dataNascimento: '2006-03-15', cpf, campus: CAMPUS_IDS[i], genero,
            status: 'Regular', atletismoProvas: [], tenisMesaParticipacoes: [], _dbId: atletaId
          });
        }
      }
    }

    await distribuirTenis(TENIS_M, 'Masculino', M.tenisM);
    await distribuirTenis(TENIS_F, 'Feminino', M.tenisF);

    // Gravar atletas no JSON (sem o _dbId interno)
    const atletasGravar = atletasJSON.map(({ _dbId, ...resto }) => resto);
    state.campus.atletasCampus = atletasGravar;

    fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');

    console.log('Total atletas gerados:', atletasGravar.length);
    console.log('Atletismo M/F:', TOTAL_ATLETAS_ATLETISMO, TOTAL_ATLETAS_ATLETISMO);
    console.log('Xadrez M/F:', XADREZ_M, XADREZ_F);
    console.log('Tênis M/F:', TENIS_M, TENIS_F);
    console.log('seed-fase1-ok');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
})();
