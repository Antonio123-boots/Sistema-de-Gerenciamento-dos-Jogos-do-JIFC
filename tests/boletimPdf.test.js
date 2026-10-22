const assert = require('node:assert/strict');
const path = require('node:path');
const ejs = require('ejs');
const adminModel = require('../models/adminModel');
const { baixarPdf } = require('../controllers/boletimController');
const {
  gerarPdfBoletim,
  montarClassificacaoFinal,
  montarTabelaChaveamento,
  montarTabelaClassificacao,
  ordenarModalidadesPorNome
} = require('../services/boletimPdfService');

(async () => {
  assert.deepEqual(montarClassificacaoFinal(
    [{ modalidade: 'Futsal', nome: 'Futsal Masculino', campeao: 'Campus A', vice: 'Campus B' }],
    [{
      fase: 'Terceiro Lugar',
      subCategoria: 'Masculino',
      casa: 'Campus C',
      fora: 'Campus D',
      casaId: 3,
      foraId: 4,
      vencedorCampus: 4
    }]
  ), [
    ['1º Lugar', 'Campus A'],
    ['2º Lugar', 'Campus B'],
    ['3º Lugar', 'Campus D'],
    ['4º Lugar', 'Campus C']
  ]);

  assert.deepEqual(montarClassificacaoFinal(
    [{ modalidade: 'Voleibol', nome: 'Voleibol', campeao: 'Campus A', vice: 'Campus B' }],
    [],
    [
      { campus: 'Campus D', pontos: 4 },
      { campus: 'Campus C', pontos: 6 },
      { campus: 'Campus B', pontos: 8 },
      { campus: 'Campus A', pontos: 10 }
    ]
  ).slice(2), [
    ['3º Lugar', 'Campus C'],
    ['4º Lugar', 'Campus D']
  ]);

  assert.deepEqual(montarTabelaChaveamento(
    [
      { id: 1, nomeChave: 'Tabela A' },
      { id: 2, nomeChave: 'Tabela B' },
      { id: 3, nomeChave: 'Tabela C' },
      { id: 4, nomeChave: 'Tabela D' }
    ],
    [
      { chaveId: 1, campus: 'Campus A' },
      { chaveId: 1, campus: 'Campus B' },
      { chaveId: 2, campus: 'Campus C' },
      { chaveId: 3, campus: 'Campus D' },
      { chaveId: 4, campus: 'Campus E' }
    ]
  ), [
    {
      cabecalhos: ['Tabela A', 'Tabela B', 'Tabela C'],
      linhas: [
        ['Campus A', 'Campus C', 'Campus D'],
        ['Campus B', '', '']
      ]
    },
    {
      cabecalhos: ['Tabela D'],
      linhas: [['Campus E']]
    }
  ]);

  assert.deepEqual(montarTabelaClassificacao([
    { atleta: 'Atleta B', campus: 'Campus B', pontos: 3, vitorias: 1, jogosJogados: 2, setsGanhos: 4, setsPerdidos: 2 },
    { atleta: 'Atleta A', campus: 'Campus A', pontos: 6, vitorias: 2, jogosJogados: 2, setsGanhos: 5, setsPerdidos: 1 }
  ], true, true), {
    cabecalhos: ['Pos.', 'Atleta / campus', 'J', 'Pts.', 'V', 'SG', 'SP', 'Saldo'],
    linhas: [
      [1, 'Atleta A (Campus A)', 2, 6, 2, 5, 1, 4],
      [2, 'Atleta B (Campus B)', 2, 3, 1, 4, 2, 2]
    ]
  });

  assert.deepEqual(ordenarModalidadesPorNome([
    { nome: 'Futsal Masculino', genero: 'Masculino' },
    { nome: 'Basquete Feminino', genero: 'Feminino' },
    { nome: 'Futsal Feminino', genero: 'Feminino' },
    { nome: 'Basquete Masculino', genero: 'Masculino' }
  ]).map((modalidade) => modalidade.nome), [
    'Basquete Feminino',
    'Basquete Masculino',
    'Futsal Feminino',
    'Futsal Masculino'
  ]);

  const html = await ejs.renderFile(path.join(__dirname, '..', 'views', 'partials', 'boletimConteudo.ejs'), {
    resumo: { ano: 2025, dataGeracao: '2025-06-30' },
    boletim: { ano_jifc: 2025 },
    modalidades: [],
    completo: null,
    pdfHref: '/boletim/2025/pdf',
    voltarHref: '/boletim'
  });
  assert.match(html, /href="\/boletim\/2025\/pdf">Salvar em PDF/);
  assert.ok(html.indexOf('</header>') < html.indexOf('boletim-toolbar'));
  assert.ok(!html.includes('window.print'));
  assert.ok(!html.includes('Ranking final dos campi'));

  const dados = {
    resumo: {
      ano: 2025,
      dataGeracao: '2025-06-30',
      modalidades: [{ nome: 'Futsal', campeao: 'Campus A', vice: 'Campus B' }]
    },
    boletim: { ano_jifc: 2025 },
    modalidades: [{ nome: 'Futsal', campeao: 'Campus A', vice: 'Campus B' }],
    completo: {
      campi: [{ nomeExibicao: 'Campus A', cidade: 'Blumenau' }],
      modalidades: [
        { id: 1, nome: 'Futsal', genero: 'Masculino' },
        { id: 2, nome: 'Atletismo', genero: 'Feminino' },
        { id: 3, nome: 'Xadrez', genero: 'Misto' }
      ],
      inscricoes: [{ modalidadeId: 1, campus: 'Campus A' }],
      chaves: [{ id: 1, modalidadeId: 1, nomeChave: 'Chave A' }],
      grupos: [{
        modalidadeId: 1,
        chaveId: 1,
        campus: 'Campus A',
        pontos: 6,
        jogosJogados: 2,
        vitorias: 2,
        saldo: 4
      }],
      jogos: [{
        modalidadeId: 1,
        numeroJogo: 1,
        data: '2025-06-30',
        fase: 'Final',
        casa: 'Campus A',
        fora: 'Campus B',
        placarCasa: 2,
        placarFora: 1,
        local: 'Ginásio'
      }],
      atletismo: {
        provas: [{
          nome: '100 metros rasos',
          genero: 'Feminino',
          resultados: [{
            raia: 3,
            posicao: 1,
            atleta: 'Atleta Atletismo Teste',
            campus: 'Campus A',
            resultado: '12.34',
            etapa: 'final'
          }]
        }],
        campi: []
      },
      xadrez: {
        classificacao: [{
          atleta: 'Enxadrista Teste',
          campus: 'Campus B',
          genero: 'Misto',
          pontuacao: 5,
          vitorias: 4,
          empates: 1,
          derrotas: 0
        }],
        campi: []
      }
    }
  };
  const pdf = await gerarPdfBoletim(dados);

  assert.ok(Buffer.isBuffer(pdf));
  assert.match(pdf.toString('latin1', 0, 8), /^%PDF-/);
  assert.ok(pdf.length > 1000);
  const paginasPdf = pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || [];
  assert.equal(paginasPdf.length, 5);
  assert.ok(!pdf.toString('latin1').includes('Ranking geral dos campi'));

  const obterBoletimCompletoOriginal = adminModel.obterBoletimCompleto;
  adminModel.obterBoletimCompleto = async () => dados;
  const resposta = {
    headers: {},
    set(cabecalhos) {
      Object.assign(this.headers, cabecalhos);
      return this;
    },
    send(conteudo) {
      this.conteudo = conteudo;
      return this;
    },
    status(codigo) {
      this.statusCode = codigo;
      return this;
    }
  };
  try {
    await baixarPdf({ params: { ano: '2025' } }, resposta);
  } finally {
    adminModel.obterBoletimCompleto = obterBoletimCompletoOriginal;
  }
  assert.equal(resposta.headers['Content-Type'], 'application/pdf');
  assert.equal(resposta.headers['Content-Disposition'], 'attachment; filename="boletim-final-jifc-2025.pdf"');
  assert.ok(Buffer.isBuffer(resposta.conteudo));

  const respostaSemSnapshot = {
    status(codigo) {
      this.statusCode = codigo;
      return this;
    },
    send(conteudo) {
      this.conteudo = conteudo;
      return this;
    }
  };
  adminModel.obterBoletimCompleto = async () => ({ ...dados, completo: null });
  try {
    await baixarPdf({ params: { ano: '2025' } }, respostaSemSnapshot);
  } finally {
    adminModel.obterBoletimCompleto = obterBoletimCompletoOriginal;
  }
  assert.equal(respostaSemSnapshot.statusCode, 409);
  assert.match(respostaSemSnapshot.conteudo, /Gere o boletim novamente/);

  const respostaAnoInvalido = {
    status(codigo) {
      this.statusCode = codigo;
      return this;
    },
    send(conteudo) {
      this.conteudo = conteudo;
      return this;
    }
  };
  await baixarPdf({ params: { ano: 'inválido' } }, respostaAnoInvalido);
  assert.equal(respostaAnoInvalido.statusCode, 400);

  console.log('Teste de geração do PDF do boletim concluído com sucesso.');
})().catch((erro) => {
  console.error('Falha no teste de geração do PDF do boletim:', erro);
  process.exit(1);
});
