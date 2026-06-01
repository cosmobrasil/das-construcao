const QUESTION_DEFINITIONS = [
  {
    questionId: 'q1',
    step: 2,
    stageKey: 'input',
    stageLabel: 'Entrada (Input)',
    maxPoints: 10,
    answers: {
      virgin: { label: 'Matérias-primas virgens', points: 0 },
      recycled: { label: 'Matérias-primas recicladas', points: 10 },
      byproduct: { label: 'Aproveitamento de resíduos de outros processos', points: 8 },
      renewable: { label: 'Fontes renováveis', points: 7 },
      unknown: { label: 'Não sei / não aplicável', points: 5 }
    }
  },
  {
    questionId: 'q2',
    step: 3,
    stageKey: 'output',
    stageLabel: 'Gestão de Resíduos',
    maxPoints: 10,
    answers: {
      landfill: { label: 'Descarte em aterro', points: 0 },
      recycling: { label: 'Reciclagem, reuso e reaproveitamento', points: 10 },
      energy: { label: 'Recuperação de energia', points: 6 }
    }
  },
  {
    questionId: 'q3',
    step: 4,
    stageKey: 'output',
    stageLabel: 'Saída do Produto',
    maxPoints: 10,
    answers: {
      yes: { label: 'Sim', points: 10 },
      no: { label: 'Não', points: 0 },
      unknown: { label: 'Não sei', points: 5 }
    }
  },
  {
    questionId: 'q4',
    step: 5,
    stageKey: 'output',
    stageLabel: 'Saída do Produto',
    maxPoints: 10,
    answers: {
      yes: { label: 'Sim', points: 10 },
      no: { label: 'Não', points: 0 },
      unknown: { label: 'Não sei', points: 5 }
    }
  },
  {
    questionId: 'q5',
    step: 6,
    stageKey: 'output',
    stageLabel: 'Saída do Produto',
    maxPoints: 10,
    answers: {
      yes: { label: 'Sim', points: 0 },
      no: { label: 'Não', points: 10 },
      unknown: { label: 'Não sei', points: 5 }
    }
  },
  {
    questionId: 'q6',
    step: 7,
    stageKey: 'output',
    stageLabel: 'Saída do Produto',
    maxPoints: 10,
    answers: {
      yes: { label: 'Sim', points: 6 },
      no: { label: 'Não', points: 4 },
      unknown: { label: 'Não sei', points: 5 }
    }
  },
  {
    questionId: 'q7',
    step: 8,
    stageKey: 'lifecycle',
    stageLabel: 'Vida Útil do Produto',
    maxPoints: 10,
    answers: {
      yes: { label: 'Sim', points: 10 },
      no: { label: 'Não', points: 0 },
      unknown: { label: 'Não sei', points: 5 }
    }
  },
  {
    questionId: 'q8',
    step: 9,
    stageKey: 'lifecycle',
    stageLabel: 'Vida Útil do Produto',
    maxPoints: 10,
    answers: {
      yes: { label: 'Sim', points: 10 },
      no: { label: 'Não', points: 0 },
      unknown: { label: 'Não sei', points: 5 }
    }
  },
  {
    questionId: 'q9',
    step: 10,
    stageKey: 'lifecycle',
    stageLabel: 'Vida Útil do Produto',
    maxPoints: 10,
    answers: {
      yes: { label: 'Sim', points: 10 },
      no: { label: 'Não', points: 0 },
      unknown: { label: 'Não sei', points: 5 }
    }
  },
  {
    questionId: 'q10',
    step: 11,
    stageKey: 'monitoring',
    stageLabel: 'Monitoramento e Extensão do Ciclo',
    maxPoints: 10,
    answers: {
      yes: { label: 'Sim', points: 10 },
      no: { label: 'Não', points: 0 },
      unknown: { label: 'Não sei', points: 5 }
    }
  },
  {
    questionId: 'q11',
    step: 12,
    stageKey: 'monitoring',
    stageLabel: 'Monitoramento e Extensão do Ciclo',
    maxPoints: 10,
    answers: {
      yes: { label: 'Sim', points: 10 },
      no: { label: 'Não', points: 0 },
      unknown: { label: 'Não sei', points: 5 }
    }
  },
  {
    questionId: 'q12',
    step: 13,
    stageKey: 'monitoring',
    stageLabel: 'Monitoramento e Extensão do Ciclo',
    maxPoints: 10,
    answers: {
      yes: { label: 'Sim', points: 10 },
      no: { label: 'Não', points: 0 },
      unknown: { label: 'Não sei', points: 5 }
    }
  }
];

const STAGE_CONFIG = {
  input: { label: 'Entrada (Input)', questionIds: ['q1'] },
  output: { label: 'Saída e gestão de resíduos', questionIds: ['q2', 'q3', 'q4', 'q5', 'q6'] },
  lifecycle: { label: 'Vida útil do produto', questionIds: ['q7', 'q8', 'q9'] },
  monitoring: { label: 'Monitoramento e extensão do ciclo', questionIds: ['q10', 'q11', 'q12'] }
};

const QUESTION_BY_ID = Object.fromEntries(QUESTION_DEFINITIONS.map((question) => [question.questionId, question]));
const QUESTION_BY_STEP = Object.fromEntries(QUESTION_DEFINITIONS.map((question) => [question.step, question]));

function getBand(score) {
  if (score >= 85) {
    return { key: 'avancado', label: 'Avançado' };
  }

  if (score >= 65) {
    return { key: 'bom', label: 'Bom' };
  }

  if (score >= 35) {
    return { key: 'moderado', label: 'Moderado' };
  }

  return { key: 'basico', label: 'Básico' };
}

