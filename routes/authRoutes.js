const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { obterUsuarioPorEmail, verificarSenha, construirPayloadJWT } = require('../models/authUsers');
const { gerarToken, construirCookieToken } = require('../middleware/auth');

const loginValidation = [
    body('email').isEmail().withMessage('Informe um e-mail válido.').normalizeEmail(),
    body('senha').isLength({ min: 1 }).withMessage('Informe a senha.')
];

router.post('/login', loginValidation, async function(req, res, next) {
    try {
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
        const senha = String(req.body.senha || '');
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

        res.setHeader('Set-Cookie', construirCookieToken(token));

        if (usuario.tipo === 'admin') return res.redirect('/perfil');
        if (usuario.tipo === 'juiz') return res.redirect('/juiz');
        res.redirect('/perfil');
    } catch (error) {
        console.error('Erro no login:', error);
        return res.render('login', {
            title: 'JIFC - Login',
            usuarioLogado: null,
            mostrarFiltros: false,
            erro: 'Erro temporário ao processar o login. Tente novamente em instantes.'
        });
    }
});

router.post('/logout', function(req, res, next) {
    res.setHeader('Set-Cookie', construirCookieToken('') + '; Max-Age=0');
    res.redirect('/');
});

module.exports = router;
