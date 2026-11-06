require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const db = require('../config/db');
const { PROVAS_ATLETISMO, distribuirProvasAtletismo } = require('../utils/atletismoSeed');

const TOTAL_POR_CAMPUS = 60;
const POR_GENERO = 30;
const DATA_NASCIMENTO_TESTE = '2008-06-15';
const STATUS_NOVOS = 'Analise';
const APENAS_SIMULAR = process.argv.includes('--dry-run');

const ESPORTES_COLETIVOS = [
  { chave: 'futsal', limite: 15, inscritos: 12, campi: { Masculino: 17, Feminino: 15 } },
  { chave: 'handebol', limite: 16, inscritos: 14, campi: { Masculino: 14, Feminino: 13 } },
  { chave: 'volei-de-praia', limite: 4, inscritos: 4, campi: { Masculino: 12, Feminino: 11 } },
  { chave: 'volei', limite: 14, inscritos: 12, campi: { Masculino: 10, Feminino: 9 } },
  { chave: 'basquete', limite: 12, inscritos: 12, campi: { Masculino: 8, Feminino: 7 } }
];

const ESPORTES_INDIVIDUAIS = [
  { chave: 'atletismo', limite: 20 },
  { chave: 'xadrez', limite: 20 },
  { chave: 'tenis-de-mesa', limite: 3 }
];

const CHAVES_TENIS_MESA_POR_GENERO = 8;
const ATLETAS_POR_CHAVE_TENIS_MESA = 3;

