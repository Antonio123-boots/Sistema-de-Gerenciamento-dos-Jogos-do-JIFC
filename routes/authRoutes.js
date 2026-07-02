const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { obterUsuarioPorEmail, construirSessaoUsuario, senhaPadraoCampus } = require('../models/authUsers');
const { listarCredenciaisCampus } = require('../models/campiCatalog');

// POST /auth/login: valida e cria a sessão do usuário.
router.post('/login', async function(req, res, next) {
    const email = String(req.body.email || '').trim().toLowerCase();
    const senha = String(req.body.senha || '').trim();
    const usuario = await obterUsuarioPorEmail(email);

    if (!usuario || String(usuario.senha || '').trim() !== senha) {
        return res.render('login', {
            title: 'JIFC - Login',
            usuarioLogado: null,
            mostrarFiltros: false,
            erro: 'E-mail ou senha inválidos.',
            credenciaisCampus: await listarCredenciaisCampus(),
            senhaPadraoCampus
        });
    }

    if (usuario.banned) {
        return res.render('login', {
            title: 'JIFC - Login',
            usuarioLogado: null,
            mostrarFiltros: false,
            erro: 'Acesso negado: este campus foi banido do JIFC.',
            credenciaisCampus: await listarCredenciaisCampus(),
            senhaPadraoCampus
        });
    }

    const sessionId = req.sessionId || crypto.randomUUID();
    req.sessionId = sessionId;
    const sessaoUsuario = await construirSessaoUsuario(usuario.email);
    req.session = {
        usuario: sessaoUsuario
    };

    global.sessions.set(sessionId, req.session);
    res.setHeader('Set-Cookie', [
        `sid=${sessionId}; Path=/; HttpOnly; SameSite=Lax`,
        `authEmail=${encodeURIComponent(usuario.email)}; Path=/; HttpOnly; SameSite=Lax`
    ]);
    res.redirect('/perfil');
});

// GET /auth/logout: encerra a sessão e apaga o cookie.
router.get('/logout', function(req, res, next) {
    if (req.sessionId) {
        global.sessions.delete(req.sessionId);
    }
    res.setHeader('Set-Cookie', [
        'sid=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax',
        'authEmail=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax'
    ]);
    res.redirect('/');
});

module.exports = router;