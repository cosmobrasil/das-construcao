const { getPool } = require('./db');
const { roundTo } = require('./scoring');
const crypto = require('crypto');

const STAGE_ORDER = [
  { key: 'input', label: 'Entrada (Input)' },
  { key: 'output', label: 'Saída e gestão de resíduos' },
  { key: 'lifecycle', label: 'Vida útil do produto' },
  { key: 'monitoring', label: 'Monitoramento e extensão do ciclo' }
];

const STAGE_LABELS = Object.fromEntries(STAGE_ORDER.map((stage) => [stage.key, stage.label]));
const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_CACHE_TTL_MS = 10 * 60 * 1000;
const aiInsightCache = new Map();

function normalizeText(value, fallback = 'Sem informação') {
  const text = String(value || '').trim();
  return text || fallback;
}

function normalizeState(value) {
  const text = String(value || '').trim().toUpperCase();
  return text || 'Sem UF';
}

function normalizeCity(value) {
  return normalizeText(value, 'Sem cidade');
}

function canonicalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function formatMonthLabel(dateValue) {
  if (!dateValue) {
    return 'Sem data';
  }

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return 'Sem data';
  }

  return new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric' }).format(date);
}

function formatMonthKey(dateValue) {
  if (!dateValue) {
    return '0000-00';
  }

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return '0000-00';
  }

  return `${String(date.getUTCFullYear()).padStart(4, '0')}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function getBandLabel(score) {
  if (score >= 85) return { key: 'advanced', label: 'Avançado' };
  if (score >= 65) return { key: 'good', label: 'Bom' };
  if (score >= 35) return { key: 'moderate', label: 'Moderado' };
  return { key: 'basic', label: 'Básico' };
}

function buildOpenRouterHeaders() {
  const headers = {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    'Content-Type': 'application/json'
  };

  if (process.env.OPENROUTER_SITE_URL) {
    headers['HTTP-Referer'] = process.env.OPENROUTER_SITE_URL;
  }

  if (process.env.OPENROUTER_APP_NAME) {
    headers['X-OpenRouter-Title'] = process.env.OPENROUTER_APP_NAME;
  }

  return headers;
}

function buildAiCacheKey(summary) {
  return crypto.createHash('sha256').update(JSON.stringify({
    filters: summary.filters,
    districtProfile: summary.districtProfile,
    totalAssessments: summary.totalAssessments,
    totalCompanies: summary.totalCompanies,
    averageIgc: summary.averageIgc,
    averagePcm: summary.averagePcm,
    averageTotalPoints: summary.averageTotalPoints,
    averageScore: summary.averageScore,
    unknownAnswerRate: summary.unknownAnswerRate,
    bandDistribution: summary.bandDistribution,
    stageAverages: summary.stageAverages,
    stateRanking: summary.stateRanking,
    cityRanking: summary.cityRanking,
    monthlyTrend: summary.monthlyTrend,
    companyLeaderboard: summary.companyLeaderboard,
    attentionCompanies: summary.attentionCompanies,
    diagnostics: summary.diagnostics
  })).digest('hex');
}

function buildOpenRouterPrompt(summary) {
  return [
    'Você é um analista executivo especialista em economia circular, inteligência territorial e apoio à decisão.',
    'Seu papel não é descrever gráficos; é interpretar o distrito, explicar causas prováveis e priorizar ação.',
    'Escreva em português do Brasil, com tom de memo executivo: curto, preciso, sem jargão acadêmico.',
    'Explique explicitamente a diferença entre o que um BI mostraria e o que a camada cognitiva do dashboard consegue concluir.',
    'Use apenas os dados fornecidos. Não invente causas, números, empresas ou tendências.',
    'Retorne somente JSON válido no schema solicitado.',
    '',
    'DADOS AGREGADOS:',
    JSON.stringify(summary, null, 2)
  ].join('\n');
}

async function generateOpenRouterInsights(summary) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return null;
  }

  const cacheKey = buildAiCacheKey(summary);
  const cached = aiInsightCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const model = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
  const response = await fetch(OPENROUTER_ENDPOINT, {
    method: 'POST',
    headers: buildOpenRouterHeaders(),
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 900,
      plugins: [{ id: 'response-healing' }],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'district_circular_intelligence',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              headline: { type: 'string' },
              boardMemo: { type: 'string' },
              executiveSummary: { type: 'string' },
              territoryInsight: { type: 'string' },
              concentrationInsight: { type: 'string' },
              dataQualityInsight: { type: 'string' },
              whyThisBeatsBI: { type: 'string' },
              decisionMemo: {
                type: 'array',
                minItems: 3,
                maxItems: 5,
                items: { type: 'string' }
              },
              priorityActions: {
                type: 'array',
                minItems: 3,
                maxItems: 6,
                items: { type: 'string' }
              },
              signalSummary: {
                type: 'array',
                minItems: 3,
                maxItems: 6,
                items: { type: 'string' }
              }
            },
            required: [
              'headline',
              'boardMemo',
              'executiveSummary',
              'territoryInsight',
              'concentrationInsight',
              'dataQualityInsight',
              'whyThisBeatsBI',
              'decisionMemo',
              'priorityActions',
              'signalSummary'
            ]
          }
        }
      },
      messages: [
        {
          role: 'system',
          content: buildOpenRouterPrompt(summary)
        },
        {
          role: 'user',
          content: [
            'Aplique estes critérios:',
            '- interprete o território e a maturidade do distrito;',
            '- compare IGC, PCM, bandas e estágios;',
            '- destaque o que é sinal confiável e o que ainda pode ser limitação de amostra;',
            '- cite o que um BI tradicional mostraria;',
            '- cite o que a IA conclui além do BI;',
            '- entregue prioridades acionáveis para liderança territorial e para as empresas.'
          ].join('\n')
        }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`OpenRouter retornou HTTP ${response.status}${errorText ? `: ${errorText}` : ''}`);
  }

  const body = await response.json();
  const content = body?.choices?.[0]?.message?.content || '';

  if (!content) {
    throw new Error('OpenRouter não retornou conteúdo interpretável.');
  }

  let parsed;
  try {
    parsed = typeof content === 'string' ? JSON.parse(content) : content;
  } catch (error) {
    throw new Error(`Falha ao interpretar JSON do OpenRouter: ${error.message}`);
  }

  const normalized = {
    source: 'openrouter',
    model,
    headline: parsed.headline || 'Leitura analítica do distrito',
    boardMemo: parsed.boardMemo || '',
    executiveSummary: parsed.executiveSummary || '',
    territoryInsight: parsed.territoryInsight || '',
    concentrationInsight: parsed.concentrationInsight || '',
    dataQualityInsight: parsed.dataQualityInsight || '',
    whyThisBeatsBI: parsed.whyThisBeatsBI || '',
    decisionMemo: Array.isArray(parsed.decisionMemo) ? parsed.decisionMemo : [],
    priorityActions: Array.isArray(parsed.priorityActions) ? parsed.priorityActions : [],
    signalSummary: Array.isArray(parsed.signalSummary) ? parsed.signalSummary : []
  };

  aiInsightCache.set(cacheKey, {
    expiresAt: Date.now() + OPENROUTER_CACHE_TTL_MS,
    value: normalized
  });

  return normalized;
}

function emptyStageAverages() {
  return STAGE_ORDER.map((stage) => ({
    stageKey: stage.key,
    label: stage.label,
    score: 0,
    avgPoints: 0
  }));
}

function averageOfRows(rows, field) {
  if (!rows.length) {
    return 0;
  }

  return rows.reduce((sum, row) => sum + Number(row[field] || 0), 0) / rows.length;
}

function collectAnswersSummary(answerRows) {
  const answersByAssessment = new Map();

  answerRows.forEach((answer) => {
    const current = answersByAssessment.get(answer.assessment_id) || { total: 0, unknown: 0 };
    current.total += 1;
    if (answer.answer_id === 'unknown') {
      current.unknown += 1;
    }
    answersByAssessment.set(answer.assessment_id, current);
  });

  return answersByAssessment;
}

function computeUnknownRate(assessmentIds, answersByAssessment) {
  const totals = assessmentIds.reduce((sum, assessmentId) => {
    const current = answersByAssessment.get(assessmentId) || { total: 0, unknown: 0 };
    return {
      total: sum.total + current.total,
      unknown: sum.unknown + current.unknown
    };
  }, { total: 0, unknown: 0 });

  return totals.total ? (totals.unknown / totals.total) * 100 : 0;
}

function computeBandDistribution(rows) {
  const map = rows.reduce((acc, row) => {
    const band = getBandLabel(Number(row.igc || 0));
    const current = acc.get(band.key) || { key: band.key, label: band.label, count: 0, percent: 0 };
    current.count += 1;
    acc.set(band.key, current);
    return acc;
  }, new Map());

  const distribution = [...map.values()].sort((a, b) => b.count - a.count);
  const total = distribution.reduce((sum, item) => sum + item.count, 0);
  distribution.forEach((item) => {
    item.percent = total ? roundTo((item.count / total) * 100, 1) : 0;
  });

  return distribution;
}

function computeStageAverages(rows) {
  const accumulator = new Map();

  rows.forEach((row) => {
    row.stageScores.forEach((stage) => {
      const current = accumulator.get(stage.stageKey) || {
        stageKey: stage.stageKey,
        label: STAGE_LABELS[stage.stageKey] || stage.label,
        sumScore: 0,
        sumPoints: 0,
        count: 0
      };

      current.sumScore += Number(stage.score || 0);
      current.sumPoints += Number(stage.rawPoints || 0);
      current.count += 1;
      accumulator.set(stage.stageKey, current);
    });
  });

  return STAGE_ORDER.map((stage) => {
    const current = accumulator.get(stage.key);
    return {
      stageKey: stage.key,
      label: stage.label,
      score: current && current.count ? roundTo(current.sumScore / current.count, 1) : 0,
      avgPoints: current && current.count ? roundTo(current.sumPoints / current.count, 1) : 0
    };
  });
}

function computeTerritoryRankings(rows) {
  const stateMap = new Map();
  const cityMap = new Map();

  rows.forEach((row) => {
    const stateKey = row.state;
    const cityKey = `${row.city}__${row.state}`;

    const stateCurrent = stateMap.get(stateKey) || {
      key: stateKey,
      label: stateKey,
      count: 0,
      sumIgc: 0,
      sumPcm: 0
    };
    stateCurrent.count += 1;
    stateCurrent.sumIgc += Number(row.igc || 0);
    stateCurrent.sumPcm += Number(row.pcm || 0);
    stateMap.set(stateKey, stateCurrent);

    const cityCurrent = cityMap.get(cityKey) || {
      key: cityKey,
      label: row.city,
      state: row.state,
      count: 0,
      sumIgc: 0,
      sumPcm: 0
    };
    cityCurrent.count += 1;
    cityCurrent.sumIgc += Number(row.igc || 0);
    cityCurrent.sumPcm += Number(row.pcm || 0);
    cityMap.set(cityKey, cityCurrent);
  });

  const stateRanking = [...stateMap.values()]
    .map((item) => ({
      key: item.key,
      label: item.label,
      count: item.count,
      avgIgc: item.count ? roundTo(item.sumIgc / item.count, 1) : 0,
      avgPcm: item.count ? roundTo(item.sumPcm / item.count, 1) : 0
    }))
    .sort((a, b) => b.count - a.count || b.avgIgc - a.avgIgc);

  const cityRanking = [...cityMap.values()]
    .map((item) => ({
      key: item.key,
      label: item.label,
      state: item.state,
      count: item.count,
      avgIgc: item.count ? roundTo(item.sumIgc / item.count, 1) : 0,
      avgPcm: item.count ? roundTo(item.sumPcm / item.count, 1) : 0
    }))
    .sort((a, b) => b.count - a.count || b.avgIgc - a.avgIgc);

  return { stateRanking, cityRanking };
}

function computeMonthlyTrend(rows) {
  const monthMap = new Map();

  rows.forEach((row) => {
    const monthKey = formatMonthKey(row.createdAt);
    const current = monthMap.get(monthKey) || {
      key: monthKey,
      label: formatMonthLabel(row.createdAt),
      count: 0,
      sumIgc: 0
    };

    current.count += 1;
    current.sumIgc += Number(row.igc || 0);
    monthMap.set(monthKey, current);
  });

  return [...monthMap.values()]
    .map((item) => ({
      key: item.key,
      label: item.label,
      count: item.count,
      avgIgc: item.count ? roundTo(item.sumIgc / item.count, 1) : 0
    }))
    .sort((a, b) => new Date(a.key).getTime() - new Date(b.key).getTime());
}

function buildCompanyProfiles(rows, answersByAssessment, assessmentCountByCompany) {
  const profiles = rows.map((row) => {
    const answers = answersByAssessment.get(row.id) || { total: 0, unknown: 0 };
    const stageScores = [...row.stageScores].sort((a, b) => Number(a.score || 0) - Number(b.score || 0));
    const weakestStage = stageScores[0] || null;
    const strongestStage = stageScores[stageScores.length - 1] || null;
    const band = getBandLabel(Number(row.igc || 0));

    return {
      companyId: row.company_id,
      assessmentId: row.id,
      name: normalizeText(row.nome, 'Empresa sem nome'),
      documento: normalizeText(row.documento_cnpj, 'Sem documento'),
      city: row.city,
      state: row.state,
      igc: roundTo(Number(row.igc || 0), 1),
      pcm: roundTo(Number(row.pcm || 0), 1),
      band: band.label,
      bandKey: band.key,
      unknownRate: answers.total ? roundTo((answers.unknown / answers.total) * 100, 1) : 0,
      weakestStage: weakestStage ? {
        stageKey: weakestStage.stageKey,
        label: STAGE_LABELS[weakestStage.stageKey] || weakestStage.label,
        score: roundTo(Number(weakestStage.score || 0), 1)
      } : null,
      strongestStage: strongestStage ? {
        stageKey: strongestStage.stageKey,
        label: STAGE_LABELS[strongestStage.stageKey] || strongestStage.label,
        score: roundTo(Number(strongestStage.score || 0), 1)
      } : null,
      latestAt: row.createdAt,
      assessmentCount: assessmentCountByCompany.get(row.company_id) || 1,
      reportSummary: normalizeText(row.analysis_json?.summary, 'Sem resumo arquivado.')
    };
  });

  const leaderboard = [...profiles]
    .sort((a, b) => b.igc - a.igc || b.pcm - a.pcm || a.name.localeCompare(b.name))
    .slice(0, 8);

  const attentionCompanies = [...profiles]
    .sort((a, b) => a.igc - b.igc || b.unknownRate - a.unknownRate || a.name.localeCompare(b.name))
    .slice(0, 8);

  return { profiles, leaderboard, attentionCompanies };
}

function buildRecentAssessments(rows, answersByAssessment) {
  return rows.slice(0, 8).map((row) => {
    const answers = answersByAssessment.get(row.id) || { total: 0, unknown: 0 };
    const band = getBandLabel(Number(row.igc || 0));

    return {
      assessmentId: row.id,
      companyId: row.company_id,
      companyName: normalizeText(row.nome, 'Empresa sem nome'),
      city: row.city,
      state: row.state,
      igc: roundTo(Number(row.igc || 0), 1),
      pcm: roundTo(Number(row.pcm || 0), 1),
      band: band.label,
      bandKey: band.key,
      unknownRate: answers.total ? roundTo((answers.unknown / answers.total) * 100, 1) : 0,
      createdAt: row.createdAt,
      reportSummary: normalizeText(row.analysis_json?.summary, 'Sem resumo arquivado.')
    };
  });
}

function describeSampleStatus(totalCompanies) {
  if (totalCompanies >= 20) {
    return { label: 'Amostra robusta', confidence: 92, note: 'Já é possível tratar os sinais como tendência distrital.' };
  }

  if (totalCompanies >= 8) {
    return { label: 'Amostra em formação', confidence: 68, note: 'Os padrões já orientam decisão, mas ainda pedem acompanhamento próximo.' };
  }

  if (totalCompanies >= 3) {
    return { label: 'Amostra inicial', confidence: 44, note: 'Há sinais úteis, mas ainda insuficientes para generalizações fortes.' };
  }

  return { label: 'Amostra incipiente', confidence: 18, note: 'O foco deve ser captar mais empresas antes de consolidar diagnósticos.' };
}

function computeTrendSignal(monthlyTrend) {
  if (monthlyTrend.length < 2) {
    return {
      direction: 'insufficient',
      label: 'Série histórica insuficiente',
      message: 'Ainda não há histórico suficiente para comparar evolução temporal do distrito.'
    };
  }

  const recentWindow = monthlyTrend.slice(-2);
  const earlierWindow = monthlyTrend.slice(0, 2);
  const recentIgc = recentWindow.reduce((sum, item) => sum + item.avgIgc, 0) / recentWindow.length;
  const earlierIgc = earlierWindow.reduce((sum, item) => sum + item.avgIgc, 0) / earlierWindow.length;
  const delta = recentIgc - earlierIgc;

  if (delta >= 6) {
    return {
      direction: 'up',
      label: 'Tração positiva',
      message: `O IGC médio recente está ${roundTo(delta, 1)} p.p. acima do início da série.`
    };
  }

  if (delta <= -6) {
    return {
      direction: 'down',
      label: 'Recuo de maturidade',
      message: `O IGC médio recente está ${roundTo(Math.abs(delta), 1)} p.p. abaixo do início da série.`
    };
  }

  return {
    direction: 'flat',
    label: 'Estabilidade relativa',
    message: 'A série mostra estabilidade; o próximo salto depende mais de profundidade que de volume.'
  };
}

function buildDistrictProfile({
  filters,
  totalCompanies,
  totalAssessments,
  averageIgc,
  averagePcm,
  uniqueCities,
  uniqueStates,
  bandDistribution,
  companyProfiles,
  stageAverages,
  monthlyTrend,
  assessmentCountByCompany
}) {
  const territoryLabel = filters.city && filters.state
    ? `${normalizeCity(filters.city)}, ${normalizeState(filters.state)}`
    : filters.state
      ? `Distrito filtrado em ${normalizeState(filters.state)}`
      : uniqueCities === 1 && companyProfiles[0]
        ? `${companyProfiles[0].city}, ${companyProfiles[0].state}`
        : 'Distrito Circular analisado';

  const sample = describeSampleStatus(totalCompanies);
  const dominantBand = bandDistribution[0]?.label || 'Sem banda dominante';
  const strongestStage = [...stageAverages].sort((a, b) => b.score - a.score)[0] || null;
  const weakestStage = [...stageAverages].sort((a, b) => a.score - b.score)[0] || null;
  const topAssessmentLoads = [...assessmentCountByCompany.values()].sort((a, b) => b - a).slice(0, 3);
  const topLoadShare = totalAssessments
    ? roundTo((topAssessmentLoads.reduce((sum, value) => sum + value, 0) / totalAssessments) * 100, 1)
    : 0;
  const trendSignal = computeTrendSignal(monthlyTrend);

  return {
    territory: territoryLabel,
    sector: 'Construção civil',
    stateCount: uniqueStates,
    cityCount: uniqueCities,
    sampleStatus: sample.label,
    sampleConfidence: sample.confidence,
    sampleNote: sample.note,
    dominantBand,
    averageIgc: roundTo(averageIgc, 1),
    averagePcm: roundTo(averagePcm, 1),
    strongestStage: strongestStage ? strongestStage.label : 'Sem leitura',
    weakestStage: weakestStage ? weakestStage.label : 'Sem leitura',
    topLoadShare,
    trendSignal
  };
}

function buildDiagnostics({
  totalCompanies,
  totalAssessments,
  averageIgc,
  averagePcm,
  unknownAnswerRate,
  bandDistribution,
  stageAverages,
  companyProfiles,
  districtProfile
}) {
  const sortedStages = [...stageAverages].sort((a, b) => a.score - b.score);
  const weakestStage = sortedStages[0] || null;
  const strongestStage = sortedStages[sortedStages.length - 1] || null;
  const gapIgcPcm = roundTo(averageIgc - averagePcm, 1);
  const bestCompany = [...companyProfiles].sort((a, b) => b.igc - a.igc)[0] || null;
  const worstCompany = [...companyProfiles].sort((a, b) => a.igc - b.igc)[0] || null;
  const maturitySpread = bestCompany && worstCompany ? roundTo(bestCompany.igc - worstCompany.igc, 1) : 0;
  const dominantBand = bandDistribution[0] || null;

  const prioritySignals = [];
  if (weakestStage && weakestStage.score < 60) {
    prioritySignals.push(`O maior gargalo do distrito está em ${weakestStage.label.toLowerCase()}.`);
  }
  if (unknownAnswerRate >= 18) {
    prioritySignals.push('Há fragilidade de evidência: a taxa de respostas "Não sei" ainda está alta.');
  }
  if (Math.abs(gapIgcPcm) >= 8) {
    prioritySignals.push(
      gapIgcPcm > 0
        ? 'A maturidade operacional está acima da maturidade material.'
        : 'A base material está evoluindo mais rápido que a governança geral.'
    );
  }
  if (districtProfile.topLoadShare >= 45) {
    prioritySignals.push('Poucas empresas concentram muitas avaliações, o que pode enviesar a leitura histórica.');
  }
  if (!prioritySignals.length) {
    prioritySignals.push('O distrito não mostra um gargalo único gritante; o trabalho agora é aprofundar consistência.');
  }

  const leadershipQuestions = [
    weakestStage ? `Como elevar ${weakestStage.label.toLowerCase()} sem depender apenas de discurso?` : 'Quais dimensões precisam virar prioridade imediata?',
    'Quais empresas líderes podem funcionar como referência prática para o distrito?',
    totalCompanies < 8
      ? 'Como ampliar rapidamente a amostra para tornar o diagnóstico territorial mais confiável?'
      : 'Como transformar leitura agregada em plano de ação empresarial?'
  ];

  return {
    weakestStage,
    strongestStage,
    gapIgcPcm,
    maturitySpread,
    dominantBand: dominantBand ? dominantBand.label : 'Sem banda dominante',
    topAssessmentLoadShare: districtProfile.topLoadShare,
    trendSignal: districtProfile.trendSignal,
    prioritySignals,
    leadershipQuestions
  };
}

function buildInsights(summary) {
  if (summary.totalAssessments === 0) {
    return {
      source: 'heuristic',
      headline: 'Sem base suficiente para leitura distrital',
      boardMemo: 'O distrito ainda não tem respostas suficientes para sustentar uma leitura confiável.',
      executiveSummary: 'Antes de interpretar padrão territorial, a prioridade é ganhar massa crítica de empresas respondentes.',
      territoryInsight: 'O painel ainda está em fase de ativação e não permite distinguir tendência de ruído.',
      concentrationInsight: 'Sem volume suficiente, qualquer ranking seria apenas ilustrativo.',
      dataQualityInsight: 'O primeiro objetivo é completar a base e garantir campos territoriais consistentes.',
      whyThisBeatsBI: 'Um BI também estaria vazio. A camada cognitiva explicita que o problema não é visualização; é insuficiência de amostra.',
      decisionMemo: [
        'Captar mais empresas de Divinópolis antes de consolidar diagnósticos.',
        'Garantir que cada resposta chegue com cidade e UF válidas.',
        'Usar o painel para monitorar adesão inicial, não para fechar tese territorial.'
      ],
      priorityActions: [
        'Aumentar o número de empresas respondentes.',
        'Manter o arquivamento dos relatórios por assessmentId.',
        'Reavaliar o distrito assim que a base tiver massa crítica.'
      ],
      signalSummary: [
        'A amostra atual é insuficiente.',
        'Ainda não existe liderança territorial observável.',
        'O foco deve estar em base, não em comparação.'
      ]
    };
  }

  const weakestStage = summary.diagnostics.weakestStage;
  const strongestStage = summary.diagnostics.strongestStage;
  const topCompany = summary.companyLeaderboard[0];
  const attentionCompany = summary.attentionCompanies[0];
  const sampleStatus = summary.districtProfile.sampleStatus;
  const gapIgcPcm = summary.diagnostics.gapIgcPcm;

  const territoryInsight = `${summary.districtProfile.territory} opera hoje com ${summary.totalCompanies} empresa(s) e ${summary.totalAssessments} avaliação(ões) arquivadas. O distrito está em ${sampleStatus.toLowerCase()}, com IGC médio de ${summary.averageIgc}% e PCM médio de ${summary.averagePcm}%.`;
  const concentrationInsight = summary.diagnostics.topAssessmentLoadShare >= 45
    ? `Há concentração histórica: ${summary.diagnostics.topAssessmentLoadShare}% das avaliações vêm das três empresas mais recorrentes.`
    : 'A leitura histórica está relativamente distribuída, sem concentração excessiva de avaliações em poucas empresas.';
  const dataQualityInsight = summary.unknownAnswerRate >= 18
    ? `${summary.unknownAnswerRate}% das respostas estão em “Não sei”, o que reduz a confiabilidade operacional do diagnóstico.`
    : `A taxa de “Não sei” está em ${summary.unknownAnswerRate}%, patamar administrável para leitura executiva.`;

  const signalSummary = [
    weakestStage ? `Gargalo central: ${weakestStage.label.toLowerCase()} (${weakestStage.score}%).` : '',
    strongestStage ? `Força atual: ${strongestStage.label.toLowerCase()} (${strongestStage.score}%).` : '',
    topCompany ? `Liderança atual: ${topCompany.name} com IGC de ${topCompany.igc}%.` : '',
    attentionCompany ? `Empresa de atenção: ${attentionCompany.name} com IGC de ${attentionCompany.igc}% e ${attentionCompany.unknownRate}% de “Não sei”.` : ''
  ].filter(Boolean);

  return {
    source: 'heuristic',
    headline: 'Leitura cognitiva do Distrito Circular',
    boardMemo: summary.diagnostics.prioritySignals.join(' '),
    executiveSummary: `O distrito não precisa apenas de gráficos: precisa de foco. Hoje o maior deslocamento está em ${weakestStage ? weakestStage.label.toLowerCase() : 'um estágio ainda não identificado claramente'}, enquanto ${strongestStage ? strongestStage.label.toLowerCase() : 'as dimensões mais fortes'} já apontam onde existe capacidade instalada.`,
    territoryInsight,
    concentrationInsight,
    dataQualityInsight,
    whyThisBeatsBI: 'A camada cognitiva aponta um gargalo prioritário, separa sinal de ruído amostral e indica o que a liderança deve atacar primeiro.',
    decisionMemo: [
      weakestStage
        ? `Prioridade 1: atacar ${weakestStage.label.toLowerCase()}, porque é o ponto que mais limita a maturidade agregada.`
        : 'Prioridade 1: consolidar a leitura por estágio com mais base.',
      gapIgcPcm >= 8
        ? 'Prioridade 2: reduzir o descompasso entre maturidade geral e circularidade material.'
        : 'Prioridade 2: aprofundar consistência entre operação, material e monitoramento.',
      summary.totalCompanies < 8
        ? 'Prioridade 3: ampliar rapidamente o número de empresas respondentes para reduzir viés.'
        : 'Prioridade 3: transformar líderes atuais em referência prática para o distrito.'
    ],
    priorityActions: [
      ...summary.diagnostics.prioritySignals.slice(0, 3),
      ...summary.diagnostics.leadershipQuestions.slice(0, 2)
    ],
    signalSummary
  };
}

function buildEmptyOverview(filters = {}) {
  const empty = {
    filters: {
      state: filters.state ? normalizeState(filters.state) : '',
      city: filters.city ? normalizeCity(filters.city) : ''
    },
    totalCompanies: 0,
    totalAssessments: 0,
    averageIgc: 0,
    averagePcm: 0,
    averageTotalPoints: 0,
    averageScore: 0,
    unknownAnswerRate: 0,
    uniqueCities: 0,
    uniqueStates: 0,
    bandDistribution: [],
    stageAverages: emptyStageAverages(),
    stateRanking: [],
    cityRanking: [],
    monthlyTrend: [],
    companyLeaderboard: [],
    attentionCompanies: [],
    companyMatrix: [],
    recentAssessments: [],
    districtProfile: {
      territory: filters.city && filters.state ? `${normalizeCity(filters.city)}, ${normalizeState(filters.state)}` : 'Distrito Circular analisado',
      sector: 'Construção civil',
      stateCount: 0,
      cityCount: 0,
      sampleStatus: 'Amostra incipiente',
      sampleConfidence: 0,
      sampleNote: 'Ainda não há base suficiente.',
      dominantBand: 'Sem banda dominante',
      averageIgc: 0,
      averagePcm: 0,
      strongestStage: 'Sem leitura',
      weakestStage: 'Sem leitura',
      topLoadShare: 0,
      trendSignal: {
        direction: 'insufficient',
        label: 'Sem histórico',
        message: 'Ainda não há histórico para comparar.'
      }
    },
    diagnostics: {
      weakestStage: null,
      strongestStage: null,
      gapIgcPcm: 0,
      maturitySpread: 0,
      dominantBand: 'Sem banda dominante',
      topAssessmentLoadShare: 0,
      trendSignal: {
        direction: 'insufficient',
        label: 'Sem histórico',
        message: 'Ainda não há histórico para comparar.'
      },
      prioritySignals: [],
      leadershipQuestions: []
    }
  };

  return {
    generatedAt: new Date().toISOString(),
    intelligenceMode: 'heuristic',
    ...empty,
    insights: buildInsights(empty),
    aiInsights: null
  };
}

async function getDashboardOverview(filters = {}) {
  const pool = getPool();
  if (!pool) {
    return buildEmptyOverview(filters);
  }

  try {
    const result = await pool.query(`
      SELECT
        a.id,
        a.igc,
        a.pcm,
        a.total_points,
        a.average_points,
        a.max_points,
        a.answer_count,
        a.created_at,
        a.analysis_json,
        c.id AS company_id,
        c.nome,
        c.documento_cnpj,
        c.cidade,
        c.state
      FROM assessments a
      INNER JOIN companies c ON c.id = a.company_id
      ORDER BY a.created_at DESC;
    `);

    const rows = result.rows.map((row) => ({
      ...row,
      city: normalizeCity(row.cidade),
      state: normalizeState(row.state),
      createdAt: row.created_at,
      stageScores: Array.isArray(row.analysis_json?.stageScores) ? row.analysis_json.stageScores : []
    }));

    const filteredRows = rows.filter((row) => {
      if (filters.state && normalizeState(filters.state) !== row.state) {
        return false;
      }

      if (filters.city && canonicalizeText(filters.city) !== canonicalizeText(row.city)) {
        return false;
      }

      return true;
    });

    if (!filteredRows.length) {
      return buildEmptyOverview(filters);
    }

    const filteredAssessmentIds = filteredRows.map((row) => row.id);
    const answerRows = await pool.query(
      `
        SELECT
          aa.assessment_id,
          aa.answer_id
        FROM assessment_answers aa
        WHERE aa.assessment_id = ANY($1::bigint[])
        ORDER BY aa.id DESC;
      `,
      [filteredAssessmentIds]
    );

    const answersByAssessment = collectAnswersSummary(answerRows.rows);

    const latestByCompany = new Map();
    const assessmentCountByCompany = new Map();
    filteredRows.forEach((row) => {
      assessmentCountByCompany.set(row.company_id, (assessmentCountByCompany.get(row.company_id) || 0) + 1);
      if (!latestByCompany.has(row.company_id)) {
        latestByCompany.set(row.company_id, row);
      }
    });

    const companyRows = [...latestByCompany.values()];
    const totalAssessments = filteredRows.length;
    const totalCompanies = companyRows.length;
    const uniqueCities = new Set(companyRows.map((row) => row.city)).size;
    const uniqueStates = new Set(companyRows.map((row) => row.state)).size;

    const averageIgc = averageOfRows(companyRows, 'igc');
    const averagePcm = averageOfRows(companyRows, 'pcm');
    const averageTotalPoints = averageOfRows(companyRows, 'total_points');
    const averageScore = averageOfRows(companyRows, 'average_points');
    const unknownAnswerRate = computeUnknownRate(companyRows.map((row) => row.id), answersByAssessment);
    const bandDistribution = computeBandDistribution(companyRows);
    const stageAverages = computeStageAverages(companyRows);
    const { stateRanking, cityRanking } = computeTerritoryRankings(companyRows);
    const monthlyTrend = computeMonthlyTrend(filteredRows);
    const { profiles, leaderboard, attentionCompanies } = buildCompanyProfiles(companyRows, answersByAssessment, assessmentCountByCompany);
    const recentAssessments = buildRecentAssessments(filteredRows, answersByAssessment);

    const districtProfile = buildDistrictProfile({
      filters,
      totalCompanies,
      totalAssessments,
      averageIgc,
      averagePcm,
      uniqueCities,
      uniqueStates,
      bandDistribution,
      companyProfiles: profiles,
      stageAverages,
      monthlyTrend,
      assessmentCountByCompany
    });

    const diagnostics = buildDiagnostics({
      totalCompanies,
      totalAssessments,
      averageIgc,
      averagePcm,
      unknownAnswerRate,
      bandDistribution,
      stageAverages,
      companyProfiles: profiles,
      districtProfile
    });

    const payload = {
      generatedAt: new Date().toISOString(),
      intelligenceMode: 'heuristic',
      filters: {
        state: filters.state ? normalizeState(filters.state) : '',
        city: filters.city ? normalizeCity(filters.city) : ''
      },
      totalCompanies,
      totalAssessments,
      averageIgc: roundTo(averageIgc, 1),
      averagePcm: roundTo(averagePcm, 1),
      averageTotalPoints: roundTo(averageTotalPoints, 1),
      averageScore: roundTo(averageScore, 1),
      unknownAnswerRate: roundTo(unknownAnswerRate, 1),
      uniqueCities,
      uniqueStates,
      bandDistribution,
      stageAverages,
      stateRanking,
      cityRanking,
      monthlyTrend,
      companyLeaderboard: leaderboard,
      attentionCompanies,
      companyMatrix: profiles.map((item) => ({
        assessmentId: item.assessmentId,
        companyName: item.name,
        igc: item.igc,
        pcm: item.pcm,
        band: item.band,
        bandKey: item.bandKey
      })).slice(0, 16),
      recentAssessments,
      districtProfile,
      diagnostics
    };

    payload.insights = buildInsights(payload);

    try {
      payload.aiInsights = await generateOpenRouterInsights({
        generatedAt: payload.generatedAt,
        filters: payload.filters,
        districtProfile: payload.districtProfile,
        totalCompanies: payload.totalCompanies,
        totalAssessments: payload.totalAssessments,
        averageIgc: payload.averageIgc,
        averagePcm: payload.averagePcm,
        averageTotalPoints: payload.averageTotalPoints,
        averageScore: payload.averageScore,
        unknownAnswerRate: payload.unknownAnswerRate,
        bandDistribution: payload.bandDistribution,
        stageAverages: payload.stageAverages,
        stateRanking: payload.stateRanking.slice(0, 5),
        cityRanking: payload.cityRanking.slice(0, 5),
        monthlyTrend: payload.monthlyTrend,
        companyLeaderboard: payload.companyLeaderboard.slice(0, 5),
        attentionCompanies: payload.attentionCompanies.slice(0, 5),
        diagnostics: payload.diagnostics
      });
      payload.intelligenceMode = payload.aiInsights ? 'openrouter' : 'heuristic';
    } catch (error) {
      payload.aiInsights = null;
      payload.intelligenceMode = 'heuristic';
      console.warn('OpenRouter insights unavailable:', error.message);
    }

    return payload;
  } catch (error) {
    console.warn('Dashboard database unavailable:', error.message);
    return buildEmptyOverview(filters);
  }
}

module.exports = {
  getDashboardOverview
};
