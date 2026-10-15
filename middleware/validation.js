const { validationResult } = require('express-validator');

function montarDestino(req, mensagem) {
  const referer = req.get('referer');
  let destino = '/';

  if (referer) {
    try {
      const url = new URL(referer);
      destino = url.pathname + url.search;
    } catch {
      destino = '/';
    }
  }

  return `${destino}${destino.includes('?') ? '&' : '?'}erro=${encodeURIComponent(mensagem)}`;
}

function handleValidationForm(req, res, next) {
  const erros = validationResult(req);
  if (erros.isEmpty()) return next();

  const mensagem = erros.array().map((item) => item.msg).join(' ');
  return res.redirect(montarDestino(req, mensagem));
}

module.exports = { handleValidationForm };
