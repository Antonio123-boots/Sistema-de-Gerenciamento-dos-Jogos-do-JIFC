const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const methodOverride = require('method-override');
const expressLayouts = require('express-ejs-layouts');
const cookieParser = require('cookie-parser');
const csurf = require('csurf');
const rateLimit = require('express-rate-limit');

const userRoutes   = require('./routes/userRoutes');
const authRoutes    = require('./routes/authRoutes');
const campusRoutes  = require('./routes/campusRoutes');
const adminRoutes   = require('./routes/adminRoutes');
const juizRoutes    = require('./routes/juizRoutes');
const adminModel = require('./models/adminModel');
const { initHashes } = require('./models/authUsers');
const { decodificarToken } = require('./middleware/auth');
const { ensureSchema } = require('./config/ensureSchema');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(expressLayouts);
app.set('layout', 'layout');

app.use(express.static(path.join(__dirname, 'public')));

app.use(bodyParser.json({ limit: '1mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '1mb' }));
app.use(methodOverride('_method'));
app.use(cookieParser());

const csrfProtection = csurf({ cookie: true });
app.use(csrfProtection);

const loginLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    message: 'Muitas tentativas de login. Tente novamente em 1 minuto.',
    standardHeaders: true,
    legacyHeaders: false
});

// Middleware global: decodifica JWT do cookie e popula req.user + res.locals
app.use((req, res, next) => {
    const payload = decodificarToken(req);
    req.user = payload || null;
    res.locals.usuarioLogado = payload || null;
    res.locals.mostrarFiltros = false;
    res.locals.configuracoes = adminModel.getConfiguracoes();
    res.locals.anoJifc = adminModel.getAnoJifc();
    res.locals.csrfToken = req.csrfToken();
    next();
});

app.use('/', userRoutes);
app.use('/auth', loginLimiter, authRoutes);
app.use('/campus', campusRoutes);
app.use('/admin', adminRoutes);
app.use('/juiz', juizRoutes);

function startServer(port) {
    const server = app.listen(port, () => {
        console.log(`Server is running on port ${port}`);
    });

    server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
            console.error(`Erro: porta ${port} já está em uso.`);
            process.exit(1);
            return;
        }
        throw error;
    });
}

initHashes()
  .then(() => ensureSchema())
  .then(() => {
    startServer(PORT);
  }).catch((err) => {
    console.error('Erro ao inicializar hashes de senha:', err);
    process.exit(1);
  });
