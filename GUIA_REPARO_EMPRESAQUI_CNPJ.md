# Guia de reparo da API EmpresaAqui e padronizacao da mensagem de CNPJ

## Objetivo

Padronizar o comportamento de qualquer aplicacao que consulte a API EmpresaAqui para CNPJ.

Importante: a consulta de CNPJ deve ser tratada como apoio ao preenchimento, e nao como requisito para o usuario conseguir prosseguir no formulario.

Regra unica de interface:

> `Conferir o numero do CNPJ - faca o preenchimento das informacoes abaixo`

Essa mensagem deve aparecer sempre que houver:

- CNPJ digitado com erro
- CNPJ inexistente
- retorno `404` da API
- falha de rede
- erro temporario do backend

O usuario nao deve ver erros tecnicos como `404`, `502`, `Falha no servidor` ou `CNPJ nao encontrado`.
O usuario tambem nao deve ficar impedido de continuar preenchendo o formulario por falha de consulta, falha de rede ou erro de digitacao.

## Escopo

Este guia serve para aplicar a mesma correcao em 3 aplicativos diferentes que usem a mesma integracao com a API EmpresaAqui.

Use o mesmo padrao em cada app:

1. Frontend principal do formulario
2. Aplicativo administrativo ou dashboard
3. Segundo dashboard, painel ou front-end que tambem consulte CNPJ

## Problema que este reparo resolve

Em alguns cenarios, a interface mostra mensagens diferentes para o mesmo tipo de falha:

- `❌ CNPJ nao encontrado.`
- `❌ Falha no servidor (404). Tente novamente.`
- mensagens de erro de rede ou resposta invalida

Isso gera confusao no usuario e mistura problema de dado informado com problema de API.

## Solucao padrao

### 1. Frontend

Toda tela que consultar CNPJ deve:

- validar o campo com 14 digitos
- tentar consultar a API
- em caso de qualquer falha, mostrar sempre a mesma mensagem amigavel
- registrar o detalhe tecnico apenas no console
- permitir que o usuario siga com preenchimento manual mesmo sem sucesso na consulta

Separar duas regras:

- regra para tentar buscar os dados do CNPJ
- regra para permitir avancar no formulario

Essas duas regras nao podem ser confundidas.

O erro na busca do CNPJ nao deve bloquear o avancar da etapa nem o envio final, desde que os demais campos obrigatorios do formulario estejam preenchidos.

Exemplo:

```js
const CNPJ_ERROR_MESSAGE = 'Conferir o numero do CNPJ - faca o preenchimento das informacoes abaixo';

function mostrarErroCNPJ() {
  mostrarFeedbackCNPJ(CNPJ_ERROR_MESSAGE, 'text-red-600');
}
```

Uso:

```js
if (cnpj.length !== 14) {
  mostrarErroCNPJ();
  return;
}

try {
  const response = await fetch(`/api/cnpj/${cnpj}`);
  const data = await response.json();

  if (!response.ok || !data.success) {
    console.warn('Falha na consulta de CNPJ:', { response, data });
    mostrarErroCNPJ();
    return;
  }

  // preencher campos do formulario
} catch (error) {
  console.error('Erro na consulta de CNPJ:', error);
  mostrarErroCNPJ();
}
```

### 1.1. Mensagem visual nao bloqueante

A mensagem padrao deve usar estilo de aviso ou orientacao, e nao um erro bloqueante de interface.

Exemplo:

- usar `status-warning`
- evitar `status-error` quando o usuario ainda pode continuar preenchendo manualmente

### 1.2. A validacao para avancar no formulario

Ao validar a etapa da empresa ou o envio final:

- nao exigir que a consulta de CNPJ tenha funcionado
- nao exigir que o CNPJ tenha retornado dados da API
- nao impedir o fluxo apenas porque o CNPJ digitado nao tem 14 digitos, se a regra de negocio do projeto permitir preenchimento manual

Na pratica:

- o botao `Buscar dados` pode exibir a mensagem padrao se o CNPJ estiver invalido
- o botao `Proximo` ou `Enviar` nao deve depender do sucesso da consulta

### 1.3. Resposta inesperada tambem deve cair no mesmo fluxo

Nem sempre o backend devolve JSON valido.

Pode acontecer:

- resposta HTML de erro
- corpo vazio
- payload sem `found`
- payload sem `company`
- resposta `ok`, mas sem campos suficientes para preencher

Todos esses casos devem mostrar a mesma mensagem amigavel.

Exemplo:

```js
const response = await fetch(`/api/cnpj/${cnpj}`);
const data = await response.json().catch(() => null);

if (!response.ok || !data?.success) {
  console.warn('Falha na consulta de CNPJ:', {
    status: response.status,
    responseOk: response.ok,
    data
  });
  mostrarErroCNPJ();
  return;
}
```

### 2. Backend

O backend pode continuar retornando erros tecnicos para monitoramento, mas o frontend nao deve expor esses detalhes.

Recomendacao:

- manter a rota `GET /api/cnpj/:cnpj`
- retornar JSON consistente
- registrar detalhes tecnicos no log do servidor
- nao depender da mensagem do provedor para o texto exibido ao usuario

