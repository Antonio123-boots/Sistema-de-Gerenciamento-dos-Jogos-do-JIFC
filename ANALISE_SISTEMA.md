# Análise do Sistema de Gerenciamento dos Jogos do JIFC

Memória técnica consolidada (análise completa em 13/09/2026). Serve de referência para futuras tarefas.

## 1. Visão geral

- **Aplicação:** portal do JIFC (Jogos Internos entre Campi do IFC) — inscrição de atletas, chaveamento, classificação, placares em tempo real, boletim final e "Edições Anteriores" (histórico importável/exportável em JSON).
- **Projeto:** `C:\Users\Acer Travel\Documents\TCC\Sistema-de-Gerenciamento-dos-Jogos-do-JIFC`
- **Stack:** Node.js + Express; views EJS + `express-ejs-layouts`; MySQL via `mysql2/promise`; `argon2` p/ senhas; JWT em cookie; `express-validator`, `csurf` (cookie), `express-rate-limit`, `method-override`.
- `package.json` diz `5.7.2`; git HEAD `3fdf333 "6.8"` (branch `main`).
- Porta `3000`; `npm run dev` = nodemon; `npm run seed:full` = `scripts/seed_full.js`; `npm test` = `node tests/run-all.js`.
- Único servidor (sem front separado). Alta acoplagem: controllers/servos/modelos/init/`forcage` de dados vivos em memória + MySQL como store persistente.

## 2. Autenticação e papéis

- `middleware/auth.js`: `requireAuth`, `requireRole('admin'|'campus'|'juiz')`, `gerarToken`, `decodificarToken`. Cookie `token` (Path=/, HttpOnly, SameSite=Lax, Secure opcional), JWT_SECRET ≥ 32 chars, expiração default `12h`.
- Login: `POST /auth/login` (rate limit 5/min, CSRF, express-validator). Logout: `POST /auth/logout`.
- Contas built-in (`models/authUsers.js` `initHashes`): senhas default via `.env` (`DEFAULT_ADMIN_PASSWORD`, `DEFAULT_JUIZ_PASSWORD`, `DEFAULT_CAMPUS_PASSWORD`). `verificarSenha`/`obterUsuarioPorEmail`/`construirPayloadJWT`/`salvarFotoPerfilUsuario`.
- Papéis: `admin`, `campus`, `juiz`, público (sem login). Fotos de perfil via `models/profileImageStore.js`.

## 3. Rotas (mapa completo)

### Público (`routes/userRoutes.js`)
| Rota | Função |
|---|---|
| `/` | Home: jogos + classificação (filtros via query: `modalidade`, `dia`, `genero`, `prova`, `sub`, `ano`) |
| `/equipes`, `/equipes/:slug` | Lista de campi / perfil do campus |
| `/perfil` | Perfil do usuário logado |
| `/chaveamento` | Chaveamento público (`?modalidade&sub=individual\|dupla`) |
| (`/campus/jogos` e `/campus/jogos?dia=` servidos pela rota do campus, mas acessíveis a público) | |

Helpers: `normalizarNomeBase`, `gerarSlugBase`, `obterBaseEsporte` (usam listas de sinonímia p/ agrupar coletivos).

