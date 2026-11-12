import { randomUUID, randomInt } from 'node:crypto';
import { gradeQuiz, sanitizeQuestion, buildDashboard } from '@ne-learn/core';
import { audit } from '../infrastructure/database.js';
import { HttpError } from '../middleware/security.js';

export function createLearningService(db,catalog) {
  const courseMap=new Map(catalog.courses.map(c=>[c.id,c]));
  const quizMap=new Map(catalog.quizzes.map(q=>[q.id,q]));
  const labMap=new Map(catalog.labs.map(l=>[l.id,l]));
  const questionMap=new Map(catalog.quizzes.flatMap(q=>q.questions.map(x=>[x.id,{question:x,quiz:q}])));
  function attempts(userId) {
    return db.prepare('SELECT * FROM quiz_attempts WHERE user_id=? ORDER BY created_at ASC').all(userId).map(r=>({id:r.id,quizId:r.quiz_id,score:r.score,total:r.total,percent:r.percent,byTopic:JSON.parse(r.by_topic),at:r.created_at}));
  }
  function saveAttempt(userId,quizId,result) {
    if(!userId)return null;
    const id=randomUUID(),at=new Date().toISOString();
    db.prepare('INSERT INTO quiz_attempts(id,user_id,quiz_id,score,total,percent,by_topic,details,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(id,userId,quizId,result.score,result.total,result.percent,JSON.stringify(result.byTopic),JSON.stringify(result.details),at);
    audit(db,'quiz.submitted',{userId,detail:`${quizId}:${result.percent}%`});
    return id;
  }
  return {
    dashboard(userId) {
      const completedLessons=db.prepare('SELECT course_id,lesson_id,completed_at FROM lesson_progress WHERE user_id=?').all(userId).map(r=>({courseId:r.course_id,lessonId:r.lesson_id,at:r.completed_at}));
      const completedLabs=db.prepare('SELECT lab_id FROM lab_progress WHERE user_id=? AND completed_at IS NOT NULL').all(userId).map(r=>r.lab_id);
      const labs=db.prepare('SELECT lab_id,checklist,completed_at FROM lab_progress WHERE user_id=?').all(userId).map(r=>({id:r.lab_id,checklist:JSON.parse(r.checklist),completedAt:r.completed_at}));
      return {...buildDashboard(catalog,{completedLessons,quizAttempts:attempts(userId),completedLabs}),completedLessons,labs,history:attempts(userId).slice(-30).reverse()};
    },
    completeLesson(userId,courseId,lessonId,complete=true) {
      const course=courseMap.get(courseId);
      if(!course?.lessons.some(l=>l.id===lessonId))throw new HttpError(404,'Leçon introuvable.');
      if(typeof complete!=='boolean')throw new HttpError(400,'État de progression invalide.');
      if(complete)db.prepare('INSERT OR REPLACE INTO lesson_progress(user_id,course_id,lesson_id,completed_at) VALUES(?,?,?,?)').run(userId,courseId,lessonId,new Date().toISOString());
      else db.prepare('DELETE FROM lesson_progress WHERE user_id=? AND course_id=? AND lesson_id=?').run(userId,courseId,lessonId);
      audit(db,'lesson.progress',{userId,detail:`${courseId}/${lessonId}:${complete}`});
      return {courseId,lessonId,complete};
    },
    publicQuiz(id) {
      const quiz=quizMap.get(id);if(!quiz)throw new HttpError(404,'Quiz introuvable.');
      return {...quiz,questions:quiz.questions.map(sanitizeQuestion)};
    },
    submitQuiz(id,responses,userId) {
      const quiz=quizMap.get(id);if(!quiz)throw new HttpError(404,'Quiz introuvable.');
      const result=gradeQuiz(quiz.questions,responses);
      const attemptId=saveAttempt(userId,id,result);
      return {...result,attemptId,saved:!!userId,passingPercent:quiz.passingPercent??70,quizId:id,title:quiz.title};
    },
    createExam(userId,level,count=10) {
      if(![0,1,2,3,4].includes(level))throw new HttpError(400,'Niveau invalide.');
      if(!Number.isInteger(count)||count<5||count>30)throw new HttpError(400,'Choisis entre 5 et 30 questions.');
      const pool=catalog.quizzes.filter(q=>!level||q.level===level).flatMap(q=>q.questions);
      if(pool.length<count)throw new HttpError(400,'Pas assez de questions pour ce niveau.');
      const candidates=[...pool];
      for(let i=candidates.length-1;i>0;i--){const j=randomInt(i+1);[candidates[i],candidates[j]]=[candidates[j],candidates[i]];}
      const selected=candidates.slice(0,count),id=randomUUID(),now=Date.now();
      db.prepare('DELETE FROM exams WHERE expires_at<?').run(now);
      db.prepare('INSERT INTO exams(id,user_id,question_ids,created_at,expires_at) VALUES(?,?,?,?,?)').run(id,userId,JSON.stringify(selected.map(q=>q.id)),now,now+2*60*60*1000);
      return {id,level,title:`Examen blanc — ${level?`niveau ${level}`:'tous niveaux'}`,duration:`${count*2} min conseillées`,expiresAt:now+2*60*60*1000,questions:selected.map(sanitizeQuestion)};
    },
    getExam(id,userId) {
      const row=db.prepare('SELECT * FROM exams WHERE id=? AND expires_at>?').get(id,Date.now());
      if(!row || (row.user_id && row.user_id!==userId))throw new HttpError(404,'Examen introuvable ou expiré.');
      return {id,title:'Examen blanc',questions:JSON.parse(row.question_ids).map(qid=>sanitizeQuestion(questionMap.get(qid).question))};
    },
    submitExam(id,responses,userId) {
      const row=db.prepare('SELECT * FROM exams WHERE id=? AND expires_at>?').get(id,Date.now());
      if(!row || (row.user_id && row.user_id!==userId))throw new HttpError(404,'Examen introuvable ou expiré.');
      const questions=JSON.parse(row.question_ids).map(qid=>questionMap.get(qid).question);
      const result=gradeQuiz(questions,responses),attemptId=saveAttempt(userId,`exam:${id}`,result);
      return {...result,attemptId,saved:!!userId,passingPercent:70,quizId:`exam:${id}`,title:'Examen blanc'};
    },
    publicLab(id) {
      const lab=labMap.get(id);if(!lab)throw new HttpError(404,'Laboratoire introuvable.');
      const {correction,validation,files,...rest}=lab;
      return {...rest,validation:{checklist:validation.checklist,question:{prompt:validation.question.prompt,options:validation.question.options}},files:files.map(({content,...meta})=>meta)};
    },
    saveLabChecklist(userId,id,checklist) {
      const lab=labMap.get(id);if(!lab)throw new HttpError(404,'Laboratoire introuvable.');
      if(!Array.isArray(checklist)||checklist.length>lab.validation.checklist.length||checklist.some(i=>!Number.isInteger(i)||i<0||i>=lab.validation.checklist.length))throw new HttpError(400,'Checklist invalide.');
      const unique=[...new Set(checklist)];
      db.prepare('INSERT INTO lab_progress(user_id,lab_id,checklist) VALUES(?,?,?) ON CONFLICT(user_id,lab_id) DO UPDATE SET checklist=excluded.checklist')
        .run(userId,id,JSON.stringify(unique));
      return {checklist:unique};
    },
    validateLab(userId,id,checklist,answer,reveal=false) {
      const lab=labMap.get(id);if(!lab)throw new HttpError(404,'Laboratoire introuvable.');
      if(reveal){audit(db,'lab.correction_revealed',{userId,detail:id});return {completed:false,correction:lab.correction,expectedResults:lab.expectedResults,revealed:true};}
      if(!Array.isArray(checklist)||new Set(checklist).size!==lab.validation.checklist.length||checklist.some(i=>!Number.isInteger(i)||i<0||i>=lab.validation.checklist.length))throw new HttpError(400,'Coche toutes les étapes vérifiées avant de valider.');
      const correct=answer===lab.validation.question.answer;
      if(!correct)return {completed:false,correct:false,message:'Réponse incorrecte. Relis le résultat attendu et réessaie. Ta checklist est conservée.'};
      const at=new Date().toISOString();
      db.prepare('INSERT INTO lab_progress(user_id,lab_id,checklist,completed_at) VALUES(?,?,?,?) ON CONFLICT(user_id,lab_id) DO UPDATE SET checklist=excluded.checklist,completed_at=excluded.completed_at')
        .run(userId,id,JSON.stringify(checklist),at);
      audit(db,'lab.validated',{userId,detail:id});
      return {completed:true,correct:true,completedAt:at,correction:lab.correction,expectedResults:lab.expectedResults};
    },
    downloadLabFile(id,name) {
      const lab=labMap.get(id);if(!lab)throw new HttpError(404,'Laboratoire introuvable.');
      const file=lab.files.find(f=>f.name===name);if(!file)throw new HttpError(404,'Fichier introuvable.');
      return file;
    },
  };
}
