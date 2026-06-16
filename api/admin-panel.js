function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number)
    ? number.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })
    : '0';
}

function getBandColor(value) {
  if (value >= 85) return '#16a34a';
  if (value >= 65) return '#38bdf8';
  if (value >= 35) return '#f59e0b';
  return '#ef4444';
}

function getCompanyLabel(report) {
  return report?.company?.nome || 'Empresa analisada';
}

function getIdentifierLabel(report) {
  return report?.company?.documento_cnpj || '';
}

function getSafeFileStem(report) {
  const identifier = String(getIdentifierLabel(report) || '').replace(/\D/g, '');
  return identifier || 'empresa';
}

function buildReportHtmlDocument(report, { sourceLabel = 'painel administrativo', archiveLabel = '' } = {}) {
  const currentDate = new Date().toLocaleString('pt-BR', {
    dateStyle: 'full',
    timeStyle: 'short'
  });
  const companyLabel = escapeHtml(getCompanyLabel(report));
  const identifierLabel = escapeHtml(getIdentifierLabel(report));
  const summary = escapeHtml(report.summary || '');
  const detail = escapeHtml(report.detail || '');
  const bandLabel = escapeHtml(report.band?.label || 'Básico');
  const igcValue = Number(report.igc || 0);
  const pcmValue = Number(report.pcm || 0);
  const totalPoints = Number(report.totalPoints || 0);
  const averagePoints = Number(report.averagePoints || 0);
  const radius = 78;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (circumference * Math.max(0, Math.min(100, igcValue))) / 100;
  const donutColor = getBandColor(igcValue);
  const strengths = (report.strengths || []).map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  const opportunities = (report.opportunities || []).map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  const recommendations = (report.recommendations || []).map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  const stageRows = (report.stageScores || []).map((stage) => `
      <div class="stage-row">
          <div class="stage-name">${escapeHtml(stage.label)}</div>
          <div class="stage-value">${formatNumber(stage.score)}%</div>
          <div class="stage-meta">${formatNumber(stage.rawPoints)} de ${formatNumber(stage.maxPoints)} pontos</div>
      </div>
  `).join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Relatório de Circularidade Empresarial</title>
  <style>
      :root {
          --bg-color: #020617;
          --glass-bg: rgba(15, 23, 42, 0.72);
          --glass-border: rgba(255, 255, 255, 0.1);
          --text-primary: #f8fafc;
          --text-secondary: #94a3b8;
          --gold: #D4AF37;
      }
      * { box-sizing: border-box; }
      body {
          margin: 0;
          font-family: Arial, sans-serif;
          color: var(--text-primary);
          background:
              radial-gradient(circle at top, rgba(30, 41, 59, 0.95), transparent 45%),
              var(--bg-color);
          min-height: 100vh;
          padding: 32px 20px;
      }
      .page { max-width: 1100px; margin: 0 auto; }
      .banner, .card {
          background: var(--glass-bg);
          border: 1px solid var(--glass-border);
          backdrop-filter: blur(16px);
          border-radius: 20px;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      }
      .banner { padding: 28px; margin-bottom: 18px; }
      .kicker {
          margin: 0 0 8px 0;
          color: var(--gold);
          text-transform: uppercase;
          letter-spacing: 0.14em;
          font-size: 12px;
          font-weight: 700;
      }
      h1, h2, h3, p { margin-top: 0; }
      h1 { margin-bottom: 10px; font-size: 30px; line-height: 1.15; }
      .subtitle { color: var(--text-secondary); line-height: 1.6; margin-bottom: 0; }
      .meta { margin-top: 14px; color: var(--text-secondary); font-size: 14px; }
      .grid {
          display: grid;
          grid-template-columns: 290px minmax(0, 1fr);
          gap: 16px;
          margin-bottom: 16px;
      }
      .card { padding: 20px; }
      .chart-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 320px;
      }
      .chart-label { text-align: center; margin-top: 14px; }
      .chart-label strong { display: block; font-size: 28px; }
      .chart-label span { color: var(--text-secondary); font-size: 14px; }
      .metrics {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
      }
      .metric {
          padding: 16px;
          border-radius: 14px;
          border: 1px solid var(--glass-border);
          background: rgba(255,255,255,0.03);
      }
      .metric .label { color: var(--text-secondary); font-size: 12px; margin-bottom: 6px; }
      .metric .value { font-size: 24px; font-weight: 700; }
      .metric .hint { margin-top: 6px; color: var(--text-secondary); font-size: 12px; line-height: 1.4; }
      .sections {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 16px;
          margin-bottom: 16px;
      }
      .section h3 { margin-bottom: 12px; font-size: 18px; }
      ul { margin: 0; padding-left: 20px; color: var(--text-primary); }
      li { margin-bottom: 10px; color: var(--text-secondary); line-height: 1.5; }
      .footer-note {
          margin-top: 14px;
          color: var(--text-secondary);
          font-size: 13px;
          line-height: 1.5;
      }
      .stage-list {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
          margin-top: 8px;
      }
      .stage-row {
          border: 1px solid var(--glass-border);
          background: rgba(255,255,255,0.03);
          border-radius: 14px;
          padding: 14px;
      }
      .stage-name { font-size: 13px; color: var(--text-secondary); margin-bottom: 6px; }
      .stage-value { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
      .stage-meta { font-size: 12px; color: var(--text-secondary); }
      .donut-wrap {
          position: relative;
          width: 220px;
          height: 220px;
      }
      .donut-center {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-direction: column;
          pointer-events: none;
      }
      .donut-center strong { font-size: 34px; line-height: 1; }
      .donut-center span { color: var(--text-secondary); font-size: 12px; margin-top: 4px; }
      @media (max-width: 760px) {
          .grid, .sections, .stage-list { grid-template-columns: 1fr; }
          .metrics { grid-template-columns: 1fr; }
      }
  </style>
</head>
<body>
  <main class="page">
      <section class="banner">
          <p class="kicker">Relatório de Circularidade Empresarial</p>
          <h1>${companyLabel}</h1>
          <p class="subtitle">Relatório gerado para ${identifierLabel || 'o cadastro informado'}.</p>
          <p class="subtitle">Fonte usada no download: ${escapeHtml(sourceLabel)}.</p>
          <p class="subtitle">${escapeHtml(archiveLabel)}</p>
          <div class="meta">Gerado em ${escapeHtml(currentDate)}</div>
      </section>
      <section class="grid">
          <div class="card chart-card">
              <div class="donut-wrap">
                  <svg viewBox="0 0 220 220" width="220" height="220" role="img" aria-label="Gráfico de IGC">
                      <circle cx="110" cy="110" r="${radius}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="22"></circle>
                      <circle cx="110" cy="110" r="${radius}" fill="none" stroke="${donutColor}" stroke-width="22" stroke-linecap="round" stroke-dasharray="${circumference}" stroke-dashoffset="${dashOffset}" transform="rotate(-90 110 110)"></circle>
                  </svg>
                  <div class="donut-center">
                      <strong>${formatNumber(igcValue)}%</strong>
                      <span>IGC</span>
                  </div>
              </div>
              <div class="chart-label">
                  <strong>${formatNumber(igcValue)}%</strong>
                  <span>Índice de Circularidade - ${bandLabel}</span>
              </div>
          </div>
          <div class="card">
              <div class="metrics">
                  <div class="metric"><div class="label">Índice de Circularidade (IGC)</div><div class="value">${formatNumber(igcValue)}%</div><div class="hint">Visão geral da maturidade circular</div></div>
                  <div class="metric"><div class="label">Perfil de Circularidade de Materiais (PCM)</div><div class="value">${formatNumber(pcmValue)}%</div><div class="hint">Foco em materiais, reaproveitamento e fim de vida</div></div>
                  <div class="metric"><div class="label">Total de Pontos</div><div class="value">${formatNumber(totalPoints)}</div><div class="hint">Somatório bruto da avaliação</div></div>
                  <div class="metric"><div class="label">Média de Pontos</div><div class="value">${formatNumber(averagePoints)}</div><div class="hint">Média por questão respondida</div></div>
              </div>
          </div>
      </section>
      <section class="sections">
          <div class="card section">
              <h3>Leitura executiva</h3>
              <p class="subtitle">${summary}</p>
              <p class="subtitle">${detail}</p>
          </div>
          <div class="card section">
              <h3>Pontos fortes</h3>
              <ul>${strengths || '<li>Nenhum destaque registrado.</li>'}</ul>
          </div>
          <div class="card section">
              <h3>Oportunidades</h3>
              <ul>${opportunities || '<li>Nenhuma oportunidade registrada.</li>'}</ul>
          </div>
      </section>
      <section class="card section">
          <h3>Recomendações prioritárias</h3>
          <ul>${recommendations || '<li>Nenhuma recomendação registrada.</li>'}</ul>
          <div class="footer-note">O relatório é gerado com base nas respostas registradas neste diagnóstico e não substitui certificações formais ou validações técnicas específicas.</div>
      </section>
      <section class="card section" style="margin-top: 16px;">
          <h3>Desempenho por estágio</h3>
          <div class="stage-list">${stageRows}</div>
      </section>
  </main>
</body>
</html>`;
}

function escapePdfText(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function buildPdfLines(report) {
  const lines = [
    'Relatorio de Circularidade Empresarial',
    '',
    `Empresa: ${getCompanyLabel(report)}`,
    `CNPJ/Documento: ${getIdentifierLabel(report) || 'Nao informado'}`,
    `IGC: ${formatNumber(report.igc)}%`,
    `PCM: ${formatNumber(report.pcm)}%`,
    `Banda: ${report.band?.label || 'Basico'}`,
    `Total de pontos: ${formatNumber(report.totalPoints)}`,
    `Media de pontos: ${formatNumber(report.averagePoints)}`,
    '',
    'Resumo executivo:',
    report.summary || 'Sem resumo arquivado.',
    '',
    'Detalhamento:',
    report.detail || 'Sem detalhamento arquivado.',
    '',
    'Pontos fortes:'
  ];

  (report.strengths || ['Nenhum destaque registrado.']).forEach((item) => {
    lines.push(`- ${item}`);
  });

  lines.push('', 'Oportunidades:');
  (report.opportunities || ['Nenhuma oportunidade registrada.']).forEach((item) => {
    lines.push(`- ${item}`);
  });

  lines.push('', 'Recomendacoes prioritarias:');
  (report.recommendations || ['Nenhuma recomendacao registrada.']).forEach((item) => {
    lines.push(`- ${item}`);
  });

  lines.push('', 'Desempenho por estagio:');
  (report.stageScores || []).forEach((stage) => {
    lines.push(`- ${stage.label}: ${formatNumber(stage.score)}% (${formatNumber(stage.rawPoints)} de ${formatNumber(stage.maxPoints)} pontos)`);
  });

  lines.push('', `Gerado em ${new Date().toLocaleString('pt-BR')}`);
  return lines;
}

function createMinimalPdfBuffer(lines) {
  const pageHeight = 792;
  const marginTop = 52;
  const lineHeight = 16;
  const linesPerPage = 42;
  const pages = [];

  for (let index = 0; index < lines.length; index += linesPerPage) {
    pages.push(lines.slice(index, index + linesPerPage));
  }

  const objects = [];
  const addObject = (content) => {
    objects.push(content);
    return objects.length;
  };

  const fontId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const pageIds = [];
  const contentIds = [];

  pages.forEach((pageLines) => {
    const textCommands = ['BT', '/F1 11 Tf', '50 740 Td'];
    pageLines.forEach((line, lineIndex) => {
      if (lineIndex > 0) {
        textCommands.push(`0 -${lineHeight} Td`);
      }
      textCommands.push(`(${escapePdfText(line)}) Tj`);
    });
    textCommands.push('ET');
    const stream = textCommands.join('\n');
    const contentId = addObject(`<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}\nendstream`);
    contentIds.push(contentId);
    pageIds.push(null);
  });

  const pagesId = addObject('');

  pages.forEach((_pageLines, pageIndex) => {
    const pageObject = `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 ${pageHeight}] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentIds[pageIndex]} 0 R >>`;
    const pageId = addObject(pageObject);
    pageIds[pageIndex] = pageId;
  });

  objects[pagesId - 1] = `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>`;
  const catalogId = addObject(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

  const parts = ['%PDF-1.4\n'];
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(parts.join(''), 'utf8'));
    parts.push(`${index + 1} 0 obj\n${object}\nendobj\n`);
  });

  const xrefOffset = Buffer.byteLength(parts.join(''), 'utf8');
  parts.push(`xref\n0 ${objects.length + 1}\n`);
  parts.push('0000000000 65535 f \n');
  for (let index = 1; index <= objects.length; index += 1) {
    parts.push(`${String(offsets[index]).padStart(10, '0')} 00000 n \n`);
  }
  parts.push(`trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  return Buffer.from(parts.join(''), 'utf8');
}

function buildReportPdfBuffer(report) {
  return createMinimalPdfBuffer(buildPdfLines(report));
}

module.exports = {
  buildReportHtmlDocument,
  buildReportPdfBuffer,
  getSafeFileStem
};
