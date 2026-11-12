import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from './infrastructure/database.js';
import { loadCatalog } from './infrastructure/content.js';
import { createApp } from './app.js';

const root=fileURLToPath(new URL('../../../',import.meta.url));
const port=Number(process.env.PORT || 3001);
const db=openDatabase(process.env.DB_PATH || resolve(root,'data/ne-learn.sqlite'));
const catalog=loadCatalog(process.env.CONTENT_DIR || resolve(root,'content'));
const webRoot=resolve(root,'apps/web/dist');
const app=createApp({db,catalog,webRoot,trustProxy:process.env.TRUST_PROXY==='true'});
const server=app.listen(port,'0.0.0.0',()=>console.log(`NE_learn API prêt sur http://0.0.0.0:${port} — ${catalog.courses.length} cours, ${catalog.labs.length} laboratoires`));
server.on('error',err=>{console.error(err.message);db.close();process.exitCode=1;});
function shutdown(){server.close(()=>{db.close();process.exit(0);});setTimeout(()=>process.exit(1),5000).unref();}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
