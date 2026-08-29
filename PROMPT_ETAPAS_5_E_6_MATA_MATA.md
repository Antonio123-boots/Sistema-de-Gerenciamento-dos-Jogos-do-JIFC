# PROMPTS DAS ETAPAS 5 E 6 — MATA-MATA (ELIMINATÓRIA) JIFC

> Documento para continuar o trabalho em sessão futura. As etapas 1–4 já estão
> concluídas e validadas. Copie o bloco de código abaixo como prompt para o agente.

---

## CONTEXTO ATUAL (válido em agosto/2026)

Projeto: Sistema de Gerenciamento dos Jogos do JIFC (Express + EJS + MySQL).
Pasta: `C:\Users\Acer Travel\Documents\TCC\Sistema-de-Gerenciamento-dos-Jogos-do-JIFC`

Já implementado e testado nas etapas 1–4:

- **Banco** (`jogos`): colunas `rotulo_casa`, `rotulo_fora` VARCHAR(24),
  `numero_jogo` INT, `data_hora` DATETIME NULL, `disputa_pontos_1`,
  `disputa_pontos_2` INT NULL. ENUM `fase` inclui `'Terceiro Lugar'`.
  Tudo garantido por `ensureMataMataColumns()` em `config/ensureSchema.js`
  (idempotente, roda no primeiro uso) e espelhado em `database.sql`.
- **Regras** (`utils/sportClassificationRules.js`): campo `padraoEliminatoria`
  ('alternado': futsal, basquete, handebol, vôlei quadra, TM dupla;
  'sequencial': TM individual, vôlei de praia; ausente: atletismo/xadrez) +
  helper `obterPadraoEliminatoria(nome, subCategoria)`.
- **Service** (`services/mataMataService.js`):
  - `montarEstruturaEliminatoria(padrao, qtdChaves)` — puro; suporta G=2 (semis
    direto, 4 jogos), G=3 (quartas com melhores terceiros, 8 jogos), G=4 (8),
    G=8 (16). Semis fundem pares da MESMA metade; 3º lugar antes da final na
    numeração. Rótulos: `1A`/`2C`, `T1`/`T2`, `V13`, `D17`.
  - `gerarEliminatoria(modalidadeId, sub)` — transacional, numeração continua
    dos jogos de grupo (`numero_jogo`), regenera só se nada Encerrado.
  - `resolverEliminatoria(modalidadeId, sub)` — preenche campus/atletas reais
    nos slots a partir de resultados/classificação; empate simples mantém
    pendente; empate com `disputa_pontos_*` diferentes resolve por disputa.
  - `listarEliminatoria(modalidadeId, sub)` — agrupa por fase ordenada.
- **Geração automática**: `chaveamentoService.efetuarChaveamentoMatematico`
  chama `gerarEliminatoriaAposSorteio(...)` nos dois caminhos (individual e
  coletivo) — sorteio e "Refazer Sorteio" criam a eliminatória juntos.
- **Ganchos de resultado** (`services/juizService.js`): `salvarPlacar` (aceita
  `disputa1/disputa2`) e `aplicarWO` chamam `resolverEliminatoriaDoJogo(id)`
  ao encerrar — preenchimento em cascata na hora.
- **Admin** (`views/adm/chaveamento.ejs`): pílula "Eliminatória" ao lado das
  rodadas no carrossel "Confrontos por rodada", com cards editáveis (data/
  horário/local) por fase. Rota manual `POST /admin/chaveamento/eliminatoria/gerar`.
- **Juiz** (`views/juiz/placar.ejs`): campos "Disputa (pênaltis / 7m / cesta
  livre)" aparecem SOMENTE em fases de eliminatória.
- Testes: `tests/mataMata.test.js` (montador) roda via `tests/run-all.js`
  (auto-descobre `*.test.js`). `npm test` = 9 arquivos passando.
- Cache busting atuais em `views/layout.ejs`: `/css/geral.css?v=11`,
  `/css/responsive.css?v=5`. Servidor do usuário roda na porta 3000 (NÃO matar).
  Windows/PowerShell: não usar aspas duplas aninhadas; para scripts Node usar
  arquivo temporário `tmp-*.js` na raiz do projeto, executar e apagar.

---

## PROMPT DA ETAPA 5 — EXIBIÇÃO DA ELIMINATÓRIA NAS TELAS

Copie isto como prompt:

