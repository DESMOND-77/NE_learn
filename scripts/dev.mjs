import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const children=[];
let stopping=false;
function stop(code=0){if(stopping)return;stopping=true;for(const c of children)c.kill('SIGTERM');setTimeout(()=>process.exit(code),700).unref();}
const api=spawn(process.execPath,['--watch','apps/api/src/server.js'],{cwd:root,stdio:'inherit',env:{...process.env,PORT:process.env.PORT||'3001'}});
children.push(api);
api.on('error',e=>{console.error(e);stop(1);});
api.on('exit',code=>{if(!stopping)stop(code||1);});
const viteBin=fileURLToPath(new URL('../node_modules/vite/bin/vite.js',import.meta.url));
const web=spawn(process.execPath,[viteBin,'--host','0.0.0.0','--port',process.env.WEB_PORT||'5173'],{cwd:`${root}apps/web`,stdio:'inherit',env:process.env});
children.push(web);
web.on('error',e=>{console.error(e);stop(1);});
web.on('exit',code=>{if(!stopping)stop(code||0);});
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
