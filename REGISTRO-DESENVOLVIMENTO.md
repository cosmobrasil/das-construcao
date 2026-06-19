# Registro de Desenvolvimento

Data: 2026-06-01

## Contexto

Esta pasta foi aberta para iniciar a adaptação de um modelo de diagnóstico de circularidade para o setor de laticínios, tomando como base um projeto já validado em outro setor.

O objetivo imediato desta etapa foi:

- localizar e ler os materiais existentes na pasta
- identificar as perguntas originais do formulário-base
- converter essas perguntas para um formato estruturado
- adaptar o conteúdo para o setor de laticínios

## Arquivos encontrados inicialmente

- `PLAYBOOK-LATICINIOS.md`
- `perguntas de circularidade.pdf`

## Leitura do playbook

O arquivo `PLAYBOOK-LATICINIOS.md` foi lido e resume a arquitetura e o método que devem ser preservados no novo projeto.

Principais diretrizes identificadas:

- manter arquitetura com `frontend`, `api`, Netlify, Railway e PostgreSQL
- preservar home com entrada separada para `Questionário` e `Dashboard`
- manter backend com cálculo, persistência e arquivamento do relatório
- manter dashboard com leitura coletiva/setorial
- adaptar apenas o conteúdo setorial, sem redesenhar a arquitetura do zero

## Leitura do PDF com perguntas

O arquivo `perguntas de circularidade.pdf` foi localizado e analisado.

Resultado da análise:

- o PDF não possui texto embutido utilizável por extração simples
- os utilitários `pdftotext` e `pdfinfo` não estavam disponíveis no ambiente
- a extração via biblioteca Python confirmou que a página não continha texto extraível
- o PDF foi convertido para imagem para leitura visual
- as perguntas foram lidas manualmente a partir da imagem gerada

## Estrutura identificada no questionário-base

O questionário original está organizado em 5 blocos:

1. `input`
2. `gestao_interna`
3. `vida_util`
4. `servicos_comunicacao`
5. `output_fim_de_vida`

Também foi identificado que:

- `vida_util` possui subitens
- `servicos_comunicacao` possui subitens
- a escala base de pontuação trabalha com `0`, `1` e `2`

## Adaptação para laticínios

As perguntas foram reinterpretadas para o setor de laticínios, preservando a lógica do diagnóstico original, mas trocando o conteúdo para uma linguagem aderente ao setor.

A adaptação atual considera:

- origem e rastreabilidade dos insumos
- perdas, resíduos e subprodutos do processo
- durabilidade e conservação do produto
- embalagem, reaproveitamento e retorno
- rastreabilidade, atendimento e comunicação
- destino final de materiais e fluxos associados

Foi adotada uma primeira versão setorial ampla, adequada para uso inicial em empresas de laticínios, sem restringir ainda para um subsegmento específico.

## Arquivos criados nesta etapa

- `perguntas-laticinios.md`
- `perguntas-laticinios.json`

## Conteúdo dos arquivos criados

### `perguntas-laticinios.md`

Documento de referência humana contendo:

- descrição do objetivo
- estrutura dos 5 blocos
- perguntas adaptadas
- opções de resposta
- pontuação por opção
- observações de implementação

### `perguntas-laticinios.json`

Arquivo estruturado para uso técnico contendo:

- metadados do questionário
- seções com `id`, `titulo`, `pergunta` e `type`
- opções com `id`, `texto` e `pontuacao`
- subseções nos blocos compostos

Este arquivo foi validado com parser JSON no ambiente local.

## Decisões tomadas até aqui

- preservar a lógica analítica do questionário-base
- adaptar o vocabulário para laticínios sem depender do PDF original na implementação
- separar formato humano (`.md`) de formato técnico (`.json`)
- manter identificadores estáveis para consumo por frontend e backend
- usar pontuação explícita por opção para facilitar cálculo posterior

## Limitações atuais

Esta primeira versão ainda não foi validada com especialista setorial.

Pontos que ainda podem exigir refinamento:

- recorte do tipo de operação: indústria, cooperativa ou produtor-processador
- foco por linha de produto: leite fluido, queijo, iogurte, manteiga ou mix
- tratamento explícito de soro de leite, efluentes e água de processo
- maior detalhamento de logística reversa e embalagens retornáveis

## Situação atual

Até este ponto, o projeto já possui:

- o playbook estratégico lido
- o questionário-base interpretado
- a adaptação inicial para laticínios estruturada
- os arquivos prontos para alimentar o próximo passo de implementação

## Próximos passos recomendados

1. validar o questionário com alguém do setor de laticínios
2. definir se o app atenderá um recorte geral ou um subsegmento específico
3. transformar o `perguntas-laticinios.json` no schema do frontend
4. implementar a lógica de cálculo no backend
5. registrar o andamento em `STATUS.md` quando a estrutura do projeto for criada

---

## Atualização operacional importante

Data: 2026-06-03

Esta seção registra aprendizados práticos da implementação já executada no caso de construção civil. Ela deve ser usada como referência direta quando o app de laticínios for publicado, para evitar repetir erros de deploy, CORS, filtro e separação de frontends.

## Arquitetura que funcionou na prática

O sistema de construção civil terminou operando com:

- um backend único em `api/`, publicado no Railway
- um frontend de formulário estático, publicado na Netlify
- um frontend de dashboard estático, publicado na Netlify
- persistência em PostgreSQL no Railway
- arquivamento do relatório final por `assessmentId`
- leitura agregada coletiva no dashboard

Conclusão importante:

- a separação entre formulário e dashboard em sites independentes funciona melhor do que manter tudo em uma única home pública
- para replicar em laticínios, o caminho recomendado é repetir essa separação desde o início

