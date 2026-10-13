const assert = require('node:assert/strict');
const {
  FORMATO_VERSAO,
  gerarNomeCompleto,
  extrairBase,
  ehModalidadeIndividual,
  ehTenisDeMesa,
  criarSubEtapasTenis,
  construirLinhaGrupo,
  aplicarResultadoJogoNoMapa,
  jogoComResultado,
  obterVencedorIndice,
  calcularTabelaDoGrupo,
  calcularClassificacaoGeral,
  obterPodioDaModalidade,
  validarDadosGerais,
  gerarListaDatas,
  montarCampiSelecionados,
  montarModalidadesDoForm,
  montarModalidadesPadrao,
  montarGruposDoForm,
  gerarJogosDasChaves,
  montarConfrontosDoForm,
  construirDadosEdicao,
  gerarEliminatoriaWizard,
  avancarEliminatoria,
  obterPodioEliminatoria
} = require('../services/edicaoWizardService');
const { obterRegras } = require('../utils/sportClassificationRules');

// ---------- Nome de modalidade ----------
assert.equal(gerarNomeCompleto('Futsal', 'Masculino'), 'Futsal Masculino');
assert.equal(gerarNomeCompleto('Futsal Masculino', 'Masculino'), 'Futsal Masculino');
assert.equal(extrairBase('Futsal Masculino'), 'Futsal');
assert.equal(extrairBase('Voleibol Feminino'), 'Voleibol');

// ---------- jogoComResultado ----------
assert.equal(jogoComResultado(null), false);
assert.equal(jogoComResultado({ status: 'Agendado', placarA: 3, placarB: 0 }), false);
assert.equal(jogoComResultado({ status: 'Cancelado', placarA: 3, placarB: 0, wo: true, vencedorId: 1 }), false);
assert.equal(jogoComResultado({ status: 'Encerrado', placarA: 3, placarB: 0 }), true);
assert.equal(jogoComResultado({ wo: true, vencedorId: 2 }), true);
assert.equal(jogoComResultado({ wo: true, vencedorId: 0 }), false);

// ---------- obterVencedorIndice ----------
const regrasFutsal = obterRegras('Futsal Masculino');
assert.equal(
  obterVencedorIndice({ participanteAId: 1, participanteBId: 2, placarA: 3, placarB: 1, status: 'Encerrado' }, regrasFutsal),
  1
);
assert.equal(
  obterVencedorIndice({ participanteAId: 1, participanteBId: 2, placarA: 1, placarB: 3, status: 'Encerrado' }, regrasFutsal),
  2
);
assert.equal(
  obterVencedorIndice({ participanteAId: 1, participanteBId: 2, status: 'Cancelado' }, regrasFutsal),
  null
);
assert.equal(
  obterVencedorIndice({ participanteAId: 1, participanteBId: 2, wo: true, vencedorId: 2 }, regrasFutsal),
  2
);
assert.equal(
  obterVencedorIndice({ participanteAId: 1, participanteBId: 2, status: 'Encerrado', placarA: 0, placarB: 0 }, regrasFutsal),
  null
);

// ---------- Tabela futsal (sem sets) ----------
{
  const campiMap = new Map([1, 2, 3].map(id => [id, { nomeExibicao: `Campus ${id}` }]));
  const jogos = [
    { participanteAId: 2, participanteBId: 1, placarA: 2, placarB: 1, status: 'Encerrado', sets: [] },
    { participanteAId: 3, participanteBId: 1, placarA: 3, placarB: 0, status: 'Encerrado', sets: [] },
    { participanteAId: 2, participanteBId: 3, placarA: 1, placarB: 1, status: 'Encerrado', sets: [] }
  ];
  const tabela = calcularTabelaDoGrupo(jogos, [1, 2, 3], campiMap, regrasFutsal, 0);
  assert.equal(tabela.length, 3);
  assert.deepEqual(tabela.map(l => l.posicao), [1, 2, 3]);
  assert.deepEqual(tabela.map(l => l.pontos), [4, 4, 0]);
  assert.deepEqual(tabela.map(l => l.campus), ['Campus 3', 'Campus 2', 'Campus 1']);
  assert.equal(tabela[0].vitorias, 1);
  assert.equal(tabela[2].derrotas, 2);
}

// ---------- Tabela volei (sets) ----------
{
  const regrasVolei = obterRegras('Voleibol Masculino');
  const l1 = construirLinhaGrupo(1, 'Campus 1', 0);
  const l2 = construirLinhaGrupo(2, 'Campus 2', 0);
  const mapa = new Map([[1, l1], [2, l2]]);
  aplicarResultadoJogoNoMapa(mapa, {
    participanteAId: 1,
    participanteBId: 2,
    placarA: 2,
    placarB: 0,
    status: 'Encerrado',
    wo: false,
    vencedorId: null,
    sets: [
      { pontosA: 25, pontosB: 20 },
      { pontosA: 25, pontosB: 18 }
    ]
  }, regrasVolei);
  assert.equal(l1.pontos, 3);
  assert.equal(l1.vitorias, 1);
  assert.equal(l1.sets_ganhos, 2);
  assert.equal(l2.pontos, 0);
  assert.equal(l2.derrotas, 1);
}

