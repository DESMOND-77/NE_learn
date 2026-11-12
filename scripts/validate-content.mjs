import { fileURLToPath } from 'node:url';
import { loadCatalog, validateCatalog } from '../apps/api/src/infrastructure/content.js';
const root=fileURLToPath(new URL('../',import.meta.url));
try {
  const c=loadCatalog(`${root}content`);
  const blocks=c.courses.flatMap(x=>x.lessons.flatMap(l=>l.blocks));
  const allowed=new Set(['paragraph','heading','list','table','code','note','formula','interactive','quiz-link','lab-link']);
  const errors=[];
  const labs=new Set(c.labs.map(l=>l.id)),quizzes=new Set(c.quizzes.map(q=>q.id));
  for(const b of blocks){
    if(!allowed.has(b.type))errors.push(`Bloc inconnu : ${b.type}`);
    if(b.type==='lab-link'&&!labs.has(b.labId))errors.push(`Lien TP manquant : ${b.labId}`);
    if(b.type==='quiz-link'&&!quizzes.has(b.quizId))errors.push(`Lien quiz manquant : ${b.quizId}`);
    if(b.type==='table' && b.rows.some(r=>r.length!==b.headers.length))errors.push(`Tableau irrégulier : ${b.headers}`);
  }
  for(const c1 of c.courses)for(const l of c1.lessons)for(const b of l.blocks)if(b.type==='paragraph' && /[\u4e00-\u9fff]/.test(b.text))errors.push(`Caractères non français à relire : ${c1.id}/${l.id}`);
  if(errors.length)throw new Error(errors.join('\n'));
  console.log(`Contenu valide : ${c.courses.length} cours, ${c.courses.reduce((s,x)=>s+x.lessons.length,0)} leçons, ${c.quizzes.reduce((s,q)=>s+q.questions.length,0)} questions, ${c.labs.length} TP, ${blocks.length} blocs, ${c.glossary.length} termes.`);
} catch(e){console.error(e.message);process.exitCode=1;}
