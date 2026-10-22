const fs = require('fs');
const path = require('path');
const db = require('../config/db');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const ADMIN = { email: 'admin@ifc.edu.br', senha: process.env.DEFAULT_ADMIN_PASSWORD };
const SENHA_CAMPUS = process.env.DEFAULT_CAMPUS_PASSWORD;
const ESTADO_PATH = path.join(__dirname, '..', 'data', 'jifc-state.json');

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

async function carregarDadosBase() {
  const conexao = await db.getConnection();
  const [campi] = await conexao.query('SELECT id, nome, email FROM campus WHERE banned = 0 ORDER BY id ASC');
  const [modalidades] = await conexao.query('SELECT id, nome, genero FROM modalidades ORDER BY id ASC');
  conexao.release();

  const estado = JSON.parse(fs.readFileSync(ESTADO_PATH, 'utf8'));
  const atletasEstado = Array.isArray(estado.campus && estado.campus.atletasCampus) ? estado.campus.atletasCampus : [];
  const limiteAtual = Number(estado.configuracoes && estado.configuracoes.limite_atletas_total_campus) || 60;

  const valores = modalidades.map((m) => `${m.nome} ${m.genero}`);
  const porGenero = {
    Masculino: modalidades.map((m, i) => (m.genero === 'Masculino' ? valores[i] : null)).filter(Boolean),
    Feminino: modalidades.map((m, i) => (m.genero === 'Feminino' ? valores[i] : null)).filter(Boolean)
  };

  return { campi, atletasEstado, limiteAtual, porGenero };
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
    throw new Error(`Falha ao salvar configuracao (${resposta.status})`);
  }
}

function planejarGenero(atletasDoGenero, modalidadesDoGenero) {
  const cobertas = new Set();
  for (const atleta of atletasDoGenero) {
    for (const m of atleta.modalidades || []) cobertas.add(m);
  }
  const faltantes = modalidadesDoGenero.filter((m) => !cobertas.has(m));

  const planos = atletasDoGenero
    .map((atleta) => ({ atleta, lista: [...(atleta.modalidades || [])], mudou: false }))
    .filter((p) => p.lista.length < 3)
    .sort((a, b) => a.lista.length - b.lista.length);

  const restantes = [];
  for (const modalidade of faltantes) {
    if (!planos.some((p) => p.lista.length < 3)) {
      restantes.push(modalidade);
      continue;
    }
    planos.sort((a, b) => a.lista.length - b.lista.length);
    const escolhido = planos.find((p) => p.lista.length < 3);
    escolhido.lista.push(modalidade);
    escolhido.mudou = true;
  }

  return { planos, restantes };
}

const NOMES_MASC = ['Rafael Moreira', 'Diego Fontes', 'Caio Barbosa', 'Eduardo Prado', 'Gustavo Pires', 'Leonardo Ramos', 'Bruno Teixeira', 'Felipe Cardoso'];
const NOMES_FEM = ['Larissa Nunes', 'Camila Freitas', 'Beatriz Ramos', 'Sabrina Melo', 'Renata Castro', 'Taina Barros', 'Paula Andrade', 'Valeria Souza'];
const NASCIMENTOS = ['2007-05-14', '2008-09-23', '2009-03-08', '2007-11-02'];

async function cadastrarNovoAtleta(jar, csrf, campusNome, genero, blocoModalidades, indice, usados) {
  let matricula;
  do {
    matricula = `30${String(1000000 + indice * 733 + Math.floor(Math.random() * 700))}`.slice(0, 9);
  } while (usados.has(matricula));
  usados.add(matricula);

  let cpfNumero;
  do {
    cpfNumero = String(80000000000 + indice * 7919 + Math.floor(Math.random() * 5000));
  } while (usados.has(cpfNumero));
  usados.add(cpfNumero);
  const cpf = `${cpfNumero.slice(0, 3)}.${cpfNumero.slice(3, 6)}.${cpfNumero.slice(6, 9)}-${cpfNumero.slice(9, 11)}`;

  const nomes = genero === 'Masculino' ? NOMES_MASC : NOMES_FEM;
  const sigla = campusNome.replace(/^IFC /, '').split(' ')[0];
  const corpo = {
    nome: `${nomes[indice % nomes.length]} ${sigla}${String.fromCharCode(65 + (indice % 26))}`,
    genero,
    dataNascimento: NASCIMENTOS[indice % NASCIMENTOS.length],
    matricula,
    cpf,
    status: 'Analise',
    modalidades: blocoModalidades,
    _csrf: csrf
  };
  if (blocoModalidades.some((m) => m.includes('TÃªnis de Mesa'))) {
    corpo.tenisMesaParticipacoes = ['Individual e Duplas'];
  }
  if (blocoModalidades.some((m) => m.includes('Atletismo'))) {
    corpo.atletismoProvas = ['100m rasos', 'Salto em distÃ¢ncia'];
  }

  const resposta = await pedir(jar, '/campus/atletas/cadastrar', { metodo: 'POST', corpo });
  return { ok: resposta.status === 302 && !/erro=/.test(resposta.location), mensagem: extrairMensagem(resposta.location) };
}