// ---------- WO ----------
{
  const regrasFutsalLocal = obterRegras('Futsal Masculino');
  const l1 = construirLinhaGrupo(1, 'Campus 1', 0);
  const l2 = construirLinhaGrupo(2, 'Campus 2', 0);
  const mapa = new Map([[1, l1], [2, l2]]);
  aplicarResultadoJogoNoMapa(mapa, {
    participanteAId: 1,
    participanteBId: 2,
    placarA: 0,
    placarB: 0,
    status: 'Encerrado',
    wo: true,
    vencedorId: 2,
    sets: []
  }, regrasFutsalLocal);
  assert.equal(l1.pontos, 0);
  assert.equal(l1.derrotas, 1);
  assert.equal(l2.pontos, 3);
  assert.equal(l2.vitorias, 1);
}

// ---------- Dados gerais (período obrigatório) ----------
assert.throws(() => validarDadosGerais({ ano: '2026' }), /per[íi]odo/i);
assert.deepEqual(
  validarDadosGerais({ ano: '2026', dataInicio: '2026-05-01', dataFim: '2026-05-03' }),
  { ano: 2026, dataInicio: '2026-05-01', dataFim: '2026-05-03' }
);
assert.throws(() => validarDadosGerais({ ano: '1999' }), /ano v[áa]lido/i);
assert.throws(() => validarDadosGerais({ ano: '2026', dataInicio: '2026-05-01', dataFim: '2026-04-01' }), /in[íi]cio.*fim/i);

// ---------- Lista de datas do período ----------
{
  assert.deepEqual(gerarListaDatas('2026-05-01', '2026-05-04'), ['2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04']);
  assert.deepEqual(gerarListaDatas('2026-05-01', '2026-05-01'), ['2026-05-01']);
  assert.deepEqual(gerarListaDatas(null, '2026-05-03'), []);
  assert.deepEqual(gerarListaDatas('2026-05-05', '2026-05-03'), []);
}

// ---------- Modalidades padrão (7 esportes × 2 gêneros) ----------
{
  const defs = montarModalidadesPadrao();
  assert.equal(defs.length, 14);
  assert.equal(defs[0].id, 10001);
  assert.equal(defs[13].id, 10014);
  assert.deepEqual(defs.map(m => m.nome).filter(n => n === 'Futsal Masculino').length, 1);
  assert.ok(defs.some(m => m.nome === 'Futsal Feminino'));
  assert.ok(defs.some(m => m.nome === 'Atletismo Masculino'));
  assert.ok(defs.some(m => m.nome === 'Atletismo Feminino'));
  assert.ok(defs.some(m => m.nome === 'Handebol Masculino'));
  assert.ok(defs.some(m => m.nome === 'Voleibol Feminino'));
  assert.ok(defs.some(m => m.nome === 'Vôlei de Praia Masculino'));
  assert.ok(defs.some(m => m.nome === 'Tênis de Mesa Feminino'));
  assert.ok(defs.some(m => m.nome === 'Xadrez Masculino'));
  assert.ok(defs.every(m => m.icone), 'todas as padrão têm ícone padrão');
  assert.ok(defs.every(m => m.etapaModalidade === 'participantes'));
}

// ---------- Campi selecionados ----------
{
  const campiAtuais = [
    { id: 1, nome: 'Campus 1', nomeExibicao: 'Campus 1', slug: 'campus-1', cor: '#fff', cidade: 'Cidade 1', fotoPerfil: '/uploads/foto1.png' },
    { id: 2, nome: 'Campus 2', nomeExibicao: 'Campus 2', slug: 'campus-2', cor: '#000', cidade: null, fotoPerfil: null }
  ];
  const selecionados = montarCampiSelecionados(campiAtuais, ['1', '2', '1'], [{ nome: 'Campus X' }]);
  assert.equal(selecionados.length, 3);
  assert.equal(selecionados[0].foto, '/uploads/foto1.png');
  assert.equal(selecionados[2].id, 100001);
  assert.equal(selecionados[2].nomeExibicao, 'Campus X');
}

// ---------- Modalidades do form (todas coletivas) ----------
{
  const { modalidades, proximoId } = montarModalidadesDoForm([
    { nome: 'Futsal', genero: 'Masculino' },
    { nome: 'Vôlei', genero: 'Feminino' },
    { nome: 'Xadrez', genero: 'Masculino' }
  ]);
  assert.equal(modalidades.length, 3);
  assert.equal(modalidades[0].id, 10001);
  assert.equal(modalidades[0].nome, 'Futsal Masculino');
  assert.equal(modalidades[0].tipoConfronto, 'Coletivo');
  assert.equal(modalidades[0].etapaModalidade, 'participantes');
  assert.equal(modalidades[2].nome, 'Xadrez Masculino');
  assert.equal(proximoId, 10004);
}

