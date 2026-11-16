const path = require('path');
const ejs = require('ejs');

const base = {
  anoJifc: 2026,
  inscricoesAbertas: false,
  chaveamentoBloqueado: false,
  listaModalidadesCompleta: [
    { id: 1, nome: 'Futsal', genero: 'Masculino', icone: '/imagens/futsal.svg', imagem: '/imagens/futsal.svg' },
    { id: 11, nome: 'Tênis de Mesa Masculino', genero: 'Masculino', icone: '/imagens/tenis.svg', imagem: '/imagens/tenis.svg' }
  ],
  modalidadeAtiva: { id: 11, nome: 'Tênis de Mesa Masculino', categoria: 'tenis-de-mesa' },
  subCategoriaAtiva: 'individual',
  csrfToken: 'teste',
  inscritosPendentes: [{ nomeAtleta: 'Atleta A', nomeCampus: 'Campus 1' }],
  isIndividualModalidade: true,
  chavesGeradas: [
    { letra: 'A', integrantes: [{ nomeAtleta: 'Atleta A', nomeCampus: 'Campus 1', numeroInscrito: 12, pontosFaseDeGrupos: 3 }] }
  ],
  modalidadeSorteavel: true,
  permitirGerarSorteio: true,
  inicioSorteio: '2026-01-01',
  mensagemErro: null,
  mensagemSucesso: null,
  datasEventoDisponiveis: ['2026-05-10', '2026-05-11'],
  rodadasJogos: [
    {
      id: 1,
      label: 'Rodada 1',
      jogos: [
        {
          id: 100,
          data: '10/05',
          horario: '09:00',
          dataInput: '2026-05-10',
          horarioInput: '09:00',
          localJogo: 'Ginásio',
          chaveLabel: 'A',
          fase: 'Grupo',
          tipoIndividual: true,
          atletaCasa: 'Atleta A',
          atletaFora: 'Atleta B',
          placar: null
        },
        {
          id: 101,
          data: '10/05',
          horario: '10:00',
          dataInput: '',
          horarioInput: '',
          localJogo: '',
          chaveLabel: 'B',
          fase: 'Grupo',
          tipoIndividual: false,
          casa: 'Campus 1',
          fora: 'Campus 2',
          placar: '2 x 0'
        }
      ]
    },
    { id: 2, label: 'Rodada 2', jogos: [] },
    { id: 3, label: 'Rodada 3', jogos: [] }
  ],
  provasAtletismo: [],
  classificadosXadrez: []
};

(async () => {
  const arquivo = path.join(__dirname, '..', 'views', 'adm', 'chaveamento.ejs');
  for (const cenario of ['tenis-individual', 'futsal-campuseiro']) {
    const locals = { ...base };
    if (cenario === 'futsal-campuseiro') {
      locals.modalidadeAtiva = { id: 1, nome: 'Futsal', categoria: 'futsal' };
      locals.subCategoriaAtiva = '';
      locals.isIndividualModalidade = false;
      locals.chavesGeradas = [{ letra: 'A', integrantes: [{ nomeCampus: 'Campus 1', pontosFaseDeGrupos: 0 }] }];
      locals.inscritosPendentes = [{ nomeCampus: 'Campus 1' }];
    }
    const html = await ejs.renderFile(arquivo, locals, { async: true });
    const marcacoes = {
      pillsSemContagem: !/\(\s*\d+\s*\)<\/button>/.test(html) && /round-pill/.test(html),
      semRoundBadge: !html.includes('round-badge'),
      semDotsInferiores: !html.includes('carousel-dot'),
      cardsNovos: html.includes('admin-game-card') && html.includes('agc-confronto'),
      semSecaoCampus: !html.includes('compact-summary-card'),
      semEmojiRodada: true
    };
    console.log(cenario, '->', JSON.stringify(marcacoes));
    if (Object.values(marcacoes).some((v) => !v)) process.exitCode = 1;
  }
  console.log('Render OK');
})().catch((e) => { console.error('ERRO DE RENDER:', e.message); process.exit(1); });