### Admin (`routes/adminRoutes.js`)
| Rota | Função |
|---|---|
| `/admin/configurar` (GET/POST `/salvar`) | Prazos de inscrição (modalidades/atletas), sorteio, ano JIFC, limites |
| `/admin/modalidades/cadastrar`, `/admin/modalidades/excluir/:modalidadeId` | CRUD de modalidades (catálogo) |
| `/admin/cadastroCampus` (GET/POST `/salvar`), `/excluir/:slug` | Cadastro de campi (`?editar=<slug>`) |
| `/admin/banirCampus` (GET/POST `/salvar`) | Punição de campus/atleta |
| `/admin/laudos`, `/validar/:id`, `/reprovar/:id` | Análise de laudos médicos |
| `/admin/chaveamento` (+ `/gerar`, `/limpar`, `/publicar`, `/publicar-tudo`, `/excluir-publicacao`, `/cancelar`, `/jogo/:id/salvar`, `/campus/:slug`) | Painel de chaveamento |
| `/admin/boletins` (GET, POST `/gerar`, `/boletins/:ano`) | Boletim final |
| `/admin/juizes` (GET), `/juizes/cadastrar` (GET/POST), `/juizes/editar/:id` (GET/POST), `/juizes/excluir/:id` | Gestão de juízes |
| `/admin/edicoes/nova` (GET) e POSTs de cada etapa do wizard (`/dados`, `/campi`, `/modalidades`, `/modalidades/ir`, `/modalidade/:modFoco/<sub-etapa>`, `/salvar`, `.../cancelar`) | Wizard de edição histórica |
| `/admin/edicoes` (GET `/edicoes`), `/importar`, `/gerar-exemplo`, `/exportar/:ano`, `/excluir/:ano`, `/salvar-ano-atual` | Edições anteriores |

### Campus (`routes/campusRoutes.js`) — `requireAuth + requireRole('campus')`
| Rota | Função |
|---|---|
| `/campus/inscricoes` (GET/POST`/salvar`) | Inscrição em modalidades (`?aba=atletas`, `?editar=<id>`) |
| `/campus/atletas` (GET), `/cadastrar` (POST), `/editar/:id` (GET), `/atualizar/:id` (POST), `/excluir/:id` (POST), `/substituir/:id` | CRUD/substituição de atletas (validação: nome 3-100, matrícula 9-12 dígitos, CPF 11 dígitos, nascimento) |
| `/campus/jogos` (GET) | Jogos do campus (`?dia=`) |

### Juiz (`routes/juizRoutes.js`) — `requireAuth + requireRole('juiz')`
| Rota | Função |
|---|---|
| `/juiz` | Painel (esportes atribuídos) |
| `/juiz/:esporte` | Jogos do esporte (`?dia=`) |
| `/juiz/jogos/:jogoId/placar` (GET/POST, `?editar=1`), `/adiar`, `/wo`, `/desfazer-wo` | Placar completo (sets, cartões, disputa, W.O., adiamento) |
| `/juiz/:esporte/resultados` (?genero=) | Resultados por modalidade (atletismo/xadrez) |
| `/juiz/:esporte/resultados/criar-prova`, `/excluir-prova/:provaId`, `/prova/:provaId` (GET), `/salvar-prova/:provaId` (POST), `/salvar-xadrez` | Provas de atletismo e pontuação de xadrez |

Validação de placar: `placar1`/`placar2` inteiros ≥ 0; `status` ∈ {Agendado, Em Andamento, Encerrado, Cancelado}; validação de sets.

## 4. Controllers

- **`controllers/adminController.js` (1171 linhas, 35 handlers):** configurações/prazos, modalidades, campi (via `campiCatalog`), multar/banir, laudos, chaveamento (gera, publica, elimina, edita jogo), boletins, edições anteriores (gera exemplo via `exemploEdicaoService` na linha ~1067). **`recalcularClassificacoes` (linha ~936) exportado mas SEM rota registrada (código morto).**
- **`controllers/campusController.js` (362):** inscrições; CRUD/substituição de atletas; o formulário de atleta em edição usa `atletaFormDrafts` (Map por `req.user.email`) para persistir o rascunho entre requisições; renderização das telas do campus.
- **`controllers/juizController.js` (703):** perfil, jogos por esporte, placar (guarda sets, cartões, disputa/pênaltis), W.O. (placar padrão por esporte via `obterPlacarWo`), adiar, resultados individuais (atletismo/xadrez), CRUD de provas.
- **`controllers/edicaoWizardController.js` (998):** estado do wizard de edição histórica; `chaveAdmin(req)` normaliza e-mail do admin; `lerResultadoJogo` captura campos `jogo_<id>_*`; etapas: dados → campi → modalidades → participantes → grupos → confrontos → resultados → eliminatória → sub-etapa (tênis de mesa) → revisão/salvar.

## 5. Services