// ---------- Grupos / chaves manuais ----------
{
  const grupos = montarGruposDoForm(['A', 'B'], { '1': '0', '2': '0', '3': '1', '4': '1' }, [1, 2, 3, 4]);
  assert.equal(grupos.length, 2);
  assert.deepEqual(grupos.map(g => g.letra), ['A', 'B']);
  assert.deepEqual(grupos[0].participantes, [1, 2]);
  assert.deepEqual(grupos[1].participantes, [3, 4]);
}
{
  const grupos = montarGruposDoForm([], {}, [1, 2, 3]);
  assert.equal(grupos.length, 1);
  assert.equal(grupos[0].letra, 'A');
  assert.deepEqual(grupos[0].participantes, [1, 2, 3]);
}
{
  const grupos = montarGruposDoForm(['A', 'B'], {}, [1, 2]);
  assert.equal(grupos.length, 1, 'chave sem participantes é descartada');
  assert.equal(grupos[0].letra, 'A');
}
{
  const grupos = montarGruposDoForm(['A', 'B', 'C'], { '1': '2', '2': '9', '3': '0', '4': '0' }, [1, 2, 3, 4]);
  assert.equal(grupos.length, 2, 'índice inexistente cai na chave 0');
  assert.deepEqual(grupos[0].participantes, [2, 3, 4]);
  assert.deepEqual(grupos[1].participantes, [1]);
}

// ---------- Confrontos manuais ----------
{
  const grupos = montarGruposDoForm(['A', 'B'], { '1': '0', '2': '0', '3': '1', '4': '1' }, [1, 2, 3, 4]);
  const jogos = montarConfrontosDoForm({
    'conf_grupo': ['0', '0', '1', '9'],
    'conf_rodada': ['1', '1', '1', '1'],
    'conf_casa': ['1', '2', '3', ''],
    'conf_fora': ['2', '3', '4', ''],
    'conf_data': ['2026-05-01', '2026-05-01', '2026-05-02', ''],
    'conf_horario': ['09:00', '10:00', '11:00', ''],
    'conf_local': ['Quadra 1', 'Quadra 2', 'Quadra 3', '']
  }, grupos);
  assert.equal(jogos.length, 3);
  assert.equal(jogos[0].participanteAId, 1);
  assert.equal(jogos[0].participanteBId, 2);
  assert.equal(jogos[0].chaveIndice, 0);
  assert.equal(jogos[1].status, 'Agendado');
  assert.deepEqual(jogos.map(j => j.id), [1, 2, 3]);
}
{
  const grupos = montarGruposDoForm(['A'], {}, [1, 2]);
  const jogos = montarConfrontosDoForm({ 'conf_casa': [], 'conf_fora': [] }, grupos);
  assert.deepEqual(jogos, []);
}

// ---------- Jogos gerados automaticamente a partir das chaves ----------
{
  const grupos = montarGruposDoForm(['A', 'B'], { '1': '0', '2': '0', '3': '1', '4': '1' }, [1, 2, 3, 4]);
  const jogos = gerarJogosDasChaves(grupos);
  assert.equal(jogos.length, 2, 'jogo único em cada chave de 2 campi');
  assert.deepEqual(jogos.map(j => j.chaveIndice), [0, 1]);
  assert.equal(jogos[0].participanteAId, 1);
  assert.equal(jogos[0].participanteBId, 2);
  assert.ok(jogos.every(j => j.status === 'Agendado'));
  assert.ok(jogos.every(j => j.placarA === null && j.placarB === null));
}
{
  const grupos = montarGruposDoForm(['A'], {}, [1, 2, 3]);
  const jogos = gerarJogosDasChaves(grupos);
  assert.equal(jogos.length, 3, 'turno único com 3 times (rodada 1/2/3)');
  assert.deepEqual(jogos.map(j => j.rodada), [1, 2, 3]);
}
{
  const grupos = montarGruposDoForm(['A', 'B', 'C'], { '1': '0', '2': '0', '3': '1', '4': '1', '5': '2', '6': '2' }, [1, 2, 3, 4, 5, 6]);
  const jogos = gerarJogosDasChaves(grupos);
  assert.equal(jogos.length, 3, 'jogo único em cada chave de 2 campi');
  assert.deepEqual(jogos.map(j => j.chaveIndice), [0, 1, 2]);
}

// ---------- Modalidade individual (atletismo/xadrez sem chaves) ----------
assert.equal(ehModalidadeIndividual('Atletismo Masculino'), true);
assert.equal(ehModalidadeIndividual('Xadrez Feminino'), true);
assert.equal(ehModalidadeIndividual('Tênis de Mesa Masculino'), false);
assert.equal(ehModalidadeIndividual('Tenis de Mesa Feminino'), false);
assert.equal(ehModalidadeIndividual('Futsal Masculino'), false);
assert.equal(ehModalidadeIndividual('Voleibol Feminino'), false);

