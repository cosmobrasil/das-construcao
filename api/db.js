const { Pool } = require('pg');

let pool;

function getPool() {
  if (!process.env.DATABASE_URL) {
    return null;
  }

  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false }
    });
  }

  return pool;
}

async function checkDbHealth() {
  const currentPool = getPool();
  if (!currentPool) {
    return { configured: false, reachable: false, error: 'DATABASE_URL não configurado.' };
  }

  try {
    await currentPool.query('SELECT 1');
    return { configured: true, reachable: true, error: null };
  } catch (error) {
    return { configured: true, reachable: false, error: error.message };
  }
}

function buildAssessmentSnapshot(report) {
  return {
    archivedAt: new Date().toISOString(),
    company: report.company,
    igc: report.igc,
    pcm: report.pcm,
    totalPoints: report.totalPoints,
    averagePoints: report.averagePoints,
    maxPoints: report.maxPoints,
    band: report.band,
    summary: report.summary,
    detail: report.detail,
    strengths: report.strengths,
    opportunities: report.opportunities,
    recommendations: report.recommendations,
    stageScores: report.stageScores,
    answers: report.answers
  };
}

async function initDb() {
  const currentPool = getPool();

  if (!currentPool) {
    return;
  }

  await currentPool.query(`
    CREATE TABLE IF NOT EXISTS companies (
      id BIGSERIAL PRIMARY KEY,
      documento_cnpj TEXT NOT NULL UNIQUE,
      nome TEXT NOT NULL,
      responsavel TEXT,
      cidade TEXT,
      state TEXT,
      cnae TEXT,
      email TEXT,
      source_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE companies ADD COLUMN IF NOT EXISTS state TEXT;

    CREATE TABLE IF NOT EXISTS assessments (
      id BIGSERIAL PRIMARY KEY,
      company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      igc NUMERIC(6,2) NOT NULL,
      pcm NUMERIC(6,2) NOT NULL,
      total_points NUMERIC(6,2) NOT NULL,
      average_points NUMERIC(6,2) NOT NULL,
      max_points NUMERIC(6,2) NOT NULL,
      answer_count INTEGER NOT NULL,
      analysis_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS assessment_answers (
      id BIGSERIAL PRIMARY KEY,
      assessment_id BIGINT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
      question_id TEXT NOT NULL,
      answer_id TEXT NOT NULL,
      answer_label TEXT NOT NULL,
      points NUMERIC(6,2) NOT NULL,
      max_points NUMERIC(6,2) NOT NULL,
      stage_key TEXT NOT NULL,
      UNIQUE (assessment_id, question_id)
    );
  `);
}

async function upsertCompany(company) {
  const currentPool = getPool();

  if (!currentPool) {
    return null;
  }

  const result = await currentPool.query(
    `
      INSERT INTO companies (documento_cnpj, nome, responsavel, cidade, state, cnae, email, source_json, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, NOW())
      ON CONFLICT (documento_cnpj)
      DO UPDATE SET
        nome = EXCLUDED.nome,
        responsavel = EXCLUDED.responsavel,
        cidade = EXCLUDED.cidade,
        state = EXCLUDED.state,
        cnae = EXCLUDED.cnae,
        email = EXCLUDED.email,
        source_json = EXCLUDED.source_json,
        updated_at = NOW()
      RETURNING *;
    `,
    [
      company.documento_cnpj,
      company.nome,
      company.responsavel || null,
      company.cidade || null,
      String(company.state || '').trim().toUpperCase() || null,
      company.cnae || null,
      company.email || null,
      JSON.stringify(company.source_json || {})
    ]
  );

  return result.rows[0];
}

async function saveAssessment({ companyId, report }) {
  const currentPool = getPool();

  if (!currentPool) {
    return null;
  }

  const client = await currentPool.connect();

  const snapshot = buildAssessmentSnapshot(report);

  try {
    await client.query('BEGIN');

    const assessmentResult = await client.query(
      `
        INSERT INTO assessments (
          company_id, igc, pcm, total_points, average_points, max_points, answer_count, analysis_json
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
        RETURNING *;
      `,
      [
        companyId,
        report.igc,
        report.pcm,
        report.totalPoints,
        report.averagePoints,
        report.maxPoints,
        report.answers.length,
        JSON.stringify({
          ...snapshot
        })
      ]
    );

    const assessment = assessmentResult.rows[0];

    for (const answer of report.answers) {
      await client.query(
        `
          INSERT INTO assessment_answers (
            assessment_id, question_id, answer_id, answer_label, points, max_points, stage_key
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7);
        `,
        [
          assessment.id,
          answer.questionId,
          answer.answerId || 'unknown',
          answer.answerLabel,
          answer.points,
          answer.maxPoints,
          answer.stageKey
        ]
      );
    }

    await client.query('COMMIT');
    return assessment;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function getAssessmentById(assessmentId) {
  const currentPool = getPool();
  if (!currentPool) {
    return null;
  }

  const assessmentResult = await currentPool.query(
    `
      SELECT
        a.id,
        a.igc,
        a.pcm,
        a.total_points,
        a.average_points,
        a.max_points,
        a.answer_count,
        a.analysis_json,
        a.created_at,
        c.documento_cnpj,
        c.nome,
        c.responsavel,
        c.cidade,
        c.state,
        c.cnae,
        c.email
      FROM assessments a
      INNER JOIN companies c ON c.id = a.company_id
      WHERE a.id = $1
      LIMIT 1;
    `,
    [assessmentId]
  );

  const row = assessmentResult.rows[0];
  if (!row) {
    return null;
  }

  const answerResult = await currentPool.query(
    `
      SELECT
        question_id,
        answer_id,
        answer_label,
        points,
        max_points,
        stage_key
      FROM assessment_answers
      WHERE assessment_id = $1
      ORDER BY id ASC;
    `,
    [assessmentId]
  );

  const snapshot = row.analysis_json?.company && Array.isArray(row.analysis_json?.answers)
    ? row.analysis_json
    : {
        archivedAt: row.created_at,
        company: {
          documento_cnpj: row.documento_cnpj,
          nome: row.nome,
          responsavel: row.responsavel,
          cidade: row.cidade,
          state: row.state,
          cnae: row.cnae,
          email: row.email
        },
        igc: Number(row.igc || 0),
        pcm: Number(row.pcm || 0),
        totalPoints: Number(row.total_points || 0),
        averagePoints: Number(row.average_points || 0),
        maxPoints: Number(row.max_points || 0),
        answerCount: Number(row.answer_count || 0),
        band: row.analysis_json?.band || null,
        summary: row.analysis_json?.summary || '',
        detail: row.analysis_json?.detail || '',
        strengths: row.analysis_json?.strengths || [],
        opportunities: row.analysis_json?.opportunities || [],
        recommendations: row.analysis_json?.recommendations || [],
        stageScores: row.analysis_json?.stageScores || [],
        answers: answerResult.rows.map((answer) => ({
          questionId: answer.question_id,
          answerId: answer.answer_id,
          answerLabel: answer.answer_label,
          points: Number(answer.points || 0),
          maxPoints: Number(answer.max_points || 0),
          stageKey: answer.stage_key
        }))
      };

  return {
    assessmentId: row.id,
    archivedAt: snapshot.archivedAt || row.created_at,
    report: snapshot
  };
}

module.exports = {
  getPool,
  checkDbHealth,
  initDb,
  upsertCompany,
  saveAssessment,
  getAssessmentById
};
