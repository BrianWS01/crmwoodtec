# CRM WoodTec Company

CRM próprio para prospecção B2B e envio de mensagens pelo WhatsApp.
HTML + Bootstrap 5 + JavaScript puro (ES Modules) + Supabase. Sem etapa de build.

> O banco começa **vazio**. Não existe nenhum dado de exemplo no projeto.

## Status das fases

| Fase | Conteúdo | Status |
|---|---|---|
| 1 | Schema Supabase, login, cadastro, validações | ✅ |
| 2 | Pipeline Kanban com drag and drop | ✅ |
| 3 | Importação CSV/TXT/Excel com prévia, mapeamento e duplicados | ✅ |
| 4 | Mensagens padrão com variáveis, envio WhatsApp com registro | ✅ |
| 5 | Histórico do lead, anotações e painel de resultados | ✅ |
| 6 | Automação: fila do dia, follow-up automático, equipe, CNPJ, tempo real | ✅ |

## Automações

- **Hoje:** abre direto na fila de quem precisa de contato: atrasados → retornos de hoje → novos → esquecidos.
  Cada item tem Enviar (WhatsApp com a mensagem pronta), Respondeu, Adiar e Perdido.
- **Mensagem pronta:** o CRM escolhe o modelo pela etapa, segmento e serviço do lead e preenche
  `{saudacao}`, `{responsavel}`, `{empresa}`, `{segmento}`, `{servico}`, `{cidade}` e `{vendedor}`.
  Ao enviar, registra o contato, conta a tentativa, move de Novo para Mensagem enviada e agenda o retorno.
- **Follow-up automático:** ao mudar de etapa, o próximo retorno é agendado pela cadência
  (Configurações → Follow-up automático). Depois de 3 mensagens sem resposta o CRM sugere marcar como perdido.
- **CNPJ:** botão Buscar no cadastro preenche nome, telefone, e-mail, cidade, UF e responsável (BrasilAPI).
- **Equipe:** todo usuário criado em Authentication vira membro e vê os mesmos leads; cada lead tem um vendedor.
  Mudanças de um aparecem na tela do outro em tempo real.
- **Resultados:** conversão, ciclo médio, funil, leads por origem e segmento, mensagens e fechamentos por vendedor.

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

### Vercel (configurado no projeto)

O `vercel.json` já manda a Vercel rodar `scripts/build-vercel.sh`, que copia o site para `public/`
e gera o `js/config.js` a partir de duas variáveis de ambiente.

1. Em <https://vercel.com/new>, importe o repositório do GitHub.
2. Antes de clicar em **Deploy**, abra **Environment Variables** e cadastre:
   - `SUPABASE_URL` = Project URL do Supabase
   - `SUPABASE_ANON_KEY` = chave anon / publishable
3. Clique em **Deploy**. Framework, build e pasta de saída vêm do `vercel.json` (não precisa mexer).
4. Cada `git push` no `main` publica de novo sozinho.

Se o deploy falhar com "Defina SUPABASE_URL...", faltou cadastrar a variável: cadastre e clique em **Redeploy**.

### Netlify (sem Git)

Em <https://app.netlify.com/drop>, arraste a pasta do projeto (com o `config.js` dentro).

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
js/fila.js            visão Hoje (fila do dia)
js/envio.js           modal de envio de WhatsApp
js/mensagens.js       variáveis, saudação e escolha do modelo (puro)
js/importar.js        leitura de CSV, mapeamento e validação da importação (puro)
js/importacao.js      tela de importação (usa SheetJS para .xlsx)
js/cnpj.js            consulta de CNPJ na BrasilAPI
js/metricas.js        números do painel (puro)
js/painel.js          visão Resultados
js/configuracoes.js   mensagens, cadência e equipe
js/dados.js           acesso a membros, mensagens, cadência e histórico
supabase/schema.sql   tabelas, constraints, índices, RLS, funções
tests/                testes das funções puras
scripts/build-vercel.sh  build da Vercel (gera js/config.js a partir das variáveis)
vercel.json           configuração do deploy na Vercel
```

## Regras de dados

- **Equipe:** o acesso é por equipe (tabela `membros`). Deixe **Allow new users to sign up** desligado: qualquer usuário criado vê todos os leads.
- **Duplicados valem para a equipe toda:** o mesmo telefone ou CNPJ não entra duas vezes, seja quem for que cadastrou.

- **Telefone:** salvo como `55` + DDD + 8 ou 9 dígitos (ex.: `55` `11` `9xxxxxxxx`). O DDD é conferido contra a lista da Anatel; celular com 9 dígitos precisa começar com 9.
- **CNPJ:** opcional, salvo só com os 14 dígitos, com os dígitos verificadores conferidos.
- **Duplicados:** o mesmo CNPJ ou telefone não pode aparecer em dois leads. O banco garante isso (índices únicos) e a tela mostra qual lead já usa o dado.
- **Mudança de etapa:** passa pela função `mover_lead`, que grava `movido_em` e o histórico na mesma transação.
- **Contato atrasado:** follow-up com data anterior a hoje (Fechado e Perdido não geram alerta).
- **Parado:** 7 dias ou mais na mesma etapa (constante `DIAS_PARADO` em `js/regras.js`).
- **Ordem dos cards:** atrasados (o mais antigo primeiro) → follow-up hoje → follow-up futuro → sem follow-up (o mais tempo parado primeiro).