// ---------- Tênis de mesa: coletivo com duas sub-etapas (individual e em dupla) ----------
assert.equal(ehTenisDeMesa('Tênis de Mesa Masculino'), true);
assert.equal(ehTenisDeMesa('Tênis de Mesa Feminino'), true);
assert.equal(ehTenisDeMesa('TenIs de mesa'), true);
assert.equal(ehTenisDeMesa('Futsal Masculino'), false);
{
  const subEtapas = criarSubEtapasTenis();
  assert.deepEqual(Object.keys(subEtapas).sort(), ['dupla', 'individual']);
  for (const bag of Object.values(subEtapas)) {
    assert.deepEqual(bag.grupos, []);
    assert.deepEqual(bag.jogos, []);
    assert.deepEqual(bag.tabela, []);
    assert.equal(bag.finalizada, false);
  }
}

// ---------- Classificação geral (multi-chave) ----------
{
  const mod = {
    tabela: [
      construirLinhaGrupo(1, 'Campus 1', 0),
      construirLinhaGrupo(2, 'Campus 2', 0),
      construirLinhaGrupo(3, 'Campus 3', 1),
      construirLinhaGrupo(4, 'Campus 4', 1)
    ]
  };
  mod.tabela[0].pontos = 7; mod.tabela[0].vitorias = 2;
  mod.tabela[1].pontos = 4; mod.tabela[1].vitorias = 1;
  mod.tabela[2].pontos = 6; mod.tabela[2].vitorias = 2;
  mod.tabela[3].pontos = 3; mod.tabela[3].vitorias = 1;

  const geral = calcularClassificacaoGeral(mod);
  assert.deepEqual(geral.map(l => l.campus), ['Campus 1', 'Campus 3', 'Campus 2', 'Campus 4']);
  assert.deepEqual(geral.map(l => l.posicao), [1, 2, 3, 4]);
  assert.equal(geral[0].pontos, 7);
}

// ---------- Pódio ----------
{
  const regrasLocal = obterRegras('Futsal Masculino');
  let mod = { grupos: [], jogos: [], tabela: [] };
  assert.deepEqual(obterPodioDaModalidade(mod, regrasLocal), { campeao: null, vice: null, terceiro: null, completa: false });

  mod = {
    grupos: [{ indice: 0, letra: 'A', participantes: [1, 2, 3] }],
    jogos: [
      { participanteAId: 1, participanteBId: 2, placarA: 2, placarB: 1, status: 'Encerrado', chaveIndice: 0, sets: [] },
      { participanteAId: 1, participanteBId: 3, placarA: 1, placarB: 1, status: 'Encerrado', chaveIndice: 0, sets: [] },
      { participanteAId: 2, participanteBId: 3, placarA: 1, placarB: 1, status: 'Encerrado', chaveIndice: 0, sets: [] }
    ]
  };
  mod.tabela = calcularTabelaDoGrupo(mod.jogos, [1, 2, 3], new Map([[1, { nomeExibicao: 'Campus 1' }], [2, { nomeExibicao: 'Campus 2' }], [3, { nomeExibicao: 'Campus 3' }]]), regrasLocal, 0);
  const podio = obterPodioDaModalidade(mod, regrasLocal);
  assert.equal(podio.completa, true);
  assert.equal(podio.campeao, 'Campus 1');
  assert.equal(podio.vice, 'Campus 3');
  assert.equal(podio.terceiro, 'Campus 2');
}
{
  const regrasLocal = obterRegras('Futsal Masculino');
  const mod = {
    grupos: [{ indice: 0, letra: 'A', participantes: [1, 2] }],
    jogos: [
      { participanteAId: 1, participanteBId: 2, placarA: 2, placarB: 0, status: 'Encerrado', chaveIndice: 0, sets: [] }
    ]
  };
  mod.tabela = calcularTabelaDoGrupo(mod.jogos, [1, 2], new Map([[1, { nomeExibicao: 'Campus 1' }], [2, { nomeExibicao: 'Campus 2' }]]), regrasLocal, 0);
  const podio = obterPodioDaModalidade(mod, regrasLocal);
  assert.equal(podio.completa, true, 'dois participantes finalizam com campeão e vice');
  assert.equal(podio.campeao, 'Campus 1');
  assert.equal(podio.vice, 'Campus 2');
  assert.equal(podio.terceiro, null);
}

