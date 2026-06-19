# Registro de Estabilização dos Aplicativos

## Sistemas Abrangidos

| App | URL | Função | Repositório |
|---|---|---|---|
| Formulário | `circularidade-form.netlify.app` | Coleta dados do usuário e gera relatório individual | `cosmobrasil/formulario` (raiz) |
| Dashboard | `dash-distrito-circular.netlify.app` | Indicadores consolidados de todos os formulários | `cosmobrasil/dash-circular` |
| Gerencial | `pagina-gerencia.netlify.app` | Lista de usuários e acesso aos relatórios individuais | `cosmobrasil/painel-gerencia` |
| Backend | `formulario-production-8df7.up.railway.app` | API central (PostgreSQL + Google Drive) | `cosmobrasil/formulario` (`backend/`) |

---

## Problemas Encontrados e Soluções Aplicadas

### 1. Root `index.html` Sobrescrito pelo Painel de Relatórios

**Problema:** O `index.html` da raiz do repositório foi substituído pelo Painel de Relatórios (dashboard gerencial). O formulário público ficou apenas em `formulario-github/index.html`, mas o Netlify publica a raiz (`publish = "/"`), então o site `circularidade-form.netlify.app` exibia o painel com senha em vez do formulário.

**Causa:** Commit `97a34d8` sobrescreveu o root `index.html`.

**Solução:** Restaurar o formulário como `index.html` da raiz copiando de `formulario-github/index.html`.

**Arquivo:** `index.html` (raiz)

```bash
cp formulario-github/index.html index.html
git add index.html
git commit -m "fix: restaura formulario como index.html da raiz (Netlify)"
```

**Commit referência:** `0281d54` / `e74aafe`

---

### 2. Site Gerencial Servindo o Mesmo Conteúdo do Formulário

**Problema:** `pagina-gerencia.netlify.app` exibia o mesmo "Painel de Relatórios" do formulário, porque o repositório `painel-gerencia` também tinha `publish = "."` na raiz, servindo o root `index.html`.

**Causa:** Root `netlify.toml` com `publish = "."` e sem configuração de diretório base no Netlify.

**Solução:**

1. Alterar `netlify.toml` da raiz para `publish = "dashboard-gerencial"` no repositório `painel-gerencia`.
2. Adicionar `dashboard-gerencial/netlify.toml` próprio com `publish = "."`, redirects para API e headers de segurança.
3. Corrigir navegação com URLs absolutas entre os 3 apps.

**Arquivos:**

- `netlify.toml` — `publish = "dashboard-gerencial"`
- `dashboard-gerencial/netlify.toml` — configuração isolada do app
- `dashboard-gerencial/index.html` — links de navegação absolutos

```toml
# netlify.toml (raiz do painel-gerencia)
[build]
  publish = "dashboard-gerencial"

[[redirects]]
  from = "/api/*"
  to = "https://formulario-production-8df7.up.railway.app/api/:splat"
  status = 200
  force = true
```

```toml
# dashboard-gerencial/netlify.toml
[build]
  publish = "."

[[redirects]]
  from = "/api/*"
  to = "https://formulario-production-8df7.up.railway.app/api/:splat"
  status = 200
  force = true

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200

[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"
    Permissions-Policy = "camera=(), microphone=(), geolocation=()"
```

**Nav links corrigidos** (em `dashboard-gerencial/index.html`):

```html
<div class="nav">
  <a href="https://circularidade-form.netlify.app/">Formulário</a>
  <a href="https://dash-distrito-circular.netlify.app/">Dashboard Analítico</a>
  <a class="active" href="./">Dashboard Gerencial</a>
</div>
```

> **Importante:** Links relativos (`../index.html`) não funcionam quando cada app está em domínios separados. Use sempre URLs absolutas.

**Commit referência:** `cd93a46` (painel-gerencia)

---

### 3. Frontend sem Resiliência a Timeout

**Problema:** As chamadas `fetch()` nos frontends não tinham timeout nem retry. Se a API demorasse ou falhasse, o usuáriovia uma tela congelada ou erro genérico.

**Solução:** Implementar `fetchComTimeout` e `fetchComRetry` em todos os frontends.

**Arquivos:**

- `formulario-github/app-postgres.js`
- `dashboard-circularidade/app.js`
- `dashboard-gerencial/index.html`

