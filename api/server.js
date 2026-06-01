try {
  require('dotenv').config();
} catch (_error) {
  // Railway and production environments can inject env vars directly.
}

const express = require('express');
const cors = require('cors');
const { calculateReport, QUESTION_BY_STEP } = require('./scoring');
const { initDb, upsertCompany, saveAssessment, getPool, checkDbHealth, getAssessmentById } = require('./db');
const { getDashboardOverview } = require('./dashboard');

const app = express();
const PORT = process.env.PORT || 3000;

function normalizeCompanyLookupResult({
  documento,
  nome = '',
  responsavel = '',
  cidade = '',
  state = '',
  cnae = '',
  email = '',
  source = ''
}) {
  return {
    documento,
    nome,
    responsavel,
    cidade,
    state: String(state || '').trim().toUpperCase(),
    cnae,
    email,
    source
  };
}

function buildEmpresaAquiHeaders(tokenHeaderName, token) {
  const headers = {
    Accept: 'application/json'
  };

  if (tokenHeaderName.toLowerCase() === 'authorization') {
    headers.Authorization = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
  } else {
    headers[tokenHeaderName] = token;
  }

  return headers;
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const bodyText = await response.text();
  let body = null;

  if (bodyText) {
    try {
      body = JSON.parse(bodyText);
    } catch (_error) {
      body = bodyText;
    }
  }

  return { response, body };
}

async function lookupEmpresaAqui(documento) {
  const apiUrl = process.env.EMPRESAQUI_API_URL;
  const token = process.env.EMPRESAQUI_TOKEN;
  const tokenHeaderName = process.env.EMPRESAQUI_TOKEN_HEADER || 'Authorization';

  if (!apiUrl || !token) {
    return {
      ok: false,
      skipped: true,
      error: 'EMPRESAQUI_API_URL e EMPRESAQUI_TOKEN não configurados.'
    };
  }

  const url = new URL(apiUrl);
  url.searchParams.set('documento', documento);

  const { response, body } = await fetchJson(url, {
    method: 'GET',
    headers: buildEmpresaAquiHeaders(tokenHeaderName, token)
  });

  if (!response.ok) {
    const errorMessage = typeof body === 'object' && body
      ? body.message || body.error || `HTTP ${response.status}`
      : `HTTP ${response.status}`;

    return {
      ok: false,
      status: response.status,
      error: errorMessage
    };
  }

  const data = body?.data || body || {};

  return {
    ok: true,
    data: normalizeCompanyLookupResult({
      documento,
      nome: data.nome || data.razao_social || data.empresa || '',
      responsavel: data.responsavel || data.socio || data.representante || '',
      cidade: data.cidade || data.municipio || data.localidade || '',
      state: data.state || data.uf || data.estado || data.sigla_uf || '',
      cnae: data.cnae || data.cnae_principal || data.cnae_fiscal || '',
      email: data.email || data.contato?.email || '',
      source: 'empresaqui'
    })
  };
}

async function lookupBrasilApi(documento) {
  const url = new URL(`https://brasilapi.com.br/api/cnpj/v1/${documento}`);
  const { response, body } = await fetchJson(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    const errorMessage = typeof body === 'object' && body
      ? body.message || body.error || `HTTP ${response.status}`
      : `HTTP ${response.status}`;

    return {
      ok: false,
      status: response.status,
      error: errorMessage
    };
  }

  const socios = Array.isArray(body?.qsa) ? body.qsa : [];
  const responsavel = socios[0]
    ? [socios[0].nome_socio, socios[0].qualificacao_socio].filter(Boolean).join(' - ')
    : '';

  return {
    ok: true,
    data: normalizeCompanyLookupResult({
      documento,
      nome: body.razao_social || body.nome_fantasia || '',
      responsavel,
      cidade: body.municipio || '',
      state: body.uf || body.estado || '',
      cnae: body.cnae_fiscal || body.descricao_cnae_fiscal || '',
      email: '',
      source: 'brasilapi'
    })
  };
}

app.use(express.json({ limit: '1mb' }));
app.use(cors({
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map((item) => item.trim()) : true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-token']
}));

app.get('/health', async (_req, res) => {
  const db = await checkDbHealth();
  res.status(db.reachable || !db.configured ? 200 : 503).json({
    ok: db.reachable || !db.configured,
    service: 'cosmobrasil-backend',
    database: db.reachable,
    databaseConfigured: db.configured,
    databaseError: db.error
  });
});

app.get('/api/health', async (_req, res) => {
  const db = await checkDbHealth();
  res.status(db.reachable || !db.configured ? 200 : 503).json({
    ok: db.reachable || !db.configured,
    service: 'cosmobrasil-backend',
    database: db.reachable,
    databaseConfigured: db.configured,
    databaseError: db.error
  });
});

app.get('/', (_req, res) => {
  res.json({
    ok: true,
    service: 'cosmobrasil-backend',
    endpoints: ['/health', '/api/health', '/api/company/lookup', '/api/assessments', '/api/assessments/:id', '/api/questions', '/api/dashboard/overview']
  });
});

