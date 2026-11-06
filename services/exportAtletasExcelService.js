const ExcelJS = require('exceljs');

const COLUNAS = [
  {
    header: 'NOME',
    key: 'nome',
    width: 36,
    headerColor: 'FF1D4ED8',
    bodyColor: 'FFDBEAFE'
  },
  {
    header: 'DATA DE NASCIMENTO',
    key: 'dataNascimento',
    width: 22,
    headerColor: 'FF047857',
    bodyColor: 'FFD1FAE5'
  },
  {
    header: 'CPF',
    key: 'cpf',
    width: 20,
    headerColor: 'FFB45309',
    bodyColor: 'FFFEF3C7'
  },
  {
    header: 'RG',
    key: 'rg',
    width: 20,
    headerColor: 'FF6D28D9',
    bodyColor: 'FFEDE9FE'
  },
  {
    header: 'MATRÍCULA',
    key: 'matricula',
    width: 18,
    headerColor: 'FFC2410C',
    bodyColor: 'FFFFEDD5'
  },
  {
    header: 'GÊNERO',
    key: 'genero',
    width: 16,
    headerColor: 'FFBE185D',
    bodyColor: 'FFFCE7F3'
  },
  {
    header: 'ESPORTES QUE ESTÁ INSCRITO',
    key: 'esportes',
    width: 48,
    headerColor: 'FF0E7490',
    bodyColor: 'FFCFFAFE'
  }
];

const BORDA = {
  top: { style: 'thin', color: { argb: 'FF9CA3AF' } },
  left: { style: 'thin', color: { argb: 'FF9CA3AF' } },
  bottom: { style: 'thin', color: { argb: 'FF9CA3AF' } },
  right: { style: 'thin', color: { argb: 'FF9CA3AF' } }
};

function formatarDataNascimento(valor) {
  if (!valor) return '';

  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    const dia = String(valor.getDate()).padStart(2, '0');
    const mes = String(valor.getMonth() + 1).padStart(2, '0');
    return `${dia}/${mes}/${valor.getFullYear()}`;
  }

  const texto = String(valor).trim();
  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return `${iso[3]}/${iso[2]}/${iso[1]}`;
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(texto)) {
    return texto;
  }

  const data = new Date(texto);
  if (!Number.isNaN(data.getTime())) {
    const dia = String(data.getDate()).padStart(2, '0');
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    return `${dia}/${mes}/${data.getFullYear()}`;
  }

  return texto;
}

function obterEsportes(atleta) {
  const modalidades = Array.isArray(atleta.modalidades)
    ? atleta.modalidades
    : String(atleta.modalidade || '').split(',');

  return modalidades
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .join(', ');
}

function montarLinha(atleta) {
  return {
    nome: String(atleta.nome || '').trim(),
    dataNascimento: formatarDataNascimento(atleta.dataNascimento),
    cpf: String(atleta.cpf || '').trim(),
    rg: String(atleta.rg || '').trim(),
    matricula: String(atleta.matricula || '').trim(),
    genero: String(atleta.genero || '').trim(),
    esportes: obterEsportes(atleta)
  };
}

function normalizarNomeAba(valor) {
  const nome = String(valor || 'Atletas')
    .replace(/[\\/*?:[\]]/g, ' ')
    .trim()
    .slice(0, 31);

  return nome || 'Atletas';
}

async function gerarPlanilhaAtletas(atletas = [], opcoes = {}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Sistema JIFC';
  workbook.created = new Date();

  const nomeAba = normalizarNomeAba(opcoes.campus ? `Atletas ${opcoes.campus}` : 'Atletas');
  const worksheet = workbook.addWorksheet(nomeAba, {
    views: [{ state: 'frozen', ySplit: 1 }]
  });

  worksheet.columns = COLUNAS.map((coluna) => ({
    header: coluna.header,
    key: coluna.key,
    width: coluna.width
  }));

  const linhaCabecalho = worksheet.getRow(1);
  linhaCabecalho.height = 28;

  COLUNAS.forEach((coluna, indice) => {
    const celula = linhaCabecalho.getCell(indice + 1);
    celula.value = coluna.header;
    celula.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    celula.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: coluna.headerColor } };
    celula.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    celula.border = BORDA;
  });

  atletas.forEach((atleta) => {
    const linha = worksheet.addRow(montarLinha(atleta));

    linha.height = 22;
    COLUNAS.forEach((coluna, indice) => {
      const celula = linha.getCell(indice + 1);
      celula.font = { name: 'Calibri', size: 11, color: { argb: 'FF111827' } };
      celula.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: coluna.bodyColor } };
      celula.border = BORDA;
      celula.alignment = {
        vertical: 'middle',
        horizontal: coluna.key === 'esportes' || coluna.key === 'nome' ? 'left' : 'center',
        wrapText: coluna.key === 'esportes'
      };
    });
  });

  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: COLUNAS.length }
  };

  return workbook.xlsx.writeBuffer();
}

module.exports = {
  gerarPlanilhaAtletas,
  formatarDataNascimento,
  obterEsportes
};