```javascript
// fetchComTimeout — aborta após N ms
const FETCH_TIMEOUT_MS = 15000;

function fetchComTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

// fetchComRetry — tenta novamente em caso de falha
async function fetchComRetry(url, options = {}, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fetchComTimeout(url, options);
    } catch (error) {
      if (i === retries) throw error;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
}
```

**Uso nos apps:**

| App | Timeout | Retry | Feedback |
|---|---|---|---|
| Formulário | 15s | 2 tentativas | Mensagens específicas por operação (formulário, dashboards, painel) |
| Dashboard | 15s | Não | `mostrarStatus()` com tipo 'erro' ou 'info' |
| Gerencial | 15s | Não | Mensagem de erro no elemento `#status` |

---

### 4. CNPJ sem Fallback (EmpresaAqui era Ponto Único de Falha)

**Problema:** A consulta de CNPJ dependia exclusivamente da API EmpresaAqui. Quando ela falhava (timeout, erro HTTP, JSON inválido), o formulário não conseguia preencher os dados da empresa.

**Solução:** Implementar fallback para BrasilAPI quando a EmpresaAqui falhar.

**Arquivo:** `backend/server.js`

```javascript
// Fluxo de consulta CNPJ:
// 1. Tenta EmpresaAqui (com timeout via AbortController)
// 2. Se falhar, tenta BrasilAPI como fallback
// 3. Se ambos falharem, retorna erro amigável

async function consultarCNPJ(cnpj, token) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    // Tenta EmpresaAqui
    const result = await consultarCnpjEmpresaqui(cnpj, token, controller.signal);
    if (result) return result;
  } catch (error) {
    log.warn('CNPJ', `EmpresaAqui falhou: ${error.message}`);
  } finally {
    clearTimeout(timeout);
  }

  // Fallback: BrasilAPI
  const result = await consultarCnpjFallback(cnpj, controller.signal);
  if (result) return result;

  throw new Error('CNPJ não encontrado em nenhuma fonte.');
}
```

---

### 5. CORS Restritivo Bloqueando os Frontends

**Problema:** O backend só permitia origens específicas. Frontends em novos subdomínios Netlify eram bloqueados.

**Solução:** Adicionar `*.netlify.app` à lista de origens permitidas no CORS.

**Arquivo:** `backend/server.js`

```javascript
const corsOptions = {
  origin: [
    /\.netlify\.app$/,
    /^https?:\/\/localhost(:\d+)?$/,
    /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
    process.env.CORS_ORIGIN,
  ].filter(Boolean),
  credentials: true,
};
```

---

### 6. Coluna `relatorio_html` Inconsistente entre Ambientes

**Problema:** O backend tentava criar a coluna `relatorio_html` automaticamente em runtime. Se a criação falhasse, o relatório HTML não era persistido e o painel gerencial perdia o endpoint `/html`.

**Solução:**

1. Migration explícita em `backend/migrations/2026-06-19-add-relatorio-html.sql`.
2. Criação automática apenas em desenvolvimento como fallback.
3. Validação e log estruturado da presença das colunas no startup.

**Arquivo:** `backend/server.js`

```javascript
// Startup: detecta colunas e schema
async function detectarSchema() {
  const result = await pool.query(`
    SELECT
      EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_name='empresas' AND column_name='uf') AS has_uf,
      EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_name='questionarios' AND column_name='relatorio_html') AS has_relatorio_html
  `);
  // ...
  log.info('SCHEMA', 'Colunas detectadas', {
    empresas_uf: hasUfColumn,
    relatorio_html: hasRelatorioHtmlColumn,
    indice_pcm: hasIndicePcmColumn,
    unaccent: hasUnaccentExtension,
  });
}
```

---

### 7. Google Drive Bloqueando o Fluxo Principal

**Problema:** O upload para o Google Drive era síncrono no mesmo request do formulário. Se o Drive falhasse, a resposta ao usuário demorava ou falhava.

**Solução:** Delegar o upload do Drive para `setImmediate()` (segundo plano), sem bloquear a resposta.

**Arquivo:** `backend/server.js`

```javascript
// Upload do Drive em segundo plano — não bloqueia a resposta
if (driveService.isAuthenticated() && relatorioHtml) {
  setImmediate(async () => {
    try {
      const driveResult = await driveService.saveFile(relatorioHtml, fileName, descricao);
      log.info('DRIVE', 'Relatório salvo', { url: driveResult.viewUrl });
    } catch (driveError) {
      log.error('DRIVE', 'Erro ao salvar', { error: driveError.message });
    }
  });
}
```

> A resposta HTTP é enviada imediatamente após a persistência no PostgreSQL. O Drive roda em background e sua falha não afeta o usuário.

