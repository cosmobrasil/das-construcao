# Deploy Railway + Netlify

## Backend no Railway

1. Crie um serviço Node.js apontando para este diretório.
2. Adicione um banco PostgreSQL no Railway.
3. Configure as variáveis de ambiente:
   - `DATABASE_URL`
   - `EMPRESAQUI_API_URL`
   - `EMPRESAQUI_TOKEN`
   - `EMPRESAQUI_TOKEN_HEADER=Authorization`
   - `OPENROUTER_API_KEY`
   - `OPENROUTER_MODEL=openai/gpt-4o-mini`
   - `OPENROUTER_SITE_URL=https://seu-site.netlify.app`
   - `OPENROUTER_APP_NAME=CosmoBrasil 2.0`
   - `CORS_ORIGIN=https://seu-site.netlify.app`
   - `PGSSLMODE=require`
4. Inicie o serviço com `npm start`.
5. Valide:
   - `GET /health`
   - `GET /api/health`
   - `GET /api/questions`
   - `GET /api/company/lookup?documento=...`
   - `POST /api/assessments`

## Frontend na Netlify

O repositório principal está preparado para publicar o dashboard como site estático independente:

1. Mantenha `publish = "frontend/dashboard"` no `netlify.toml`.
2. Publique a branch `netlify-dashboard` normalmente.
3. Edite `frontend/dashboard/config.js` e confirme:
   - `window.COSMOBRASIL_API_BASE_URL = "https://backend-production-5b5cc.up.railway.app";`
4. Teste o fluxo do painel:
   - carregamento do dashboard
   - filtros territoriais
   - leitura agregada por empresa
   - tendência histórica
   - fallback heurístico quando a IA não estiver disponível

Para manter formulário e dashboard em sites separados, use os repositórios estáticos já preparados em `repos/`:

5. `repos/formulario-construcao` publica a raiz do formulário com `publish = "."`.
6. `repos/dashboard-construcao` publica a raiz do dashboard com `publish = "."`.
7. Em ambos os casos, deixe `Base directory`, `Publish directory` e `Build command` vazios na Netlify.
8. Confirme os arquivos de configuração:
   - `repos/formulario-construcao/config.js`
   - `repos/dashboard-construcao/config.js`
9. Teste o fluxo completo do formulário no site dedicado:
   - cadastro da empresa
   - preenchimento automático via EmpresaAqui
   - respostas do questionário
   - relatório final com IGC e PCM
   - arquivamento do relatório final no PostgreSQL
   - leitura do relatório em `GET /api/assessments/:id`

## Observações

- O frontend usa `config.js` para apontar para o backend.
- O backend usa `EMPRESAQUI_TOKEN` apenas no servidor.
- A camada de insight inteligente no dashboard usa `OPENROUTER_API_KEY` no servidor; se a chave não existir ou a API falhar, o painel volta para a heurística local.
- O novo dashboard foi desenhado para trabalhar por empresa e por território, usando a avaliação mais recente de cada empresa para a leitura principal e preservando o histórico para tendência e drilldown.
- Não coloque o token dentro do HTML público.

## Separação por público

Esta passou a ser a topologia de referência para operação real, porque formulário e dashboard atendem usuários diferentes:

- empresários: formulário operacional
- analistas técnicos: dashboard territorial

Topologia recomendada:

- `formulario.seu-dominio.com` publicando `repos/formulario-construcao`
- `dashboard.seu-dominio.com` publicando `repos/dashboard-construcao`
- backend compartilhado no Railway

Arquivos de apoio incluídos neste repositório:

- `netlify.formulario.toml` para o site do formulário
- `netlify.dashboard.toml` para o site do dashboard

Na prática, isso evita:

- exposição desnecessária do dashboard ao público do formulário
- mistura de navegação entre perfis diferentes
- dependência de uma home única para dois contextos de uso distintos
