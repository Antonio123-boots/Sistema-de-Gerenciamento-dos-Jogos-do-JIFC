# Sistema de Gerenciamento dos Jogos do JIFC

Sistema web para gerenciar os Jogos Internos entre Campus do IFC: inscrições de atletas, sorteio de chaves, registro de placares e resultados, classificação por grupo e acompanhamento público dos jogos.

## Funcionalidades

- **Admin**: gerencia modalidades, campi, juízes, prazos de inscrição e sorteio; gera chaves (grupos) automaticamente e publica os jogos
- **Campus**: inscreve o campus nas modalidades, cadastra atletas e acompanha o status de validação
- **Juiz**: consulta os jogos do seu esporte e atualiza placares (inclusive sets, no vôlei/praia/tênis de mesa), aplica W.O. com placar padrão por esporte e lança resultados individuais (atletismo e xadrez)
- **Público**: acompanha jogos publicados, chaves e classificações sem login
- Cada juiz só pode editar jogos e provas das modalidades atribuídas a ele

## Tecnologias

- Node.js + Express + EJS
- MySQL (mysql2/promise) com pool preguiçoso
- Argon2 para hash de senhas (campi, juízes e admin)
- JWT em cookie HttpOnly para sessão
- express-validator + csurf + express-rate-limit + helmet

## Requisitos

- Node.js 18+
- MySQL 8+

## Instalação

```bash
npm install
```

1. Crie e inicialize o banco MySQL antes de iniciar a aplicação. Para usar o banco padrão `jifc`, execute na raiz do projeto:

   ```bash
   mysql -u <usuario> -p < database.sql
   ```

   O arquivo cria o banco `jifc`; se `DB_NAME` tiver outro nome, ajuste as instruções `CREATE DATABASE` e `USE` no início do SQL. Na inicialização, a aplicação atualiza tabelas e colunas existentes, mas não cria todo o schema base.
2. Copie `.env.example` para `.env` e preencha:
   - `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
   - `JWT_SECRET` (mínimo 32 caracteres — gere com `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`)
   - `DEFAULT_ADMIN_PASSWORD`, `DEFAULT_JUIZ_PASSWORD`, `DEFAULT_CAMPUS_PASSWORD` (substitua os valores de exemplo por senhas fortes)
   - `COOKIE_SECURE=true` somente em produção com HTTPS

## Execução

```bash
npm run dev     # desenvolvimento (nodemon)
npm start       # produção
npm test        # roda a suíte de testes
npm run seed:full  # popula campi, modalidades e dados de exemplo
```

O servidor sobe em http://localhost:3000.

## Contas iniciais

- Admin: `admin@ifc.edu.br` — senha definida em `DEFAULT_ADMIN_PASSWORD`
- Campi: `<campus>@ifc.edu.br` (ex.: `araquari@ifc.edu.br`) — senha definida em `DEFAULT_CAMPUS_PASSWORD`
- Juízes: cadastrados pelo admin em `/admin/juizes`

Não use valores de exemplo em produção e altere as senhas iniciais antes de disponibilizar o sistema.

## Estrutura

```
├── app.js                  # entrada da aplicação
├── config/                 # conexão MySQL e criação de schema
├── controllers/            # controllers (admin, campus, juiz, rotas públicas)
├── services/               # regras de negócio (chaveamento, classificação, W.O., etc.)
├── models/                 # acesso a dados e catálogos
├── routes/                 # definição das rotas
├── middleware/             # autenticação JWT
├── utils/                  # regras por esporte, filtros e helpers
├── views/                  # templates EJS
├── tests/                  # testes (npm test)
└── scripts/                # scripts utilitários (seed, migrações)
```

## Licença

ISC
