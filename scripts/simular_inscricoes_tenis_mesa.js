/**
 * Simula o fluxo real de inscrição no Tênis de Mesa:
 * 1. Admin reabre o período de inscrições (POST /admin/configurar/salvar).
 * 2. Cada campus faz login e inscreve a modalidade (POST /campus/inscricoes/salvar),
 *    preservando as modalidades já salvas.
 * 3. Cada campus cadastra 2 atletas para o Tênis de Mesa (1 Masculino + 1 Feminino)
 *    via POST /campus/atletas/cadastrar.
 *
 * Uso: node scripts/simular_inscricoes_tenis_mesa.js
 */

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const db = require('../config/db');
const SENHA_CAMPUS = 'jifc2026';
const ADMIN = { email: 'admin@ifc.edu.br', senha: 'admin123' };

const NOMES_MASCULINOS = [
  'Lucas Andrade Prado', 'Rafael Monteiro Costa', 'Bruno Carvalho Dias',
  'Pedro Henrique Souza', 'Gabriel Ferreira Lima', 'Matheus Rocha Silva',
  'Thiago Almeida Castro', 'Felipe Barbosa Neto', 'Gustavo Ramos Dias',
  'Vinicius Teixeira Alves', 'Leonardo Pinto Moreira', 'Caio Fernandes Ribeiro',
  'Diego Nunes Cardoso', 'Eduardo Moraes Freitas', 'Rodrigo Batista Lopes',
  'Marcelo Vieira Campos'
];
const NOMES_FEMININOS = [
  'Ana Beatriz Oliveira', 'Julia Santos Pereira', 'Larissa Coelho Martins',
  'Mariana Duarte Silva', 'Camila Rodrigues Lima', 'Beatriz Alves Gomes',
  'Fernanda Ribeiro Araujo', 'Isabela Machado Pires', 'Laura Cristina Bastos',
  'Nicole Esteves Ramos', 'Paula Vanessa Cordeiro', 'Renata Souza Braga',
  'Sabrina Lopes Farias', 'Taina Mendes Vitorino', 'Valeria Cristina Amorim',
  'Yasmin Castro Beltrao'
];
const PARTICIPACOES = ['Individual', 'Duplas', 'Individual e Duplas'];
const NASCIMENTOS = ['2007-04-12', '2008-07-25', '2009-01-30', '2008-11-05', '2007-09-18'];

function dormir(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function criarJar() {
  const cookies = new Map();
  return {
    absorver(resposta) {
      const linhas = resposta.headers.getSetCookie ? resposta.headers.getSetCookie() : [];
      for (const linha of linhas) {
        const [par] = linha.split(';');
        const idx = par.indexOf('=');
        if (idx < 0) continue;
        const nome = par.slice(0, idx).trim();
        const valor = par.slice(idx + 1).trim();
        if (!valor) cookies.delete(nome); else cookies.set(nome, valor);
      }
    },
    cabecalho() {
      return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
    },
    tem(nome) {
      return cookies.has(nome);
    }
  };
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
  let url = BASE + caminho;
  for (let salto = 0; salto < 8; salto++) {
    const headers = { cookie: jar.cabecalho() };
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
    const resposta = await tentarFetch(url, opcoes);
    jar.absorver(resposta);
    if ([301, 302, 303, 307, 308].includes(resposta.status)) {
      url = new URL(resposta.headers.get('location'), url).toString();
      metodo = 'GET';
      corpo = null;
      continue;
    }
    const texto = await resposta.text();
    return { status: resposta.status, texto, urlFinal: url };
  }
  throw new Error('Excesso de redirecionamentos em ' + caminho);
}

function extrairCsrf(html) {
  const m = html.match(/name="_csrf"[^>]*value="([^"]+)"/)
    || html.match(/value="([^"]+)"[^>]*name="_csrf"/);
  if (!m) throw new Error('Token CSRF nao encontrado na pagina.');
  return m[1];
}

function extrairModalidadesMarcadas(html) {
  const inicio = html.indexOf('action="/campus/inscricoes/salvar"');
  if (inicio < 0) return [];
  const fim = html.indexOf('</form>', inicio);
  const secao = html.slice(inicio, fim > 0 ? fim : undefined);
  const marcadas = [];
  const re = /<input[^>]*name="modalidades"[^>]*>/gi;
  let match;
  while ((match = re.exec(secao)) !== null) {
    if (!/\bchecked\b/i.test(match[0])) continue;
    const valor = match[0].match(/value="([^"]*)"/i);
    if (valor && valor[1]) marcadas.push(valor[1]);
  }
  return marcadas;
}

