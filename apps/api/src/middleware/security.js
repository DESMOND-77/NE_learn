import { parse as parseCookies } from 'cookie';
import { SESSION_COOKIE } from '../infrastructure/auth.js';

export class HttpError extends Error {
  constructor(status, message, code='REQUEST_ERROR') { super(message); this.status=status; this.code=code; }
}
export function securityContext(auth) {
  return (req,res,next) => {
    try { req.cookies=parseCookies(req.headers.cookie || ''); } catch { req.cookies={}; }
    req.sessionToken=req.cookies[SESSION_COOKIE];
    req.user=auth.userFromToken(req.sessionToken);
    next();
  };
}
export function requireAuth(req,res,next) {
  if (!req.user) return next(new HttpError(401,'Connecte-toi pour enregistrer ta progression.','AUTH_REQUIRED'));
  next();
}
/** Protège les mutations cookyées contre les requêtes cross-origin simples. */
export function sameOrigin(req,res,next) {
  if (['GET','HEAD','OPTIONS'].includes(req.method)) return next();
  const origin=req.headers.origin;
  if (origin) {
    try {
      const url=new URL(origin);
      const forwardedHost=req.app.get('trust proxy') ? req.headers['x-forwarded-host']?.split(',')[0].trim() : null;
      const host=forwardedHost || req.headers.host;
      if (url.host!==host) return next(new HttpError(403,'Origine de requête non autorisée.','ORIGIN_REJECTED'));
    } catch { return next(new HttpError(403,'Origine invalide.','ORIGIN_REJECTED')); }
  }
  if (req.headers['sec-fetch-site']==='cross-site') return next(new HttpError(403,'Requête intersites refusée.','ORIGIN_REJECTED'));
  next();
}
export function rateLimit({ windowMs=60000, max=30 }={}) {
  const buckets=new Map();
  const middleware=(req,res,next) => {
    const now=Date.now(), key=req.ip || 'unknown';
    if (buckets.size>10000) for (const [k,v] of buckets) if(v.reset<now)buckets.delete(k);
    let bucket=buckets.get(key);
    if(!bucket || bucket.reset<=now){bucket={count:0,reset:now+windowMs};buckets.set(key,bucket);}
    bucket.count++;
    if(bucket.count>max){res.setHeader('Retry-After',Math.ceil((bucket.reset-now)/1000));return next(new HttpError(429,'Trop de requêtes. Réessaie dans quelques instants.','RATE_LIMITED'));}
    next();
  };
  middleware.cleanup=()=>buckets.clear();
  return middleware;
}
export function errorHandler(err,req,res,next) {
  if(res.headersSent)return next(err);
  const status=err.status || 500;
  if(status>=500)console.error(JSON.stringify({level:'error',route:req.path,message:err.message,at:new Date().toISOString()}));
  res.status(status).json({error:{code:err.code || 'INTERNAL_ERROR',message:status>=500?'Une erreur interne est survenue. Réessaie plus tard.':err.message}});
}
