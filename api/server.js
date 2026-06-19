try {
  require('dotenv').config();
} catch (_error) {
  // Railway and production environments can inject env vars directly.
}

const express = require('express');
const cors = require('cors');
const { calculateReport, QUESTION_BY_STEP, validateAssessmentAnswers } = require('./scoring');
const { initDb, upsertCompany, saveAssessment, getPool, checkDbHealth, getAssessmentById, listAdminResponses, detectarSchema } = require('./db');
const { getDashboardOverview } = require('./dashboard');
const { buildReportHtmlDocument, buildReportPdfBuffer, getSafeFileStem } = require('./admin-panel');
const { log } = require('./logger');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_ACCESS_TOKEN = process.env.ADMIN_ACCESS_TOKEN || 'Cosmob2026@';

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

function getAdminToken(req) {
  const headerToken = String(req.headers['x-admin-token'] || '').trim();
  const queryToken = String(req.query.token || '').trim();
  return headerToken || queryToken;
}

function isAdminAuthorized(req) {
  return getAdminToken(req) === ADMIN_ACCESS_TOKEN;
}

function requireAdminAccess(req, res) {
  if (isAdminAuthorized(req)) {
    return true;
  }

  res.status(401).json({
    success: false,
    error: 'Acesso administrativo não autorizado.'
  });
  return false;
}

