const db = require('../config/db');

const BASE = 'http://localhost:3000';
const ADMIN = { email: 'admin@ifc.edu.br', senha: 'admin123' };
const SENHA_CAMPUS = 'jifc2026';

function dormir(ms) { return new Promise((r) => setTimeout(r, ms)); }
function criarJar() { return { cookies: new Map() }; }

function absorverCookie(jar, resposta) {
  const brutos = resposta.headers.getSetCookie ? resposta.headers.getSetCookie() : [];
  for (const bruto of brutos) {
    const [par] = bruto.split(';');
    const idx = par.indexOf('=');
    if (idx > 0) {
      const nome = par.slice(0, idx).trim();
      const valor = par.slice(idx + 1).trim();
      if (valor === '') jar.cookies.delete(nome); else jar.cookies.set(nome, valor);
    }
  }
}

function cab(jar) { return [...jar.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; '); }

function csrfDe(html) { const m = html.match(/name="_csrf"[^>]*value="([^"]+)"/); return m ? m[1] : ''; }

async function pedir(jar, caminho, { metodo = 'GET', corpo = null } = {}) {
  const headers = { cookie: cab(jar) };
  const opcoes = { method: metodo, redirect: 'manual', headers };
  if (corpo) {
    headers['content-type'] = 'application/x-www-form-urlencoded';
    const params = new URLSearchParams();
    for (const [chave, valor] of Object.entries(corpo)) {
      if (Array.isArray(valor)) valor.forEach((item) => params.append(chave, item));
      else params.append(chave, valor);
    }
    opcoes.body = params.toString();
  }
  let ultimo;
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(BASE + caminho, opcoes);
      absorverCookie(jar, r);
      return { status: r.status, location: r.headers.get('location') || '', texto: await r.text() };
    } catch (e) { ultimo = e; await dormir(1500 * (i + 1)); }
  }
  throw ultimo;
}

async function entrar(jar, email, senha) {
  const p = await pedir(jar, '/login');
  await pedir(jar, '/auth/login', { metodo: 'POST', corpo: { email, senha, _csrf: csrfDe(p.texto) } });
}

async function salvarConfiguracaoAdmin(jarAdmin, csrf, fimInscricoes) {
  await pedir(jarAdmin, '/admin/configurar/salvar', {
    metodo: 'POST',
    corpo: {
      inicio_evento: '2026-08-26', fim_evento: '2026-08-28',
      inicioInscricoesModalidades: '2026-08-01', fimInscricoesModalidades: fimInscricoes,
      inicioInscricoesAtletas: '2026-08-01', fimInscricoesAtletas: fimInscricoes,
      inicioSorteio: '2026-08-22', fimSorteio: '2026-09-30',
      limite_atletas_total_campus: '60', _csrf: csrf
    }
  });
}

async function gerarSorteio(jarAdmin, csrf, modalidadeId, subCategoria) {
  const r = await pedir(jarAdmin, '/admin/chaveamento/gerar', {
    metodo: 'POST',
    corpo: { modalidadeId: String(modalidadeId), subCategoria, _csrf: csrf }
  });
  if (r.status !== 302) throw new Error(`sorteio ${subCategoria} modalidade ${modalidadeId}: HTTP ${r.status}`);
}

function geradorIdentidade(usados) {
  return function gerar(genero) {
    let matricula;
    do { matricula = `34${String(Math.floor(Math.random() * 9000000) + 1000000)}`; } while (usados.has(matricula));
    usados.add(matricula);
    let numero;
    do { numero = String(71000000000 + Math.floor(Math.random() * 9999999999)); } while (usados.has(numero));
    usados.add(numero);
    return {
      matricula,
      cpf: `${numero.slice(0, 3)}.${numero.slice(3, 6)}.${numero.slice(6, 9)}-${numero.slice(9)}`
    };
  };
}

