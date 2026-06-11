const express = require('express');
const crypto = require('crypto');
const router = express.Router();

// Usuários fictícios usados para simular autenticação no sistema.
const usuariosPermitidos = {
    'admin@ifc.edu.br': {
        senha: 'admin123',
        tipo: 'admin',
        nome: 'Administrador Principal',
        email: 'admin@ifc.edu.br',
        perfil: 'Administrador'
    },
    'instituicao@ifc.edu.br': {
        senha: 'instituicao123',
        tipo: 'campus',
        nome: 'Instituição Participante',
        email: 'instituicao@ifc.edu.br',
        perfil: 'Instituição'
    },
    'juiz@ifc.edu.br': {
        senha: 'juiz123',
        tipo: 'juiz',
        nome: 'Juiz / Mesário',
        email: 'juiz@ifc.edu.br',
        perfil: 'Juiz'
    }
};

// POST /auth/login: valida e cria a sessão do usuário.
router.post('/login', function(req, res, next) {
    const { email, senha } = req.body;
    const usuario = usuariosPermitidos[email?.trim().toLowerCase()];

    if (!usuario || usuario.senha !== senha) {
        return res.render('login', {
            title: 'JIFC - Login',
            usuarioLogado: null,
            mostrarFiltros: false,
            erro: 'E-mail ou senha inválidos.'
        });
    }

    const sessionId = req.sessionId || crypto.randomUUID();
    req.sessionId = sessionId;
    req.session = {
        usuario: {
            id: usuario.email,
            nome: usuario.nome,
            email: usuario.email,
            tipo: usuario.tipo,
            perfil: usuario.perfil
        }
    };

    global.sessions.set(sessionId, req.session);
    res.setHeader('Set-Cookie', `sid=${sessionId}; Path=/; HttpOnly; SameSite=Lax`);
    res.redirect('/perfil');
});

// GET /auth/logout: encerra a sessão e apaga o cookie.
router.get('/logout', function(req, res, next) {
    if (req.sessionId) {
        global.sessions.delete(req.sessionId);
    }
    res.setHeader('Set-Cookie', 'sid=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax');
    res.redirect('/');
});

module.exports = router;