function formatAdminDateTime(value) {
  if (!value) {
    return 'Sem data';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Sem data';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
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
const corsOptions = {
  origin: function (origin, callback) {
    // Permitir requisições sem origin (apps nativos, Postman, etc.)
    if (!origin) {
      return callback(null, true);
    }

    // Lista de origens fixas do CORS_ORIGIN (separadas por vírgula)
    const fixedOrigins = process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(',').map((item) => item.trim()).filter(Boolean)
      : [];

    // Padrões regex de origens permitidas
    const allowedPatterns = [
      /\.netlify\.app$/,
      /^https?:\/\/localhost(:\d+)?$/,
      /^https?:\/\/127\.0\.0\.1(:\d+)?$/
    ];

    const allowed = fixedOrigins.some((o) => origin === o) ||
      allowedPatterns.some((pattern) => pattern.test(origin));

    if (allowed) {
      callback(null, true);
    } else {
      callback(new Error(`Origem não permitida pelo CORS: ${origin}`));
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-token', 'x-admin-token']
};

app.use(cors(corsOptions));

app.get('/health', async (_req, res) => {
  const db = await checkDbHealth();
  let schema = null;
  const pool = getPool();
  if (pool) {
    try { schema = await detectarSchema(pool); } catch { /* ignore */ }
  }
  res.status(db.reachable || !db.configured ? 200 : 503).json({
    ok: db.reachable || !db.configured,
    service: 'cosmobrasil-backend',
    database: db.reachable,
    databaseConfigured: db.configured,
    databaseError: db.error,
    schema
  });
});

app.get('/api/health', async (_req, res) => {
  const db = await checkDbHealth();
  let schema = null;
  const pool = getPool();
  if (pool) {
    try { schema = await detectarSchema(pool); } catch { /* ignore */ }
  }
  res.status(db.reachable || !db.configured ? 200 : 503).json({
    ok: db.reachable || !db.configured,
    service: 'cosmobrasil-backend',
    database: db.reachable,
    databaseConfigured: db.configured,
    databaseError: db.error,
    schema
  });
});

app.get('/api/status', async (_req, res) => {
  const db = await checkDbHealth();
  let schema = null;
  const pool = getPool();
  if (pool) {
    try { schema = await detectarSchema(pool); } catch { /* ignore */ }
  }

  const empresaquiConfigured = Boolean(process.env.EMPRESAQUI_API_URL && process.env.EMPRESAQUI_TOKEN);

  res.json({
    ok: true,
    service: 'cosmobrasil-backend',
    dependencies: {
      database: {
        configured: db.configured,
        reachable: db.reachable,
        error: db.error
      },
      schema,
      empresaqui: {
        configured: empresaquiConfigured
      },
      openrouter: {
        configured: Boolean(process.env.OPENROUTER_API_KEY)
      }
    }
  });
});

app.get('/', (_req, res) => {
  res.json({
    ok: true,
    service: 'cosmobrasil-backend',
    endpoints: ['/health', '/api/health', '/api/status', '/api/company/lookup', '/api/assessments', '/api/assessments/:id', '/api/questions', '/api/dashboard/overview', '/api/admin/respostas', '/api/admin/respostas/:id/html', '/api/admin/respostas/:id/pdf']
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
    log('DASH', 'ERROR', 'Falha ao gerar dashboard agregado', { error: error.message });
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
    log('CNPJ', 'ERROR', 'Consulta CNPJ falhou', { error: error.message });
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

    const answerValidation = validateAssessmentAnswers(answers);
    if (!answerValidation.isComplete) {
      return res.status(400).json({
        error: 'Respostas inválidas para este questionário.',
        message: 'A submissão precisa conter as 12 respostas válidas do formulário.',
        details: answerValidation
      });
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
      if (documento) {
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
      }

      assessment = await saveAssessment({
        companyId: savedCompany?.id || null,
        report
      });

      persistence.persisted = Boolean(assessment);
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
    log('API', 'ERROR', 'Falha ao processar relatório', { error: error.message });
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

app.get('/api/admin/respostas', async (req, res) => {
  if (!requireAdminAccess(req, res)) {
    return;
  }

  try {
    const rows = await listAdminResponses();
    const searchTerm = String(req.query.search || '').trim().toLowerCase();
    const data = rows
      .filter((item) => {
        if (!searchTerm) {
          return true;
        }

        const haystack = [
          item.company?.nome,
          item.company?.responsavel,
          item.company?.cidade,
          item.company?.state,
          item.company?.documento_cnpj,
          item.summary
        ].join(' ').toLowerCase();

        return haystack.includes(searchTerm);
      })
      .map((item) => ({
        id: item.id,
        assessment_id: String(item.id),
        nomeResponsavel: item.company?.responsavel || 'Não informado',
        nomeEmpresa: item.company?.nome || 'Empresa sem nome',
        cidade: item.company?.cidade || '',
        uf: item.company?.state || '',
        documento: item.company?.documento_cnpj || '',
        dataHora: formatAdminDateTime(item.created_at),
        igc: Number(item.igc || 0),
        pcm: Number(item.pcm || 0),
        temHtml: true,
        temPdf: true,
        resumo: item.summary || '',
        banda: item.band?.label || ''
      }));

    return res.json({
      success: true,
      data
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Falha ao listar respostas administrativas.',
      message: error.message
    });
  }
});

app.get('/api/admin/respostas/:id/html', async (req, res) => {
  if (!requireAdminAccess(req, res)) {
    return;
  }

  const assessmentId = Number(req.params.id);
  if (!Number.isInteger(assessmentId) || assessmentId <= 0) {
    return res.status(400).json({ success: false, error: 'Informe um ID válido.' });
  }

  try {
    const assessment = await getAssessmentById(assessmentId);
    if (!assessment) {
      return res.status(404).json({ success: false, error: 'Relatório não encontrado.' });
    }

    const fileStem = getSafeFileStem(assessment.report);
    const disposition = String(req.query.download || '') === '1' ? 'attachment' : 'inline';
    const html = buildReportHtmlDocument(assessment.report, {
      sourceLabel: 'painel administrativo',
      archiveLabel: `Relatório arquivado com ID ${assessment.assessmentId}.`
    });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `${disposition}; filename="relatorio-circularidade-${fileStem}.html"`);
    return res.send(html);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Falha ao gerar o HTML do relatório.',
      message: error.message
    });
  }
});

app.get('/api/admin/respostas/:id/pdf', async (req, res) => {
  if (!requireAdminAccess(req, res)) {
    return;
  }

  const assessmentId = Number(req.params.id);
  if (!Number.isInteger(assessmentId) || assessmentId <= 0) {
    return res.status(400).json({ success: false, error: 'Informe um ID válido.' });
  }

  try {
    const assessment = await getAssessmentById(assessmentId);
    if (!assessment) {
      return res.status(404).json({ success: false, error: 'Relatório não encontrado.' });
    }

    const fileStem = getSafeFileStem(assessment.report);
    const disposition = String(req.query.download || '') === '1' ? 'attachment' : 'inline';
    const pdfBuffer = buildReportPdfBuffer(assessment.report);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${disposition}; filename="relatorio-circularidade-${fileStem}.pdf"`);
    return res.send(pdfBuffer);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Falha ao gerar o PDF do relatório.',
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
  log('INIT', 'INFO', `CosmoBrasil backend listening on port ${PORT}`);
});

initDb().then(async () => {
  const pool = getPool();
  if (pool) {
    const schema = await detectarSchema(pool).catch(() => null);
    if (schema) {
      log('SCHEMA', 'INFO', 'Colunas detectadas', schema);
    }
  }
}).catch((error) => {
  log('DB', 'WARN', 'Database init skipped or failed', { error: error.message });
});