// ---------- construirDadosEdicao (formato importável) ----------
{
  const campi = [
    { id: 1, nome: 'Campus 1', nomeExibicao: 'Campus 1', slug: 'campus-1', cor: '#000' },
    { id: 2, nome: 'Campus 2', nomeExibicao: 'Campus 2', slug: 'campus-2', cor: '#000' },
    { id: 3, nome: 'Campus 3', nomeExibicao: 'Campus 3', slug: 'campus-3', cor: '#000' }
  ];
  const draft = {
    ano: 2026,
    titulo: 'JIFC 2026',
    campi,
    modalidades: [
      {
        id: 10001,
        nome: 'Futsal Masculino',
        base: 'Futsal',
        genero: 'Masculino',
        tipoConfronto: 'Coletivo',
        participantes: [1, 2, 3],
        grupos: [{ indice: 0, letra: 'A', participantes: [1, 2, 3] }],
        jogos: [
          { id: 1, chaveIndice: 0, rodada: 1, participanteAId: 1, participanteBId: 2,
            data: '2026-05-01', horario: '09:00', local: 'Quadra 1',
            placarA: 3, placarB: 0, status: 'Encerrado', wo: false, sets: [] },
          { id: 2, chaveIndice: 0, rodada: 1, participanteAId: 1, participanteBId: 3,
            data: '2026-05-01', horario: '10:00', local: 'Quadra 1',
            placarA: 1, placarB: 1, status: 'Encerrado', wo: false, sets: [] },
          { id: 3, chaveIndice: 0, rodada: 1, participanteAId: 2, participanteBId: 3,
            data: '2026-05-01', horario: '11:00', local: 'Quadra 1',
            placarA: 1, placarB: 1, status: 'Encerrado', wo: false, sets: [] }
        ],
        tabela: [],
        campeao: 'Campus 1',
        vice: 'Campus 2'
      },
      {
        id: 10002,
        nome: 'Voleibol Feminino',
        base: 'Voleibol',
        genero: 'Feminino',
        tipoConfronto: 'Coletivo',
        participantes: [1, 2],
        grupos: [{ indice: 0, letra: 'A', participantes: [1, 2] }],
        jogos: [
          { id: 1, chaveIndice: 0, rodada: 1, participanteAId: 1, participanteBId: 2,
            data: '2026-05-02', horario: '14:00', local: 'Quadra 2',
            placarA: 0, placarB: 0, status: 'Agendado', wo: false, sets: [] }
        ],
        tabela: [],
        campeao: null,
        vice: null
      }
    ]
  };
  draft.modalidades[0].tabela = calcularTabelaDoGrupo(
    draft.modalidades[0].jogos, [1, 2, 3],
    new Map(campi.map(c => [c.id, c])), obterRegras('Futsal Masculino'), 0
  );

  const dados = construirDadosEdicao(draft);
  assert.equal(dados.formatoVersao, FORMATO_VERSAO);
  assert.equal(dados.ano, 2026);
  assert.equal(dados.titulo, 'JIFC 2026');
  assert.equal(dados.origem, 'importada');
  assert.equal(dados.campi.length, 3);
  assert.equal(dados.modalidades.length, 2);
  assert.equal(dados.chaves.length, 2);
  assert.equal(dados.grupos.length, 3);
  assert.equal(dados.jogos.length, 4);
  assert.equal(dados.jogos[0].casaId, 1);
  assert.equal(dados.jogos[0].foraId, 2);
  assert.equal(dados.jogos[0].casa, 'Campus 1');
  assert.equal(dados.jogos[0].fase, 'Fase de Grupos');
  assert.equal(dados.jogos[0].chaveId, 1);
  assert.equal(dados.jogos[0].vencedorCampus, 1);
  assert.equal(dados.jogos[0].publicado, 1);
  assert.equal(dados.jogos[3].status, 'Agendado');
  assert.equal(dados.boletim.ranking[0].campus, 'Campus 1');
  assert.equal(dados.boletim.modalidades[0].campeao, 'Campus 1');
  assert.equal(dados.boletim.modalidades[1].campeao, '—');
  assert.ok(!dados.atletismo);
  assert.ok(!dados.xadrez);
}