const tentativasLogin = [];

async function aguardarJanelaLogin(rotulo) {
  const agora = Date.now();
  while (tentativasLogin.length && agora - tentativasLogin[0] >= 60000) tentativasLogin.shift();
  if (tentativasLogin.length >= 4) {
    const espera = 60000 - (agora - tentativasLogin[0]) + 800;
    console.log(`   aguardando ${Math.ceil(espera / 1000)}s (limite de logins por minuto)... [${rotulo}]`);
    await dormir(espera);
  }
  tentativasLogin.push(Date.now());
}

async function entrar(jar, email, senha) {
  await aguardarJanelaLogin(email);
  const paginaLogin = await pedir(jar, '/login');
  const csrf = extrairCsrf(paginaLogin.texto);
  const resposta = await pedir(jar, '/auth/login', { metodo: 'POST', corpo: { email, senha, _csrf: csrf } });
  if (!jar.tem('token')) {
    throw new Error(`Login falhou para ${email} (${resposta.urlFinal})`);
  }
}

function extrairMensagem(urlFinal) {
  try {
    const params = new URL(urlFinal).searchParams;
    return params.get('erro') || params.get('sucesso') || '';
  } catch (_) {
    return '';
  }
}

async function configurarPrazosAdmin(limiteAtletas) {
  console.log('== Etapa 1: admin abrindo o periodo de inscricoes ==');
  const jar = criarJar();
  await entrar(jar, ADMIN.email, ADMIN.senha);
  const pagina = await pedir(jar, '/admin/configurar');
  const csrf = extrairCsrf(pagina.texto);
  await pedir(jar, '/admin/configurar/salvar', {
    metodo: 'POST',
    corpo: {
      inicio_evento: '2026-08-26',
      fim_evento: '2026-08-28',
      inicioInscricoesModalidades: '2026-08-20',
      fimInscricoesModalidades: '2026-08-25',
      inicioInscricoesAtletas: '2026-08-20',
      fimInscricoesAtletas: '2026-08-25',
      inicioSorteio: '2026-08-26',
      fimSorteio: '2026-09-30',
      limite_atletas_total_campus: String(limiteAtletas),
      _csrf: csrf
    }
  });
  const conferencia = await pedir(jar, '/admin/configurar');
  const ok = conferencia.texto.includes('2026-08-20') || conferencia.texto.includes('value="2026-08-20"');
  console.log(ok ? 'Prazos atualizados: inscricoes abertas de 20/08 a 25/08.\n' : 'Prazos enviados (confira no painel).\n');
}

async function inscreverModalidadeDoCampus(jar) {
  const pagina = await pedir(jar, '/campus/inscricoes');
  const csrf = extrairCsrf(pagina.texto);
  const existentes = extrairModalidadesMarcadas(pagina.texto);
  const alvo = ['Tênis de Mesa Masculino', 'Tênis de Mesa Feminino'];
  const lista = [...new Set([...existentes, ...alvo])];
  const adicionados = alvo.filter((item) => !existentes.includes(item));

  const resposta = await pedir(jar, '/campus/inscricoes/salvar', {
    metodo: 'POST',
    corpo: { modalidades: lista, _csrf: csrf }
  });
  const mensagem = extrairMensagem(resposta.urlFinal);

  const conferencia = extrairModalidadesMarcadas(await pedir(jar, '/campus/inscricoes').then((r) => r.texto));
  const faltando = lista.filter((m) => !conferencia.includes(m));
  return { adicionados, faltando, mensagem };
}

async function cadastrarAtletaTenisMesa(jar, dados) {
  const pagina = await pedir(jar, '/campus/inscricoes?aba=atletas');
  const csrf = extrairCsrf(pagina.texto);
  const corpo = {
    nome: dados.nome,
    genero: dados.genero,
    dataNascimento: dados.dataNascimento,
    matricula: dados.matricula,
    cpf: dados.cpf,
    status: 'Analise',
    _csrf: csrf
  };
  corpo.modalidades = dados.modalidades;
  corpo.tenisMesaParticipacoes = dados.tenisMesaParticipacoes;

  const resposta = await pedir(jar, '/campus/atletas/cadastrar', { metodo: 'POST', corpo });
  const mensagem = extrairMensagem(resposta.urlFinal);
  const deuErro = Boolean(new URL(resposta.urlFinal).searchParams.get('erro'));
  return { ok: !deuErro, mensagem };
}

