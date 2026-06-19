# Especificação Técnica do Dashboard Gerencial

Este documento descreve detalhadamente a arquitetura, o design, a lógica do frontend e a integração com o backend do **Dashboard Gerencial**. Ele serve como um guia completo para a reprodução exata desta solução em qualquer outra pasta ou contexto.

---

## 1. Arquitetura Geral

O aplicativo é uma **SPA (Single Page Application)** estática e minimalista baseada em tecnologias web nativas:
* **Estrutura**: HTML5 semântico.
* **Estilização**: CSS Vanilla (sem frameworks ou pré-processadores).
* **Lógica**: JavaScript Vanilla (ES6+) sem dependências externas.
* **Autenticação**: Controle de acesso básico no cliente (Gate com senha), validado pelo backend por token.

---

## 2. Design e Estilização (CSS)

O aplicativo utiliza um tema escuro moderno (*glassmorphism* implícito, bordas finas e contrastes limpos).

### Sistema de Cores (CSS Variables)
```css
:root {
  --bg: #0b1220;
  --card: #131d31;
  --line: #24314f;
  --text: #e6efff;
  --muted: #9fb0cf;
  --accent: #1d9bf0;
  --ok: #22c55e;
  --error: #ef4444;
  --warning: #f59e0b;
}
```

### Elementos Visuais Chave
* **Fundo da Página**: Gradiente radial suave para dar profundidade:
  ```css
  background: radial-gradient(circle at 20% 10%, #182846 0%, #0b1220 50%);
  ```
* **Tipografia**: Família de fontes sem serifa (`Inter`, `Plus Jakarta Sans`, ou `Arial, Helvetica, sans-serif`) com tamanho base legível e pesos adequados.
* **Layout**:
  * Centralizado usando uma classe `.wrap` com largura máxima de `1180px` e margem automática.
  * Uso de `display: flex` e `display: grid` para posicionamento e responsividade dos botões e barras de ferramentas.
* **Tabela de Dados**: Layout de tabela padrão adaptada para rolagem lateral em telas pequenas (`max-width: 900px`).

---

## 3. Lógica do Frontend (JavaScript)

Toda a lógica está encapsulada dentro de um **IIFE (Immediately Invoked Function Expression)** para evitar poluição do escopo global.

### A. Resolução Dinâmica da URL da API
O script detecta automaticamente em qual ambiente está rodando:
```javascript
const isLocal = location.hostname.includes('localhost') || location.hostname === '127.0.0.1';
const API_BASE = isLocal ? 'http://localhost:3001' : 'https://formulario-production-8df7.up.railway.app';
```

### B. Controle de Acesso (Gate)
1. **Padrão Inicial**: O wrapper principal (`.wrap`) inicia oculto (com a classe `.locked` tendo `display: none`). A tela de login/senha (`#gate`) é exibida por padrão.
2. **Senha Administrativa**: A senha de acesso (`Cosmob2026@`) está hardcoded no script do cliente como `ADMIN_PASSWORD`.
3. **Persistência de Sessão**:
   - É utilizada a chave `admin_access_token` no `sessionStorage` para guardar o token após o login.
   - Ao iniciar, o script verifica a chave no `sessionStorage`. Se for correspondente, desbloqueia o painel automaticamente.
4. **Transição de Tela**:
   - O formulário intercepta o evento de `submit`.
   - Se a senha corresponder a `ADMIN_PASSWORD`, executa-se a função `setLocked(false)` que oculta o `#gate`, remove a classe `.locked` do `.wrap` e inicia o carregamento dos dados (`carregar()`).
   - Se incorreta, exibe erro e mantém o bloqueio.

### C. Carregamento dos Dados
1. **Requisição HTTP**: Realiza um `fetch` para `${API_BASE}/api/admin/respostas?token=${ADMIN_PASSWORD}`.
2. **Processamento da Resposta**:
   - O backend retorna um JSON contendo `{ success: true, data: [...] }`.
   - A lista retornada é filtrada com base no campo de busca (`#search-input`) e percorrida gerando dinamicamente linhas (`<tr>`) no DOM.
3. **Formatação e Exibição de Dados**:
   - **Data e Hora**: Convertida para exibição no fuso horário do Brasil (`America/Sao_Paulo`) no formato `DD/MM/AAAA HH:MM`.
   - **Índices (IGC / PCM)**: Valores numéricos formatados para uma casa decimal com sufixo percentual (ex: `75.4% / 60.0%`). O PCM (originalmente de 0 a 2.0) é convertido para percentual: `(pcm / 2.0) * 100`.
   - **Visualização Condicional do Relatório**:
     - Botão **Visualizar HTML** aponta para `${API_BASE}/api/admin/respostas/:id/html?token=...` (abre em nova aba).
     - Botão **Baixar PDF** aponta para `${API_BASE}/api/admin/respostas/:id/pdf?token=...` (abre ou baixa em nova aba).

---

## 4. Contrato de Integração com o Backend (API)

O backend expõe três endpoints específicos com autenticação de token via Query Param `token` ou Header `x-admin-token`:

### A. Listagem de Respostas
* **Rota**: `GET /api/admin/respostas`
* **Retorno Esperado (JSON)**:
  ```json
  {
    "success": true,
    "data": [
      {
        "id": 1,
        "assessment_id": "b02888ba-5b92-47a3-9877-a39e62a993cd",
        "nomeResponsavel": "João Silva",
        "nomeEmpresa": "Empresa X",
        "cidade": "Macapá",
        "uf": "AP",
        "produto": "Queijo",
        "dataHora": "15/06/2026 14:30",
        "igc": 75.5,
        "pcm": 1.6,
        "temHtml": true
      }
    ]
  }
  ```

### B. Relatório em PDF
* **Rota**: `GET /api/admin/respostas/:id/pdf`
* **Query Params**: `token` (validação) e `download=1` (opcional, força download).
* **Comportamento**: Retorna um stream de PDF (`application/pdf`) gerado dinamicamente no servidor com as respostas e recomendações do preenchimento correspondente ao ID ou UUID informado.

### C. Relatório em HTML
* **Rota**: `GET /api/admin/respostas/:id/html`
* **Query Params**: `token` (validação) e `download=1` (opcional, força download).
* **Comportamento**: Retorna a página web estática gerada pelo questionário original contida no banco de dados (`text/html; charset=UTF-8`).

---

## 5. Estrutura do Banco de Dados Relacional (PostgreSQL)

O app assume a existência das tabelas relacionadas:

### Tabela `companies`
* `id` (SERIAL, Chave Primária)
* `document` (CNPJ único)
* `legal_name` (Razão Social)
* `city` (Cidade)
* `state` (UF)
* `responsible_name` (Responsável)
* `product` (Produto Avaliado)

### Tabela `assessments`
* `id` (SERIAL, Chave Primária)
* `assessment_id` (UUID único)
* `company_id` (Chave Estrangeira apontando para `companies.id`)
* `igc` (Valor numérico do IGC)
* `pcm` (Valor numérico do PCM)
* `analysis_json` (JSON contendo o snapshot das respostas compiladas e o relatório textual de IA)
* `created_at` (Timestamp de criação)

---

## 6. Histórico de Problemas Encontrados e Soluções Aplicadas

Durante a fase de desenvolvimento e publicação da solução, os seguintes problemas foram detectados e corrigidos:

### A. Constante Indefinida no Frontend (`ACCESS_TOKEN_KEY`)
* **Problema**: O código original chamava `sessionStorage.removeItem(ACCESS_TOKEN_KEY);` no tratamento de erros, mas a constante `ACCESS_TOKEN_KEY` não estava declarada no arquivo, provocando um erro de referência (`ReferenceError`).
* **Solução**: Declarou-se a constante `const ACCESS_TOKEN_KEY = "admin_access_token";` no início de `assets/dashboard.js`, garantindo também a persistência do token para evitar logins desnecessários ao atualizar a página.

### B. Falha de Leitura do HTML/JSON no Netlify (`API_BASE` Relativa)
* **Problema**: A resolução da API para ambientes Netlify estava configurada como `isNetlify ? ''`. Como a aplicação final de backend é hospedada separadamente no Railway e a SPA do painel foi publicada no Netlify como um site independente, as chamadas relativas batiam no próprio servidor do Netlify, gerando erros 404 com resposta HTML. O navegador disparava o erro `The string did not match the expected pattern` ao tentar ler HTML como JSON.
* **Solução**: Configurou-se `API_BASE` para usar a URL absoluta do Railway (`https://formulario-production-8df7.up.railway.app`) quando fora do ambiente de desenvolvimento local (`localhost`).

### C. Bloqueio de Política de CORS em Produção
* **Problema**: A SPA publicada no Netlify apresentava o erro `TypeError: Load failed` ao tentar consultar o backend no Railway, pois o domínio dinâmico do Netlify não constava na variável estática `CORS_ORIGIN` configurada no servidor.
* **Solução**: O middleware CORS do backend em [backend/api/server.js](file:///Users/APLICATIVOS%20GERAIS/LATICINIOS%20CIRCULAR/backend/api/server.js) foi ajustado para permitir dinamicamente qualquer origem oriunda do domínio do Netlify (`*.netlify.app`) e do `localhost`, eliminando atritos de deploy.

### D. Diretório de Build e Código Inativo no Railway
* **Problema**: As primeiras correções locais do backend não refletiam no Railway após o deploy. Descobriu-se que o serviço do Railway compila a pasta de produção `backend/` do repositório, mantendo a pasta `/api` da raiz inativa.
* **Solução**: Os scripts corrigidos do backend (`server.js` e `admin-report.js`) foram copiados para a pasta correspondente `backend/api/` antes do deploy `railway up`.

### E. Bug de Cálculo no PDF Multipáginas (Zero Dependências)
* **Problema**: O gerador nativo de PDF lançava um erro `Cannot read properties of undefined (reading 'content')` no servidor ao tentar ler o objeto de stream do PDF final, decorrente de uma falha na contagem total de objetos (`totalObjCount = 3 + N + 1 + N`).
* **Solução**: Corrigiu-se o totalizador de objetos na estrutura binária para `3 + 2 * N`, garantindo o mapeamento correto de todos os IDs sem gaps (Catalog, Pages, 3 Páginas de Conteúdo, Fonte e 3 Streams de texto).