// ---------- construirDadosEdicao com tênis de mesa (sub-etapas individual/dupla) ----------
{
  const campi = [
    { id: 1, nome: 'Campus 1', nomeExibicao: 'Campus 1', slug: 'campus-1', cor: '#000' },
    { id: 2, nome: 'Campus 2', nomeExibicao: 'Campus 2', slug: 'campus-2', cor: '#000' }
  ];
  const modTenis = {
    id: 10020,
    nome: 'Tênis de Mesa Masculino',
    base: 'Tênis de Mesa',
    genero: 'Masculino',
    tipoConfronto: 'Coletivo',
    participantes: [1, 2],
    subEtapa: 'dupla',
    subEtapasTenis: {
      individual: {
        grupos: [{ indice: 0, letra: 'A', participantes: [1, 2] }],
        jogos: [{ id: 1, chaveIndice: 0, rodada: 1, participanteAId: 1, participanteBId: 2, data: '2026-05-02', horario: '14:00', local: 'Mesa 1', placarA: 2, placarB: 0, status: 'Encerrado', wo: false, sets: [{ numero: 1, pontosA: 11, pontosB: 6 }, { numero: 2, pontosA: 11, pontosB: 9 }] }],
        tabela: [],
        campeao: 'Campus 1',
        vice: 'Campus 2',
        finalizada: true
      },
      dupla: {
        grupos: [{ indice: 0, letra: 'A', participantes: [1, 2] }],
        jogos: [{ id: 2, chaveIndice: 0, rodada: 1, participanteAId: 1, participanteBId: 2, data: '2026-05-02', horario: '15:00', local: 'Mesa 2', placarA: 2, placarB: 0, status: 'Encerrado', wo: false, sets: [{ numero: 1, pontosA: 11, pontosB: 8 }, { numero: 2, pontosA: 11, pontosB: 7 }] }],
        tabela: [],
        campeao: 'Campus 2',
        vice: 'Campus 1',
        finalizada: true
      }
    }
  };
  const dados = construirDadosEdicao({
    ano: 2026,
    titulo: 'JIFC 2026',
    campi,
    modalidades: [modTenis]
  });
  assert.equal(dados.chaves.length, 2, 'uma chave do individual e uma do dupla');
  assert.deepEqual(dados.chaves.map(c => c.subCategoria).sort(), ['dupla', 'individual']);
  assert.equal(dados.jogos.length, 2, 'individual e dupla somados');
  assert.deepEqual(dados.jogos.map(j => j.subCategoria).sort(), ['dupla', 'individual']);
  assert.equal(dados.jogos[0].sets[0].pontosCasa, 11);
  assert.equal(dados.jogos[1].sets[1].pontosFora, 7);
}

// ---------- Eliminatória: geração a partir das tabelas das chaves ----------
function montarTabela(chavesCampi) {
  const linhas = [];
  chavesCampi.forEach((campiDaChave, ci) => {
    campiDaChave.forEach((campusId, i) => {
      linhas.push({
        chaveIndice: ci,
        posicao: i + 1,
        campus_id: campusId,
        pontos: 100 - Number(campusId),
        jogos_jogados: i, vitorias: 0, empates: 0, derrotas: 0,
        pontos_pro: 0, pontos_contra: 0, saldo_pontuacao: 0,
        sets_ganhos: 0, sets_perdidos: 0, excluicoes_2min: 0
      });
    });
  });
  return linhas;
}

// 2 chaves → Semifinal direto (1ºA×2ºB e 2ºA×1ºB), mesmo em 'sequencial'
{
  const regras = obterRegras('Futsal Masculino');
  const mod = { tabela: montarTabela([[1, 2, 3], [4, 5, 6]]) };
  const elim = gerarEliminatoriaWizard(mod, regras, 'sequencial');
  assert.deepEqual(elim.avancantes, [1, 4, 2, 5], '1ºs geral e depois 2ºs geral');
  assert.deepEqual(elim.fases.map(f => f.nome), ['Semifinal', 'Final']);
  assert.equal(elim.fases[0].jogos.length, 2);
  assert.equal(elim.fases[1].jogos.length, 1);
  assert.deepEqual(elim.fases[0].jogos.map(j => [j.participanteAId, j.participanteBId]), [[1, 5], [2, 4]]);
  assert.equal(elim.jogoTerceiro.fase, 'Terceiro Lugar');
  assert.deepEqual(elim.jogoTerceiro.origemCasa, { r: 1, gi: 0, perdedor: true });
}

// 3 chaves → Quartas com 1ºs gerais (P), melhores 3ºs (T) e 2ºs por chave
{
  const regras = obterRegras('Futsal Masculino');
  const elim = gerarEliminatoriaWizard({ tabela: montarTabela([[1, 2, 3], [4, 5, 6], [7, 8, 9]]) }, regras, 'alternado');
  assert.deepEqual(elim.avancantes, [1, 4, 7, 2, 5, 8, 3, 6], '2 melhores 3ºs completam as 8 vagas');
  assert.deepEqual(elim.fases.map(f => f.nome), ['Quartas', 'Semifinal', 'Final']);
  assert.deepEqual(elim.fases[0].jogos.map(j => [j.participanteAId, j.participanteBId]), [[1, 6], [4, 3], [7, 2], [5, 8]]);
  assert.equal(elim.avancantes.length, 8);
}

// 4 chaves → Quartas cruzadas/sequenciais emendando pela chave
{
  const regras = obterRegras('Voleibol Masculino');
  const tabela = montarTabela([[1, 2, 3], [4, 5, 6], [7, 8, 9], [10, 11, 12]]);
  const alternado = gerarEliminatoriaWizard({ tabela }, regras, 'alternado');
  assert.deepEqual(alternado.avancantes, [1, 4, 7, 10, 2, 5, 8, 11]);
  assert.deepEqual(alternado.fases.map(f => f.nome), ['Quartas', 'Semifinal', 'Final']);
  assert.deepEqual(alternado.fases[0].jogos.map(j => [j.participanteAId, j.participanteBId]), [[1, 8], [2, 7], [4, 11], [5, 10]]);

  const sequencial = gerarEliminatoriaWizard({ tabela }, regras, 'sequencial');
  assert.deepEqual(sequencial.fases[0].jogos.map(j => [j.participanteAId, j.participanteBId]), [[1, 5], [2, 4], [7, 11], [8, 10]]);
}