async function main() {
  const conexao = await db.getConnection();

  console.log('== Completando duplas de Tenis de Mesa ==');
  const [campi] = await conexao.query('SELECT id, nome, email FROM campus WHERE banned = 0 ORDER BY nome');
  const [links] = await conexao.query(
    `SELECT a.campus_id, a.genero, COUNT(*) n FROM atleta_modalidade am JOIN atletas a ON a.id = am.atleta_id WHERE am.modalidade_id IN (11,12) GROUP BY a.campus_id, a.genero`
  );
  const mapaLinks = new Map(links.map((l) => [`${l.campus_id}|${l.genero}`, l.n]));

  const [existentes] = await conexao.query('SELECT matricula, cpf FROM atletas');
  const usados = new Set();
  for (const a of existentes) {
    const matricula = String(a.matricula || '').replace(/\D/g, '');
    const cpf = String(a.cpf || '').replace(/\D/g, '');
    if (matricula) usados.add(matricula);
    if (cpf) usados.add(cpf);
  }

  const gerar = geradorIdentidade(usados);

  const NOMES_MASC = ['Henrique Steil', 'Murilo Prass', 'Otavio Bortoluzzi', 'Renan Kirsch', 'Saulo Brandao', 'Tiago Werner', 'Vicente Mallmann', 'Yuri Balthazar'];
  const NOMES_FEM = ['Ayla Back', 'Bruna Tessele', 'Clarice Voigt', 'Deise Benitez', 'Elisa Krambeck', 'Fernanda Wilrich', 'Giovana Benvenutti', 'Helena Sutil'];

  const plano = [];
  for (const camp of campi) {
    const faltaM = Math.max(0, 2 - (mapaLinks.get(`${camp.id}|Masculino`) || 0));
    const faltaF = Math.max(0, 2 - (mapaLinks.get(`${camp.id}|Feminino`) || 0));
    if (faltaM || faltaF) plano.push({ camp, faltaM, faltaF });
  }
  const totalNovos = plano.reduce((soma, p) => soma + p.faltaM + p.faltaF, 0);
  console.log(`Campi a completar: ${plano.length} | novos atletas: ${totalNovos}\n`);
  if (!plano.length) {
    conexao.release();
    return;
  }

  const jarAdmin = criarJar();
  await entrar(jarAdmin, ADMIN.email, ADMIN.senha);
  const csrfAdmin = csrfDe(await pedir(jarAdmin, '/admin/configurar').then((r) => r.texto));
  await salvarConfiguracaoAdmin(jarAdmin, csrfAdmin, '2026-08-31');
  console.log('Prazos abertos.\n');

  let contadorGlobal = 0;
  for (let i = 0; i < plano.length; i++) {
    const { camp, faltaM, faltaF } = plano[i];
    console.log(`[${i + 1}/${plano.length}] ${camp.nome} (+${faltaM} M, +${faltaF} F)`);
    if (i > 0) {
      await dormir(16000);
    }
    const jar = criarJar();
    await entrar(jar, camp.email, SENHA_CAMPUS);
    const csrf = csrfDe(await pedir(jar, '/campus/inscricoes').then((r) => r.texto));

    const tarefas = [];
    for (let k = 0; k < faltaM; k++) tarefas.push({ genero: 'Masculino', modalidade: 'Tênis de Mesa Masculino' });
    for (let k = 0; k < faltaF; k++) tarefas.push({ genero: 'Feminino', modalidade: 'Tênis de Mesa Feminino' });

    for (const tarefa of tarefas) {
      const identidade = gerar(tarefa.genero);
      const nomes = tarefa.genero === 'Masculino' ? NOMES_MASC : NOMES_FEM;
      const sigla = camp.nome.replace(/^IFC /, '').replace(/\s+/g, '').slice(0, 6);
      const nome = `${nomes[contadorGlobal % nomes.length]} ${sigla}${String.fromCharCode(65 + (contadorGlobal % 26))}`;
      contadorGlobal += 1;

      const r = await pedir(jar, '/campus/atletas/cadastrar', {
        metodo: 'POST',
        corpo: {
          nome,
          genero: tarefa.genero,
          dataNascimento: '2008-06-12',
          matricula: identidade.matricula,
          cpf: identidade.cpf,
          status: 'Analise',
          modalidades: [tarefa.modalidade],
          tenisMesaParticipacoes: ['Individual e Duplas'],
          _csrf: csrf
        }
      });
      const ok = r.status === 302 && !/erro=/.test(r.location);
      console.log(`   ${ok ? 'OK' : 'FALHA'} ${tarefa.genero}: ${nome}`);
      if (!ok) process.exitCode = 1;
    }
  }

  await dormir(1000);
  await salvarConfiguracaoAdmin(jarAdmin, csrfAdmin, '2026-08-21');
  console.log('\nPrazos fechados. Re-executando sorteios...');

  for (const id of [11, 12]) await gerarSorteio(jarAdmin, csrfAdmin, id, 'individual');
  for (const id of [11, 12]) await gerarSorteio(jarAdmin, csrfAdmin, id, 'dupla');
  console.log('Sorteios concluidos.');

  const [deficit] = await conexao.query(
    `SELECT c.nome, m.genero, COUNT(a.id) n
       FROM campus c CROSS JOIN modalidades m
       LEFT JOIN atleta_modalidade am ON am.modalidade_id = m.id
       LEFT JOIN atletas a ON a.id = am.atleta_id AND a.campus_id = c.id AND a.genero = m.genero
      WHERE m.id IN (11,12)
      GROUP BY c.nome, m.id, m.genero
     HAVING COUNT(CASE WHEN a.id IS NOT NULL THEN 1 END) < 2`
  );
  console.log(`Campi ainda com menos de 2 atletas em algum tenis: ${deficit.length}`);
  deficit.forEach((d) => console.log(`   - ${d.nome} (${d.genero}): ${d.n}`));

  conexao.release();
}

main()
  .then(() => process.exit(process.exitCode || 0))
  .catch((erro) => { console.error('FALHA:', erro.message); process.exit(1); });