```
Contexto: leia o arquivo PROMPT_ETAPAS_5_E_6_MATA_MATA.md na raiz do projeto —
ele descreve tudo que já existe do mata-mata (etapas 1–4 concluídas). Agora
implemente a ETAPA 5 (exibição), sem alterar backend de geração/resolução:

1) JUIZ precisa ver e julgar os jogos de eliminatória:
   - Confira `obterJogosPorEsporte` em `services/juizService.js`: os jogos com
     fase Oitavas/Quartas/Semifinal/Terceiro Lugar/Final já aparecem na lista?
     Se não, inclua-os (mesma query, sem filtro que os exclua), exibindo o
     rótulo (`rotulo_casa × rotulo_fora`) quando ainda não há campus/atleta,
     e o nome real quando houver.
   - Em `views/juiz/jogos.ejs`, os cards de eliminatória devem seguir o mesmo
     padrão visual dos demais (badge âmbar "W.O." quando `wo=1`, placar quando
     Encerrado, "vs" quando aguardando).

2) HOME PÚBLICA (`views/user.ejs` + partial de card):
   - Os cards da home (destaque e carrossel filtrado) devem ignorar jogos de
     eliminatória enquanto `publicado = 0` (comportamento atual de
     `getJogosPublicados` já filtra por publicado — confirme que nada mudou).
   - Quando publicados, exibir igual aos de grupo: nomes reais, placar,
     badge W.O. Se slot não resolvido, mostrar o rótulo (ex.: "Vencedor Jogo 13"
     ou o próprio rótulo curto `V13`) em vez de nome vazio.

3) CHAVEAMENTO PÚBLICO (`views/chaveamento.ejs` + `getJogosModalidade` em
   `services/chaveamentoService.js`):
   - Hoje a página mostra apenas "VS" (não faz join com resultados). Mantenha
     isso para Fase de Grupos, mas para fases de eliminatória mostre também a
     seção "Eliminatória" agrupada por fase (Oitavas → Quartas → Semifinal →
     Terceiro Lugar → Final), usando `listarEliminatoria` como referência de
     estrutura. Cada confronto: nome real ou rótulo amigável, placar quando
     Encerrado (inclusive placar da disputa entre parênteses, ex.: "1x1 (4x3)"),
     badge "W.O." quando aplicável.
   - Adicione um texto curto explicativo: "Confrontos preenchem automaticamente
     conforme os resultados são confirmados."

4) Consistência visual: se criar qualquer classe nova, adicione em
   `public/css/geral.css` e/ou `public/css/responsive.css` e SUBA O CACHE em
   `views/layout.ejs` (geral.css ?v=12). Reaproveite classes existentes
   (.game-card, .agc-*, .chave-card, .round-pill) sempre que possível.

5) Validação obrigatória antes de encerrar:
   - Compilar todos os EJS alterados (script temporário com ejs.compile).
   - `npm test` (9/9).
   - `Invoke-WebRequest http://localhost:3000/` e `/chaveamento` retornando 200.
   - Cenário real rápido: gere sorteio numa modalidade temporária ("ZZ Futsal
     Temporario", 8 campi), publique os jogos, confira home/chaveamento
     mostrando a eliminatória, depois APAGUE toda a modalidade temporária.
   - NÃO matar o servidor na porta 3000; limpar todos os tmp-*.
```

---

## PROMPT DA ETAPA 6 — VALIDAÇÃO PONTA A PONTA E FECHAMENTO

Copie isto como prompt:

```
Contexto: leia PROMPT_ETAPAS_5_E_6_MATA_MATA.md na raiz do projeto. Etapas 1–5
do mata-mata concluídas. Execute a ETAPA 6 (validação ponta a ponta) SEM criar
funcionalidades novas. Rode cada teste abaixo, em ordem, corrigindo qualquer
desvio encontrado, e reporte o resultado de cada um:

A) INTEGRAIDADE DO BANCO
   - Comparar schema real (information_schema) x database.sql para a tabela
     jogos (colunas novas, ENUM de fase com 'Terceiro Lugar').
   - Confirmar contagem atual de jogos intacta (baseline: 357+ jogos, nenhum
     resíduo de modalidades de teste "ZZ").

B) CICLO COMPLETO EM MODALIDADE TEMPORÁRIA (apagar tudo ao final)
   1. Criar "ZZ Ciclo Completo" (Coletivo/Masculino) + 12 campi inscritos.
   2. Sorteio via efetuarChaveamentoMatematico → 3 chaves esperadas
      (12 campi / chave de 4) → eliminatória automática com 8 jogos
      (Quartas 1A×T2, 1C×2A, 1B×T1, 2B×2C; Semis; 3º lugar; Final).
   3. Encerrar TODOS os grupos pelo fluxo do juiz (salvarPlacar) com forças
      distintas → quartas preenchem sozinhas (incluindo T1/T2 corretos).
   4. Encerrar quartas: uma normal, uma com W.O. (aplicarWO), uma empatada
      com disputa 4x3 → semis e 3º lugar preenchem em cascata.
   5. Encerrar semis (uma com empate SEM disputa → deve ficar pendente;
      depois registrar disputa e resolver) → final preenche por último.
   6. Publicar jogos e conferir HTTP 200 + presença das fases no HTML público.
   7. Apagar modalidade temporária inteira (jogos, chaves, inscrições, modalidade).

C) REGRAS DE NEGÓCIO FIXAS
   - G=2 → 4 jogos | G=3 → 8 | G=4 → 8 | G=8 → 16 | outros tamanhos rejeitados.
   - Atletismo/Xadrez nunca geram eliminatória (nem no sorteio em lote).
   - TM individual = sequencial; TM dupla = alternado.
   - Refazer Sorteio regenera grupos + eliminatória zerados.

D) QUALIDADE
   - npm test → 9/9.
   - node --check em todos os .js alterados.
   - ejs.compile em todas as views alteradas.
   - Home e páginas principais HTTP 200; sem erros no console do servidor
     (pedir ao usuário olhar o terminal dele se necessário).
   - git status sem arquivos tmp-* sobrando; listar arquivos modificados.

E) RELATÓRIO FINAL
   - Resumir em até 15 linhas: o que foi validado, o que foi corrigido, e o
     estado final do mata-mata. Não commitar sem pedido expresso do usuário.
```

---

### Observações finais

- Se o número de testes mudar (novos `.test.js`), ajuste a expectativa "9/9".
- Baseline de jogos pode ter crescido desde agosto/2026 — valide só consistência.
- Qualquer dúvida de regra: os cruzamentos aprovados pelo usuário são os do
  montador `montarEstruturaEliminatoria` (fonte da verdade, cobertos por teste).
