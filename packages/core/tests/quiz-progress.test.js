import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gradeQuiz, gradeAnswer, sanitizeQuestion, validateQuestion } from '../src/quiz.js';
import { buildDashboard, masteryFromPercent } from '../src/progress.js';

const questions = [
  { id: 'q1', type: 'single', prompt: 'Combien de couches dans le modèle OSI ?', options: ['5', '6', '7', '8'], answer: 2, explanation: 'Le modèle OSI compte 7 couches.', topic: 'osi' },
  { id: 'q2', type: 'multiple', prompt: 'Protocoles de couche 3 ?', options: ['IP', 'TCP', 'ICMP', 'HTTP'], answer: [0, 2], explanation: 'IP et ICMP sont en couche 3.', topic: 'osi' },
  { id: 'q3', type: 'boolean', prompt: 'UDP est fiable.', answer: false, explanation: 'UDP ne garantit pas la livraison.', topic: 'transport' },
  { id: 'q4', type: 'numeric', prompt: 'Hôtes dans un /24 ?', answer: 254, explanation: '2^8 − 2 = 254.', topic: 'subnetting', unit: 'hôtes' },
  { id: 'q5', type: 'match', prompt: 'Associer couche et PDU.', pairs: [{ left: 'Liaison', right: 'Trame' }, { left: 'Réseau', right: 'Paquet' }, { left: 'Transport', right: 'Segment' }], explanation: 'Trame L2, paquet L3, segment L4.', topic: 'osi' },
  { id: 'q6', type: 'order', prompt: 'Ordre d’encapsulation OSI (haut en bas).', items: ['Application', 'Transport', 'Réseau', 'Liaison', 'Physique'], answer: [0, 1, 2, 3, 4], explanation: 'On descend les couches à l’émission.', topic: 'osi' },
];

test('sanitizeQuestion retire réponses et explications', () => {
  const s = sanitizeQuestion(questions[0]);
  assert.equal(s.answer, undefined);
  assert.equal(s.explanation, undefined);
  assert.deepEqual(s.options, ['5', '6', '7', '8']);
});

test('validateQuestion', () => {
  for (const q of questions) assert.deepEqual(validateQuestion(q), [], q.id);
  const errs = validateQuestion({ id: 'x', type: 'single', prompt: '?', options: ['a'], answer: 5, explanation: 'e' });
  assert.ok(errs.length >= 2);
});

test('gradeAnswer par type', () => {
  assert.ok(gradeAnswer(questions[0], 2));
  assert.ok(!gradeAnswer(questions[0], 1));
  assert.ok(gradeAnswer(questions[1], [2, 0]));
  assert.ok(!gradeAnswer(questions[1], [0]));
  assert.ok(gradeAnswer(questions[2], false));
  assert.ok(gradeAnswer(questions[3], '254'));
  assert.ok(gradeAnswer(questions[3], 254.0000000001));
  assert.ok(gradeAnswer(questions[4], { 0: 0, 1: 1, 2: 2 }));
  assert.ok(!gradeAnswer(questions[4], { 0: 1, 1: 0, 2: 2 }));
  assert.ok(gradeAnswer(questions[5], [0, 1, 2, 3, 4]));
  assert.ok(!gradeAnswer(questions[5], [4, 3, 2, 1, 0]));
});

test('gradeQuiz complet', () => {
  const result = gradeQuiz(questions, { q1: 2, q2: [0, 2], q3: false, q4: 254, q5: { 0: 0, 1: 1, 2: 2 }, q6: [0, 1, 2, 3, 4] });
  assert.equal(result.score, 6);
  assert.equal(result.percent, 100);
  assert.equal(result.byTopic.osi.total, 4);
  assert.equal(result.byTopic.osi.correct, 4);
  assert.ok(result.details[0].explanation);
});

test('gradeQuiz réponses partielles', () => {
  const result = gradeQuiz(questions, { q1: 1, q3: true });
  assert.equal(result.score, 0);
  assert.equal(result.details[1].answered, false);
  assert.equal(result.details[0].correct, false);
});

test('une réponse numérique vide ne vaut pas zéro', () => {
  const q = { id: 'zero', type: 'numeric', prompt: 'Valeur ?', answer: 0, explanation: 'Zéro.' };
  assert.equal(gradeAnswer(q, ''), false);
  assert.equal(gradeAnswer(q, '   '), false);
  const result = gradeQuiz([q], { zero: '' });
  assert.equal(result.details[0].answered, false);
  assert.equal(result.details[0].correct, false);
});

test('masteryFromPercent', () => {
  assert.equal(masteryFromPercent(0).id, 'not-started');
  assert.equal(masteryFromPercent(50).id, 'learning');
  assert.equal(masteryFromPercent(95).id, 'mastered');
});

test('buildDashboard', () => {
  const catalog = {
    courses: [
      { id: 'c1', title: 'Cours 1', level: 1, discipline: 'réseaux', quizId: 'qz1', lessons: [{ id: 'l1' }, { id: 'l2' }] },
      { id: 'c2', title: 'Cours 2', level: 2, discipline: 'réseaux', quizId: 'qz2', lessons: [{ id: 'l1' }] },
    ],
    labs: [{ id: 'lab1' }, { id: 'lab2' }],
  };
  const events = {
    completedLessons: [{ courseId: 'c1', lessonId: 'l1' }],
    quizAttempts: [{ quizId: 'qz1', percent: 100, score: 4, total: 4, at: '2026-01-01', byTopic: { osi: { correct: 4, total: 4 } } }],
    completedLabs: ['lab1'],
  };
  const d = buildDashboard(catalog, events);
  assert.equal(d.globalPercent, 33);
  assert.equal(d.lessonsDone, 1);
  assert.equal(d.coursesCompleted, 0);
  assert.equal(d.labsDone, 1);
  assert.equal(d.averageQuizPercent, 100);
  assert.ok(d.badges.some((b) => b.id === 'perfect-quiz'));
  assert.ok(d.badges.some((b) => b.id === 'first-lab'));
  assert.ok(d.recommendations.length > 0);
});
