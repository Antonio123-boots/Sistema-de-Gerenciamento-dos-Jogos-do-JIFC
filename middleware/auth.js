const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRATION = '12h';

function extrairToken(req) {
    const cookies = req.headers.cookie ? req.headers.cookie.split(';') : [];
    const match = cookies.map((c) => c.trim()).find((c) => c.startsWith('token='));
    return match ? decodeURIComponent(match.slice('token='.length)) : null;
}

function decodificarToken(req) {
    const token = extrairToken(req);
    if (!token) return null;
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch {
        return null;
    }
}

function requireAuth(req, res, next) {
    const payload = decodificarToken(req);
    if (!payload) {
        return res.redirect('/login');
    }
    req.user = payload;
    res.locals.usuarioLogado = payload;
    next();
}

function requireRole(...roles) {
    return (req, res, next) => {
        const payload = decodificarToken(req);
        if (!payload) {
            return res.redirect('/login');
        }
        if (!roles.includes(payload.tipo)) {
            return res.status(403).send('Acesso negado.');
        }
        req.user = payload;
        res.locals.usuarioLogado = payload;
        next();
    };
}

function gerarToken(payload) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRATION });
}

module.exports = { requireAuth, requireRole, gerarToken, decodificarToken, extrairToken };