Exemplo de resposta tecnica:

```json
{
  "success": false,
  "error": "CNPJ nao encontrado."
}
```

Mesmo assim, a interface deve exibir apenas:

`Conferir o numero do CNPJ - faca o preenchimento das informacoes abaixo`

## Pontos para revisar em cada aplicativo

### A. Configuracao da base da API

Verificar se o app nao depende apenas de `window.location` ou de um redirect externo fragil.

Boas praticas:

- usar uma `API_URL` explicita em producao
- manter `localhost` para desenvolvimento
- evitar base vazia quando o app esta em producao

### B. Funcao de consulta

Localizar o trecho que faz:

- `fetch('/api/cnpj/...')`
- ou `fetch(`${API_URL}/api/cnpj/...`)`

Trocar qualquer mensagem especifica por uma mensagem unica e padronizada.

### C. Tratamento de erro

Em qualquer bloco `catch`, `else` ou status nao-OK:

- nao mostrar status HTTP para o usuario
- nao mostrar `CNPJ nao encontrado`
- nao mostrar `Falha no servidor (404)`
- mostrar sempre a mensagem unica
- tratar `response.ok === false`, `found === false`, `company` ausente e payload invalido da mesma forma

### D. Logs internos

Manter logs apenas para depuracao:

```js
console.warn('Falha na consulta de CNPJ:', {
  status: response.status,
  responseOk: response.ok,
  data
});
```

No `catch`:

```js
console.error('Erro na consulta de CNPJ:', error);
```

### E. Normalizacao e mascara

Revisar sempre:

- mascara visual do campo CNPJ
- remocao de caracteres nao numericos antes da consulta
- consistencia entre o valor exibido e o valor enviado para a API

Exemplo:

```js
function normalizeDocument(value) {
  return String(value || '').replace(/\D/g, '');
}
```

### F. Gatilhos automaticos de busca

Verificar todos os pontos que podem disparar a consulta:

- clique no botao `Buscar dados`
- `blur` do campo
- `change`
- `input`
- carregamento automatico por script

Todos os gatilhos devem usar a mesma mensagem padrao e o mesmo fluxo de fallback manual.

## Checklist de implementacao nos 3 apps

Para cada aplicativo:

- [ ] localizar a tela ou componente que consulta o CNPJ
- [ ] criar a constante `CNPJ_ERROR_MESSAGE`
- [ ] substituir mensagens diferentes pela mensagem unica
- [ ] garantir que erros de rede caiam no mesmo fluxo
- [ ] garantir que resposta nao-JSON ou payload inesperado caiam no mesmo fluxo
- [ ] garantir que `found: false` ou ausencia de `company` caiam no mesmo fluxo
- [ ] revisar se a busca de CNPJ nao bloqueia o botao `Proximo` ou o envio final
- [ ] usar estilo visual de aviso, nao erro bloqueante, quando o preenchimento manual ainda for possivel
- [ ] revisar mascara e normalizacao do CNPJ antes da consulta
- [ ] revisar todos os gatilhos automaticos de busca
- [ ] validar que a API continua preenchendo os dados quando responde com sucesso
- [ ] testar CNPJ valido
- [ ] testar CNPJ invalido
- [ ] testar backend fora do ar
- [ ] testar resposta `404`
- [ ] testar resposta nao-JSON
- [ ] testar resposta vazia ou sem os campos esperados
- [ ] confirmar que o usuario consegue continuar manualmente em todos os cenarios de falha
- [ ] confirmar que a UI mostra sempre a mesma mensagem

## Aplicacao pratica em 3 apps

### App 1

Aplicar no formulario principal.

Arquivos tipicos:

- `index.html`
- arquivo JS do formulario, por exemplo `app-postgres.js`

### App 2

Aplicar no segundo front-end que use consulta de CNPJ.

Regras:

- localizar a funcao de consulta
- padronizar a mensagem
- manter log tecnico no console

### App 3

Aplicar no terceiro front-end ou painel que use a mesma API.

Regras:

- mesmo texto padrao
- mesma validacao de erro
- mesma experiencia de usuario

## Referencia de comportamento desejado

- Se o usuario digitar um CNPJ invalido: mostrar a mensagem unica
- Se a API EmpresaAqui responder 404: mostrar a mensagem unica
- Se o backend cair: mostrar a mensagem unica
- Se a resposta vier em formato inesperado: mostrar a mensagem unica
- Se a resposta vier sem `company` ou sem dados suficientes: mostrar a mensagem unica
- Em todos esses casos: permitir que o usuario continue preenchendo manualmente

## Decisao de regra de negocio

Antes de replicar em outro projeto, confirmar separadamente:

- o campo CNPJ e obrigatorio para submissao final?
- ou ele e apenas opcional?

Essa decisao e diferente da integracao com a API.

Mesmo quando o campo for obrigatorio, a consulta automatica continua sendo opcional e nao deve bloquear a experiencia.

## Observacao final

Este padrao evita confusao e deixa a experiencia do usuario previsivel.

Se for necessario diagnostico tecnico, usar apenas os logs internos e o console do servidor.
