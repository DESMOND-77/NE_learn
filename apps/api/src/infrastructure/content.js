import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { validateQuestion } from '@ne-learn/core/quiz';

export function validateCatalog(c) {
  const errors = [];
  const courses = new Map(c.courses.map(x => [x.id,x]));
  const labs = new Map(c.labs.map(x => [x.id,x]));
  const quizzes = new Map(c.quizzes.map(x => [x.id,x]));
  const questionIds = new Set();
  for (const course of c.courses) {
    if (!course.title || !course.lessons?.length) errors.push(`Cours incomplet : ${course.id}`);
    if (!quizzes.has(course.quizId)) errors.push(`Quiz manquant : ${course.quizId}`);
    if (![1,2,3,4].includes(course.level)) errors.push(`Niveau invalide : ${course.id}`);
    const ids = new Set();
    for (const lesson of course.lessons ?? []) {
      if (ids.has(lesson.id)) errors.push(`Leçon dupliquée : ${course.id}/${lesson.id}`);
      ids.add(lesson.id);
      if (!lesson.blocks?.length) errors.push(`Leçon vide : ${course.id}/${lesson.id}`);
    }
  }
  for (const quiz of c.quizzes) {
    if (!courses.has(quiz.courseId)) errors.push(`Cours inconnu du quiz ${quiz.id}`);
    for (const q of quiz.questions) {
      if (questionIds.has(q.id)) errors.push(`Question dupliquée : ${q.id}`);
      questionIds.add(q.id);
      for (const e of validateQuestion(q)) errors.push(`${q.id} : ${e}`);
      if (q.courseRef && !courses.has(q.courseRef)) errors.push(`Référence inconnue : ${q.courseRef}`);
    }
  }
  for (const lab of c.labs) {
    if (!lab.steps?.length || !lab.validation?.question || !lab.correction) errors.push(`Lab incomplet : ${lab.id}`);
    const nodeIds = new Set(lab.topology.nodes.map(n => n.id));
    for (const link of lab.topology.links) if (!nodeIds.has(link.from) || !nodeIds.has(link.to)) errors.push(`Lien inconnu : ${lab.id}`);
    const q = lab.validation.question;
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.options?.length) errors.push(`Validation lab invalide : ${lab.id}`);
  }
  for (const level of c.curriculum.levels) for (const mod of level.modules) {
    if (mod.courseId && !courses.has(mod.courseId)) errors.push(`Module sans cours : ${mod.title}`);
    if (mod.labId && !labs.has(mod.labId)) errors.push(`Module sans lab : ${mod.title}`);
  }
  for (const path of c.curriculum.careerPaths) {
    for (const id of path.courseIds) if (!courses.has(id)) errors.push(`Parcours ${path.id} : cours ${id} inconnu`);
    for (const id of path.labIds) if (!labs.has(id)) errors.push(`Parcours ${path.id} : lab ${id} inconnu`);
  }
  for (const entry of c.assistant.entries) if (entry.courseId && !courses.has(entry.courseId)) errors.push(`Assistant : cours ${entry.courseId} inconnu`);
  for (const project of c.projects) {
    for (const id of project.courseIds) if (!courses.has(id)) errors.push(`Projet : cours ${id} inconnu`);
    for (const id of project.labIds) if (!labs.has(id)) errors.push(`Projet : lab ${id} inconnu`);
    if (project.status === 'available' && project.evaluationGrid.reduce((s,g)=>s+g.weight,0)!==100) errors.push(`Barème projet != 100 : ${project.id}`);
  }
  return errors;
}

export function loadCatalog(directory) {
  const read = (name) => JSON.parse(readFileSync(join(directory,name),'utf8'));
  const list = (folder) => readdirSync(join(directory,folder)).filter(f=>f.endsWith('.json')).sort().map(f=>read(`${folder}/${f}`));
  const catalog = { curriculum:read('curriculum.json'), courses:list('courses'), labs:list('labs'), quizzes:list('quizzes'), glossary:read('glossary.json'), resources:read('resources.json'), assistant:read('assistant-kb.json'), projects:read('projects.json') };
  const errors = validateCatalog(catalog);
  if (errors.length) throw new Error(`Contenu invalide :\n${errors.join('\n')}`);
  return catalog;
}

export function courseSummary(c) {
  const { lessons, revisionSheet, references, ...rest } = c;
  return { ...rest, lessonCount: lessons.length, lessons: lessons.map(l=>({id:l.id,title:l.title,duration:l.duration})) };
}
