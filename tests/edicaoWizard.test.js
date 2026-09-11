const assert = require('node:assert/strict');
const {
  FORMATO_VERSAO,
  gerarNomeCompleto,
  extrairBase,
  construirLinhaGrupo,
  aplicarResultadoJogoNoMapa,
  jogoComResultado,
  obterVencedorIndice,
  calcularTabelaDoGrupo,
  calcularClassificacaoGeral,
  obterPodioDaModalidade,
  validarDadosGerais,
  montarCampiSelecionados,
  montarModalidadesDoForm,
  montarGruposDoForm,
  montarConfrontosDoForm,
  construirDadosEdicao
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

// ---------- Dados gerais (sem campo título) ----------
assert.deepEqual(validarDadosGerais({ ano: '2026' }), { ano: 2026, dataInicio: null, dataFim: null });
assert.deepEqual(
  validarDadosGerais({ ano: '2026', dataInicio: '2026-05-01', dataFim: '2026-05-03' }),
  { ano: 2026, dataInicio: '2026-05-01', dataFim: '2026-05-03' }
);
assert.throws(() => validarDadosGerais({ ano: '1999' }), /ano v[áa]lido/i);
assert.throws(() => validarDadosGerais({ ano: '2026', dataInicio: '2026-05-01', dataFim: '2026-04-01' }), /in[íi]cio.*fim/i);

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

console.log('OK - edicaoWizard');