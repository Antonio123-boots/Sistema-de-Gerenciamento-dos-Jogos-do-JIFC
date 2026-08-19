const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { obterUsuarioPorEmail, verificarSenha, construirPayloadJWT } = require('../models/authUsers');
const { gerarToken } = require('../middleware/auth');

const loginValidation = [
    body('email').isEmail().withMessage('Informe um e-mail válido.').normalizeEmail(),
    body('senha').isLength({ min: 1 }).withMessage('Informe a senha.')
];

router.post('/login', loginValidation, async function(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.render('login', {
            title: 'JIFC - Login',
            usuarioLogado: null,
            mostrarFiltros: false,
            erro: errors.array()[0].msg
        });
    }

    const email = String(req.body.email || '').trim().toLowerCase();
    const senha = String(req.body.senha || '').trim();
    const usuario = await obterUsuarioPorEmail(email);

    if (!usuario || !(await verificarSenha(usuario, senha))) {
        return res.render('login', {
            title: 'JIFC - Login',
            usuarioLogado: null,
            mostrarFiltros: false,
            erro: 'E-mail ou senha inválidos.'
        });
    }

    if (usuario.banned) {
        return res.render('login', {
            title: 'JIFC - Login',
            usuarioLogado: null,
            mostrarFiltros: false,
            erro: 'Acesso negado: este campus foi banido do JIFC.'
        });
    }

    const payload = construirPayloadJWT(usuario);
    const token = gerarToken(payload);

    res.setHeader('Set-Cookie', `token=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax`);

    if (usuario.tipo === 'admin') return res.redirect('/admin/configurar');
    if (usuario.tipo === 'juiz') return res.redirect('/juiz');
    res.redirect('/perfil');
});

router.get('/logout', function(req, res, next) {
    res.setHeader('Set-Cookie', 'token=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax');
    res.redirect('/');
});

module.exports = router;
