const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const methodOverride = require('method-override');
const expressLayouts = require('express-ejs-layouts');
const cookieParser = require('cookie-parser');
const csrfProtection = require('./middleware/csrfProtection');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

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

// CSP: baseline restritiva por origem; 'unsafe-inline' mantido temporariamente
// porque as views ainda usam scripts/estilos inline (remover progressivamente).
const usandoHttps = String(process.env.COOKIE_SECURE || '').trim().toLowerCase() === 'true';
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      "script-src": ["'self'", "'unsafe-inline'"],
      "script-src-attr": ["'unsafe-inline'"],
      "style-src": ["'self'", "'unsafe-inline'"],
      "img-src": ["'self'", "data:", "blob:"],
      "font-src": ["'self'", "data:"],
      "connect-src": ["'self'"],
      "object-src": ["'none'"],
      "base-uri": ["'self'"],
      "form-action": ["'self'"],
      "frame-ancestors": ["'self'"]
    }
  },
  hsts: usandoHttps
}));

app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h', etag: true }));

app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use(methodOverride('_method'));
app.use(cookieParser());

app.use((req, res, next) => {
    if (req.is('multipart/form-data')) {
        return next();
    }
    return csrfProtection(req, res, next);
});

const loginLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    message: 'Muitas tentativas de login. Tente novamente em 1 minuto.',
    standardHeaders: true,
    legacyHeaders: false
});

const publicLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    message: 'Muitas requisições. Aguarde um instante e tente novamente.',
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
    res.locals.csrfToken = typeof req.csrfToken === 'function' ? req.csrfToken() : '';
    next();
});

app.use('/', publicLimiter, userRoutes);
app.use('/auth/login', loginLimiter);
app.use('/auth', authRoutes);
app.use('/campus', campusRoutes);
app.use('/admin', adminRoutes);
app.use('/juiz', juizRoutes);

// Middleware de tratamento de erros
app.use((err, req, res, next) => {
  console.error('Erro não tratado:', err);
  if (res.headersSent) {
    return next(err);
  }
  const mensagem = err && err.message ? err.message : 'Ocorreu um erro inesperado.';
  if (req.method === 'POST') {
    const referer = req.get('referer') || '/';
    try {
      const url = new URL(referer);
      const destino = url.pathname + url.search;
      return res.redirect(`${destino}${destino.includes('?') ? '&' : '?'}erro=${encodeURIComponent(mensagem)}`);
    } catch (e) {
      return res.redirect('/?erro=' + encodeURIComponent(mensagem));
    }
  }
  res.status(500).send('Erro interno do servidor.');
});

function startServer(port) {
    const server = app.listen(port, '0.0.0.0', () => {
        console.log(`Server is running on port ${port}`);
        require('./config/db').getConnection()
            .then((conn) => {
                console.log('Conectado ao banco de dados MySQL com sucesso.');
                conn.release();
            })
            .catch((err) => {
                console.error('Falha ao conectar ao banco de dados MySQL:', err.message);
            });
    });

    server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
            const proximaPorta = Number(port) + 1;
            console.warn(`A porta ${port} já está em uso. Tentando a porta ${proximaPorta}...`);
            server.close(() => startServer(proximaPorta));
            return;
        }
        console.error('Erro ao iniciar o servidor:', error.message);
        process.exit(1);
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
