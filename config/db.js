const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('path');

// Força o dotenv a buscar o arquivo .env explicitamente na raiz do projeto
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Tratamento rigoroso de strings vazias ou nulas vindas do ambiente
let dbPassword = process.env.DB_PASSWORD;
if (dbPassword === '""' || dbPassword === "''" || !dbPassword) {
    dbPassword = '';
}

let poolReal = null;

function obterPool() {
    if (!poolReal) {
        poolReal = mysql.createPool({
            host: process.env.DB_HOST || '127.0.0.1',
            user: process.env.DB_USER || 'root',
            password: dbPassword,
            database: process.env.DB_NAME || 'jifc',
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0
        });
    }
    return poolReal;
}

// Pool preguiçoso: só conecta na primeira query, permitindo usar módulos
// isolados (regras, validadores) em testes sem depender do banco.
module.exports = new Proxy({}, {
    get(_alvo, propriedade) {
        const pool = obterPool();
        const valor = pool[propriedade];
        return typeof valor === 'function' ? valor.bind(pool) : valor;
    }
});