function normalizarTexto(valor) {
  return String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

async function main() {
  const filtroArg = process.argv[2] || '';
  const OFFSET_MATRICULA = Number(process.argv[3] || 0);
  const LIMITE_ADMIN = Number(process.argv[4] || 15);

  const [todosCampi] = await db.query('SELECT id, nome, email FROM campus WHERE banned = 0 ORDER BY id ASC').catch(async () => {
    const conexao = await db.getConnection();
    const [linhas] = await conexao.query('SELECT id, nome, email FROM campus WHERE banned = 0 ORDER BY id ASC');
    conexao.release();
    return [linhas];
  });

  const filtros = filtroArg ? filtroArg.split(',').map(normalizarTexto).filter(Boolean) : null;
  const campi = filtros ? todosCampi.filter((c) => filtros.some((f) => normalizarTexto(c.nome).includes(f))) : todosCampi;

  if (!campi.length) {
    console.error('Nenhum campus encontrado para o filtro:', filtroArg);
    process.exit(1);
  }

  console.log(`Campi selecionados: ${campi.length}. Modalidade alvo: Tenis de Mesa (Masculino e Feminino).\n`);

  await configurarPrazosAdmin(LIMITE_ADMIN);

  const resultados = [];
  let indiceGlobal = 0;

  for (let i = 0; i < campi.length; i++) {
    const campus = campi[i];
    console.log(`[${i + 1}/${campi.length}] ${campus.nome}`);

    const jar = criarJar();
    try {
      await entrar(jar, String(campus.email).trim().toLowerCase(), SENHA_CAMPUS);
    } catch (erro) {
      console.log(`   ERRO no login: ${erro.message}`);
      resultados.push({ campus: campus.nome, login: false });
      continue;
    }

    const inscricao = await inscreverModalidadeDoCampus(jar);
    console.log(`   Modalidade: ${inscricao.adicionados.length ? 'inscrita (' + inscricao.adicionados.join(', ') + ')' : 'ja estava inscrita'}${inscricao.faltando.length ? ' | FALTANDO APOS SALVAR: ' + inscricao.faltando.join(', ') : ''}`);

    const atletasInfo = [
      {
        nome: NOMES_MASCULINOS[i % NOMES_MASCULINOS.length],
        genero: 'Masculino',
        modalidades: ['Tênis de Mesa Masculino']
      },
      {
        nome: NOMES_FEMININOS[i % NOMES_FEMININOS.length],
        genero: 'Feminino',
        modalidades: ['Tênis de Mesa Feminino']
      }
    ];

    const cadastros = [];
    for (const info of atletasInfo) {
      const atleta = {
        ...info,
        matricula: `20262${String(100 + OFFSET_MATRICULA + indiceGlobal).padStart(4, '0')}`,
        cpf: String(10000000000 + (OFFSET_MATRICULA + indiceGlobal) * 137),
        dataNascimento: NASCIMENTOS[indiceGlobal % NASCIMENTOS.length],
        tenisMesaParticipacoes: [PARTICIPACOES[indiceGlobal % PARTICIPACOES.length]]
      };
      indiceGlobal += 1;
      const resultado = await cadastrarAtletaTenisMesa(jar, atleta);
      cadastros.push({ nome: atleta.nome, ...resultado });
      console.log(`   Atleta ${atleta.nome} (${atleta.genero}): ${resultado.ok ? 'OK' : 'ERRO'} - ${resultado.mensagem || '(sem mensagem)'}`);
    }

    resultados.push({ campus: campus.nome, login: true, inscricao, cadastros });
  }

  console.log('\n===== RESUMO =====');
  const falhas = resultados.filter((r) => !r.login || (r.cadastros || []).some((c) => !c.ok));
  console.log(`Campi processados: ${resultados.length} | com algum problema: ${falhas.length}`);
  for (const r of falhas) {
    console.log(`- ${r.campus}${r.login === false ? ': login falhou' : ': ' + r.cadastros.filter((c) => !c.ok).map((c) => `${c.nome} (${c.mensagem})`).join('; ')}`);
  }

  const [verificacao] = await db.query(
    `SELECT m.genero, COUNT(DISTINCT am.atleta_id) AS total
       FROM atleta_modalidade am
       JOIN modalidades m ON m.id = am.modalidade_id
      WHERE m.nome LIKE '%Mesa%'
      GROUP BY m.genero`
  ).catch(() => [[]]);
  console.log('\nVerificacao no banco (atletas vinculados ao Tenis de Mesa):');
  for (const linha of verificacao || []) {
    console.log(`- ${linha.genero}: ${linha.total}`);
  }

  process.exit(0);
}

main().catch((erro) => {
  console.error('FALHA NA SIMULACAO:', erro.message);
  process.exit(1);
});
