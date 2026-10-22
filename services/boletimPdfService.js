const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const CORES = {
  azul: '#17224C',
  azulCabecalho: '#244F7D',
  verde: '#E3EFDC',
  cinzaLinha: '#252525',
  cinzaAlternado: '#E8EDF2',
  texto: '#17212B',
  cinza: '#555555',
  branco: '#FFFFFF'
};
const MARGEM = 34;
const ALTURA_CABECALHO = 56;
const ALTURA_RODAPE = 24;
const TAMANHO_FONTE_TABELA = 10.5;

function texto(valor, fallback = '-') {
  const valorTexto = String(valor == null ? '' : valor).trim();
  return valorTexto || fallback;
}

function nomeParticipante(item) {
  const atleta = String(item.atleta || '').trim();
  const campus = String(item.campus || '').trim();
  if (atleta && campus) return `${atleta} (${campus})`;
  return atleta || campus || '—';
}

function dataBrasileira(valor) {
  if (!valor) return '—';
  const partes = String(valor).slice(0, 10).split('-');
  return partes.length === 3 ? `${partes[2]}/${partes[1]}/${partes[0]}` : String(valor);
}

function nomeModalidade(modalidade) {
  const nome = String(modalidade.nome || modalidade.modalidade || 'Modalidade').trim();
  const genero = String(modalidade.genero || '').trim();
  if (!genero || nome.toLocaleLowerCase('pt-BR').endsWith(genero.toLocaleLowerCase('pt-BR'))) return nome;
  return `${nome} ${genero}`;
}