- **`services/chaveamentoService.js` (1090):** `resolverSubCategoria` (tênis de mesa → `dupla`/`individual`, senão `geral`), `obterNumeroSistema`, `embaralharArray` (Fisher-Yates), `ordenarPorNumeroESorteio`, geração de grupos, round-robin (confrontos), gravação de jogos, dispara mata-mata. Sorteio fora do prazo lança erro (ver Bugs).
- **`services/classificacaoService.js` (769):** pontuação, desempate, classificação recalculada do zero a cada placar; colunas dinâmicas por modalidade.
- **`services/jogoService.js` (251):** `ehTenisDeMesa`, `normalizarSubCategoriaFiltro`, `filtrarJogosDoCampus`, lógica de W.O.
- **`services/boletimService.js` (143):** geração do boletim final (ranking p/ ano).
- **`services/configService.js` (203)** e **`services/modalidadeService.js` (148):** configurações e catálogo de modalidades.
- **`services/edicaoService.js` (554):** listar anos de edições, obter/exportar/importar (`JSON.parse` etc.); re-exportado por `models/adminModel.js` (linhas 79–85); usado em `userRoutes.js` (linhas ~479/495) para a página pública de edições anteriores.
- **`services/exemploEdicaoService.js` (487, untracked):** monta a edição de exemplo 2025 (usada por `adminController.js` ~1067 e no wizard) — não apagar.
- **`services/rascunhoEdicaoService.js` (86):** salva/recupera rascunho do wizard.
- **`services/edicaoWizardService.js` (1311):** máquina de estados do wizard (valida, persiste em `rascunho_edicoes`).
- **`services/juizService.js` (586):** `FASES_ELIMINATORIAS` = {Oitavas, Quartas, Semifinal, Terceiro Lugar, Final}; `FASES_PRECEDENTES`; cache de completude de fases com `limparCacheFases`; `faseAnteriorCompleta`; `normalizarEsportes`; `listarJuizes`; CRUD de juízes; vínculo `juiz_modalidade`. **`resolverEliminatoriaDoJogo` silencia erros (só `console.error`).**
- **`services/resultadosIndividuaisService.js` (479):** classificação de atletismo por gênero/campus, pontuação por prova; xadrez.
- **`services/mataMataService.js` (459):** chaves eliminatórias dirigidas por rótulos (`1A`, `V5`, `T2`) e resolução de desempates.

## 6. Models / Banco

- **`config/db.js` (39):** pool lazy singleton via Proxy (`obterPool()`); credenciais de `.env`; banco default `jifc`; `connectionLimit` 10; DB_HOST default 127.0.0.1; senha vazia tratada (`""`, `"''"`, falsy → `''`).
- **`config/ensureSchema.js` (760):** cria/migra todas as tabelas no startup com ALTERs idempotentes. Inclui tabelas-chave: `rascunho_edicoes` (UQ `uq_rascunho_admin` por admin_email; `etapa` default `'dados'`; `dados_json` LONGTEXT) ~linha 436–448 e `edicoes_anteriores` (UQ `uq_edicao_ano` por ano_jifc; `origem` ENUM('auto','importada')) ~linha 453–463; além de `juiz_modalidade`, `jogos`, `placares`, `cartoes`, `provas`, `resultadosIndividuais`, etc.
- **`models/adminModel.js`:** fachada que delega para configService, modalidadeService, chaveamentoService, jogoService, classificacaoService, boletimService e edicaoService.
- **`models/campusModel.js` (983):** inscrições, CRUD de atletas, laudo com validação (dados de saúde/reserva), substituição de atleta, jogos do campus. Mescla cache em memória + MySQL. Validar irregularidades (atletismo/tênis/duplas etc.).
- **`models/campiCatalog.js` (559):** catálogo estático dos campi do IFC + `listarCampi` com operações `banCampus`/`desbanirCampus`/`removerCampus`/`adicionarCampus`/`atualizarCampus`.
- **`models/profileImageStore.js` (131):** fotos de perfil. **`models/stateStore.js` (31):** state storage file-based (`data/jifc-state.json`), remanescente de arquitetura anterior.