// 5 chaves → extensão para 16 vagas usando o melhor 4º colocado
{
  const regras = obterRegras('Futsal Masculino');
  const elim = gerarEliminatoriaWizard({ tabela: montarTabela([[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]]) }, regras, 'alternado');
  assert.equal(elim.avancantes.length, 16);
  assert.deepEqual(elim.avancantes.slice(0, 5), [1, 5, 9, 13, 17], '1ºs geral');
  assert.equal(elim.avancantes[15], 4, 'melhor 4º colocado entra');
  assert.deepEqual(elim.fases.map(f => f.nome), ['Oitavas', 'Quartas', 'Semifinal', 'Final']);
  assert.equal(elim.fases[0].jogos.length, 8);
  assert.equal(elim.fases[0].jogos[0].participanteAId, 1, 'seed 1 joga a oitava 1');
  assert.equal(elim.fases[1].jogos.length, 4);
}

// 7 chaves → extensão para 16 vagas com os 2 melhores 3ºs
{
  const regras = obterRegras('Futsal Masculino');
  const elim = gerarEliminatoriaWizard({ tabela: montarTabela([[1, 2, 3], [4, 5, 6], [7, 8, 9], [10, 11, 12], [13, 14, 15], [16, 17, 18], [19, 20, 21]]) }, regras, 'alternado');
  assert.deepEqual(elim.avancantes, [1, 4, 7, 10, 13, 16, 19, 2, 5, 8, 11, 14, 17, 20, 3, 6]);
  assert.deepEqual(elim.fases.map(f => f.nome), ['Oitavas', 'Quartas', 'Semifinal', 'Final']);
  assert.equal(elim.fases[0].jogos.length, 8);
  const jogo1 = elim.fases[0].jogos[0];
  assert.equal(jogo1.participanteAId, 1, 'seed 1');
  assert.equal(jogo1.participanteBId, 6, 'seed 16 (último classificado)');
}

// 8 chaves → Oitavas alternadas (padrão do sistema)
{
  const regras = obterRegras('Futsal Masculino');
  const chaves = [[1, 2, 3], [4, 5, 6], [7, 8, 9], [10, 11, 12], [13, 14, 15], [16, 17, 18], [19, 20, 21], [22, 23, 24]];
  const elim = gerarEliminatoriaWizard({ tabela: montarTabela(chaves) }, regras, 'alternado');
  assert.equal(elim.avancantes.length, 16);
  assert.deepEqual(elim.fases.map(f => f.nome), ['Oitavas', 'Quartas', 'Semifinal', 'Final']);
  assert.equal(elim.fases[0].jogos.length, 8);
  assert.deepEqual(elim.fases[0].jogos.map(j => [j.participanteAId, j.participanteBId]), [[1, 8], [2, 7], [13, 20], [14, 19], [4, 11], [5, 10], [16, 23], [17, 22]]);
  assert.equal(elim.fases[1].jogos.length, 4);
  assert.equal(elim.fases[2].jogos.length, 2);
  assert.equal(elim.fases[3].jogos.length, 1);
}

// ---------- Eliminatória: vencedores fluem até o pódio ----------
{
  const regras = obterRegras('Voleibol Masculino');
  const elim = gerarEliminatoriaWizard({ tabela: montarTabela([[1, 2, 3], [4, 5, 6]]) }, regras, 'sequencial');
  assert.deepEqual(elim.fases[0].jogos.map(j => [j.participanteAId, j.participanteBId]), [[1, 5], [2, 4]]);

  const semis = elim.fases[0].jogos;
  semis[0].status = 'Encerrado'; semis[0].placarA = 2; semis[0].placarB = 0;
  semis[0].sets = [{ pontosA: 21, pontosB: 10 }, { pontosA: 21, pontosB: 12 }];
  semis[1].status = 'Encerrado'; semis[1].placarA = 0; semis[1].placarB = 2;
  semis[1].sets = [{ pontosA: 10, pontosB: 21 }, { pontosA: 12, pontosB: 21 }];

  avancarEliminatoria(elim, regras);
  const final = elim.fases[1].jogos[0];
  assert.equal(final.participanteAId, 1);
  assert.equal(final.participanteBId, 4, 'semi 2 (2ºA×1ºB) venceu o lado B (4)');
  assert.equal(elim.jogoTerceiro.participanteAId, 5, 'perdedor da semi 1');
  assert.equal(elim.jogoTerceiro.participanteBId, 2, 'perdedor da semi 2');

  final.status = 'Encerrado'; final.placarA = 2; final.placarB = 0;
  final.sets = [{ pontosA: 21, pontosB: 15 }, { pontosA: 21, pontosB: 17 }];
  elim.jogoTerceiro.status = 'Encerrado'; elim.jogoTerceiro.placarA = 2; elim.jogoTerceiro.placarB = 0;
  elim.jogoTerceiro.sets = [{ pontosA: 21, pontosB: 18 }, { pontosA: 21, pontosB: 19 }];
  const podio = obterPodioEliminatoria(elim, regras);
  assert.equal(podio.campeao, 1);
  assert.equal(podio.vice, 4);
  assert.equal(podio.terceiro, 5);
  assert.equal(podio.completa, true);
}

