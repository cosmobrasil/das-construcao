# Status do App

Data da atualização: 2026-06-01 11:04:24 -03

## Estágio atual

Fase de operação estabilizada do questionário e do backend, com primeira versão do novo dashboard territorial já implementada para o caso de Divinópolis, Minas Gerais, no setor de construção civil.

O app deixou de ser apenas um formulário com relatório final individual e passou a operar em duas camadas:

- captura operacional da empresa e do questionário
- leitura territorial agregada com drilldown para relatórios arquivados

## O que está pronto

- Frontend principal publicado via Netlify com entrada em `frontend/index.html`.
- Questionário operacional em `frontend/questionario_circularidade/`.
- Backend Node.js em `api/` com cálculo de IGC, PCM, total e média de pontos.
- Persistência no PostgreSQL via Railway.
- Arquivamento do relatório final de cada resposta em `analysis_json`.
- Endpoint público de leitura do relatório arquivado por `assessmentId`.
- Dashboard territorial implementado em `frontend/dashboard/index.html`.
- Agregação do dashboard reescrita para priorizar a carteira por empresa, sem perder o histórico de avaliações.
- Camada heurística de diagnóstico executivo no dashboard.
- Integração opcional com OpenRouter para leitura cognitiva adicional quando a chave estiver configurada.

## O que foi validado

- Conexão do backend com o PostgreSQL no Railway.
- Criação automática das tabelas.
- Gravação de respostas do formulário no banco.
- Arquivamento e recuperação do relatório final por `assessmentId`.
- Healthcheck real do banco em `/api/health`.
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
- Drilldown do relatório arquivado da empresa dentro do painel.

## O que ainda não está concluído

- Validação visual completa do novo dashboard com base real no navegador.
- Ajuste fino da narrativa executiva com dados reais de Divinópolis.
- Eventual refinamento da camada de IA após observar o comportamento da base.
- Publicação e validação final do novo dashboard no deploy produtivo, caso o ambiente ainda esteja servindo a versão anterior.

## Risco operacional atual

- O fluxo principal do aplicativo já funciona: formulário, gravação, arquivamento e leitura.
- O principal ponto pendente não é o backend transacional, e sim a calibração do novo dashboard com dados reais de produção.
- Se a chave do OpenRouter falhar ou não existir, o painel continua operando com heurística local.

## Próximo estágio recomendado

- Validar o dashboard no navegador com dados reais do recorte `Divinopolis/MG`.
- Ajustar textos, prioridades e estados vazios conforme a primeira leva de respostas.
- Publicar a nova versão do dashboard no ambiente produtivo.
- Só depois disso iniciar refinamentos cosméticos ou expansão de filtros.