## 7. Utils

- `utils/statusPrazos.js` (36): `estaNoPrazo(inicio, fim, hojeStr)` e `obterStatusPrazos` → flags `prazoModalidadesAberto`, `prazoAtletasAberto`, `inscricoesConfiguradas`, `inscricoesAbertas`, `inscricoesEncerradas`, `sorteioDisponivelPorData`, `prazoSorteioAberto`, `sorteioBloqueado`, `resumoDisponivel`. Comparação lexicográfica de datas ISO (funciona).
- `utils/jogoStatus.js` (16): `statusEfetivo(status, dataHora)` — vazio → 'Agendado'; 'Em Andamento' → voltou a 'Agendado' (derivado); data no passado + 'Agendado' → 'Em Andamento'.
- `utils/atletismoProvas.js` (346): catálogo (15 provas) com tipo (Tempo/Distância), formato (direta/baterias/final) e flag de baterias.
- `utils/sportClassificationRules.js` (278): `obterRegras(esporte)` e `obterPlacarWo(esporte)` — regras por modalidade (pts, sets, cartões, desempate, penalidades, placa de W.O.). **Fallback silencioso p/ futsal em esporte desconhecido (ver Bugs).** Pontos individuais: 13/8/6/5/4/3/2/1 (1º ao 8º).

## 8. Views / UI — o que cada botão faz

**`views/layout.ejs`:** menus por papel. Público: EQUIPES (`/equipes`); admin ganha botão "+ EDIÇÃO ANTERIOR" (`/admin/edicoes/nova`) e seletor `?ano=` para edições anteriores. Menu admin: Chaveamento `/admin/chaveamento`, Validar atletas `/admin/laudos`, Boletins `/admin/boletins`, Cadastrar campus `/admin/cadastroCampus`, Gerenciar punições `/admin/banirCampus`, Gerenciar Juízes `/admin/juizes`, Configurar `/admin/configurar`. Menu juiz: MEUS JOGOS `/juiz`. Menu campus: ATLETAS `/campus/atletas`, MEUS JOGOS `/campus/jogos`. Logout: `POST /auth/logout` (form com `_csrf`).

**`views/user.ejs` (home, 798):** coluna de classificação por grupo/gênero (Pts/V/E/D coloridos), atletismo por prova `?prova=<slug>` (baterias, "Pontuação na Final" quando publicada, revezamento por campus), Xadrez (classificação geral P/J/V/D + tabela direta), filtro de rodadas com pills, carrossel de jogos com `partials/cardJogoHome`. Sem jogos: layout-simples com mensagens.

**`views/partials/cardJogo.ejs`:** card completo — W.O., fase, placar (vôlei: sets `s1 x s2`), status. Rodapé: juiz → `Atualizar Placar` `/juiz/jogos/<id>/placar`; admin → `Lançar Resultado` `/admin/jogos/placar/<id>`.
**`views/partials/cardJogoHome.ejs`:** card compacto (fase, modalidade, matchup, status).