function normalizarTexto(valor) {
  return String(valor || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function dataIso(valor) {
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    return valor.toISOString().slice(0, 10);
  }
  return String(valor || '').slice(0, 10);
}

function chaveEsporte(nome) {
  const normalizado = normalizarTexto(nome);
  if (normalizado.includes('volei de praia')) return 'volei-de-praia';
  if (normalizado.includes('futsal')) return 'futsal';
  if (normalizado.includes('handebol')) return 'handebol';
  if (normalizado.includes('basquete')) return 'basquete';
  if (normalizado.includes('volei')) return 'volei';
  if (normalizado.includes('atletismo')) return 'atletismo';
  if (normalizado.includes('tenis de mesa')) return 'tenis-de-mesa';
  if (normalizado.includes('xadrez')) return 'xadrez';
  return null;
}

function generoValido(valor) {
  return valor === 'Masculino' || valor === 'Feminino';
}

function hashDeterministico(numero, sal) {
  let valor = (Number(numero) * 2654435761 + Number(sal) * 2246822519) >>> 0;
  valor ^= valor >>> 16;
  valor = Math.imul(valor, 2246822519) >>> 0;
  valor ^= valor >>> 13;
  return valor >>> 0;
}

function escolherCampi(campi, quantidade, sal) {
  return new Set(campi
    .slice()
    .sort((a, b) => hashDeterministico(a.id, sal) - hashDeterministico(b.id, sal))
    .slice(0, quantidade)
    .map((campus) => Number(campus.id)));
}

function escolherCampiTenisMesa(campi, atletasPorCampus, modalidadeId, quantidade, sal) {
  return new Set(campi
    .map((campus) => ({
      id: Number(campus.id),
      jaInscrito: atletasPorCampus.get(Number(campus.id))
        .some((atleta) => atleta.status !== 'Reprovado' && atleta.modalidadeIds.has(modalidadeId))
    }))
    .sort((a, b) => Number(b.jaInscrito) - Number(a.jaInscrito)
      || hashDeterministico(a.id, sal) - hashDeterministico(b.id, sal))
    .slice(0, quantidade)
    .map((campus) => campus.id));
}

function distribuirEmOrdemDeterministica(itens, sal) {
  return itens.slice().sort((a, b) => hashDeterministico(a.indice, sal) - hashDeterministico(b.indice, sal));
}

function criarErro(mensagem) {
  return new Error(mensagem);
}

async function carregarEstado() {
  const [configuracoes] = await db.query(
    'SELECT ano_evento, inicio_evento, fim_evento, limite_atletas_total_campus FROM configuracoes_evento ORDER BY id DESC LIMIT 1'
  );
  const configuracao = configuracoes[0];
  if (!configuracao || Number(configuracao.ano_evento) !== 2026) {
    throw criarErro('A edição ativa não está configurada para 2026. Nenhum dado foi alterado.');
  }
    if (dataIso(configuracao.inicio_evento) !== '2026-11-30'
      || dataIso(configuracao.fim_evento) !== '2026-12-02') {
    throw criarErro('As datas da edição não correspondem a 30/11/2026–02/12/2026. Nenhum dado foi alterado.');
  }
  if (Number(configuracao.limite_atletas_total_campus) !== TOTAL_POR_CAMPUS) {
    throw criarErro('O limite geral por campus precisa estar configurado em 60 antes da população.');
  }

  const [campi] = await db.query('SELECT id, nome, slug FROM campus ORDER BY id');
  if (!campi.length) throw criarErro('Não há campi cadastrados.');

  const [modalidades] = await db.query('SELECT id, nome, genero, limite_inscritos FROM modalidades ORDER BY id');
  const modalidadesPorChave = new Map();
  modalidades.forEach((modalidade) => {
    const esporte = chaveEsporte(modalidade.nome);
    if (!esporte || !generoValido(modalidade.genero)) return;
    const chave = `${esporte}|${modalidade.genero}`;
    if (modalidadesPorChave.has(chave)) {
      throw criarErro(`Há mais de uma modalidade correspondente a ${modalidade.nome}.`);
    }
    modalidadesPorChave.set(chave, modalidade);
  });

  for (const esporte of [...ESPORTES_COLETIVOS, ...ESPORTES_INDIVIDUAIS]) {
    for (const genero of ['Masculino', 'Feminino']) {
      if (!modalidadesPorChave.has(`${esporte.chave}|${genero}`)) {
        throw criarErro(`Falta a modalidade ${esporte.chave} ${genero}. Nenhum dado foi alterado.`);
      }
    }
  }

  const [atletasExistentes] = await db.query(
    `SELECT id, campus_id, genero, status, provas_atletismo, tenis_mesa_participacoes
     FROM atletas
     WHERE COALESCE(substituido, 0) = 0
     ORDER BY campus_id, id`
  );
  const [vinculosExistentes] = await db.query(
    `SELECT am.atleta_id, am.modalidade_id
     FROM atleta_modalidade am
     JOIN atletas a ON a.id = am.atleta_id
     WHERE COALESCE(a.substituido, 0) = 0`
  );
  const [identificadores] = await db.query('SELECT cpf, matricula FROM atletas');

  return {
    configuracao,
    campi,
    modalidadesPorChave,
    atletasExistentes,
    vinculosExistentes,
    cpfsExistentes: new Set(identificadores.map((row) => String(row.cpf || ''))),
    matriculasExistentes: new Set(identificadores.map((row) => String(row.matricula || '')))
  };
}

function prepararPlano(estado) {
  const {
    campi,
    modalidadesPorChave,
    atletasExistentes,
    vinculosExistentes,
    cpfsExistentes,
    matriculasExistentes
  } = estado;
  const atletasPorCampus = new Map(campi.map((campus) => [Number(campus.id), []]));
  atletasExistentes.forEach((atleta) => {
    const campusId = Number(atleta.campus_id);
    if (!atletasPorCampus.has(campusId)) return;
    if (!generoValido(atleta.genero)) {
      throw criarErro(`O campus ${campusId} tem atleta sem gênero válido. Revise esse registro antes de continuar.`);
    }
    atletasPorCampus.get(campusId).push({
      id: Number(atleta.id),
      campusId,
      genero: atleta.genero,
      status: atleta.status,
      atletismoProvas: atleta.provas_atletismo,
      tenisMesaParticipacoes: atleta.tenis_mesa_participacoes,
      modalidadeIds: new Set(),
      novo: false,
      atletismoOriginal: false,
      indice: Number(atleta.id)
    });
  });

  const modalidadePorId = new Map();
  modalidadesPorChave.forEach((modalidade) => modalidadePorId.set(Number(modalidade.id), modalidade));
  const esportePorModalidadeId = new Map();
  modalidadesPorChave.forEach((modalidade, chave) => esportePorModalidadeId.set(Number(modalidade.id), chave.split('|')[0]));
  const vinculosPorAtleta = new Map();
  vinculosExistentes.forEach((vinculo) => {
    const atletaId = Number(vinculo.atleta_id);
    if (!vinculosPorAtleta.has(atletaId)) vinculosPorAtleta.set(atletaId, []);
    vinculosPorAtleta.get(atletaId).push(Number(vinculo.modalidade_id));
  });
  atletasPorCampus.forEach((atletas) => atletas.forEach((atleta) => {
    atleta.modalidadeIds = new Set(vinculosPorAtleta.get(atleta.id) || []);
    atleta.atletismoOriginal = atleta.modalidadeIds.has(
      Number(modalidadesPorChave.get(`atletismo|${atleta.genero}`).id)
    );
  }));

  const novosAtletas = [];
  let serial = 1;
  for (const campus of campi) {
    const campusId = Number(campus.id);
    const atuais = atletasPorCampus.get(campusId);
    if (atuais.length > TOTAL_POR_CAMPUS) {
      throw criarErro(`O campus ${campus.nome} já excede o limite de 60. Nenhum dado foi alterado.`);
    }

    for (const genero of ['Masculino', 'Feminino']) {
      const existentesDoGenero = atuais.filter((atleta) => atleta.genero === genero);
      if (existentesDoGenero.length > POR_GENERO) {
        throw criarErro(`O campus ${campus.nome} já tem mais de 30 atletas ${genero}. Nenhum dado foi alterado.`);
      }

      const faltam = POR_GENERO - existentesDoGenero.length;
      for (let indice = 1; indice <= faltam; indice += 1) {
        while (cpfsExistentes.has(String(98000000000 + serial))
            || matriculasExistentes.has(String(800000000000 + serial))) {
          serial += 1;
        }
        const slug = String(campus.slug || campus.nome)
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-');
        const atleta = {
          cpf: String(98000000000 + serial),
          matricula: String(800000000000 + serial),
          campusId,
          nome: `Atleta Teste ${slug} ${genero === 'Masculino' ? 'M' : 'F'} ${String(indice).padStart(2, '0')}`,
          genero,
          dataNascimento: DATA_NASCIMENTO_TESTE,
          status: STATUS_NOVOS,
          modalidadeIds: new Set(),
          atletismoProvas: null,
          tenisMesaParticipacoes: null,
          novo: true,
          atletismoOriginal: false,
          indice: serial
        };
        serial += 1;
        cpfsExistentes.add(atleta.cpf);
        matriculasExistentes.add(atleta.matricula);
        atuais.push(atleta);
        novosAtletas.push(atleta);
      }
    }
  }

  const campusModalidadeIds = new Map(campi.map((campus) => [Number(campus.id), new Set()]));
  const modalidadesPorCampus = new Map(campi.map((campus) => [Number(campus.id), []]));
  const participacoesPorModalidade = new Map();
  const campusModalidadeExcluir = [];
  const atletaModalidadeExcluir = [];
  const planosPorCampusGenero = [];
  const campiTenisMesaPorGenero = new Map();
  for (const [generoIndex, genero] of ['Masculino', 'Feminino'].entries()) {
    const mesaId = Number(modalidadesPorChave.get(`tenis-de-mesa|${genero}`).id);
    campiTenisMesaPorGenero.set(genero, escolherCampiTenisMesa(
      campi,
      atletasPorCampus,
      mesaId,
      Math.min(CHAVES_TENIS_MESA_POR_GENERO, campi.length),
      911 + generoIndex
    ));
  }

  for (let campusIndex = 0; campusIndex < campi.length; campusIndex += 1) {
    const campus = campi[campusIndex];
    const campusId = Number(campus.id);
    for (const [generoIndex, genero] of ['Masculino', 'Feminino'].entries()) {
      const atletas = atletasPorCampus.get(campusId).filter((atleta) => atleta.genero === genero);
      const elegiveis = atletas.filter((atleta) => atleta.status !== 'Reprovado');
      const chavesSelecionadas = new Set();
      const campiTenisMesa = campiTenisMesaPorGenero.get(genero);

      for (const [esporteIndex, esporte] of ESPORTES_COLETIVOS.entries()) {
        const modalidade = modalidadesPorChave.get(`${esporte.chave}|${genero}`);
        const sal = esporteIndex * 37 + generoIndex * 101 + 1;
        const campusParticipantes = escolherCampi(campi, esporte.campi[genero], sal);
        if (!campusParticipantes.has(campusId)) continue;

        const modalidadeId = Number(modalidade.id);
        campusModalidadeIds.get(campusId).add(modalidadeId);
        chavesSelecionadas.add(esporte.chave);
        participacoesPorModalidade.set(modalidadeId, (participacoesPorModalidade.get(modalidadeId) || new Set()).add(campusId));
      }

      const par = campiTenisMesa.has(campusId)
        ? ['atletismo', 'xadrez', 'tenis-de-mesa']
        : ['atletismo', 'xadrez'];
      const mesaId = Number(modalidadesPorChave.get(`tenis-de-mesa|${genero}`).id);
      if (!campiTenisMesa.has(campusId)) campusModalidadeExcluir.push([campusId, mesaId]);
      const mesaExistentes = elegiveis
        .filter((atleta) => atleta.modalidadeIds.has(mesaId))
        .sort((a, b) => hashDeterministico(a.id, campusId + generoIndex)
          - hashDeterministico(b.id, campusId + generoIndex));
      const mesaManter = new Set(campiTenisMesa.has(campusId)
        ? mesaExistentes.slice(0, ATLETAS_POR_CHAVE_TENIS_MESA)
        : []);
      atletas.filter((atleta) => atleta.modalidadeIds.has(mesaId)).forEach((atleta) => {
        if (mesaManter.has(atleta)) return;
        atleta.modalidadeIds.delete(mesaId);
        if (atleta.id) atletaModalidadeExcluir.push([atleta.id, mesaId]);
        atleta.tenisMesaParticipacoes = null;
      });

      for (const chave of par) {
        const modalidade = modalidadesPorChave.get(`${chave}|${genero}`);
        const modalidadeId = Number(modalidade.id);
        campusModalidadeIds.get(campusId).add(modalidadeId);
        chavesSelecionadas.add(chave);
        participacoesPorModalidade.set(modalidadeId, (participacoesPorModalidade.get(modalidadeId) || new Set()).add(campusId));
      }

      for (const modalidadeId of campusModalidadeIds.get(campusId)) {
        const modalidade = modalidadePorId.get(modalidadeId);
        if (!modalidade || modalidade.genero !== genero) continue;
        modalidadesPorCampus.get(campusId).push(modalidadeId);
      }

      const individuaisDoPar = par.map((chave) => ({
        chave,
        modalidadeId: Number(modalidadesPorChave.get(`${chave}|${genero}`).id)
      }));
      const existenteComIndividual = elegiveis.filter((atleta) =>
        [...atleta.modalidadeIds].some((id) => ESPORTES_INDIVIDUAIS.some((esporte) => esporte.chave === esportePorModalidadeId.get(id)))
      );
      const precisamIndividual = elegiveis.filter((atleta) =>
        atleta.novo && !existenteComIndividual.includes(atleta)
      );
      const ordemIndividual = distribuirEmOrdemDeterministica(
        precisamIndividual.map((atleta, indice) => ({ atleta, indice })),
        campusId * 11 + generoIndex * 73
      );

      const mesa = individuaisDoPar.find((item) => item.chave === 'tenis-de-mesa');
      if (mesa) {
        const outras = individuaisDoPar.filter((item) => item.chave !== 'tenis-de-mesa');
        const vagasMesa = Math.max(0, ATLETAS_POR_CHAVE_TENIS_MESA - mesaManter.size);
        ordemIndividual.forEach(({ atleta }, indice) => {
          if (indice < vagasMesa) {
            atleta.modalidadeIds.add(mesa.modalidadeId);
          } else {
            atleta.modalidadeIds.add(outras[(indice - vagasMesa) % outras.length].modalidadeId);
          }
        });

        const inscritosMesa = elegiveis.filter((atleta) => atleta.modalidadeIds.has(mesa.modalidadeId));
        const vagasRestantes = Math.max(0, ATLETAS_POR_CHAVE_TENIS_MESA - inscritosMesa.length);
        const outrasIds = outras.map((item) => item.modalidadeId);
        const paraCompletarChave = distribuirEmOrdemDeterministica(
          elegiveis
            .filter((atleta) => !atleta.modalidadeIds.has(mesa.modalidadeId)
              && outrasIds.some((modalidadeId) => atleta.modalidadeIds.has(modalidadeId)))
            .map((atleta, indice) => ({ atleta, indice })),
          campusId * 313 + generoIndex * 521
        ).slice(0, vagasRestantes);
        paraCompletarChave.forEach(({ atleta }) => {
          const modalidadeSubstituida = outrasIds.find((modalidadeId) => atleta.modalidadeIds.has(modalidadeId));
          if (modalidadeSubstituida) {
            atleta.modalidadeIds.delete(modalidadeSubstituida);
            if (atleta.id) atletaModalidadeExcluir.push([atleta.id, modalidadeSubstituida]);
          }
          atleta.modalidadeIds.add(mesa.modalidadeId);
          atleta.tenisMesaParticipacoes = JSON.stringify(['Individual']);
        });
      } else {
        ordemIndividual.forEach(({ atleta }, indice) => {
          atleta.modalidadeIds.add(individuaisDoPar[indice % individuaisDoPar.length].modalidadeId);
        });
      }

      const modalidadesColetivas = [...chavesSelecionadas]
        .filter((chave) => ESPORTES_COLETIVOS.some((esporte) => esporte.chave === chave))
        .map((chave) => ({
          esporte: ESPORTES_COLETIVOS.find((item) => item.chave === chave),
          modalidadeId: Number(modalidadesPorChave.get(`${chave}|${genero}`).id)
        }));
      const contagemColetivas = new Map(elegiveis.map((atleta) => [atleta, 0]));

      for (const { esporte, modalidadeId } of modalidadesColetivas) {
        const ordemAtletas = distribuirEmOrdemDeterministica(
          elegiveis.map((atleta, indice) => ({ atleta, indice })),
          campusId * 101 + generoIndex * 211 + modalidadeId
        ).sort((a, b) => contagemColetivas.get(a.atleta) - contagemColetivas.get(b.atleta)
          || hashDeterministico(a.indice, modalidadeId) - hashDeterministico(b.indice, modalidadeId));
        const tamanhoElenco = Math.min(esporte.inscritos, ordemAtletas.length);
        if (tamanhoElenco < esporte.inscritos) {
          throw criarErro(`Não há atletas elegíveis suficientes para ${esporte.chave} em ${campus.nome}.`);
        }
        const selecionados = ordemAtletas.slice(0, tamanhoElenco);
        selecionados.forEach(({ atleta }) => {
          if (atleta.modalidadeIds.size >= 3 && !atleta.modalidadeIds.has(modalidadeId)) {
            throw criarErro(`A distribuição excedeu três modalidades para um atleta em ${campus.nome}.`);
          }
          atleta.modalidadeIds.add(modalidadeId);
          contagemColetivas.set(atleta, contagemColetivas.get(atleta) + 1);
        });
      }

      for (const atleta of elegiveis) {
        if (atleta.modalidadeIds.size > 3) {
          throw criarErro(`O atleta ${atleta.id || atleta.nome} ultrapassou três modalidades.`);
        }
        const mesaId = Number(modalidadesPorChave.get(`tenis-de-mesa|${genero}`).id);
        if (atleta.novo && atleta.modalidadeIds.has(mesaId)) {
          atleta.tenisMesaParticipacoes = JSON.stringify(['Individual']);
        }
      }

      planosPorCampusGenero.push({ campusId, genero, quantidade: atletas.length, modalidades: modalidadesColetivas.length + individuaisDoPar.length });
    }
  }

  for (const [generoIndex, genero] of ['Masculino', 'Feminino'].entries()) {
    const modalidadeAtletismoId = Number(modalidadesPorChave.get(`atletismo|${genero}`).id);
    const participantes = [...atletasPorCampus.values()].flat().filter((atleta) =>
      atleta.genero === genero && atleta.status !== 'Reprovado' && atleta.modalidadeIds.has(modalidadeAtletismoId)
    );
    if (!participantes.length) continue;
    const provasPorAtleta = distribuirProvasAtletismo(participantes, 2026 + generoIndex);
    provasPorAtleta.forEach((provas, atleta) => {
      atleta.atletismoProvas = provas.length ? JSON.stringify(provas) : null;
      if (provas.length) return;
      atleta.modalidadeIds.delete(modalidadeAtletismoId);
      if (atleta.id) atletaModalidadeExcluir.push([atleta.id, modalidadeAtletismoId]);
    });
  }

  for (const genero of ['Masculino', 'Feminino']) {
    const mesaId = Number(modalidadesPorChave.get(`tenis-de-mesa|${genero}`).id);
    const inscritosMesa = [...atletasPorCampus.values()].flat()
      .filter((atleta) => atleta.genero === genero && atleta.status !== 'Reprovado' && atleta.modalidadeIds.has(mesaId));
    if (inscritosMesa.length > CHAVES_TENIS_MESA_POR_GENERO * ATLETAS_POR_CHAVE_TENIS_MESA) {
      throw criarErro(`O tênis de mesa ${genero} ultrapassou ${CHAVES_TENIS_MESA_POR_GENERO} chaves de ${ATLETAS_POR_CHAVE_TENIS_MESA} atletas.`);
    }
  }

  for (const atleta of novosAtletas) {
    if (!atleta.modalidadeIds.size || atleta.modalidadeIds.size > 3) {
      throw criarErro(`O atleta fictício ${atleta.nome} ficou sem uma distribuição válida de modalidades.`);
    }
  }

  const campusModalityRows = [];
  campusModalidadeIds.forEach((ids, campusId) => ids.forEach((modalidadeId) => campusModalityRows.push([campusId, modalidadeId])));
  const athleteModalityRows = [];
  atletasPorCampus.forEach((atletas) => atletas.forEach((atleta) => {
    atleta.modalidadeIds.forEach((modalidadeId) => athleteModalityRows.push([atleta.id || atleta.cpf, modalidadeId]));
  }));

  return {
    atletasPorCampus,
    novosAtletas,
    campusModalityRows,
    athleteModalityRows,
    campusModalidadeExcluir,
    atletaModalidadeExcluir,
    modalidadesPorChave,
    modalidadePorId,
    participacoesPorModalidade,
    atualizarProvasAtletismo: [...atletasPorCampus.values()].flat()
      .filter((atleta) => atleta.id
        && atleta.status !== 'Reprovado'
        && (atleta.atletismoOriginal
          || atleta.modalidadeIds.has(Number(modalidadesPorChave.get(`atletismo|${atleta.genero}`).id))))
      .map((atleta) => [atleta.id, atleta.modalidadeIds.has(Number(modalidadesPorChave.get(`atletismo|${atleta.genero}`).id))
        ? atleta.atletismoProvas
        : null]),
    planosPorCampusGenero
  };
}

function imprimirResumo(estado, plano) {
  const edicao = estado.configuracao;
  const totalAtual = estado.atletasExistentes.length;
  const totalNovo = plano.novosAtletas.length;
  console.log(`Edição ${edicao.ano_evento}: ${dataIso(edicao.inicio_evento)} a ${dataIso(edicao.fim_evento)}`);
  console.log(`Campi: ${estado.campi.length}; modalidades: ${plano.modalidadesPorChave.size}; atletas ativos atuais: ${totalAtual}; novos fictícios: ${totalNovo}`);
  console.log('Limites por modalidade:');
  for (const modalidade of [...plano.modalidadesPorChave.values()].sort((a, b) => a.nome.localeCompare(b.nome))) {
    const esporte = chaveEsporte(modalidade.nome);
    const regra = [...ESPORTES_COLETIVOS, ...ESPORTES_INDIVIDUAIS].find((item) => item.chave === esporte);
    const participantes = plano.participacoesPorModalidade.get(Number(modalidade.id))?.size || 0;
    const atletasInscritos = [...plano.atletasPorCampus.values()].flat()
      .filter((atleta) => atleta.status !== 'Reprovado' && atleta.modalidadeIds.has(Number(modalidade.id))).length;
    console.log(`  ${modalidade.nome}: máximo ${regra.limite}, campi participantes ${participantes}, atletas ${atletasInscritos}`);
  }
  for (const genero of ['Masculino', 'Feminino']) {
    const atletasAtletismo = [...plano.atletasPorCampus.values()].flat()
      .filter((atleta) => atleta.genero === genero
        && atleta.modalidadeIds.has(Number(plano.modalidadesPorChave.get(`atletismo|${genero}`).id)));
    const quantidades = PROVAS_ATLETISMO.map((prova) => atletasAtletismo.filter((atleta) =>
      JSON.parse(atleta.atletismoProvas || '[]').includes(prova)
    ).length);
    console.log(`  Provas atletismo ${genero}: ${quantidades.join(', ')}`);
  }
  console.log('Total projetado por campus:');
  for (const campus of estado.campi) {
    const quantidadeAtual = estado.atletasExistentes.filter((atleta) => Number(atleta.campus_id) === Number(campus.id)).length;
    console.log(`  ${campus.nome}: ${quantidadeAtual + plano.novosAtletas.filter((atleta) => atleta.campusId === Number(campus.id)).length}/${TOTAL_POR_CAMPUS}`);
  }
}

async function aplicarPlano(plano) {
  const novasLinhas = plano.novosAtletas.map((atleta) => [
    atleta.campusId,
    atleta.nome,
    atleta.cpf,
    atleta.matricula,
    atleta.genero,
    atleta.dataNascimento,
    atleta.status,
    atleta.atletismoProvas,
    atleta.tenisMesaParticipacoes
  ]);
  const cpfsNovos = plano.novosAtletas.map((atleta) => atleta.cpf);

  await db.withTransaction(async () => {
    for (const modalidade of plano.modalidadesPorChave.values()) {
      const regra = [...ESPORTES_COLETIVOS, ...ESPORTES_INDIVIDUAIS]
        .find((item) => item.chave === chaveEsporte(modalidade.nome));
      await db.query('UPDATE modalidades SET limite_inscritos = ? WHERE id = ?', [regra.limite, modalidade.id]);
    }

    for (const modalidadeId of new Set(plano.campusModalidadeExcluir.map(([, id]) => id))) {
      const campusIds = plano.campusModalidadeExcluir
        .filter(([, id]) => id === modalidadeId)
        .map(([campusId]) => campusId);
      if (campusIds.length) {
        await db.query('DELETE FROM campus_modalidade WHERE modalidade_id = ? AND campus_id IN (?)', [modalidadeId, campusIds]);
      }
    }

    for (const modalidadeId of new Set(plano.atletaModalidadeExcluir.map(([, id]) => id))) {
      const atletaIds = plano.atletaModalidadeExcluir
        .filter(([, id]) => id === modalidadeId)
        .map(([atletaId]) => atletaId);
      if (atletaIds.length) {
        await db.query('DELETE FROM atleta_modalidade WHERE modalidade_id = ? AND atleta_id IN (?)', [modalidadeId, atletaIds]);
        const modalidade = plano.modalidadesPorChave.get(`tenis-de-mesa|Masculino`);
        const modalidadeFeminina = plano.modalidadesPorChave.get(`tenis-de-mesa|Feminino`);
        if ([modalidade, modalidadeFeminina].some((item) => Number(item.id) === modalidadeId)) {
          await db.query('UPDATE atletas SET tenis_mesa_participacoes = NULL WHERE id IN (?)', [atletaIds]);
        }
      }
    }

    if (plano.campusModalityRows.length) {
      await db.query(
        'INSERT IGNORE INTO campus_modalidade (campus_id, modalidade_id) VALUES ?',
        [plano.campusModalityRows]
      );
    }

    if (novasLinhas.length) {
      await db.query(
        `INSERT INTO atletas
           (campus_id, nome, cpf, matricula, genero, data_nascimento, status, provas_atletismo, tenis_mesa_participacoes)
         VALUES ?`,
        [novasLinhas]
      );
    }

    const atletaIdPorCpf = new Map();
    if (cpfsNovos.length) {
      const marcadores = cpfsNovos.map(() => '?').join(', ');
      const [linhas] = await db.query(`SELECT id, cpf FROM atletas WHERE cpf IN (${marcadores})`, cpfsNovos);
      linhas.forEach((linha) => atletaIdPorCpf.set(String(linha.cpf), Number(linha.id)));
    }

    const vinculos = [];
    for (const atletas of plano.atletasPorCampus.values()) {
      for (const atleta of atletas) {
        const atletaId = atleta.id || atletaIdPorCpf.get(atleta.cpf);
        if (!atletaId) throw criarErro(`Não foi possível localizar o ID do atleta ${atleta.nome || atleta.id}.`);
        atleta.modalidadeIds.forEach((modalidadeId) => vinculos.push([atletaId, modalidadeId]));
      }
    }

    if (vinculos.length) {
      await db.query('INSERT IGNORE INTO atleta_modalidade (atleta_id, modalidade_id) VALUES ?', [vinculos]);
    }

    if (plano.atualizarProvasAtletismo.length) {
      const cases = plano.atualizarProvasAtletismo.map(() => 'WHEN ? THEN ?').join(' ');
      const ids = plano.atualizarProvasAtletismo.map(([id]) => id);
      const parametros = plano.atualizarProvasAtletismo.flatMap(([id, provas]) => [id, provas]);
      await db.query(
        `UPDATE atletas SET provas_atletismo = CASE id ${cases} ELSE provas_atletismo END WHERE id IN (?)`,
        [...parametros, ids]
      );
    }
  });
}

(async () => {
  try {
    const estado = await carregarEstado();
    const plano = prepararPlano(estado);
    imprimirResumo(estado, plano);

    if (APENAS_SIMULAR) {
      console.log('Simulação concluída: nenhum registro foi alterado.');
      return;
    }

    await aplicarPlano(plano);
    console.log('População concluída. Os atletas fictícios novos estão em análise.');
  } catch (error) {
    console.error(`Falha na população: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
})();