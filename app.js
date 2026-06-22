// Arquivo principal que sobe o servidor Express e registra as rotas da aplicação.
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const bodyParser = require('body-parser');
const methodOverride = require('method-override');
const expressLayouts = require('express-ejs-layouts');

const userRoutes   = require('./routes/userRoutes');   // O seu arquivo atual atualizado
const authRoutes    = require('./routes/authRoutes');   // Processamento de login/logout
const campusRoutes  = require('./routes/campusRoutes'); // Painel do Campus
const adminRoutes   = require('./routes/adminRoutes');  // Painel do Admin
const juizRoutes    = require('./routes/juizRoutes');   // Painel do Juiz / Mesário
const adminModel = require('./models/adminModel');
const { construirSessaoUsuario } = require('./models/authUsers');

const app = express();
const PORT = process.env.PORT || 3000;

// Armazena sessões em memória para simular login e autenticação simples.
global.sessions = new Map();

// Lê um cookie do navegador para recuperar a sessão atual.
function getCookie(req, name) {
    const cookies = req.headers.cookie ? req.headers.cookie.split(';') : [];
    const match = cookies.map((item) => item.trim()).find((item) => item.startsWith(name + '='));
    return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views')); // Atualizado para usar path.join (boa prática)

// 2. CONFIGURAÇÃO DO EXPRESS LAYOUTS
app.use(expressLayouts);
app.set('layout', 'layout'); // Indica que o arquivo principal se chama 'layout.ejs'

// Serve static files from the 'public' folder (css, imagens, js, etc.)
app.use(express.static(path.join(__dirname, 'public')));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(methodOverride('_method'));

// Middleware que carrega a sessão do usuário a partir do cookie 'sid'.
app.use((req, res, next) => {
    const sessionId = getCookie(req, 'sid');
    const authEmail = getCookie(req, 'authEmail');
    req.sessionId = sessionId || null;
    req.session = global.sessions.get(sessionId) || {};

    if ((!req.session || !req.session.usuario) && authEmail) {
        const usuarioReconstituido = construirSessaoUsuario(authEmail);
        if (usuarioReconstituido) {
            req.session = { usuario: usuarioReconstituido };
            if (sessionId) {
                global.sessions.set(sessionId, req.session);
            }
        }
    }

    res.locals.usuarioLogado = req.session?.usuario || null;
    res.locals.mostrarFiltros = false;
    res.locals.configuracoes = adminModel.getConfiguracoes();
    res.locals.anoJifc = adminModel.getAnoJifc();
    next();
});

// Garante que a sessão seja registrada no cookie quando houver redirecionamento.
app.use((req, res, next) => {
    const originalRedirect = res.redirect.bind(res);
    res.redirect = (url) => {
        if (!req.sessionId && req.session?.usuario) {
            const sessionId = crypto.randomUUID();
            req.sessionId = sessionId;
            global.sessions.set(sessionId, req.session);
            res.setHeader('Set-Cookie', `sid=${sessionId}; Path=/; HttpOnly; SameSite=Lax`);
        }
        return originalRedirect(url);
    };
    next();
});

app.use('/', userRoutes);          // Caminhos públicos (ex: / , /login , /equipes)
app.use('/auth', authRoutes);      // Caminhos de ação (ex: /auth/login)
app.use('/campus', campusRoutes);  // Caminhos do Campus (ex: /campus/atletas)
app.use('/admin', adminRoutes);    // Caminhos do Admin (ex: /admin/laudos)
app.use('/juiz', juizRoutes);      // Caminhos do Juiz / Mesário (placar e tabelas)

function startServer(port) {
    const server = app.listen(port, () => {
        console.log(`Server is running on port ${port}`);
    });

    server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
            const nextPort = Number(port) + 1;
            console.log(`Porta ${port} em uso. Tentando a porta ${nextPort}...`);
            startServer(nextPort);
            return;
        }

        throw error;
    });
}

startServer(PORT);