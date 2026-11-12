import express from 'express';
import helmet from 'helmet';
import { serialize } from 'cookie';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { analyzeSubnet, subnetSteps, allocateVLSM, convertBase, shannonCapacity, transmissionTime } from '@ne-learn/core';
import { createAuthService, SESSION_COOKIE, sessionMaxAge } from './infrastructure/auth.js';
import { audit } from './infrastructure/database.js';
import { courseSummary } from './infrastructure/content.js';
import { createLearningService } from './domain/learning.js';
import { answerQuestion } from './domain/assistant.js';
import { HttpError, securityContext, requireAuth, sameOrigin, rateLimit, errorHandler } from './middleware/security.js';

const asyncRoute = fn => (req,res,next) => Promise.resolve(fn(req,res,next)).catch(next);
const cookieOptions = (req) => ({httpOnly:true,sameSite:'lax',path:'/',secure:req.secure || process.env.COOKIE_SECURE==='true'});

export function createApp({db,catalog,webRoot,trustProxy=false}) {
  const app=express();
  app.disable('x-powered-by');
  if(trustProxy)app.set('trust proxy',1);
  app.use(helmet({contentSecurityPolicy:webRoot?{directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'","'unsafe-inline'"],imgSrc:["'self'",'data:','blob:'],fontSrc:["'self'"],connectSrc:["'self'"],objectSrc:["'none'"],frameAncestors:(process.env.FRAME_ANCESTORS||"'self'").split(',').map(s=>s.trim()),upgradeInsecureRequests:null}}:false,crossOriginEmbedderPolicy:false,frameguard:false}));
  app.use(express.json({limit:'64kb'}));
  const auth=createAuthService(db),learning=createLearningService(db,catalog);
  app.use('/api',securityContext(auth));
  app.use('/api',sameOrigin);
  app.use('/api',rateLimit({windowMs:60000,max:240}));
  const authLimit=rateLimit({windowMs:15*60000,max:30});
  const assistantLimit=rateLimit({windowMs:60000,max:30});
  const api=express.Router();
  api.get('/health',(req,res)=>res.json({status:'ok',version:'0.1.0',courses:catalog.courses.length,lessons:catalog.courses.reduce((s,c)=>s+c.lessons.length,0),questions:catalog.quizzes.reduce((s,q)=>s+q.questions.length,0),labs:catalog.labs.length}));
  api.get('/catalog',(req,res)=>res.json({curriculum:catalog.curriculum,courses:catalog.courses.map(courseSummary),labs:catalog.labs.map(({id,title,level,difficulty,theme,duration,tools,summary,objectives})=>({id,title,level,difficulty,theme,duration,tools,summary,objectives})),quizzes:catalog.quizzes.map(({questions,...q})=>({...q,questionCount:questions.length})),projects:catalog.projects,stats:{courses:catalog.courses.length,lessons:catalog.courses.reduce((s,c)=>s+c.lessons.length,0),questions:catalog.quizzes.reduce((s,q)=>s+q.questions.length,0),labs:catalog.labs.length}}));
  api.get('/courses/:id',(req,res)=>{const c=catalog.courses.find(c=>c.id===req.params.id);if(!c)throw new HttpError(404,'Cours introuvable.');res.json(c);});
  api.get('/glossary',(req,res)=>res.json(catalog.glossary));
  api.get('/resources',(req,res)=>res.json(catalog.resources));
  api.post('/auth/register',authLimit,asyncRoute(async(req,res)=>{
    const user=await auth.register(req.body || {},req.ip);
    const login=await auth.login({email:req.body.email,password:req.body.password},req.ip);
    res.setHeader('Set-Cookie',serialize(SESSION_COOKIE,login.token,{...cookieOptions(req),maxAge:sessionMaxAge}));
    res.status(201).json({user});
  }));
  api.post('/auth/login',authLimit,asyncRoute(async(req,res)=>{
    const result=await auth.login(req.body || {},req.ip);
    res.setHeader('Set-Cookie',serialize(SESSION_COOKIE,result.token,{...cookieOptions(req),maxAge:sessionMaxAge}));
    res.json({user:result.user});
  }));
  api.post('/auth/logout',(req,res)=>{auth.logout(req.sessionToken,req.ip);res.setHeader('Set-Cookie',serialize(SESSION_COOKIE,'',{...cookieOptions(req),maxAge:0}));res.json({ok:true});});
  api.get('/auth/me',(req,res)=>res.json({user:req.user}));
  api.patch('/auth/me',requireAuth,(req,res)=>res.json({user:auth.updateLevel(req.user.id,req.body?.academicLevel)}));
  api.get('/dashboard',requireAuth,(req,res)=>res.json(learning.dashboard(req.user.id)));
  api.put('/progress/lessons/:courseId/:lessonId',requireAuth,(req,res)=>res.json(learning.completeLesson(req.user.id,req.params.courseId,req.params.lessonId,req.body?.complete!==false)));
  api.get('/quizzes/:id',(req,res)=>res.json(learning.publicQuiz(req.params.id)));
  api.post('/quizzes/:id/submissions',(req,res)=>res.json(learning.submitQuiz(req.params.id,req.body?.responses,req.user?.id)));
  api.post('/exams',(req,res)=>res.json(learning.createExam(req.user?.id,req.body?.level??0,req.body?.count??10)));
  api.get('/exams/:id',(req,res)=>res.json(learning.getExam(req.params.id,req.user?.id)));
  api.post('/exams/:id/submissions',(req,res)=>res.json(learning.submitExam(req.params.id,req.body?.responses,req.user?.id)));
  api.get('/labs/:id',(req,res)=>res.json(learning.publicLab(req.params.id)));
  api.put('/labs/:id/checklist',requireAuth,(req,res)=>res.json(learning.saveLabChecklist(req.user.id,req.params.id,req.body?.checklist)));
  api.post('/labs/:id/validation',requireAuth,(req,res)=>res.json(learning.validateLab(req.user.id,req.params.id,req.body?.checklist,req.body?.answer,req.body?.reveal===true)));
  api.get('/labs/:id/files/:name',(req,res)=>{const file=learning.downloadLabFile(req.params.id,req.params.name);res.setHeader('Content-Disposition',`attachment; filename="${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}"`);res.type('text/plain; charset=utf-8').send(file.content);});
  api.post('/assistant',assistantLimit,(req,res)=>res.json(answerQuestion(catalog,req.body?.message)));
  api.post('/tools/subnet',(req,res)=>{try{const result=analyzeSubnet(req.body?.ip,req.body?.mask);res.json({...result,steps:subnetSteps(req.body.ip,result.prefix)});}catch(e){throw new HttpError(400,e.message,'CALCULATION_ERROR');}});
  api.post('/tools/vlsm',(req,res)=>{try{res.json(allocateVLSM(req.body?.ip,req.body?.mask,req.body?.requirements));}catch(e){throw new HttpError(400,e.message,'CALCULATION_ERROR');}});
  api.use((req,res)=>{throw new HttpError(404,'Route API introuvable.');});
  app.use('/api',api);
  if(webRoot && existsSync(webRoot)){
    app.use(express.static(webRoot,{index:false,maxAge:'1h'}));
    app.get('*', (req,res)=>res.sendFile(join(webRoot,'index.html')));
  }
  app.use(errorHandler);
  return app;
}
