const { readState, writeState } = require('../models/stateStore');

(async () => {
  try {
    const state = readState();
    state.campus = state.campus || {};
    state.campus.inscricoesCampus = state.campus.inscricoesCampus || {};
    state.campus.atletasCampus = state.campus.atletasCampus || [];

    // Define campuses alvo e modalidades a inserir
    const alvo = [
      'IFC Blumenau',
      'IFC Camboriú'
    ];

    const modalidadesPadrao = [
      'Futsal Masculino',
      'Futsal Feminino',
      'Basquete Masculino',
      'Basquete Feminino',
      'Voleibol Masculino',
      'Voleibol Feminino'
    ];

    // Garantir modalidades para cada campus alvo
    for (const campusNome of alvo) {
      state.campus.inscricoesCampus[campusNome] = state.campus.inscricoesCampus[campusNome] || modalidadesPadrao.slice(0,3);
    }

    // Adicionar atletas de teste coerentes com validações (nascimento >= 2007 para evento 2026)
    const baseAtletas = [
      { nome: 'João Silva', matricula: '20260101', genero: 'Masculino', dataNascimento: '2008-05-12', campus: 'IFC Blumenau', modalidades: ['Futsal Masculino'] },
      { nome: 'Pedro Souza', matricula: '20260102', genero: 'Masculino', dataNascimento: '2009-08-21', campus: 'IFC Blumenau', modalidades: ['Basquete Masculino'] },
      { nome: 'Mariana Lima', matricula: '20260103', genero: 'Feminino', dataNascimento: '2007-11-03', campus: 'IFC Camboriú', modalidades: ['Futsal Feminino'] },
      { nome: 'Beatriz Alves', matricula: '20260104', genero: 'Feminino', dataNascimento: '2008-02-18', campus: 'IFC Camboriú', modalidades: ['Basquete Feminino'] }
    ];

    // Avoid duplicating existing matriculas
    const existingMatriculas = new Set((state.campus.atletasCampus || []).map(a => String(a.matricula)));
    let nextId = Date.now();

    for (const a of baseAtletas) {
      if (existingMatriculas.has(String(a.matricula))) continue;
      const atleta = {
        id: nextId++,
        nome: a.nome,
        campus: a.campus,
        matricula: String(a.matricula),
        modalidade: (a.modalidades || []).join(', '),
        modalidades: a.modalidades || [],
        dataNascimento: a.dataNascimento,
        status: 'Analise'
      };
      state.campus.atletasCampus.push(atleta);
    }

    writeState(state);
    console.log('Estado atualizado com sucesso.');
    console.log('Campus com inscrições:', Object.keys(state.campus.inscricoesCampus));
    console.log('Total atletas no estado:', state.campus.atletasCampus.length);
  } catch (err) {
    console.error('Falha ao atualizar estado:', err);
    process.exit(1);
  }
})();