**Área admin:**
- `adm/configEvento.ejs`: form `POST /admin/configurar/salvar` (limites/prazos); form `POST /admin/modalidades/cadastrar` (nome/gênero/tipo/ícone base64 via FileReader) e `POST /admin/modalidades/excluir/<id>`.
- `adm/cadastroCampus.ejs`: form `POST /admin/cadastroCampus/salvar` (nome/slug/e-mail/senha/cidade/foto base64/cor); Editar `?editar=<slug>`; Excluir `POST .../excluir/<slug>`.
- `adm/banirCampus.ejs`: radio Campus/Atleta alterna seções; `atletasPorCampus[slug]` preenche select via JS; form `POST /admin/banirCampus/salvar`.
- `adm/analiseAtletas.ejs`: grid de campi → `?campus=`; botões Validar `POST /admin/laudos/validar/<id>` / Reprovar `.../reprovar/<id>`.
- `adm/boletins.ejs` / `boletimDetalhe.ejs`: gera `POST /admin/boletins/gerar`; abrir `/admin/boletins/<ano>`.
- `adm/juizes.ejs` / `cadastrarJuiz.ejs`: `+ Cadastrar Juiz` `/admin/juizes/cadastrar`; Editar `/juizes/editar/<id>`; Remover `POST /juizes/excluir/<id>`.
- `adm/chaveamento.ejs` (729): abas por modalidade; Realizar Sorteio `POST /admin/chaveamento/gerar` (forcar=1), Refazer `.../limpar`, Publicar `.../publicar`, Publicar tudo, Excluir publicação (checkboxes + modal), Cancelar; atletismo (filtros `sub=`/`subProva=`); xadrez (sistema suíço); jogos com form `POST /admin/chaveamento/jogo/<id>/salvar` (data/hora/local), rascunho em `localStorage('jifc-jogo-rascunho-<id>')`, carrossel por rodada/fase.
- `adm/chaveamento_campus.ejs`: resumo por campus (`/admin/chaveamento/campus/:slug`).
- `adm/edicoesAnteriores.ejs`: Importar JSON `POST /admin/edicoes/importar` (FileReader → hidden), Gerar exemplo `POST .../gerar-exemplo`, Exportar `/admin/edicoes/exportar/<ano>`, Excluir `POST .../excluir/<ano>`, seletor de ano atual `POST .../salvar-ano-atual`.
- `adm/edicaoWizard.ejs` (1096) + `public/js/edicaoWizard.js` (380): wizard em 5 etapas (Dados → Campi → Modalidades → Modalidade → Revisão) com POSTs dedicados; tênis de mesa tem botões Individual/Em-dupla; modalidade tem sub-etapas Participantes/Chaves/Confrontos/Resultados/Eliminatórias; charts com `wzChaveGrid`, modal de distribuição, requisito "todos os campi com chave" p/ habilitar Salvar; pódio e classificação; form final `POST /admin/edicoes/nova/salvar`.

**Área campus:**
- `campus/inscricoes.ejs` (505): abas Modalidades (checkboxes gênero → `POST /campus/inscricoes/salvar`) e Atletas (form `POST /campus/atletas/cadastrar` ou `/atualizar/<id>`, máscaras CPF/matrícula, max 3 modalidades, detalhes condicionais por modalidade); ações Editar (`?aba=atletas&editar=<id>#atletas`) e Excluir.
- `campus/atletas.ejs` (134): listas por gênero com status (✓/⏳/✗).
- `campus/jogos.ejs` (33) (`/campus/jogos`): day-chips + cards, público também vê.

**Área juiz:**
- `juiz/perfil.ejs`: grid de esportes → `/juiz/<esporte>`.
- `juiz/jogos.ejs`: filtro dia; Corrigir placar `/juiz/jogos/<id>/placar?editar=1`; Cancelar W.O. `POST /juiz/jogos/<id>/desfazer-wo`; Atualizar Placar `/juiz/jogos/<id>/placar`.
- `juiz/placar.ejs` (515): inputs placar1/placar2 + W.O. (modal `#woConfirmModal` + form `POST .../wo`); disputa de pênaltis quando eliminatória ≠ basquete; sets (`#setsContainer` 3 linhas, botão OK, `setsSummary`); cartões (-1 amarelo/-3 vermelho); Adiar (`POST .../adiar`); Encerrar Jogo. Quando encerrado, mostra resultado e `?editar=1` para corrigir.
- `juiz/resultados.ejs` (193): atletismo (+ Nova Prova `POST .../criar-prova`, Lançar `/juiz/<esporte>/resultados/prova/<id>`, excluir prova); Xadrez (`POST .../salvar-xadrez`).
- `juiz/resultadosProva.ejs` (430): tabela por série/bateria/final, máscara de tempo "Pix" (`m:ss,ms`), pontos 13/8/6/5/4/3/2/1, form `POST .../salvar-prova/<id>`.

