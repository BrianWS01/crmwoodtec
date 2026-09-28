# CRM WoodTec Company

CRM próprio para prospecção B2B e envio de mensagens pelo WhatsApp.
HTML + Bootstrap 5 + JavaScript puro (ES Modules) + Supabase. Sem etapa de build.

> O banco começa **vazio**. Não existe nenhum dado de exemplo no projeto.

## Status das fases

| Fase | Conteúdo | Status |
|---|---|---|
| 1 | Schema Supabase, login, cadastro, validações | ✅ |
| 2 | Pipeline Kanban com drag and drop | ✅ |
| 3 | Importação CSV/TXT com prévia e mapeamento | ⏳ |
| 4 | Mensagens padrão, envio WhatsApp, disparo em sequência | ⏳ |
| 5 | Exportação, histórico e ajustes | ⏳ |

---

## 1. Criar o projeto no Supabase

1. Acesse <https://supabase.com>, entre e clique em **New project**.
2. Escolha nome, senha do banco (guarde-a) e a região **South America (São Paulo)**.
3. Aguarde o projeto ficar pronto.

## 2. Rodar o schema

1. No painel do projeto: **SQL Editor** → **New query**.
2. Cole todo o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) e clique em **Run**.
3. Confira em **Table Editor** as tabelas `leads`, `mensagens_padrao` e `historico_contatos`, todas com o selo de RLS ativo.

O script pode ser rodado de novo sem erro (útil quando ele for atualizado nas próximas fases).

## 3. Criar o seu usuário e bloquear cadastros públicos

1. **Authentication** → **Users** → **Add user** → **Create new user**.
2. Informe e-mail e senha e marque **Auto Confirm User**.
3. **Importante:** em **Authentication** → **Sign In / Providers**, desligue **Allow new users to sign up**.
   A anon key fica visível no navegador; com o cadastro desligado, ninguém consegue criar conta por fora.
   (Mesmo que conseguisse, o RLS não deixaria essa pessoa ver os seus dados.)

## 4. Configurar o `config.js`

1. Copie `js/config.example.js` para `js/config.js`.
2. No Supabase: **Project Settings** → **API** (ou **API Keys**):
   - `SUPABASE_URL` = **Project URL**
   - `SUPABASE_ANON_KEY` = chave **anon** / **publishable**
3. **Nunca** use a chave `service_role` / `secret` no front.

O `js/config.js` está no `.gitignore`, então não vai para o Git.

## 5. Rodar localmente

Os ES Modules não funcionam abrindo o arquivo direto (`file://`). É preciso um servidor estático:

- **VS Code:** instale a extensão **Live Server**, clique com o botão direito no `index.html` → **Open with Live Server**.
- Ou, com Node instalado: `npx serve .`

Abra o endereço mostrado (ex.: `http://127.0.0.1:5500/index.html`) e entre com o usuário criado no passo 3.

## 6. Rodar os testes

Os testes cobrem as funções puras (validação e, nas próximas fases, parser e mensagens).
Eles usam valores definidos no próprio teste e **não acessam o banco**.

- **No navegador:** com o Live Server rodando, abra `tests/run.html`.
- **No Node (18+):** `node tests/run.mjs`

## 7. Publicar

A anon key é pública por natureza (a proteção é o RLS), então o `config.js` pode ir junto no deploy.
Só não deve ir para o repositório.

- **Netlify (mais simples):** em <https://app.netlify.com/drop>, arraste a pasta do projeto (com o `config.js` dentro).
- **Vercel / GitHub Pages / Netlify via Git:** como o `config.js` não está no repositório, gere-o no deploy.
  Exemplo de build command no Netlify/Vercel, com as variáveis `SUPABASE_URL` e `SUPABASE_ANON_KEY` cadastradas no painel:

  ```
  printf "export const SUPABASE_URL='%s';\nexport const SUPABASE_ANON_KEY='%s';\n" "$SUPABASE_URL" "$SUPABASE_ANON_KEY" > js/config.js
  ```

Depois de publicar, em **Authentication** → **URL Configuration** do Supabase, coloque o endereço do site em **Site URL**.

---

## Estrutura

```
index.html            login
app.html              CRM
css/styles.css
js/config.example.js  modelo de credenciais (copie para config.js)
js/constants.js       etapas, serviços, segmentos sugeridos
js/validators.js      CNPJ, telefone, máscaras, normalizações (puro)
js/regras.js          atraso de follow-up, dias na etapa, parados, filtros, ordenação (puro)
js/pipeline.js        Kanban: resumo por etapa, colunas, cards, arrastar (SortableJS)
js/lista.js           visão em tabela
js/supabase.js        cliente + tradução de erros
js/auth.js            login, sessão, sair
js/leads.js           CRUD de leads
js/ui.js              toasts, confirmação, estados vazios, validação de formulário
js/app.js             ponto de entrada do app.html
supabase/schema.sql   tabelas, constraints, índices, RLS, funções
tests/                testes das funções puras
```

## Regras de dados

- **Telefone:** salvo como `55` + DDD + 8 ou 9 dígitos (ex.: `55` `11` `9xxxxxxxx`). O DDD é conferido contra a lista da Anatel; celular com 9 dígitos precisa começar com 9.
- **CNPJ:** opcional, salvo só com os 14 dígitos, com os dígitos verificadores conferidos.
- **Duplicados:** o mesmo CNPJ ou telefone não pode aparecer em dois leads. O banco garante isso (índices únicos) e a tela mostra qual lead já usa o dado.
- **Mudança de etapa:** passa pela função `mover_lead`, que grava `movido_em` e o histórico na mesma transação.
- **Contato atrasado:** follow-up com data anterior a hoje (Fechado e Perdido não geram alerta).
- **Parado:** 7 dias ou mais na mesma etapa (constante `DIAS_PARADO` em `js/regras.js`).
- **Ordem dos cards:** atrasados (o mais antigo primeiro) → follow-up hoje → follow-up futuro → sem follow-up (o mais tempo parado primeiro).