---

### 8. Formulário Versionado mas Excluído do Git

**Problema:** O diretório `formulario-github/` continha o formulário principal com resiliência de frontend, mas estava fora do versionamento Git (era uma cópia avulsa).

**Solução:** Adicionar `formulario-github/` ao tracking do Git, removendo duplicatas de pastas internas (`backend/`, `dashboards/`, `painel-relatorios.html`).

**Commit referência:** `622c227`

---

### 9. Observabilidade Inexistente

**Problema:** Todo log era feito com `console.log/warn/error` sem estrutura, impossibilitando diagnóstico rápido de falhas.

**Solução:** Criar `backend/logger.js` com categorias e níveis, e substituir `console.*` no `server.js`.

**Arquivo:** `backend/logger.js`

```javascript
const CATEGORIES = {
  DB:     { prefix: '🗄️  [DB]',     color: '\x1b[36m' },
  DRIVE:  { prefix: '☁️  [DRIVE]',  color: '\x1b[34m' },
  CNPJ:   { prefix: '🔍 [CNPJ]',    color: '\x1b[33m' },
  AUTH:   { prefix: '🔐 [AUTH]',    color: '\x1b[35m' },
  API:    { prefix: '🌐 [API]',     color: '\x1b[32m' },
  SCHEMA: { prefix: '🧭 [SCHEMA]',  color: '\x1b[37m' },
  INIT:   { prefix: '🚀 [INIT]',    color: '\x1b[32m' },
};

function log(category, level, message, data) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const line = data
    ? `${ts} ${CATEGORIES[category].prefix} ${level === 'ERROR' ? '❌' : '✅'} ${message} ${JSON.stringify(data)}`
    : `${ts} ${CATEGORIES[category].prefix} ${level === 'ERROR' ? '❌' : '✅'} ${message}`;
  // ...
}
```

**Endpoints de observabilidade criados:**

- `GET /api/health` — agora retorna schema, Drive, auth, env
- `GET /api/status` — testa cada dependência individualmente (DB, schema, Drive, auth)

**Commit referência:** `904a99b` / `9e15e96`

---

## Padrões Reutilizáveis para Outros Sistemas

### Arquitetura de Deploy (3 repositórios, 3 Netlify)

```
fluxo de deploy:
  GitHub (main) ──push──> Netlify (auto-deploy) ──> site no ar

cada app tem:
  ├── netlify.toml          → configuração de build, publish, redirects, headers
  ├── index.html            → entry point do app
  └── (JS/CSS/assets)       → recursos do app

backend (Railway):
  ├── backend/
  │   ├── server.js         → API Express
  │   ├── logger.js         → logs estruturados
  │   └── google-drive-service.js
  └── netlify.toml (raiz)   → proxy /api/* → Railway
```

### Checklist para Novo App Netlify + Railway

1. **netlify.toml** no diretório do app:
   - `publish = "."` (ou diretório específico)
   - redirect `/api/*` → Railway
   - redirect `/*` → `/index.html` (SPA fallback)
   - headers de segurança (`X-Frame-Options`, `X-Content-Type-Options`, etc.)

2. **Resiliência no frontend:**
   - `fetchComTimeout(url, options, 15000)` em todas as chamadas API
   - `fetchComRetry(url, options, 2)` em operações críticas
   - Mensagens de erro específicas por operação

3. **Observabilidade no backend:**
   - Logger estruturado com categorias
   - Health check detalhado `/api/health`
   - Status de dependências `/api/status`

4. **CNPJ/Fontes externas:**
   - Consulta principal + fallback explícito
   - Timeout configurado via `AbortController`
   - Logs categorizados para diagnóstico

5. **Processos secundários:**
   - Uploads, envios de email, etc. em segundo plano (`setImmediate`)
   - Não bloquear a resposta HTTP com operações externas

### Linha do Tempo das Correções

```
2026-06-19
├── 7730781  CNPJ fallback (BrasilAPI), relatorio_html obrigatório, CORS *.netlify.app
├── 97a34d8  Resiliência frontend (timeout, retry, mensagens de erro)
├── 622c227  Versiona formulario-github com formulário principal
├── 0281d54  Restaura formulário como index.html da raiz
├── 9e15e96  Logger.js + /api/status + logs estruturados
├── cd93a46  Gerencial: publish dashboard-gerencial + nav links absolutos
└── 904a99b  Observabilidade no origin/main + Railway deploy
```
