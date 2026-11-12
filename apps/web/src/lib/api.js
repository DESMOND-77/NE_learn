export class ApiError extends Error { constructor(message,status,code){super(message);this.status=status;this.code=code;} }
export async function api(path,options={}) {
  const res=await fetch(`/api${path}`,{credentials:'same-origin',headers:{'Content-Type':'application/json',...options.headers},...options,body:options.body===undefined?undefined:JSON.stringify(options.body)});
  const data=await res.json().catch(()=>({error:{message:'Réponse serveur invalide.'}}));
  if(!res.ok)throw new ApiError(data.error?.message||'Erreur réseau.',res.status,data.error?.code);
  return data;
}
export const get=api;
export const post=(path,body)=>api(path,{method:'POST',body});
export const put=(path,body)=>api(path,{method:'PUT',body});
export const patch=(path,body)=>api(path,{method:'PATCH',body});
export const fmtDate=(date)=>date?new Date(date).toLocaleDateString('fr-FR',{day:'numeric',month:'short'}):'—';
export const levelNames={1:'Fondamentaux',2:'Maîtrise des réseaux',3:'Administration',4:'Cycle ingénieur'};
export const levelColors={1:'green',2:'blue',3:'violet',4:'amber'};
export function downloadText(name,content,type='text/plain;charset=utf-8'){
  const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