## Estrutura de repositórios que foi adotada

Para construção civil, foram preparados dois repositórios estáticos separados:

- `repos/formulario-construcao`
- `repos/dashboard-construcao`

Eles foram publicados em:

- `https://github.com/cosmobrasil/repos-formulario-construcao.git`
- `https://github.com/cosmobrasil/repos-dashboard-construcao.git`

Lição para laticínios:

- criar desde cedo dois repositórios dedicados para os frontends estáticos
- não depender de um único repositório para formulário e dashboard se o objetivo final já for separação por público

## URLs publicadas na Netlify

No caso de construção civil, as URLs ativas ficaram:

- formulário: `https://form-constru.netlify.app/`
- dashboard: `https://painel-constru.netlify.app/`

Lição para laticínios:

- decidir cedo os nomes dos sites na Netlify
- alinhar esses domínios com o `CORS_ORIGIN` do backend antes de testar no navegador

## Regra crítica de CORS no Railway

O principal problema operacional de hoje foi este:

- o dashboard carregava o HTML, mas mostrava `Dashboard indisponível`
- na página aparecia `Load failed`
- a causa era CORS no backend do Railway

O backend em `api/server.js` usa:

- `process.env.CORS_ORIGIN`

Essa variável precisa conter explicitamente todos os domínios públicos da Netlify que vão consumir a API.

No caso de construção civil, o valor correto ficou:

`https://construcao-circular.netlify.app,https://app-construcao.netlify.app,https://painel-constru.netlify.app,https://form-constru.netlify.app`

Procedimento que funcionou:

1. atualizar `CORS_ORIGIN` no Railway
2. forçar redeploy do backend
3. validar se a resposta da API passa a devolver `access-control-allow-origin` para o domínio do frontend

Comando usado no Railway:

- atualizar variável via `railway variable set`
- forçar nova implantação via `railway redeploy`

Lição para laticínios:

- assim que os sites da Netlify forem criados, incluir imediatamente seus domínios em `CORS_ORIGIN`
- não esperar o erro aparecer no navegador para só então corrigir

## Teste funcional mínimo que deve sempre ser feito

O teste correto não é apenas abrir a página.

Foi validado no caso de construção civil:

- `GET /api/health`
- `GET /api/dashboard/overview`
- `POST /api/assessments` com payload inválido para confirmar validação
- `POST /api/assessments` com payload válido de teste
- `GET /api/assessments/:id` para confirmar arquivamento
- leitura do dashboard após a submissão

Lição para laticínios:

- sempre executar um teste ponta a ponta com submissão real controlada
- confirmar que a resposta entra no banco
- confirmar que o dashboard passa a refletir essa nova resposta

## Teste de produção realizado hoje

Foi criada uma submissão de teste em produção no app de construção civil com:

- empresa: `[TESTE] Validacao Netlify Dashboard`
- `assessmentId`: `16`

Esse teste provou que:

- o formulário consegue persistir no backend
- o relatório é arquivado
- o dashboard coletivo lê o novo registro

Lição para laticínios:

- ao testar em produção, usar sempre nomes explicitamente marcados com `[TESTE]`
- isso evita confusão com dados operacionais reais

## Problema encontrado no filtro do dashboard

Foi identificado um detalhe importante:

- o dashboard usava `Divinopolis` sem acento como filtro padrão
- a submissão de teste entrou como `Divinópolis` com acento
- isso gerou leitura inconsistente dependendo do recorte enviado à API

Correção aplicada no caso de construção civil:

- ajustar o default visual do filtro para `Divinópolis`
- manter atenção especial à normalização de cidade e estado no backend e no frontend

Lição para laticínios:

- sempre tratar filtros textuais com normalização robusta
- considerar acentos, caixa e variações de escrita
- não confiar em comparação literal para cidade, território, segmento ou categoria

## Backend que deve ser preservado no novo setor

Alguns comportamentos do backend se mostraram essenciais e devem ser repetidos em laticínios:

- validação obrigatória das 12 respostas antes de aceitar submissão
- rejeição explícita de payload incompleto
- `upsert` da empresa por documento
- salvamento do relatório completo em `analysis_json`
- endpoint para recuperar relatório por `assessmentId`
- endpoint coletivo para o dashboard

Lição:

- não simplificar esses pontos na migração para o novo setor
- a estrutura de persistência e leitura agregada já se provou útil

## Ordem recomendada para replicação em laticínios

Sequência sugerida para evitar retrabalho:

1. adaptar o conteúdo setorial das perguntas
2. preservar a mesma arquitetura de backend, banco e dashboard
3. criar dois frontends separados: formulário e dashboard
4. criar dois repositórios dedicados para deploy estático
5. publicar os dois sites na Netlify
6. configurar `CORS_ORIGIN` no Railway com os novos domínios
7. testar healthcheck, submissão inválida, submissão válida e leitura do dashboard
8. só depois refinar visual, narrativa executiva e massa de demonstração

## Riscos que não devem ser esquecidos

- CORS mal configurado quebra o dashboard mesmo com backend saudável
- filtro textual sem normalização pode esconder dados reais
- abrir página na Netlify não prova que o sistema está funcionando
- deploy separado exige sincronismo entre `config.js`, domínio da Netlify e `CORS_ORIGIN`
- dados de demonstração podem mascarar falhas se não houver teste com submissão nova

## Instrução final para a próxima pasta

Quando a implementação migrar para laticínios:

- reutilizar a mesma topologia técnica de construção civil
- adaptar apenas o conteúdo setorial, labels, narrativa e filtros de território
- repetir a disciplina operacional aprendida hoje: repositórios separados, CORS configurado, teste real de submissão e validação do dashboard após o envio