**CSS:** `geral.css` importa base/components/profile/extra/responsive; `chaveamento.css` (872), responsive.css (1077), admin.css, cadastroCampus/banirCampus/perfil/login/punishments. Estilo: fundo `#1c1d3b`, acento JIFC amarelo `#ece42d` (hover `#fff56b`), cards `rgba(255,255,255,0.04-0.08)` + blur, status verde `#58d68d`/amarelo `#f5b041`/vermelho `#f1948a`. Responsivo até mobile (menu vira app-bar rolável, inputs ≥16px).

## 9. Regras de negócio relevantes

- **Pontos coletivos** por esporte (sportClassificationRules): futsal 3/1/0; vôlei por sets 3/2/1/0; etc. Desempates específicos por modalidade.
- **W.O.:** placar padrão por esporte (`obterPlacarWo`); juiz pode desfazer.
- **Atletismo:** 15 provas (`atletismoProvas.js`); pontos 13/8/6/5/4/3/2/1 (1º ao 8º); final automática (8 vagas, 4/bateria) quando configurada; classificação final por prova e geral.
- **Xadrez:** sistema suíço; pontos V=1/exceto empate, PTS total; classificados pontuados.
- **Sub-etapa:** tênis de mesa `Individual`/`Dupla`; demais `geral`. Filtros de home por `sub`.
- **Mata-mata:** fases Oitavas/Quartas/Semifinal/Terceiro Lugar/Final; jogos bloqueados até fase anterior completar (`faseAnteriorCompleta`); placar com penalidades (pênaltis/7m/cesta livre) na eliminatória (exceto basquete).
- **Prazos:** inscrição de modalidades/atletas, sorteio — todos via `obterStatusPrazos`.
- **Substituição de atleta:** 1 por inscrição; exige justificativa; valida dados.

## 10. Testes e scripts

- `tests/run-all.js` (runner), `tests/edicaoWizard.test.js` (635), `tests/statusPrazos.test.js` (+ outros). `npm test`. `scripts/seed_full.js`.
- **IMPORTANTE:** rodar `npm test` e conferir que nada quebrou antes de entregar mudanças.

## 11. Bugs e riscos conhecidos (levantados na análise)

1. **`construirLinhaCsv` inexistente** — exportação CSV de classificações quebra (ReferenceError).
2. **Sorteio fora do prazo** gera `ReferenceError` (variável não definida no erro) em vez de mensagem amigável no `adminController`.
3. **Boletim final** calcula campeão por pontos de grupo, não pelo vencedor da final.
4. **`obterRegras`** cai silenciosamente nas regras de futsal p/ esporte não catalogado.
5. **express-validator** em rotas declara regras mas `adminRoutes` **nunca chama `validationResult`/`handleValidation`** — validações não aplicadas.
6. **`atualizarJuiz`** pode apagar esportes atribuídos se o payload vier sem esse campo.
7. **`resolverEliminatoriaDoJogo`** engole exceções (só loga).
8. Estado do git tem alterações staged+unstaged do wizard (edição histórica) e arquivos untracked de debug (`err*.txt`, `out*.txt`) que podem ser removidos — **exceto `services/exemploEdicaoService.js`, que é usado em runtime.**

## 12. Estado do repositório (13/09/2026)

- Branch `main`, HEAD `3fdf333 "6.8"`.
- Staged: `controllers/edicaoWizardController.js`, `models/profileImageStore.js`, `public/js/edicaoWizard.js`, `services/edicaoService.js`, `services/edicaoWizardService.js`, `services/resultadosIndividuaisService.js`, `tests/edicaoWizard.test.js`, `views/adm/edicaoWizard.ejs`, `views/adm/edicoesAnteriores.ejs`.
- Unstaged: `controllers/adminController.js`, `controllers/edicaoWizardController.js`, `routes/adminRoutes.js`, `services/edicaoWizardService.js`, `tests/edicaoWizard.test.js`, `views/adm/edicaoWizard.ejs`, `views/adm/edicoesAnteriores.ejs`, `views/layout.ejs`.
- Untracked: `err.txt`, `err2..4.txt`, `out.txt`, `out2..4.txt`, `services/exemploEdicaoService.js`, `ANALISE_SISTEMA.md` (este arquivo).