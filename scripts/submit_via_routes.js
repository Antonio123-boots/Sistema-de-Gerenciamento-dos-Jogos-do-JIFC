const { readState, writeState } = require('../models/stateStore');
const http = require('http');

async function openPrazos() {
  const state = readState();
  state.configuracoes = state.configuracoes || {};
  const hoje = new Date();
  const iso = (d) => d.toISOString().split('T')[0];
  const inicio = new Date(hoje);
  inicio.setDate(hoje.getDate() - 1);
  const fim = new Date(hoje);
  fim.setDate(hoje.getDate() + 14);

  state.configuracoes.inicio_inscricao_modalidades = iso(inicio);
  state.configuracoes.fim_inscricao_modalidades = iso(fim);
  state.configuracoes.inicio_inscricao_atletas = iso(inicio);
  state.configuracoes.fim_inscricao_atletas = iso(fim);
  state.configuracoes.ano_evento = hoje.getFullYear();

  writeState(state);
  console.log('Prazos atualizados no state:', state.configuracoes);
}

function httpRequest(path, method = 'GET', headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3001,
      path,
      method,
      headers
    };

    const req = http.request(options, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString();
        resolve({ status: res.statusCode, headers: res.headers, body: text });
      });
    });

    req.on('error', (err) => reject(err));
    if (body) req.write(body);
    req.end();
  });
}

async function login(email, senha) {
  const path = '/auth/login';
  const body = new URLSearchParams({ email, senha }).toString();
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Content-Length': Buffer.byteLength(body)
  };
  const res = await httpRequest(path, 'POST', headers, body);
  const setCookie = res.headers['set-cookie'];
  let cookieHeader = '';
  if (setCookie) {
    cookieHeader = setCookie.map(c => c.split(';')[0]).join('; ');
  }
  console.log('Login status:', res.status, 'cookie:', cookieHeader);
  return cookieHeader;
}

async function submitModalidades(cookie, modalidades) {
  const path = '/campus/inscricoes/salvar';
  const body = modalidades.map(m => `modalidades=${encodeURIComponent(m)}`).join('&');
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Content-Length': Buffer.byteLength(body),
    'Cookie': cookie
  };
  const res = await httpRequest(path, 'POST', headers, body);
  console.log('Salvar modalidades status:', res.status);
  return res;
}

async function cadastrarAtleta(cookie, atleta) {
  const path = '/campus/atletas/cadastrar';
  const parts = [];
  parts.push(`nome=${encodeURIComponent(atleta.nome)}`);
  parts.push(`matricula=${encodeURIComponent(atleta.matricula)}`);
  parts.push(`genero=${encodeURIComponent(atleta.genero)}`);
  parts.push(`dataNascimento=${encodeURIComponent(atleta.dataNascimento)}`);
  if (atleta.cpf) parts.push(`cpf=${encodeURIComponent(atleta.cpf)}`);
  (atleta.modalidades || []).forEach(m => parts.push(`modalidades=${encodeURIComponent(m)}`));
  const body = parts.join('&');
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Content-Length': Buffer.byteLength(body),
    'Cookie': cookie
  };
  const res = await httpRequest(path, 'POST', headers, body);
  console.log('Cadastrar atleta', atleta.matricula, 'status:', res.status);
  return res;
}

(async () => {
  try {
    await openPrazos();

    // login as IFC Blumenau
    const email = 'blumenau@ifc.edu.br';
    const senha = '123';
    const cookie = await login(email, senha);

    if (!cookie) {
      console.error('Não recebeu cookies de sessão após login.');
      process.exit(1);
    }

    // submit modalidades for Blumenau
    const modalidades = ['Futsal Masculino', 'Basquete Masculino', 'Voleibol Masculino'];
    await submitModalidades(cookie, modalidades);

    // cadastrar atletas via rota de campus
    const atletas = [
      { nome: 'Mariana Oliveira', matricula: '20260301', genero: 'Feminino', dataNascimento: '2008-11-14', modalidades: ['Voleibol Masculino'] },
      { nome: 'Ricardo Pereira', matricula: '20260302', genero: 'Masculino', dataNascimento: '2009-03-07', modalidades: ['Futsal Masculino'] },
      { nome: 'Ana Carolina Souza', matricula: '20260303', genero: 'Feminino', dataNascimento: '2008-07-22', modalidades: ['Basquete Masculino'] }
    ];

    for (const a of atletas) {
      await cadastrarAtleta(cookie, a);
    }

    console.log('Envios via rotas concluídos.');
  } catch (err) {
    console.error('Erro no script:', err);
    process.exit(1);
  }
})();