function roundTo(value, decimals = 1) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function calculateReport({ company, answers }) {
  const normalizedAnswers = Array.isArray(answers) ? answers : [];
  const answerMap = new Map(normalizedAnswers.map((answer) => [answer.questionId, answer]));

  const detailedAnswers = QUESTION_DEFINITIONS.map((question) => {
    const answer = answerMap.get(question.questionId);
    const answerMeta = answer ? question.answers[answer.answerId] : null;

    if (!answerMeta) {
      return {
        questionId: question.questionId,
        step: question.step,
        stageKey: question.stageKey,
        stageLabel: question.stageLabel,
        answerId: null,
        answerLabel: 'Sem resposta',
        points: 0,
        maxPoints: question.maxPoints
      };
    }

    return {
      questionId: question.questionId,
      step: question.step,
      stageKey: question.stageKey,
      stageLabel: question.stageLabel,
      answerId: answer.answerId,
      answerLabel: answerMeta.label,
      points: answerMeta.points,
      maxPoints: question.maxPoints
    };
  });

  const totalPoints = detailedAnswers.reduce((sum, item) => sum + item.points, 0);
  const maxPoints = QUESTION_DEFINITIONS.reduce((sum, item) => sum + item.maxPoints, 0);
  const averagePoints = detailedAnswers.length ? totalPoints / detailedAnswers.length : 0;

  const stageScores = Object.entries(STAGE_CONFIG).map(([stageKey, stage]) => {
    const questions = stage.questionIds.map((questionId) => detailedAnswers.find((item) => item.questionId === questionId));
    const stageTotal = questions.reduce((sum, item) => sum + (item?.points || 0), 0);
    const stageMax = questions.reduce((sum, item) => sum + (item?.maxPoints || 0), 0);
    const stageAverage = stageMax ? (stageTotal / stageMax) * 100 : 0;

    return {
      stageKey,
      label: stage.label,
      score: roundTo(stageAverage, 1),
      rawPoints: roundTo(stageTotal, 1),
      maxPoints: stageMax
    };
  });

  const pcmQuestions = detailedAnswers.filter((item) => ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'].includes(item.questionId));
  const pcmTotal = pcmQuestions.reduce((sum, item) => sum + item.points, 0);
  const pcmMax = pcmQuestions.reduce((sum, item) => sum + item.maxPoints, 0);
  const pcm = pcmMax ? (pcmTotal / pcmMax) * 100 : 0;
  const igc = maxPoints ? (totalPoints / maxPoints) * 100 : 0;

  const band = getBand(igc);
  const lowestStage = [...stageScores].sort((a, b) => a.score - b.score)[0];
  const strongestStage = [...stageScores].sort((a, b) => b.score - a.score)[0];

  const strengths = [];
  const opportunities = [];

  if (strongestStage.score >= 70) {
    strengths.push(`Melhor desempenho em ${strongestStage.label.toLowerCase()}.`);
  }

  if (lowestStage.score < 65) {
    opportunities.push(`Reforçar práticas em ${lowestStage.label.toLowerCase()}.`);
  }

  if (pcm < 60) {
    opportunities.push('Melhorar a circularidade dos materiais na origem e no fim de vida.');
  }

  if (igc >= 80) {
    strengths.push('A empresa apresenta uma base madura de circularidade e rastreabilidade.');
  } else if (igc >= 55) {
    strengths.push('A empresa já possui boas práticas, mas ainda há espaço claro para ganho de maturidade.');
  } else {
    opportunities.push('Priorizar melhorias estruturais para elevar a circularidade do produto.');
  }

  const recommendations = [];

  if (stageScores.find((stage) => stage.stageKey === 'input')?.score < 60) {
    recommendations.push('Aumentar a participação de matérias-primas recicladas, renováveis ou provenientes de reaproveitamento.');
  }
  if (stageScores.find((stage) => stage.stageKey === 'output')?.score < 60) {
    recommendations.push('Projetar o produto para desmontagem, reciclabilidade e redução de descarte em aterro.');
  }
  if (stageScores.find((stage) => stage.stageKey === 'lifecycle')?.score < 60) {
    recommendations.push('Fortalecer certificações, durabilidade e logística reversa.');
  }
  if (stageScores.find((stage) => stage.stageKey === 'monitoring')?.score < 60) {
    recommendations.push('Melhorar rastreabilidade, pós-venda e disponibilidade de documentação técnica.');
  }

  if (!recommendations.length) {
    recommendations.push('Manter o padrão atual e aprofundar a rastreabilidade dos dados para monitoramento contínuo.');
  }

  const summary = `${company?.nome || 'A empresa'} alcançou IGC de ${roundTo(igc, 1)}% (${band.label}). `;
  const detail = pcm >= igc
    ? 'O perfil de circularidade de materiais está acima ou igual ao índice geral, indicando boa base de materiais.'
    : 'O perfil de circularidade de materiais está abaixo do índice geral, sinalizando gargalos na base material.';

  return {
    company,
    igc: roundTo(igc, 1),
    pcm: roundTo(pcm, 1),
    totalPoints: roundTo(totalPoints, 1),
    maxPoints,
    averagePoints: roundTo(averagePoints, 1),
    band,
    summary,
    detail,
    strengths,
    opportunities,
    recommendations,
    stageScores,
    answers: detailedAnswers
  };
}

module.exports = {
  QUESTION_DEFINITIONS,
  QUESTION_BY_ID,
  QUESTION_BY_STEP,
  STAGE_CONFIG,
  calculateReport,
  getBand,
  roundTo
};
