const adminModel = require('../models/adminModel');
const { gerarPdfBoletim } = require('../services/boletimPdfService');

async function baixarPdf(req, res) {
  const ano = Number(req.params.ano || 0);
  if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) {
    return res.status(400).send('Ano inválido.');
  }

  try {
    const dados = await adminModel.obterBoletimCompleto(ano);
    if (!dados) {
      return res.status(404).send('Boletim final não encontrado.');
    }
    if (!dados.completo || !Array.isArray(dados.completo.modalidades)) {
      return res.status(409).send('Este boletim não possui dados detalhados suficientes para exportação. Gere o boletim novamente pela administração.');
    }

    const pdf = await gerarPdfBoletim(dados);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="boletim-final-jifc-${ano}.pdf"`,
      'Content-Length': pdf.length,
      'Cache-Control': 'no-store'
    });
    return res.send(pdf);
  } catch (error) {
    console.error(`Erro ao gerar PDF do boletim final ${ano}:`, error);
    return res.status(500).send('Não foi possível gerar o PDF do boletim final.');
  }
}

module.exports = { baixarPdf };