app.get('/api/dashboard/overview', async (req, res) => {
  try {
    const overview = await getDashboardOverview({
      state: req.query.state ? String(req.query.state) : '',
      city: req.query.city ? String(req.query.city) : ''
    });

    return res.json(overview);
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      error: 'Falha ao gerar o dashboard agregado.',
      message: error.message
    });
  }
});

app.get('/api/company/lookup', async (req, res) => {
  const documento = String(req.query.documento || '').replace(/\D/g, '');

  if (!documento) {
    return res.status(400).json({ error: 'Informe o CNPJ/documento para consulta.' });
  }

  try {
    const empresaAquiResult = await lookupEmpresaAqui(documento);

    if (empresaAquiResult.ok) {
      return res.json(empresaAquiResult.data);
    }

    const brasilApiResult = await lookupBrasilApi(documento);

    if (brasilApiResult.ok) {
      return res.json(brasilApiResult.data);
    }

    return res.status(502).json({
      error: 'Não foi possível consultar o CNPJ.',
      message: 'A consulta falhou tanto na EmpresaAqui quanto na fonte pública de fallback.',
      details: {
        empresaqui: empresaAquiResult.error || null,
        brasilapi: brasilApiResult.error || null
      }
    });
  } catch (error) {
    console.error(error);
    return res.status(502).json({
      error: 'Não foi possível consultar o CNPJ.',
      message: error.message,
      hint: 'Verifique se EMPRESAQUI_API_URL aponta para o endpoint correto da consulta de CNPJ e se o token está válido. Se a EmpresaAqui falhar, o backend tentará o fallback público automaticamente.'
    });
  }
});

app.post('/api/assessments', async (req, res) => {
  try {
    const body = req.body || {};
    const company = body.company || {};
    const answers = Array.isArray(body.answers) ? body.answers : [];

    const documento = String(company.identifier || company.documento_cnpj || '').replace(/\D/g, '');

    if (!documento) {
      return res.status(400).json({ error: 'Dados da empresa incompletos: faltou o CNPJ/documento.' });
    }

    const report = calculateReport({
      company: {
        documento_cnpj: documento,
        nome: company.name || company.nome || 'Empresa sem nome',
        responsavel: company.responsible || company.responsavel || '',
        cidade: company.city || company.cidade || '',
        state: String(company.state || company.uf || '').trim().toUpperCase(),
        cnae: company.cnae || '',
        email: company.email || ''
      },
      answers
    });

    let assessment = null;
    let savedCompany = null;
    let persistence = {
      persisted: false,
      error: null
    };

    try {
      savedCompany = await upsertCompany({
        documento_cnpj: documento,
        nome: report.company.nome,
        responsavel: report.company.responsavel,
        cidade: report.company.cidade,
        state: String(report.company.state || '').trim().toUpperCase(),
        cnae: report.company.cnae,
        email: report.company.email,
        source_json: {
          submittedAt: new Date().toISOString(),
          source: 'netlify-questionnaire'
        }
      });

      if (savedCompany) {
        assessment = await saveAssessment({
          companyId: savedCompany.id,
          report
        });
      }

      persistence.persisted = Boolean(savedCompany && assessment);
    } catch (error) {
      persistence.error = error.message;
    }

    return res.status(201).json({
      assessmentId: assessment?.id || null,
      persisted: persistence.persisted,
      archiveStatus: persistence.persisted ? 'archived' : 'not_archived',
      archiveError: persistence.error,
      company: savedCompany || report.company,
      report
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      error: 'Falha ao processar o relatório de circularidade.',
      message: error.message
    });
  }
});

app.get('/api/assessments/:id', async (req, res) => {
  const assessmentId = Number(req.params.id);
  if (!Number.isInteger(assessmentId) || assessmentId <= 0) {
    return res.status(400).json({ error: 'Informe um assessmentId válido.' });
  }

  try {
    const assessment = await getAssessmentById(assessmentId);
    if (!assessment) {
      return res.status(404).json({ error: 'Relatório arquivado não encontrado.' });
    }

    return res.json(assessment);
  } catch (error) {
    return res.status(500).json({
      error: 'Falha ao recuperar o relatório arquivado.',
      message: error.message
    });
  }
});

app.get('/api/questions', (_req, res) => {
  return res.json({
    totalQuestions: Object.keys(QUESTION_BY_STEP).length,
    questions: Object.values(QUESTION_BY_STEP).map((question) => ({
      step: question.step,
      questionId: question.questionId,
      stageKey: question.stageKey,
      stageLabel: question.stageLabel,
      maxPoints: question.maxPoints
    }))
  });
});

app.use((req, res) => {
  if (req.method === 'GET') {
    res.status(404).json({ error: 'Rota não encontrada.' });
    return;
  }

  res.status(404).json({ error: 'Rota não encontrada.' });
});

app.listen(PORT, () => {
  console.log(`CosmoBrasil backend listening on port ${PORT}`);
});

initDb().catch((error) => {
  console.warn('Database initialization skipped or failed:', error.message);
});
