# Status do App

Data da atualização: 2026-06-03 00:00:00 -03

## Estágio atual

Fase de separação operacional dos frontends, com backend persistente no Railway e duas entregas estáticas prontas para deploy independente: formulário operacional e dashboard territorial coletivo para Divinópolis, Minas Gerais, no setor de construção civil.

O app deixou de ser apenas um formulário com relatório final individual e passou a operar em duas camadas independentes:

- captura operacional da empresa e do questionário
- leitura territorial agregada para decisão coletiva do distrito

## O que está pronto

- Dashboard estático preparado para deploy direto pela branch `netlify-dashboard`.
- Repositório estático dedicado do formulário pronto em `repos/formulario-construcao/`.
- Repositório estático dedicado do dashboard pronto em `repos/dashboard-construcao/`.
- Home unificada preservada em `frontend/index.html` apenas como referência de navegação.
- Backend Node.js em `api/` com cálculo de IGC, PCM, total e média de pontos.
- Persistência no PostgreSQL via Railway.
- Arquivamento do relatório final de cada resposta em `analysis_json`.
- Endpoint público de leitura do relatório arquivado por `assessmentId`.
- Agregação do dashboard reescrita para priorizar a carteira por empresa, sem perder o histórico de avaliações.
- Camada heurística de diagnóstico executivo no dashboard.
- Validação de submissão no backend para rejeitar payload malformado ou incompleto.
- Integração opcional com OpenRouter para leitura cognitiva adicional quando a chave estiver configurada.

## O que foi validado

- Conexão do backend com o PostgreSQL no Railway.
- Criação automática das tabelas.
- Gravação de respostas do formulário no banco.
- Arquivamento e recuperação do relatório final por `assessmentId`.
- Healthcheck real do banco em `/api/health`.
- Sincronização entre `frontend/` e os sites espelhados em `repos/`.
- Resposta do agregado do dashboard com base pública populada.
- Rejeição de submissão inválida no endpoint `POST /api/assessments`.
- Sintaxe do backend do dashboard com `node -c api/dashboard.js`.
- Sintaxe do JavaScript inline do dashboard com parsing local.

## Escopo já entregue no novo dashboard

- Hero territorial orientado a Divinópolis.
- KPIs de empresas, avaliações, IGC, PCM, respostas "Não sei" e confiança amostral.
- Bloco comparativo entre BI descritivo e camada cognitiva.
- Distribuição por bandas de maturidade.
- Leitura por estágio da circularidade.
- Matriz analítica IGC x PCM.
- Tendência histórica das avaliações.
- Lista de empresas líderes.
- Lista de empresas de atenção.
- Lista de avaliações recentes.
- Foco exclusivamente coletivo, sem drilldown individual dentro do painel.

## O que ainda não está concluído

- Publicação efetiva dos dois sites separados na Netlify com domínios próprios.
- Entrada de respostas reais de empresas para substituir a massa sintética de demonstração.
- Ajuste fino da narrativa executiva com a primeira base real de Divinópolis.
- Eventual refinamento da camada de IA após observar o comportamento da base real.
- Decisão sobre quando remover a massa `[DEMO]` e abrir operação exclusivamente com dados reais.

## Risco operacional atual

- O fluxo principal do aplicativo já funciona: formulário, gravação, arquivamento, leitura e dashboard.
- O principal ponto pendente não é infraestrutura nem persistência, e sim a transição da base sintética para a base real de produção.
- Se a chave do OpenRouter falhar ou não existir, o painel continua operando com heurística local.
- O backend agora rejeita submissões incompletas, o que reduz risco de poluição silenciosa da base.
- Ainda existe risco documental se alguém assumir que o deploy continua unificado; a referência correta agora é a separação por site.

## Próximo estágio recomendado

- Publicar `repos/formulario-construcao` e `repos/dashboard-construcao` em sites independentes.
- Iniciar coleta real no formulário público.
- Monitorar as primeiras submissões reais em `Divinopolis/MG`.
- Remover a massa `[DEMO]` quando a base real já permitir leitura útil do distrito.
- Só depois disso iniciar refinamentos cosméticos, expansão de filtros ou camada agente mais sofisticada.
