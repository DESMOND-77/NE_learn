/**
 * NE_learn — moteur de quiz. Le calcul du score est une responsabilité du serveur :
 * les clients ne reçoivent jamais les corrigés avant d'avoir soumis leurs réponses.
 */
export class QuizError extends Error {
  constructor(message) { super(message); this.name = 'QuizError'; }
}

export const QUESTION_TYPES = ['single', 'multiple', 'boolean', 'numeric', 'match', 'order'];

export function validateQuestion(q) {
  const errors = [];
  if (!q || typeof q !== 'object') return ['Question invalide.'];
  if (!q.id) errors.push('id manquant');
  if (!QUESTION_TYPES.includes(q.type)) errors.push(`type inconnu : ${q.type}`);
  if (!q.prompt) errors.push('énoncé manquant');
  if (!q.explanation) errors.push('explication pédagogique manquante');
  if (q.type === 'single') {
    if (!Array.isArray(q.options) || q.options.length < 2) errors.push('options manquantes');
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= (q.options?.length ?? 0)) errors.push('answer hors plage');
  }
  if (q.type === 'multiple') {
    if (!Array.isArray(q.options) || q.options.length < 2) errors.push('options manquantes');
    if (!Array.isArray(q.answer) || q.answer.length === 0) errors.push('answer doit être un tableau non vide');
    else if (q.answer.some((i) => !Number.isInteger(i) || i < 0 || i >= q.options.length)) errors.push('index de réponse hors plage');
  }
  if (q.type === 'boolean' && typeof q.answer !== 'boolean') errors.push('answer doit être booléen');
  if (q.type === 'numeric') {
    if (!Number.isFinite(q.answer)) errors.push('answer doit être numérique');
    if (q.tolerance != null && (!Number.isFinite(q.tolerance) || q.tolerance < 0)) errors.push('tolérance invalide');
  }
  if (q.type === 'match') {
    if (!Array.isArray(q.pairs) || q.pairs.length < 2) errors.push('pairs manquantes');
    else if (q.pairs.some((p) => !p.left || !p.right)) errors.push('paire incomplète');
  }
  if (q.type === 'order') {
    if (!Array.isArray(q.items) || q.items.length < 2) errors.push('items manquants');
    if (!Array.isArray(q.answer) || q.answer.length !== (q.items?.length ?? -1)) errors.push('answer doit être une permutation des items');
    else {
      const sorted = [...q.answer].sort((a, b) => a - b);
      if (sorted.some((v, i) => v !== i)) errors.push('answer doit être une permutation de 0..n-1');
    }
  }
  return errors;
}

/** Retire les réponses : version « examen » envoyée au client. */
export function sanitizeQuestion(q) {
  const { answer, ...rest } = q;
  const out = { ...rest };
  if (q.type === 'match') out.pairs = q.pairs.map((p, i) => ({ id: i, left: p.left, right: p.right }));
  if (q.type === 'order') out.items = q.items.map((text, i) => ({ id: i, text }));
  delete out.explanation;
  return out;
}

function sameSet(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  const sa = [...new Set(a)], sb = [...new Set(b)];
  return sa.length === sb.length && sa.every((x) => sb.includes(x));
}

export function gradeAnswer(question, response) {
  switch (question.type) {
    case 'single':
      return Number.isInteger(response) && response === question.answer;
    case 'multiple':
      return Array.isArray(response) && response.every(Number.isInteger) && sameSet(response, question.answer);
    case 'boolean':
      return typeof response === 'boolean' && response === question.answer;
    case 'numeric': {
      if (typeof response === 'string' && response.trim() === '') return false;
      const n = typeof response === 'string' ? Number(response.replace(',', '.').replace(/\s/g, '')) : Number(response);
      if (!Number.isFinite(n)) return false;
      return Math.abs(n - question.answer) <= (question.tolerance ?? 1e-9);
    }
    case 'match': {
      // response : { leftIndex: rightIndex } — les items de droite sont mélangés côté client.
      if (!response || typeof response !== 'object') return false;
      return question.pairs.every((_, i) => Number(response[i]) === i);
    }
    case 'order':
      return Array.isArray(response) && response.length === question.answer.length && question.answer.every((v, i) => Number(response[i]) === v);
    default:
      throw new QuizError(`Type de question non pris en charge : ${question.type}`);
  }
}

/**
 * Corrige une soumission.
 * @param {Array} questions Questions complètes (avec réponses).
 * @param {Object} responses Map { questionId: réponse }.
 */
export function gradeQuiz(questions, responses) {
  if (!responses || typeof responses !== 'object') throw new QuizError('Réponses manquantes.');
  const details = questions.map((q) => {
    const given = responses[q.id];
    const answered = given !== undefined && given !== null && !(typeof given === 'string' && given.trim() === '') && !(Array.isArray(given) && given.length === 0);
    const correct = answered && gradeAnswer(q, given);
    return {
      questionId: q.id, correct, answered,
      given: given ?? null,
      expected: q.answer ?? (q.type === 'match' ? q.pairs.map((_, i) => i) : null),
      expectedText: formatExpected(q),
      givenText: formatGiven(q, given),
      explanation: q.explanation,
      reasoning: q.reasoning ?? null,
      pitfalls: q.pitfalls ?? null,
      courseRef: q.courseRef ?? null,
      topic: q.topic ?? null,
    };
  });
  const score = details.filter((d) => d.correct).length;
  const byTopic = {};
  for (const d of details) {
    const t = d.topic || 'général';
    byTopic[t] ??= { correct: 0, total: 0 };
    byTopic[t].total++;
    if (d.correct) byTopic[t].correct++;
  }
  return { score, total: questions.length, percent: Math.round((score / questions.length) * 100), details, byTopic };
}

function formatExpected(q) {
  switch (q.type) {
    case 'single': return q.options[q.answer];
    case 'multiple': return q.answer.map((i) => q.options[i]).join(' ; ');
    case 'boolean': return q.answer ? 'Vrai' : 'Faux';
    case 'numeric': return `${q.answer}${q.unit ? ' ' + q.unit : ''}${q.tolerance ? ` (± ${q.tolerance})` : ''}`;
    case 'match': return q.pairs.map((p) => `${p.left} → ${p.right}`).join(' ; ');
    case 'order': return q.answer.map((i) => q.items[i]).join(' → ');
    default: return '';
  }
}

function formatGiven(q, given) {
  if (given === undefined || given === null) return 'Pas de réponse';
  switch (q.type) {
    case 'single': return q.options[given] ?? String(given);
    case 'multiple': return Array.isArray(given) ? given.map((i) => q.options[i] ?? String(i)).join(' ; ') : String(given);
    case 'boolean': return given ? 'Vrai' : 'Faux';
    case 'numeric': return String(given);
    case 'match': return typeof given === 'object' ? q.pairs.map((p, i) => `${p.left} → ${q.pairs[given[i]]?.right ?? '—'}`).join(' ; ') : String(given);
    case 'order': return Array.isArray(given) ? given.map((i) => q.items[i] ?? String(i)).join(' → ') : String(given);
    default: return String(given);
  }
}