function normalizarTexto(valor) {
  return String(valor || '').trim().toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function prioridadeSubCategoriaTenis(subCategoria) {
  const categoria = String(subCategoria || '').toLocaleLowerCase('pt-BR');
  if (categoria === 'individual') return 0;
  if (categoria === 'dupla') return 1;
  return 2;
}

function participanteDoJogo(jogo, lado) {
  const atleta = String(jogo[lado === 'casa' ? 'atletaCasa' : 'atletaFora'] || '').trim();
  const campus = String(jogo[lado === 'casa' ? 'casa' : 'fora'] || '').trim();
  return atleta && campus && normalizarTexto(atleta) !== normalizarTexto(campus)
    ? `${atleta} (${campus})`
    : atleta || campus || '—';
}

function vencedorDoJogo(jogo) {
  const casaId = String(jogo.casaId || '');
  const foraId = String(jogo.foraId || '');
  const vencedorId = String(jogo.vencedorCampus || '');
  if (vencedorId && vencedorId === casaId) return 'casa';
  if (vencedorId && vencedorId === foraId) return 'fora';

  const placarCasa = Number(jogo.placarCasa);
  const placarFora = Number(jogo.placarFora);
  if (Number.isFinite(placarCasa) && Number.isFinite(placarFora) && placarCasa !== placarFora) {
    return placarCasa > placarFora ? 'casa' : 'fora';
  }

  const disputaCasa = Number(jogo.disputaPontos1);
  const disputaFora = Number(jogo.disputaPontos2);
  if (Number.isFinite(disputaCasa) && Number.isFinite(disputaFora) && disputaCasa !== disputaFora) {
    return disputaCasa > disputaFora ? 'casa' : 'fora';
  }
  return null;
}

function montarClassificacaoFinal(podios = [], jogos = [], grupos = []) {
  if (!podios.length) return [];

  const partidasTerceiroLugar = jogos.filter((jogo) => normalizarTexto(jogo.fase).includes('terceiro lugar'));
  const chavesGrupo = new Set(grupos.map((linha) => linha.chaveId || 'geral'));
  const classificacaoGrupo = chavesGrupo.size === 1
    ? [...grupos].sort((a, b) =>
      Number(b.pontos || 0) - Number(a.pontos || 0) ||
      Number(b.vitorias || 0) - Number(a.vitorias || 0) ||
      Number(b.saldo || 0) - Number(a.saldo || 0)
    )
    : [];

  return podios.flatMap((podio) => {
    const nomePodio = String(podio.nome || podio.modalidade || '').trim();
    const nomeModalidadePodio = String(podio.modalidade || '').trim();
    const sufixo = nomePodio && nomeModalidadePodio && normalizarTexto(nomePodio).startsWith(normalizarTexto(nomeModalidadePodio))
      ? nomePodio.slice(nomeModalidadePodio.length).replace(/^[\s(-]+|[\s)]+$/g, '')
      : '';
    const terceiraPartida = partidasTerceiroLugar.find((jogo) => (
      !sufixo || normalizarTexto(jogo.subCategoria) === normalizarTexto(sufixo)
    ));
    const vencedor = terceiraPartida ? vencedorDoJogo(terceiraPartida) : null;
    const terceiro = vencedor ? participanteDoJogo(terceiraPartida, vencedor) : '';
    const quarto = vencedor
      ? participanteDoJogo(terceiraPartida, vencedor === 'casa' ? 'fora' : 'casa')
      : '';

    return [
      ['1º Lugar', podio.campeao],
      ['2º Lugar', podio.vice],
      ['3º Lugar', terceiro || (classificacaoGrupo[2] && nomeParticipante(classificacaoGrupo[2]))],
      ['4º Lugar', quarto || (classificacaoGrupo[3] && nomeParticipante(classificacaoGrupo[3]))]
    ];
  });
}

function montarTabelaChaveamento(chaves = [], grupos = []) {
  const colunas = chaves.length
    ? chaves.map((chave) => ({
      titulo: chave.nomeChave || `Chave ${chave.numeroChave || ''}`.trim(),
      participantes: grupos
        .filter((grupo) => String(grupo.chaveId) === String(chave.id))
        .map(nomeParticipante)
    }))
    : grupos.length
      ? [{ titulo: 'Classificação', participantes: grupos.map(nomeParticipante) }]
      : [];

  const maximoColunasPorTabela = 3;
  const tabelas = [];
  for (let inicio = 0; inicio < colunas.length; inicio += maximoColunasPorTabela) {
    const colunasDaTabela = colunas.slice(inicio, inicio + maximoColunasPorTabela);
    const quantidadeLinhas = Math.max(0, ...colunasDaTabela.map((coluna) => coluna.participantes.length));
    tabelas.push({
      cabecalhos: colunasDaTabela.map((coluna) => coluna.titulo),
      linhas: Array.from({ length: quantidadeLinhas }, (_, indice) =>
        colunasDaTabela.map((coluna) => coluna.participantes[indice] || '')
      )
    });
  }
  return tabelas;
}

function ordenarModalidadesPorNome(modalidades = []) {
  return [...modalidades].sort((a, b) =>
    nomeModalidade(a).localeCompare(nomeModalidade(b), 'pt-BR', { sensitivity: 'base' })
  );
}

function montarTabelaClassificacao(linhas = [], usaSets = false, tenisMesa = false) {
  const ordenadas = [...linhas].sort((a, b) =>
    Number(b.pontos || 0) - Number(a.pontos || 0) ||
    Number(b.vitorias || 0) - Number(a.vitorias || 0) ||
    Number(b.saldo || 0) - Number(a.saldo || 0)
  );

  if (tenisMesa) {
    return {
      cabecalhos: usaSets
        ? ['Pos.', 'Atleta / campus', 'J', 'Pts.', 'V', 'SG', 'SP', 'Saldo']
        : ['Pos.', 'Atleta / campus', 'J', 'Pts.', 'V', 'Feitos', 'Sofridos', 'Saldo'],
      linhas: ordenadas.map((linha, indice) => [
        indice + 1,
        nomeParticipante(linha),
        linha.jogosJogados,
        linha.pontos,
        linha.vitorias,
        usaSets ? linha.setsGanhos : linha.pontosPro,
        usaSets ? linha.setsPerdidos : linha.pontosContra,
        usaSets ? Number(linha.setsGanhos || 0) - Number(linha.setsPerdidos || 0) : linha.saldo
      ])
    };
  }

  return {
    cabecalhos: usaSets
      ? ['Pos.', 'Campus', 'Nº. Jogos', 'Pontos', 'Vitórias', 'Sets ganhos', 'Sets perdidos', 'Saldo de sets']
      : ['Pos.', 'Campus', 'Nº. Jogos', 'Pontos', 'Vitórias', 'Feitos', 'Sofridos', 'Saldo'],
    linhas: ordenadas.map((linha, indice) => [
      indice + 1,
      linha.campus || nomeParticipante(linha),
      linha.jogosJogados,
      linha.pontos,
      linha.vitorias,
      usaSets ? linha.setsGanhos : linha.pontosPro,
      usaSets ? linha.setsPerdidos : linha.pontosContra,
      usaSets ? Number(linha.setsGanhos || 0) - Number(linha.setsPerdidos || 0) : linha.saldo
    ])
  };
}

function gerarPdfBoletim({ resumo = {}, boletim = {}, modalidades = [], completo = null } = {}) {
  return new Promise((resolve, reject) => {
    const ano = Number(resumo.ano || boletim.ano_jifc || new Date().getFullYear());
    const listaPodios = Array.isArray(modalidades) ? modalidades : [];
    const dados = completo && typeof completo === 'object' ? completo : null;
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: ALTURA_CABECALHO + 22, right: MARGEM, bottom: ALTURA_RODAPE + 10, left: MARGEM },
      bufferPages: true,
      info: {
        Title: `Boletim Final - JIFC ${ano}`,
        Author: 'Jogos Internos do IFC',
        Subject: `Boletim final do JIFC ${ano}`
      }
    });
    const partes = [];

    doc.on('data', (parte) => partes.push(parte));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(partes)));

    const larguraUtil = () => doc.page.width - MARGEM * 2;
    const limiteInferior = () => doc.page.height - doc.page.margins.bottom;
    const logo = path.join(__dirname, '..', 'public', 'imagens', 'jifc original-Picsart-AiImageEnhancer.jfif');
    let secaoAtual = '';

    function cabecalhoPagina(titulo, opcoes = {}) {
      const y = 24;
      const caixaLogoLargura = 62;
      const caixaLogoAltura = 32;
      const caixaTituloX = MARGEM + caixaLogoLargura;
      const caixaTituloLargura = larguraUtil() - caixaLogoLargura;
      doc.save();
      doc.lineWidth(0.8).strokeColor(CORES.cinzaLinha);
      doc.rect(MARGEM, y, caixaLogoLargura, caixaLogoAltura).stroke();
      doc.rect(caixaTituloX, y, caixaTituloLargura, caixaLogoAltura).stroke();
      if (fs.existsSync(logo)) {
        doc.image(logo, MARGEM + 4, y + 3, { fit: [caixaLogoLargura - 8, caixaLogoAltura - 6], align: 'center', valign: 'center' });
      }
      doc.fillColor(CORES.texto).font('Helvetica-Bold').fontSize(opcoes.tamanhoTitulo || 13)
        .text(texto(titulo, '').toLocaleUpperCase('pt-BR'), caixaTituloX + 6, y + 9, {
          width: caixaTituloLargura - 12,
          height: caixaLogoAltura - 12,
          align: 'center',
          ellipsis: true
        });
      if (opcoes.detalhe) {
        doc.fillColor(CORES.texto).font('Helvetica-Bold').fontSize(9)
          .text(opcoes.detalhe, MARGEM, y + caixaLogoAltura + 3, { width: larguraUtil() });
      }
      doc.restore();
      doc.y = opcoes.detalhe ? y + caixaLogoAltura + 29 : y + caixaLogoAltura + 15;
      secaoAtual = titulo;
    }

    function novaPagina(titulo, opcoes = {}) {
      doc.addPage();
      cabecalhoPagina(titulo, opcoes);
    }

    const garantirEspaco = (altura) => {
      if (doc.y + altura > limiteInferior()) {
        novaPagina('');
      }
    };

    function tituloSecao(titulo) {
      garantirEspaco(22);
      const y = doc.y;
      doc.save();
      doc.rect(MARGEM, y, larguraUtil(), 19).fill(CORES.verde).stroke(CORES.cinzaLinha);
      doc.fillColor(CORES.texto).font('Helvetica-Bold').fontSize(9)
        .text(texto(titulo, '').toLocaleUpperCase('pt-BR'), MARGEM + 4, y + 5, {
          width: larguraUtil() - 8,
          height: 11,
          align: 'center',
          ellipsis: true
        });
      doc.restore();
      doc.y = y + 19;
    }

    function paragrafo(valor, opcoes = {}) {
      const corpo = texto(valor, '');
      if (!corpo) return;
      const fonte = opcoes.fonte || 'Helvetica';
      const tamanho = opcoes.tamanho || 9;
      const largura = opcoes.largura || larguraUtil();
      const altura = doc.heightOfString(corpo, { font: fonte, fontSize: tamanho, width: largura, lineGap: 2 }) + 8;
      garantirEspaco(altura);
      doc.fillColor(opcoes.cor || CORES.texto).font(fonte).fontSize(tamanho)
        .text(corpo, { width: largura, lineGap: 2 });
      doc.moveDown(0.35);
    }

    function tabela(cabecalhos, linhas, larguras, opcoes = {}) {
      const tamanhoFonte = opcoes.tamanhoFonte || TAMANHO_FONTE_TABELA;
      const alturaCabecalho = opcoes.alturaCabecalho || 20;
      const preenchimento = opcoes.preenchimento == null ? 4 : opcoes.preenchimento;
      const somaLarguras = larguras.reduce((total, largura) => total + largura, 0);
      const escala = somaLarguras > larguraUtil() ? larguraUtil() / somaLarguras : 1;
      const largurasAjustadas = larguras.map((largura) => largura * escala);
      const larguraTabela = largurasAjustadas.reduce((total, largura) => total + largura, 0);
      const xInicial = MARGEM + Math.max(0, (larguraUtil() - larguraTabela) / 2);

      const desenharCabecalho = () => {
        garantirEspaco(alturaCabecalho + 8);
        const y = doc.y;
        doc.save();
        doc.rect(xInicial, y, larguraTabela, alturaCabecalho)
          .fill(opcoes.corCabecalho || CORES.azulCabecalho)
          .stroke(CORES.cinzaLinha);
        let x = xInicial;
        cabecalhos.forEach((cabecalho, indice) => {
          const tamanhoFonteCabecalho = opcoes.tamanhoFonteCabecalho || Math.min(
            tamanhoFonte,
            Math.max(7.5, largurasAjustadas[indice] / 6)
          );
          doc.fillColor(opcoes.corTextoCabecalho || CORES.branco).font('Helvetica-Bold').fontSize(tamanhoFonteCabecalho)
            .text(texto(cabecalho, '').toLocaleUpperCase('pt-BR'), x + preenchimento, y + 4, {
              width: largurasAjustadas[indice] - preenchimento * 2,
              height: alturaCabecalho - 6,
              align: opcoes.alinhamentos && opcoes.alinhamentos[indice] || 'center',
              ellipsis: true
            });
          x += largurasAjustadas[indice];
        });
        doc.restore();
        doc.y = y + alturaCabecalho;
      };

      desenharCabecalho();
      (Array.isArray(linhas) ? linhas : []).forEach((linha, indiceLinha) => {
        const celulas = cabecalhos.map((_, indice) => texto(linha[indice], '-'));
        const linhasCelulas = celulas.map((celula, indice) => {
          const fonte = opcoes.negritoColuna === indice ? 'Helvetica-Bold' : 'Helvetica';
          const largura = Math.max(1, largurasAjustadas[indice] - preenchimento * 2);
          const linhasQuebradas = [];
          doc.font(fonte).fontSize(tamanhoFonte);

          celula.split(/\r?\n/).forEach((paragrafo) => {
            const palavras = paragrafo.split(/\s+/).filter(Boolean);
            let linhaAtual = '';
            palavras.forEach((palavra) => {
              const candidata = linhaAtual ? `${linhaAtual} ${palavra}` : palavra;
              if (doc.widthOfString(candidata) <= largura) {
                linhaAtual = candidata;
                return;
              }
              if (linhaAtual) linhasQuebradas.push(linhaAtual);
              linhaAtual = '';
              let parte = '';
              for (const caractere of palavra) {
                if (parte && doc.widthOfString(`${parte}${caractere}`) > largura) {
                  linhasQuebradas.push(parte);
                  parte = '';
                }
                parte += caractere;
              }
              linhaAtual = parte;
            });
            linhasQuebradas.push(linhaAtual);
          });

          return linhasQuebradas.length ? linhasQuebradas : [''];
        });
        const totalLinhas = Math.max(...linhasCelulas.map((linhasTexto) => linhasTexto.length));
        let inicioLinha = 0;
        const alturaLinhaTexto = tamanhoFonte * 1.2;
        const corFundo = indiceLinha === 0 && opcoes.corPrimeiraLinha
          ? opcoes.corPrimeiraLinha
          : (indiceLinha % 2 ? CORES.cinzaAlternado : CORES.branco);

        while (inicioLinha < totalLinhas) {
          const alturaMinima = Math.max(opcoes.alturaLinha || 17, alturaLinhaTexto + preenchimento * 2);
          if (doc.y + alturaMinima > limiteInferior()) {
            novaPagina('');
            desenharCabecalho();
          }
          const linhasDisponiveis = Math.max(1, Math.floor(
            (limiteInferior() - doc.y - preenchimento * 2) / alturaLinhaTexto
          ));
          const quantidadeLinhas = Math.min(totalLinhas - inicioLinha, linhasDisponiveis);
          const alturaTexto = quantidadeLinhas * alturaLinhaTexto;
          const alturaLinha = Math.max(opcoes.alturaLinha || 17, alturaTexto + preenchimento * 2);
          const y = doc.y;

          doc.save();
          doc.rect(xInicial, y, larguraTabela, alturaLinha).fill(corFundo).stroke(CORES.cinzaLinha);
          let x = xInicial;
          linhasCelulas.forEach((linhasTexto, indice) => {
            const alinhamento = opcoes.alinhamentos && opcoes.alinhamentos[indice] || 'center';
            const linhasVisiveis = linhasTexto.slice(inicioLinha, inicioLinha + quantidadeLinhas);
            doc.fillColor(CORES.texto)
              .font(opcoes.negritoColuna === indice ? 'Helvetica-Bold' : 'Helvetica')
              .fontSize(tamanhoFonte)
              .text(linhasVisiveis.join('\n'), x + preenchimento, y + Math.max(2, (alturaLinha - alturaTexto) / 2), {
                width: largurasAjustadas[indice] - preenchimento * 2,
                height: alturaLinha - preenchimento * 2,
                align: alinhamento,
                lineGap: 0
              });
            x += largurasAjustadas[indice];
            if (indice < celulas.length - 1) {
              doc.moveTo(x, y).lineTo(x, y + alturaLinha).stroke(CORES.cinzaLinha);
            }
          });
          doc.restore();
          doc.y = y + alturaLinha;
          inicioLinha += quantidadeLinhas;

          if (inicioLinha < totalLinhas) {
            novaPagina('');
            desenharCabecalho();
          }
        }
      });
      doc.moveDown(0.4);
    }

    function adicionarCapa() {
      if (fs.existsSync(logo)) {
        doc.image(logo, (doc.page.width - 270) / 2, 75, { fit: [270, 120], align: 'center', valign: 'center' });
      }
      doc.fillColor(CORES.azul).font('Helvetica-Bold').fontSize(17)
        .text('Boletim final', MARGEM, 255, { width: larguraUtil(), align: 'center' });
      doc.fillColor(CORES.texto).font('Helvetica-Bold').fontSize(27)
        .text('Jogos Internos do IFC', MARGEM, 295, { width: larguraUtil(), align: 'center' });
      doc.fillColor(CORES.azul).font('Helvetica-Bold').fontSize(23)
        .text(`JIFC/${ano}`, MARGEM, 340, { width: larguraUtil(), align: 'center' });
      doc.fillColor(CORES.cinza).font('Helvetica').fontSize(10)
        .text(dataBrasileira(resumo.dataGeracao || boletim.criado_em), MARGEM, 450, {
          width: larguraUtil(),
          align: 'center'
        });
      novaPagina('Atletismo', { detalhe: `DATA: ${dataBrasileira(dados && dados.geradoEm || resumo.dataGeracao)}    CHAMADA GERAL: 08:30 horas` });
    }

    function adicionarDetalheModalidades() {
      const modalidadesDados = Array.isArray(dados && dados.modalidades) ? dados.modalidades : [];
      if (!modalidadesDados.length) {
        novaPagina('Modalidades');
        paragrafo('O boletim salvo não contém os dados detalhados das modalidades.');
        return;
      }

      const grupos = Array.isArray(dados.grupos) ? dados.grupos : [];
      const jogos = Array.isArray(dados.jogos) ? dados.jogos : [];
      const chaves = Array.isArray(dados.chaves) ? dados.chaves : [];
      const inscricoes = Array.isArray(dados.inscricoes) ? dados.inscricoes : [];

      ordenarModalidadesPorNome(modalidadesDados.filter((modalidade) => (
        !/atletismo|xadrez/i.test(String(modalidade.base || modalidade.nome || modalidade.modalidade || ''))
      ))).forEach((modalidade) => {
        const id = Number(modalidade.id);
        const gruposModalidade = grupos.filter((grupo) => Number(grupo.modalidadeId) === id);
        const jogosModalidade = jogos.filter((jogo) => Number(jogo.modalidadeId) === id);
        const tenisMesa = /t[eê]nis\s+de\s+mesa/i.test(String(modalidade.base || modalidade.nome || modalidade.modalidade || ''));
        const chavesModalidade = chaves
          .filter((chave) => Number(chave.modalidadeId) === id)
          .sort((a, b) =>
            prioridadeSubCategoriaTenis(a.subCategoria) - prioridadeSubCategoriaTenis(b.subCategoria) ||
            Number(a.numeroChave || 0) - Number(b.numeroChave || 0)
          );
        const nome = nomeModalidade(modalidade);
        novaPagina(nome);

        const participantes = [...new Set([
          ...inscricoes.filter((item) => Number(item.modalidadeId) === id).map((item) => item.campus),
          ...gruposModalidade.map((item) => nomeParticipante(item)),
          ...jogosModalidade.flatMap((jogo) => [jogo.atletaCasa || jogo.casa, jogo.atletaFora || jogo.fora])
        ].map((item) => String(item || '').trim()).filter(Boolean))];
        if (participantes.length) {
          tabela(['Equipes participantes'], [[participantes.join(' - ')]], [larguraUtil()], {
            alinhamentos: ['center'],
            alturaLinha: 20,
            corCabecalho: CORES.cinzaAlternado,
            corTextoCabecalho: CORES.texto,
            corPrimeiraLinha: CORES.verde
          });
        } else {
          tituloSecao('Equipes participantes');
          paragrafo('Não há participantes registrados para esta modalidade.');
        }

        tituloSecao('Chaveamento');
        const categoriasChaveamento = tenisMesa
          ? [...new Set(chavesModalidade.map((chave) => String(chave.subCategoria || 'geral')))]
          : [null];
        if (chavesModalidade.length) {
          categoriasChaveamento.forEach((subCategoria) => {
            const chavesDaCategoria = subCategoria == null
              ? chavesModalidade
              : chavesModalidade.filter((chave) => String(chave.subCategoria || 'geral') === subCategoria);
            const gruposDaCategoria = subCategoria == null
              ? gruposModalidade
              : gruposModalidade.filter((grupo) =>
                chavesDaCategoria.some((chave) => String(chave.id) === String(grupo.chaveId))
              );
            if (tenisMesa) {
              tituloSecao(prioridadeSubCategoriaTenis(subCategoria) === 1 ? 'Duplas' : 'Individual');
            }
            montarTabelaChaveamento(chavesDaCategoria, gruposDaCategoria).forEach((tabelaChaveamento) => {
              tabela(
                tabelaChaveamento.cabecalhos,
                tabelaChaveamento.linhas,
                tabelaChaveamento.cabecalhos.map(() => larguraUtil() / tabelaChaveamento.cabecalhos.length),
                { alinhamentos: tabelaChaveamento.cabecalhos.map(() => 'center') }
              );
            });
          });
        } else if (gruposModalidade.length) {
          montarTabelaChaveamento([], gruposModalidade).forEach((tabelaChaveamento) => {
            tabela(tabelaChaveamento.cabecalhos, tabelaChaveamento.linhas, [larguraUtil()]);
          });
        } else {
          paragrafo('Chaves não cadastradas.');
        }

        tituloSecao('Tabela de jogos');
        if (jogosModalidade.length) {
          const jogosPorDiaEFase = new Map();
          jogosModalidade.forEach((jogo, indice) => {
            const data = dataBrasileira(jogo.data);
            const fase = jogo.fase || (jogo.rodada ? `Rodada ${jogo.rodada}` : 'Jogos');
            const chaveGrupo = `${data}|${fase}`;
            if (!jogosPorDiaEFase.has(chaveGrupo)) {
              jogosPorDiaEFase.set(chaveGrupo, { data, fase, jogos: [] });
            }
            jogosPorDiaEFase.get(chaveGrupo).jogos.push({ ...jogo, indice });
          });

          jogosPorDiaEFase.forEach((grupo) => {
            tituloSecao(grupo.data);
            tituloSecao(grupo.fase);
            tabela(
              ['Jogo', 'Hora', 'Chave', 'Quadra', 'Equipe', 'Pontos', 'Equipe'],
              grupo.jogos.map((jogo) => {
                const sets = Array.isArray(jogo.sets) && jogo.sets.length
                  ? ` (${jogo.sets.map((set) => `${set.pontosCasa}-${set.pontosFora}`).join(' / ')})`
                  : '';
                const resultado = jogo.cancelado
                  ? 'Cancelado'
                  : `${jogo.placarCasa ?? 0} - ${jogo.placarFora ?? 0}${jogo.wo ? ' W.O.' : ''}${sets}`;
                return [
                  jogo.numeroJogo || jogo.indice + 1,
                  jogo.horario,
                  jogo.chave || '—',
                  jogo.local,
                  jogo.atletaCasa || jogo.casa || jogo.rotuloCasa,
                  resultado,
                  jogo.atletaFora || jogo.fora || jogo.rotuloFora
                ];
              }),
              [30, 44, 46, 49, 130, 54, larguraUtil() - 353],
              { tamanhoFonte: 9.5 }
            );
          });
        } else {
          paragrafo('Não há jogos registrados para esta modalidade.');
        }

        tituloSecao('Classificação na chave');
        if (gruposModalidade.length) {
          const gruposPorChave = new Map();
          gruposModalidade.forEach((grupo) => {
            const chaveId = grupo.chaveId == null ? 'geral' : String(grupo.chaveId);
            if (!gruposPorChave.has(chaveId)) gruposPorChave.set(chaveId, []);
            gruposPorChave.get(chaveId).push(grupo);
          });

          gruposPorChave.forEach((linhas, chaveId) => {
            if (chaveId !== 'geral') {
              const chave = chavesModalidade.find((item) => String(item.id) === chaveId);
              const nomeChave = chave && chave.nomeChave ? chave.nomeChave : 'Classificação da chave';
              tituloSecao(tenisMesa && chave
                ? `${prioridadeSubCategoriaTenis(chave.subCategoria) === 1 ? 'Duplas' : 'Individual'} - ${nomeChave}`
                : nomeChave);
            }
            const usaSets = linhas.some((linha) => Number(linha.setsGanhos || 0) || Number(linha.setsPerdidos || 0));
            const classificacao = montarTabelaClassificacao(linhas, usaSets, tenisMesa);
            const largurasClassificacao = tenisMesa
              ? [34, larguraUtil() * 0.38, 32, 38, 30, 38, 38, larguraUtil() - (34 + larguraUtil() * 0.38 + 32 + 38 + 30 + 38 + 38)]
              : [38, larguraUtil() * 0.27, 48, 48, 54, 54, 54, larguraUtil() - (38 + larguraUtil() * 0.27 + 48 + 48 + 54 + 54 + 54)];
            tabela(
              classificacao.cabecalhos,
              classificacao.linhas,
              largurasClassificacao,
              { tamanhoFonte: tenisMesa ? 9 : 9.5, alinhamentos: ['center', 'left', 'center', 'center', 'center', 'center', 'center', 'center'] }
            );
          });
        } else {
          paragrafo('Não há classificação registrada para esta modalidade.');
        }

        const podiosDaModalidade = listaPodios.filter((item) => (
          Number(item.modalidade_id || item.modalidadeId) === id ||
          normalizarTexto(item.nome || item.modalidade) === normalizarTexto(nome)
        ));
        if (podiosDaModalidade.length) {
          tituloSecao('Classificação final');
          tabela(['Posição', 'Campus / atleta'], montarClassificacaoFinal(
            podiosDaModalidade,
            jogosModalidade,
            gruposModalidade
          ), [100, larguraUtil() - 100], {
            tamanhoFonte: 11,
            alturaCabecalho: 25,
            alturaLinha: 26,
            preenchimento: 6,
            alinhamentos: ['center', 'left']
          });
        }
      });
    }

    function adicionarAtletismo() {
      const atletismo = dados && dados.atletismo;
      const provas = Array.isArray(atletismo && atletismo.provas) ? atletismo.provas : [];
      const modalidadesAtletismo = Array.isArray(dados && dados.modalidades)
        ? dados.modalidades.filter((modalidade) => /atletismo/i.test(String(modalidade.nome || modalidade.base || '')))
        : [];

      if (provas.length) {
        tabela(
          ['Prova', 'Naipe'],
          provas.map((prova) => [prova.nome, prova.genero]),
          [larguraUtil() * 0.7, larguraUtil() * 0.3],
          { alinhamentos: ['left', 'center'], alturaLinha: 16 }
        );
      } else {
        paragrafo(modalidadesAtletismo.length
          ? 'O boletim identifica a modalidade de atletismo, mas o snapshot não contém provas cadastradas.'
          : 'Não há provas de atletismo registradas neste boletim.');
      }

      const generos = [...new Set(provas.map((prova) => String(prova.genero || '').trim()).filter(Boolean))];
      generos.forEach((genero) => {
        novaPagina(`Atletismo ${genero}`);
        const provasDoGenero = provas.filter((prova) => String(prova.genero || '').trim() === genero);
        provasDoGenero.forEach((prova) => {
          const resultados = Array.isArray(prova.resultados) ? prova.resultados : [];
          const porEtapa = new Map();
          resultados.forEach((resultado) => {
            const etapa = String(resultado.etapa || 'prova').trim();
            const bateria = Number(resultado.bateria || 0);
            const titulo = `${prova.nome || 'Prova'}${etapa && etapa !== 'prova' ? ` - ${etapa}` : ''}${bateria ? ` - ${bateria}ª bateria` : ''}`;
            if (!porEtapa.has(titulo)) porEtapa.set(titulo, []);
            porEtapa.get(titulo).push(resultado);
          });
          if (!porEtapa.size) porEtapa.set(prova.nome || 'Prova', []);

          porEtapa.forEach((linhas, titulo) => {
            tituloSecao(`Prova - ${titulo}`);
            tabela(
              ['Raia', 'Col.', 'Nome da atleta', 'Campus', 'Marca'],
              linhas.map((resultado) => [
                resultado.raia,
                resultado.posicao ? `${resultado.posicao}º` : '—',
                resultado.atleta,
                resultado.campus,
                resultado.resultado ?? resultado.tempo ?? resultado.medida
              ]),
              [38, 40, 190, 130, larguraUtil() - 398],
              { tamanhoFonte: 9.5, alinhamentos: ['center', 'center', 'left', 'left', 'center'] }
            );
          });
        });
      });

      const classificacaoCampi = Array.isArray(atletismo && atletismo.campi) ? atletismo.campi : [];
      if (classificacaoCampi.length) {
        novaPagina('Classificação do atletismo por campus');
        tabela(
          ['Naipe', 'Posição', 'Campus', 'Pontos'],
          classificacaoCampi.map((linha) => [linha.genero, linha.posicao, linha.campus, linha.pontos]),
          [larguraUtil() * 0.25, 80, larguraUtil() * 0.48, larguraUtil() * 0.27]
        );
      }
    }

    function adicionarXadrez() {
      const xadrez = dados && dados.xadrez;
      const classificacao = Array.isArray(xadrez && xadrez.classificacao) ? xadrez.classificacao : [];
      const modalidadesXadrez = Array.isArray(dados && dados.modalidades)
        ? dados.modalidades.filter((modalidade) => /xadrez/i.test(String(modalidade.nome || modalidade.base || '')))
        : [];

      const generos = [...new Set(classificacao.map((linha) => String(linha.genero || '').trim()).filter(Boolean))];
      modalidadesXadrez.forEach((modalidade) => {
        const genero = String(modalidade.genero || '').trim();
        if (genero && !generos.includes(genero)) generos.push(genero);
      });
      if (!generos.length) generos.push('Misto');
      generos.forEach((genero) => {
        novaPagina(`Xadrez ${genero}`);
        const linhas = classificacao
          .filter((linha) => !linha.genero || String(linha.genero).trim() === genero)
          .sort((a, b) => Number(b.pontuacao || 0) - Number(a.pontuacao || 0) ||
            Number(b.vitorias || 0) - Number(a.vitorias || 0));
        if (linhas.length) {
          tabela(
            ['Posição', 'Nome do atleta', 'Campus', 'Pontos', 'Vitórias', 'Empates', 'Derrotas'],
            linhas.map((linha, indice) => [
              indice + 1,
              linha.atleta,
              linha.campus,
              linha.pontuacao,
              linha.vitorias,
              linha.empates,
              linha.derrotas
            ]),
            [48, 165, 125, 48, 48, 48, larguraUtil() - 482],
            { tamanhoFonte: 10, alinhamentos: ['center', 'left', 'left', 'center', 'center', 'center', 'center'] }
          );
        } else {
          paragrafo('O boletim identifica a modalidade de xadrez, mas não contém resultados individuais registrados.');
        }
      });

      const classificacaoCampi = Array.isArray(xadrez && xadrez.campi) ? xadrez.campi : [];
      if (classificacaoCampi.length) {
        novaPagina('Classificação do xadrez por campus');
        tabela(
          ['Naipe', 'Posição', 'Campus', 'Pontos'],
          classificacaoCampi.map((linha) => [linha.genero, linha.posicao, linha.campus, linha.pontos]),
          [larguraUtil() * 0.25, 80, larguraUtil() * 0.48, larguraUtil() * 0.27]
        );
      }
    }

    adicionarCapa();
    adicionarAtletismo();
    adicionarDetalheModalidades();
    adicionarXadrez();

    doc.end();
  });
}

module.exports = {
  gerarPdfBoletim,
  montarClassificacaoFinal,
  montarTabelaChaveamento,
  montarTabelaClassificacao,
  ordenarModalidadesPorNome
};
