/**
 * NE_learn — règles de progression et de maîtrise.
 * Pur et déterministe : à partir des événements de l'apprenant, calcule un état agrégé.
 */
export const MASTERY_LEVELS = [
  { id: 'not-started', label: 'Non commencé', min: 0 },
  { id: 'discovery', label: 'Découverte', min: 1 },
  { id: 'learning', label: 'En apprentissage', min: 40 },
  { id: 'practicing', label: 'En pratique', min: 70 },
  { id: 'mastered', label: 'Maîtrisé', min: 90 },
];

export function masteryFromPercent(percent) {
  let level = MASTERY_LEVELS[0];
  for (const l of MASTERY_LEVELS) if (percent >= l.min) level = l;
  return level;
}

/**
 * Construit le tableau de bord.
 * @param {Object} catalog Catalogue (cours, labs, quiz).
 * @param {Object} events { completedLessons: [{courseId, lessonId}], quizAttempts: [...], completedLabs: [labId] }
 */
export function buildDashboard(catalog, events) {
  const completed = new Set((events.completedLessons ?? []).map((l) => `${l.courseId}/${l.lessonId}`));
  const labsDone = new Set(events.completedLabs ?? []);
  const attempts = events.quizAttempts ?? [];

  const courses = catalog.courses.map((course) => {
    const lessonIds = course.lessons.map((l) => l.id);
    const done = lessonIds.filter((id) => completed.has(`${course.id}/${id}`)).length;
    const percent = lessonIds.length ? Math.round((done / lessonIds.length) * 100) : 0;
    const courseAttempts = attempts.filter((a) => a.quizId === course.quizId);
    const best = courseAttempts.length ? Math.max(...courseAttempts.map((a) => a.percent)) : null;
    return {
      id: course.id, title: course.title, level: course.level, discipline: course.discipline,
      lessonsTotal: lessonIds.length, lessonsDone: done, percent,
      bestQuizPercent: best, quizAttempts: courseAttempts.length,
      mastery: masteryFromPercent(Math.round(percent * 0.5 + (best ?? 0) * 0.5)),
    };
  });

  const totalLessons = courses.reduce((s, c) => s + c.lessonsTotal, 0);
  const doneLessons = courses.reduce((s, c) => s + c.lessonsDone, 0);
  const globalPercent = totalLessons ? Math.round((doneLessons / totalLessons) * 100) : 0;

  const topicStats = {};
  for (const a of attempts) {
    for (const [topic, stat] of Object.entries(a.byTopic ?? {})) {
      topicStats[topic] ??= { correct: 0, total: 0 };
      topicStats[topic].correct += stat.correct;
      topicStats[topic].total += stat.total;
    }
  }
  const weakTopics = Object.entries(topicStats)
    .map(([topic, s]) => ({ topic, percent: Math.round((s.correct / s.total) * 100), ...s }))
    .filter((t) => t.percent < 70)
    .sort((a, b) => a.percent - b.percent);

  const badges = [];
  if (doneLessons >= 1) badges.push({ id: 'first-lesson', label: 'Premier pas', description: 'Première leçon terminée', icon: 'footprints' });
  if (doneLessons >= 10) badges.push({ id: 'ten-lessons', label: 'Curieux', description: '10 leçons terminées', icon: 'book-open' });
  if (attempts.some((a) => a.percent === 100)) badges.push({ id: 'perfect-quiz', label: 'Sans faute', description: 'Un quiz réussi à 100 %', icon: 'target' });
  if (labsDone.size >= 1) badges.push({ id: 'first-lab', label: 'Mains dans le cambouis', description: 'Premier laboratoire validé', icon: 'flask-conical' });
  if (labsDone.size >= 5) badges.push({ id: 'lab-master', label: 'Praticien', description: '5 laboratoires validés', icon: 'wrench' });
  const subnetAttempts = attempts.filter((a) => a.quizId === 'quiz-subnetting');
  if (subnetAttempts.some((a) => a.percent >= 80)) badges.push({ id: 'subnet-master', label: 'Maître du subnetting', description: 'Quiz subnetting ≥ 80 %', icon: 'calculator' });
  if (courses.filter((c) => c.percent === 100).length >= 3) badges.push({ id: 'three-courses', label: 'Trilogie', description: '3 cours terminés', icon: 'award' });

  const recommendations = [];
  for (const w of weakTopics.slice(0, 3)) recommendations.push({ type: 'review', topic: w.topic, message: `Retravaille « ${w.topic} » (${w.percent} % de réussite). Refais le quiz associé après relecture.` });
  const nextCourse = courses.find((c) => c.percent > 0 && c.percent < 100) ?? courses.find((c) => c.percent === 0);
  if (nextCourse) recommendations.push({ type: 'continue', courseId: nextCourse.id, message: `Poursuis « ${nextCourse.title} » (${nextCourse.percent} % fait).` });
  const nextLab = catalog.labs.find((l) => !labsDone.has(l.id));
  if (nextLab) recommendations.push({ type: 'lab', labId: nextLab.id, message: `Passe à la pratique : « ${nextLab.title} ».` });

  return {
    globalPercent, lessonsDone: doneLessons, lessonsTotal: totalLessons,
    coursesCompleted: courses.filter((c) => c.percent === 100).length,
    coursesStarted: courses.filter((c) => c.percent > 0).length,
    quizAttempts: attempts.length,
    averageQuizPercent: attempts.length ? Math.round(attempts.reduce((s, a) => s + a.percent, 0) / attempts.length) : null,
    labsDone: labsDone.size, labsTotal: catalog.labs.length,
    courses, weakTopics, badges, recommendations,
    recentActivity: attempts.slice(-8).reverse().map((a) => ({ quizId: a.quizId, percent: a.percent, score: a.score, total: a.total, at: a.at })),
  };
}
