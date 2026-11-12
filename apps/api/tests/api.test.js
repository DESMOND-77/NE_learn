import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { openDatabase } from '../src/infrastructure/database.js';
import { loadCatalog } from '../src/infrastructure/content.js';
import { createApp } from '../src/app.js';

const catalog=loadCatalog(fileURLToPath(new URL('../../../content/',import.meta.url)));
let db,server,base,cookie='',user;
async function request(path,{method='GET',body,auth=true,headers={}}={}){
  const res=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(auth&&cookie?{Cookie:cookie}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});
  const setCookie=res.headers.get('set-cookie');if(setCookie)cookie=setCookie.split(';')[0];
  return {status:res.status,data:await res.json(),headers:res.headers};
}
before(async()=>{db=openDatabase(':memory:');const app=createApp({db,catalog});await new Promise(r=>{server=app.listen(0,'127.0.0.1',r);});base=`http://127.0.0.1:${server.address().port}/api`;});
after(async()=>{await new Promise(r=>server.close(r));db.close();});

test('santé et catalogue sans réponses de quiz',async()=>{
  const health=await request('/health');assert.equal(health.status,200);assert.equal(health.data.courses,10);
  const cat=await request('/catalog');assert.equal(cat.data.courses.length,10);assert.equal(cat.data.quizzes[0].questions,undefined);
});
test('progression exige une session',async()=>{assert.equal((await request('/dashboard',{auth:false})).status,401);});
test('un cookie malformé est traité comme une session absente',async()=>{
  const res=await fetch(base+'/auth/me',{headers:{Cookie:'ne_session=%E0%A4%A'}});
  assert.equal(res.status,200);assert.equal((await res.json()).user,null);
});
test('inscription, session httpOnly et profil',async()=>{
  const weak=await request('/auth/register',{method:'POST',body:{name:'Test',email:'test@example.com',password:'short'}});assert.equal(weak.status,400);
  const r=await request('/auth/register',{method:'POST',body:{name:'Awa Étudiante',email:'awa@example.com',password:'MotDePasse-Solide-2026!',academicLevel:2}});
  assert.equal(r.status,201);user=r.data.user;assert.equal(user.academicLevel,2);assert.equal(user.password_hash,undefined);assert.match(r.headers.get('set-cookie'),/HttpOnly/i);assert.match(r.headers.get('set-cookie'),/SameSite=Lax/i);
  assert.equal((await request('/auth/me')).data.user.id,user.id);
  assert.equal((await request('/auth/me',{method:'PATCH',body:{academicLevel:3}})).data.user.academicLevel,3);
});
test('connexion refusée sans invention de compte',async()=>{assert.equal((await request('/auth/login',{method:'POST',body:{email:'awa@example.com',password:'incorrect'},auth:false})).status,401);});
test('CORS/CSRF : origine étrangère refusée',async()=>{assert.equal((await request('/progress/lessons/modele-osi/pourquoi-des-couches',{method:'PUT',body:{complete:true},headers:{Origin:'https://evil.example'}})).status,403);});
test('une origine étrangère ne peut pas usurper X-Forwarded-Host sans proxy de confiance',async()=>{
  const r=await request('/auth/logout',{method:'POST',headers:{Origin:'https://evil.example','X-Forwarded-Host':'evil.example'}});
  assert.equal(r.status,403);
});
test('leçon validée et dashboard agrégé',async()=>{
  const r=await request('/progress/lessons/modele-osi/pourquoi-des-couches',{method:'PUT',body:{complete:true}});assert.equal(r.status,200);
  const d=await request('/dashboard');assert.equal(d.data.lessonsDone,1);assert.ok(d.data.badges.some(b=>b.id==='first-lesson'));
  assert.equal((await request('/progress/lessons/modele-osi/inexistant',{method:'PUT',body:{}})).status,404);
});
test('quiz : pas de corrigé avant soumission, score serveur et historique',async()=>{
  const q=await request('/quizzes/quiz-osi');assert.equal(q.status,200);assert.ok(q.data.questions.every(x=>x.answer===undefined&&x.explanation===undefined));
  const full=catalog.quizzes.find(x=>x.id==='quiz-osi');const responses=Object.fromEntries(full.questions.map(x=>[x.id,x.type==='match'?Object.fromEntries(x.pairs.map((_,i)=>[i,i])):x.answer]));
  const r=await request('/quizzes/quiz-osi/submissions',{method:'POST',body:{responses}});assert.equal(r.data.percent,100);assert.equal(r.data.saved,true);assert.ok(r.data.details[0].explanation);
  assert.equal((await request('/dashboard')).data.averageQuizPercent,100);
});
test('invité : quiz utilisable mais non sauvegardé',async()=>{const r=await request('/quizzes/quiz-osi/submissions',{method:'POST',auth:false,body:{responses:{}}});assert.equal(r.data.score,0);assert.equal(r.data.saved,false);});
test('examen : tirage sans réponses et correction',async()=>{
  const r=await request('/exams',{method:'POST',body:{level:2,count:10}});assert.equal(r.data.questions.length,10);assert.ok(r.data.questions.every(q=>q.answer===undefined));
  const result=await request(`/exams/${r.data.id}/submissions`,{method:'POST',body:{responses:{}}});assert.equal(result.data.total,10);assert.equal(result.data.score,0);
});
test('calcul IPv4 et VLSM : validation et erreurs explicites',async()=>{
  const r=await request('/tools/subnet',{method:'POST',body:{ip:'192.168.1.130',mask:26}});assert.equal(r.data.network,'192.168.1.128');assert.equal(r.data.usableHosts,62);assert.equal(r.data.steps.length,5);
  assert.equal((await request('/tools/subnet',{method:'POST',body:{ip:'999.1.1.1',mask:24}})).status,400);
  const v=await request('/tools/vlsm',{method:'POST',body:{ip:'192.168.1.0',mask:24,requirements:[{name:'A',hosts:100},{name:'B',hosts:50}]}});assert.equal(v.data.allocations[0].prefix,25);assert.equal(v.data.allocations[1].network,'192.168.1.128');
});
test('lab : correction protégée, téléchargement réel, validation',async()=>{
  const id='lab-premier-lan',lab=await request(`/labs/${id}`);assert.equal(lab.data.correction,undefined);assert.equal(lab.data.validation.question.answer,undefined);
  const early=await request(`/labs/${id}/validation`,{method:'POST',body:{checklist:[],answer:0}});assert.equal(early.status,400);
  const file=await fetch(`${base}/labs/${id}/files/plan-adressage.csv`);assert.match(file.headers.get('content-disposition'),/attachment/);assert.match(await file.text(),/192.168.1.10/);
  const checklist=lab.data.validation.checklist.map((_,i)=>i);
  const wrong=await request(`/labs/${id}/validation`,{method:'POST',body:{checklist,answer:1}});assert.equal(wrong.data.completed,false);
  const good=await request(`/labs/${id}/validation`,{method:'POST',body:{checklist,answer:0}});assert.equal(good.data.completed,true);assert.ok(good.data.correction);
  assert.equal((await request('/dashboard')).data.labsDone,1);
});
test('isolation des progrès entre utilisateurs',async()=>{
  const oldCookie=cookie;
  await request('/auth/register',{method:'POST',body:{name:'Deuxième',email:'deux@example.com',password:'AutreMotDePasse-2026!',academicLevel:1}});
  const d=await request('/dashboard');assert.equal(d.data.lessonsDone,0);assert.equal(d.data.labsDone,0);
  cookie=oldCookie;
});
test('assistant documentary : calcul exact et refus honnête',async()=>{
  const r=await request('/assistant',{method:'POST',body:{message:'Calcule 192.168.1.130/26'}});assert.equal(r.data.mode,'calcul-déterministe');assert.match(r.data.answer,/192\.168\.1\.128/);
  const unknown=await request('/assistant',{method:'POST',body:{message:'zzzzzzqqqq'}});assert.equal(unknown.data.status,'unknown');
  const osi=await request('/assistant',{method:'POST',body:{message:'Explique les couches OSI'}});assert.equal(osi.data.courseRef,'modele-osi');
});
test('déconnexion invalide la session',async()=>{
  const old=cookie;await request('/auth/logout',{method:'POST'});assert.equal((await request('/auth/me')).data.user,null);cookie=old;assert.equal((await request('/auth/me')).data.user,null);
});