// ---------- Eliminatória: pódio incompleto ----------
{
  const regras = obterRegras('Handebol Feminino');
  const elim = gerarEliminatoriaWizard({ tabela: montarTabela([[1, 2, 3], [4, 5, 6]]) }, regras, 'alternado');
  elim.fases[0].jogos.forEach(j => { j.status = 'Encerrado'; j.placarA = 10; j.placarB = 6; });
  avancarEliminatoria(elim, regras);
  const podio = obterPodioEliminatoria(elim, regras);
  assert.equal(podio.campeao, null, 'final ainda não jogada');
  assert.equal(podio.completa, false);
}

// ---------- construirDadosEdicao inclui jogos da eliminatória ----------
{
  const campi = [
    { id: 1, nome: 'Campus 1', nomeExibicao: 'Campus 1', slug: 'campus-1', cor: '#000' },
    { id: 2, nome: 'Campus 2', nomeExibicao: 'Campus 2', slug: 'campus-2', cor: '#000' },
    { id: 3, nome: 'Campus 3', nomeExibicao: 'Campus 3', slug: 'campus-3', cor: '#000' },
    { id: 4, nome: 'Campus 4', nomeExibicao: 'Campus 4', slug: 'campus-4', cor: '#000' }
  ];
  const regras = obterRegras('Voleibol Masculino');
  const elim = gerarEliminatoriaWizard({ tabela: montarTabela([[1, 2, 3], [4, 5, 6]]) }, regras, 'sequencial');
  const semis = elim.fases[0].jogos;
  semis[0].status = 'Encerrado'; semis[0].placarA = 2; semis[0].placarB = 0;
  semis[0].sets = [{ pontosA: 21, pontosB: 10 }, { pontosA: 21, pontosB: 12 }];
  semis[1].status = 'Encerrado'; semis[1].placarA = 0; semis[1].placarB = 2;
  semis[1].sets = [{ pontosA: 10, pontosB: 21 }, { pontosA: 12, pontosB: 21 }];
  avancarEliminatoria(elim, regras);
  const final = elim.fases[1].jogos[0];
  final.status = 'Encerrado'; final.placarA = 1; final.placarB = 3;
  final.sets = [{ pontosA: 21, pontosB: 18 }, { pontosA: 18, pontosB: 21 }, { pontosA: 20, pontosB: 22 }];
  elim.jogoTerceiro.status = 'Encerrado'; elim.jogoTerceiro.placarA = 2; elim.jogoTerceiro.placarB = 0;
  elim.jogoTerceiro.sets = [{ pontosA: 21, pontosB: 17 }, { pontosA: 21, pontosB: 19 }];
  avancarEliminatoria(elim, regras);
  const podioE = obterPodioEliminatoria(elim, regras);

  const modVolei = {
    id: 10025,
    nome: 'Voleibol Masculino',
    base: 'Voleibol',
    genero: 'Masculino',
    tipoConfronto: 'Coletivo',
    participantes: [1, 2, 3, 4],
    subEtapa: null,
    subEtapasTenis: null,
    eliminatoria: elim,
    grupos: [{ indice: 0, letra: 'A', participantes: [1, 2, 3, 4] }],
    jogos: [],
    tabela: [],
    campeao: `Campus ${podioE.campeao}`,
    vice: `Campus ${podioE.vice}`,
    terceiro: `Campus ${podioE.terceiro}`,
    finalizada: true
  };
  const dados = construirDadosEdicao({ ano: 2026, titulo: 'JIFC 2026', campi, modalidades: [modVolei] });
  const jogosElim = dados.jogos.filter(j => j.fase !== 'Fase de Grupos');
  assert.equal(dados.jogos.length, 4, '2 semis + 1 final + 1 terceiro + 0 grupos');
  assert.ok(jogosElim.some(j => j.fase === 'Semifinal'));
  assert.ok(jogosElim.some(j => j.fase === 'Final'));
  assert.ok(jogosElim.some(j => j.fase === 'Terceiro Lugar'));
  assert.equal(dados.boletim.modalidades[0].campeao, `Campus ${podioE.campeao}`);
  assert.equal(dados.boletim.modalidades[0].vice, `Campus ${podioE.vice}`);
}

console.log('OK - edicaoWizard');