async function atualizarAtletaExistente(jar, csrf, atleta, listaAlvo) {
  const corpo = {
    nome: atleta.nome,
    genero: atleta.genero,
    dataNascimento: atleta.dataNascimento,
    matricula: String(atleta.matricula || ''),
    cpf: String(atleta.cpf || ''),
    status: atleta.status || 'Analise',
    modalidades: listaAlvo,
    _csrf: csrf
  };

  if (listaAlvo.some((m) => m.includes('TÃªnis de Mesa'))) {
    const atuais = Array.isArray(atleta.tenisMesaParticipacoes) ? atleta.tenisMesaParticipacoes.filter(Boolean) : [];
    corpo.tenisMesaParticipacoes = atuais.length ? atuais : ['Individual e Duplas'];
  }
  if (listaAlvo.some((m) => m.includes('Atletismo'))) {
    const atuais = Array.isArray(atleta.atletismoProvas) ? atleta.atletismoProvas.filter(Boolean) : [];
    corpo.atletismoProvas = atuais.length ? atuais : ['100m rasos'];
  }

  const resposta = await pedir(jar, `/campus/atletas/atualizar/${atleta.id}`, { metodo: 'POST', corpo });
  return { ok: resposta.status === 302 && !/erro=/.test(resposta.location), mensagem: extrairMensagem(resposta.location) };
}

async function processarCampus(campus, dadosBase, contadorGlobal, usados) {
  const jar = criarJar();
  await entrar(jar, campus.email, SENHA_CAMPUS);

  const pagina = await pedir(jar, '/campus/inscricoes');
  const csrf = extrairCsrf(pagina.texto);
  if (!csrf) throw new Error(`CSRF nao encontrado para ${campus.nome}`);

  const todas = [...dadosBase.porGenero.Masculino, ...dadosBase.porGenero.Feminino];
  const respostaSalvar = await pedir(jar, '/campus/inscricoes/salvar', {
    metodo: 'POST',
    corpo: { modalidades: todas, _csrf: csrf }
  });
  if (respostaSalvar.status !== 302 || /erro=/.test(respostaSalvar.location)) {
    throw new Error(`${campus.nome}: falha ao salvar modalidades: ${extrairMensagem(respostaSalvar.location)}`);
  }
  console.log('   Modalidades: 16/16 inscritas');

  const atletasCampus = dadosBase.atletasEstado.filter((a) => a.campus === campus.nome);
  let novos = 0;
  let atualizados = 0;

  for (const genero of ['Masculino', 'Feminino']) {
    const doGenero = atletasCampus.filter((a) => a.genero === genero);
    const { planos, restantes } = planejarGenero(doGenero, dadosBase.porGenero[genero]);

    for (const plano of planos) {
      if (!plano.mudou) continue;
      void plano.atleta.id;
      const resultado = await atualizarAtletaExistente(jar, csrf, plano.atleta, plano.lista.slice(0, 3));
      if (resultado.ok) {
        atualizados += 1;
      } else {
        console.log(`   AVISO atualizar ${plano.atleta.nome}: ${resultado.mensagem}`);
      }
    }

    while (restantes.length) {
      const bloco = restantes.splice(0, Math.min(3, restantes.length));
      const resultado = await cadastrarNovoAtleta(jar, csrf, campus.nome, genero, bloco, contadorGlobal.n++, usados);
      if (resultado.ok) {
        novos += 1;
        console.log(`   Novo atleta ${genero}: ${resultado.mensagem}`);
      } else {
        console.log(`   AVISO cadastro novo atleta (${genero}): ${resultado.mensagem}`);
      }
    }
  }

  console.log(`   Atletas reorganizados: ${atualizados} | novos: ${novos}`);
  return novos;
}

async function main() {
  console.log('== Reorganizacao completa de inscricoes ==');
  const dadosBase = await carregarDadosBase();
  console.log(`Campi: ${dadosBase.campi.length} | Modalidades por genero: ${dadosBase.porGenero.Masculino.length} | Limite atual: ${dadosBase.limiteAtual}`);

  const jarAdmin = criarJar();
  await entrar(jarAdmin, ADMIN.email, ADMIN.senha);
  const paginaConfig = await pedir(jarAdmin, '/admin/configurar');
  const csrfAdmin = extrairCsrf(paginaConfig.texto);
  await salvarConfiguracaoAdmin(jarAdmin, csrfAdmin, dadosBase.limiteAtual, '2026-08-31');
  console.log('Prazos abertos para edicao.\n');

  const usados = new Set();
  const contadorGlobal = { n: 0 };
  let totalNovos = 0;

  for (let i = 0; i < dadosBase.campi.length; i++) {
    const campus = dadosBase.campi[i];
    console.log(`[${i + 1}/${dadosBase.campi.length}] ${campus.nome}`);
    if (i > 0) {
      console.log('   aguardando 16s (limite de logins por minuto)...');
      await dormir(16000);
    }
    totalNovos += await processarCampus(campus, dadosBase, contadorGlobal, usados);
  }

  await salvarConfiguracaoAdmin(jarAdmin, csrfAdmin, dadosBase.limiteAtual, '2026-08-21');
  console.log('\nPrazos fechados novamente (sorteio continua liberado).');
  console.log(`Total de novos atletas cadastrados: ${totalNovos}`);
}

main()
  .then(() => process.exit(0))
  .catch((erro) => {
    console.error('FALHA NA REORGANIZACAO:', erro.message);
    process.exit(1);
  });
