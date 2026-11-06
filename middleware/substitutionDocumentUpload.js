const multer = require('multer');

const tiposPermitidos = new Set(['application/pdf', 'image/jpeg', 'image/png']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter(_req, file, callback) {
    if (!tiposPermitidos.has(file.mimetype)) {
      const erro = new Error('Envie o comprovante em PDF, JPG ou PNG (máximo 5 MB).');
      erro.code = 'TIPO_DOCUMENTO_SUBSTITUICAO_INVALIDO';
      return callback(erro);
    }
    callback(null, true);
  }
});

module.exports = upload.single('documentoSubstituicao');