const fs = require('fs');
const path = require('path');
const db = require('../config/db');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const ADMIN = { email: 'admin@ifc.edu.br', senha: process.env.DEFAULT_ADMIN_PASSWORD || 'admin123' };
const SENHA_CAMPUS = process.env.DEFAULT_CAMPUS_PASSWORD || 'jifc2026';
const ESTADO_PATH = path.join(__dirname, '..', 'data', 'jifc-state.json');
const MATRICULA_VALIDA = /^[0-9]{9,12}$/;

function dormir(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function criarJar() {
  return { cookies: new Map() };
}

function absorverCookie(jar, resposta) {
  const brutos = resposta.headers.getSetCookie ? resposta.headers.getSetCookie() : [];
  for (const bruto of brutos) {
    const [par] = bruto.split(';');
    const idx = par.indexOf('=');
    if (idx > 0) {
      const nome = par.slice(0, idx).trim();
      const valor = par.slice(idx + 1).trim();
      if (valor === '') jar.cookies.delete(nome);
      else jar.cookies.set(nome, valor);
    }
  }
}

function cabecalhoComCookies(jar) {
  return [...jar.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

function extrairCsrf(html) {
  const m = html.match(/name="_csrf"[^>]*value="([^"]+)"/);
  return m ? m[1] : '';
}

async function tentarFetch(url, opcoes, tentativas = 4) {
  let ultimoErro;
  for (let i = 0; i < tentativas; i++) {
    try {
      return await fetch(url, opcoes);
    } catch (erro) {
      ultimoErro = erro;
      await dormir(1500 * (i + 1));
    }
  }
  throw ultimoErro;
}

async function pedir(jar, caminho, { metodo = 'GET', corpo = null } = {}) {
  const headers = { cookie: cabecalhoComCookies(jar) };
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

  const resposta = await tentarFetch(`${BASE}${caminho}`, opcoes);
  absorverCookie(jar, resposta);
  const texto = await resposta.text();
  return { status: resposta.status, location: resposta.headers.get('location') || '', texto };
}

async function entrar(jar, email, senha) {
  const paginaLogin = await pedir(jar, '/login');
  const csrf = extrairCsrf(paginaLogin.texto);
  const resposta = await pedir(jar, '/auth/login', { metodo: 'POST', corpo: { email, senha, _csrf: csrf } });
  if (resposta.status !== 302 || /login/.test(resposta.location)) {
    throw new Error(`Falha no login de ${email} (${resposta.status})`);
  }
}

function extrairMensagem(location) {
  try {
    const url = new URL(location, BASE);
    return decodeURIComponent(url.searchParams.get('erro') || url.searchParams.get('sucesso') || '');
  } catch (erro) {
    return '';
  }
}

function apenasDigitos(valor) {
  return String(valor || '').replace(/\D/g, '');
}

function carregarEstado() {
  return JSON.parse(fs.readFileSync(ESTADO_PATH, 'utf8'));
}

async function carregarDadosBase(estado) {
  const conexao = await db.getConnection();
  const [campi] = await conexao.query('SELECT id, nome, email FROM campus WHERE banned = 0 ORDER BY id ASC');
  const [modalidades] = await conexao.query('SELECT id, nome, genero FROM modalidades ORDER BY id ASC');
  conexao.release();

  const atletasEstado = Array.isArray(estado.campus && estado.campus.atletasCampus) ? estado.campus.atletasCampus : [];
  const limiteAtual = Number(estado.configuracoes && estado.configuracoes.limite_atletas_total_campus) || 60;

  const valores = modalidades.map((m) => `${m.nome} ${m.genero}`);
  const porGenero = {
    Masculino: modalidades.map((m, i) => (m.genero === 'Masculino' ? valores[i] : null)).filter(Boolean),
    Feminino: modalidades.map((m, i) => (m.genero === 'Feminino' ? valores[i] : null)).filter(Boolean)
  };

  const usados = new Set();
  for (const atleta of atletasEstado) {
    const matricula = apenasDigitos(atleta.matricula);
    if (matricula) usados.add(matricula);
    const cpf = apenasDigitos(atleta.cpf);
    if (cpf) usados.add(cpf);
  }

  return { campi, atletasEstado, limiteAtual, porGenero, usados };
}

async function salvarConfiguracaoAdmin(jarAdmin, csrf, limite, fimInscricoes) {
  const resposta = await pedir(jarAdmin, '/admin/configurar/salvar', {
    metodo: 'POST',
    corpo: {
      inicio_evento: '2026-08-26',
      fim_evento: '2026-08-28',
      inicioInscricoesModalidades: '2026-08-01',
      fimInscricoesModalidades: fimInscricoes,
      inicioInscricoesAtletas: '2026-08-01',
      fimInscricoesAtletas: fimInscricoes,
      inicioSorteio: '2026-08-22',
      fimSorteio: '2026-09-30',
      limite_atletas_total_campus: String(limite),
      _csrf: csrf
    }
  });
  if (resposta.status !== 302) {
    throw new Error('Falha ao salvar configuracao');
  }
}

function gerarMatricula(usados) {
  let matricula;
  do {
    matricula = `31${String(Math.floor(Math.random() * 9000000) + 1000000)}`;
  } while (usados.has(matricula));
  usados.add(matricula);
  return matricula;
}

function gerarCpf(usados) {
  let numero;
  do {
    numero = String(70000000000 + Math.floor(Math.random() * 9999999999));
  } while (usados.has(numero));
  usados.add(numero);
  return `${numero.slice(0, 3)}.${numero.slice(3, 6)}.${numero.slice(6, 9)}-${numero.slice(9, 11)}`;
}

const NOMES_MASC = ['Rafael Moreira', 'Diego Fontes', 'Caio Barbosa', 'Eduardo Prado', 'Gustavo Pires', 'Leonardo Ramos', 'Bruno Teixeira', 'Felipe Cardoso'];
const NOMES_FEM = ['Larissa Nunes', 'Camila Freitas', 'Beatriz Ramos', 'Sabrina Melo', 'Renata Castro', 'Taina Barros', 'Paula Andrade', 'Valeria Souza'];
const NASCIMENTOS = ['2007-05-14', '2008-09-23', '2009-03-08', '2007-11-02'];

function montarCorpoAtleta(atletaOuNovo, listaAlvo, extras = {}) {
  const base = {
    nome: atletaOuNovo.nome,
    genero: atletaOuNovo.genero,
    dataNascimento: atletaOuNovo.dataNascimento,
    matricula: String(atletaOuNovo.matricula || ''),
    cpf: String(atletaOuNovo.cpf || ''),
    status: atletaOuNovo.status || 'Analise',
    modalidades: listaAlvo,
    _csrf: extras.csrf
  };

  if (listaAlvo.some((m) => m.includes('Tênis de Mesa'))) {
    const atuais = Array.isArray(atletaOuNovo.tenisMesaParticipacoes) ? atletaOuNovo.tenisMesaParticipacoes.filter(Boolean) : [];
    base.tenisMesaParticipacoes = atuais.length ? atuais : ['Individual e Duplas'];
  }
  if (listaAlvo.some((m) => m.includes('Atletismo'))) {
    const atuais = Array.isArray(atletaOuNovo.atletismoProvas) ? atletaOuNovo.atletismoProvas.filter(Boolean) : [];
    base.atletismoProvas = atuais.length ? atuais : ['100m rasos'];
  }
  return base;
}

async function atualizarAtleta(jar, csrf, atleta, listaAlvo, matriculaFinal) {
  const dados = { ...atleta, matricula: matriculaFinal };
  const corpo = montarCorpoAtleta(dados, listaAlvo, { csrf });
  const resposta = await pedir(jar, `/campus/atletas/atualizar/${atleta.id}`, { metodo: 'POST', corpo });
  return { ok: resposta.status === 302 && !/erro=/.test(resposta.location), mensagem: extrairMensagem(resposta.location) };
}

async function cadastrarAtleta(jar, csrf, campusNome, genero, bloco, indiceGlobal, usados) {
  let ultimaMensagem = '';
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const nomes = genero === 'Masculino' ? NOMES_MASC : NOMES_FEM;
    const sigla = campusNome.replace(/^IFC /, '').split(' ')[0];
    const novo = {
      nome: `${nomes[(indiceGlobal + tentativa * 3) % nomes.length]} ${sigla}${String.fromCharCode(65 + ((indiceGlobal + tentativa * 5) % 26))}`,
      genero,
      dataNascimento: NASCIMENTOS[(indiceGlobal + tentativa) % NASCIMENTOS.length],
      matricula: gerarMatricula(usados),
      cpf: gerarCpf(usados),
      status: 'Analise'
    };
    const corpo = montarCorpoAtleta(novo, bloco, { csrf });
    const resposta = await pedir(jar, '/campus/atletas/cadastrar', { metodo: 'POST', corpo });
    if (resposta.status === 302 && !/erro=/.test(resposta.location)) {
      return { ok: true, nome: novo.nome };
    }
    ultimaMensagem = extrairMensagem(resposta.location);
  }
  return { ok: false, mensagem: ultimaMensagem };
}

async function main() {
  console.log('== Fechando lacunas de cobertura ==');
  const estadoInicial = carregarEstado();
  const dadosBase = await carregarDadosBase(estadoInicial);

  const plano = [];
  for (const campus of dadosBase.campi) {
    const doCampus = dadosBase.atletasEstado.filter((a) => a.campus === campus.nome);
    const tarefas = [];
    for (const genero of ['Masculino', 'Feminino']) {
      const cobertas = new Set();
      for (const a of doCampus.filter((x) => x.genero === genero)) {
        for (const m of a.modalidades || []) cobertas.add(m);
      }
      const faltantes = dadosBase.porGenero[genero].filter((m) => !cobertas.has(m));
      if (faltantes.length) tarefas.push({ genero, faltantes });
    }
    if (tarefas.length) plano.push({ campus, tarefas });
  }

  const totalLacunas = plano.reduce((soma, p) => soma + p.tarefas.reduce((t, x) => t + x.faltantes.length, 0), 0);
  console.log(`Campi com lacuna: ${plano.length} | modalidades sem atleta: ${totalLacunas}\n`);
  if (!plano.length) {
    console.log('Nada a fazer.');
    return;
  }

  const jarAdmin = criarJar();
  await entrar(jarAdmin, ADMIN.email, ADMIN.senha);
  const csrfAdmin = extrairCsrf(await pedir(jarAdmin, '/admin/configurar').then((r) => r.texto));
  await salvarConfiguracaoAdmin(jarAdmin, csrfAdmin, dadosBase.limiteAtual, '2026-08-31');
  console.log('Prazos abertos.\n');

  let indiceGlobal = 0;

  for (let i = 0; i < plano.length; i++) {
    const { campus, tarefas } = plano[i];
    console.log(`[${i + 1}/${plano.length}] ${campus.nome}`);
    if (i > 0) {
      console.log('   aguardando 16s (limite de logins)...');
      await dormir(16000);
    }

    const jar = criarJar();
    await entrar(jar, campus.email, SENHA_CAMPUS);
    const csrf = extrairCsrf(await pedir(jar, '/campus/inscricoes').then((r) => r.texto));
    if (!csrf) throw new Error(`CSRF nao encontrado para ${campus.nome}`);

    const doCampus = dadosBase.atletasEstado.filter((a) => a.campus === campus.nome);

    for (const tarefa of tarefas) {
      const restantes = [...tarefa.faltantes];
      const candidatos = doCampus
        .filter((a) => a.genero === tarefa.genero && (a.modalidades || []).length < 3)
        .sort((a, b) => (a.modalidades || []).length - (b.modalidades || []).length);

      while (restantes.length && candidatos.some((c) => (c.modalidades || []).length < 3)) {
        candidatos.sort((a, b) => (a.modalidades || []).length - (b.modalidades || []).length);
        const candidato = candidatos.find((c) => (c.modalidades || []).length < 3);

        const espaco = Math.min(3 - (candidato.modalidades || []).length, restantes.length);
        const bloco = restantes.splice(0, espaco);
        const listaAlvo = [...new Set([...(candidato.modalidades || []), ...bloco])].slice(0, 3);
        const matriculaFinal = MATRICULA_VALIDA.test(apenasDigitos(candidato.matricula))
          ? String(candidato.matricula)
          : gerarMatricula(dadosBase.usados);

        const resultado = await atualizarAtleta(jar, csrf, candidato, listaAlvo, matriculaFinal);
        if (resultado.ok) {
          candidato.modalidades = listaAlvo;
          console.log(`   + ${bloco.length} para ${candidato.nome}${matriculaFinal !== String(candidato.matricula) ? ' [matricula corrigida]' : ''}`);
        } else {
          restantes.unshift(...bloco);
          candidatos.splice(candidatos.indexOf(candidato), 1);
          console.log(`   AVISO ${candidato.nome}: ${resultado.mensagem}`);
        }
      }

      while (restantes.length) {
        const bloco = restantes.splice(0, Math.min(3, restantes.length));
        const resultado = await cadastrarAtleta(jar, csrf, campus.nome, tarefa.genero, bloco, indiceGlobal++, dadosBase.usados);
        if (resultado.ok) {
          console.log(`   Novo atleta ${tarefa.genero}: ${resultado.nome}`);
        } else {
          console.log(`   AVISO cadastro (${tarefa.genero}): ${resultado.mensagem}`);
        }
      }
    }
  }

  await salvarConfiguracaoAdmin(jarAdmin, csrfAdmin, dadosBase.limiteAtual, '2026-08-21');
  console.log('\nPrazos fechados novamente.');
}

main()
  .then(() => process.exit(0))
  .catch((erro) => {
    console.error('FALHA:', erro.message);
    process.exit(1);
  });
