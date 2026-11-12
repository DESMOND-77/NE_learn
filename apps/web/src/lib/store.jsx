import React,{createContext,useContext,useState,useEffect,useCallback} from 'react';
import {get,post,patch} from './api.js';
const AppContext=createContext(null);
export function AppProvider({children}){
  const [user,setUser]=useState(null),[catalog,setCatalog]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[authReady,setAuthReady]=useState(false);
  const [theme,setTheme]=useState(()=>localStorage.getItem('ne-theme')||'dark');
  const [dashboard,setDashboard]=useState(null),[toast,setToast]=useState(null);
  const notify=useCallback((message,type='success')=>setToast({message,type,id:Date.now()}),[]);
  useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(null),4500);return()=>clearTimeout(t);},[toast]);
  useEffect(()=>{document.documentElement.dataset.theme=theme;localStorage.setItem('ne-theme',theme);},[theme]);
  const reload=useCallback(async()=>{setLoading(true);setError('');try{const [c,a]=await Promise.all([get('/catalog'),get('/auth/me')]);setCatalog(c);setUser(a.user);setAuthReady(true);}catch(e){setError(e.message);}finally{setLoading(false);}},[]);
  useEffect(()=>{reload();},[reload]);
  const refreshDashboard=useCallback(async()=>{if(!user){setDashboard(null);return;}try{setDashboard(await get('/dashboard'));}catch(e){notify(e.message,'error');}},[user,notify]);
  useEffect(()=>{refreshDashboard();},[refreshDashboard]);
  const login=async(body)=>{const r=await post('/auth/login',body);setUser(r.user);notify(`Bon retour, ${r.user.name} !`);return r.user;};
  const register=async(body)=>{const r=await post('/auth/register',body);setUser(r.user);notify('Ton espace étudiant est créé. Bienvenue !');return r.user;};
  const logout=async()=>{await post('/auth/logout',{});setUser(null);setDashboard(null);notify('Tu es déconnecté.');};
  const updateLevel=async(level)=>{const r=await patch('/auth/me',{academicLevel:level});setUser(r.user);notify('Niveau académique mis à jour.');};
  return <AppContext.Provider value={{user,catalog,error,loading,authReady,theme,setTheme,dashboard,refreshDashboard,login,register,logout,updateLevel,notify,toast,reload}}>{children}</AppContext.Provider>;
}
export const useApp=()=>useContext(AppContext);
export function useResource(path){
  const [data,setData]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  useEffect(()=>{let live=true;setData(null);setLoading(true);setError('');get(path).then(d=>{if(live)setData(d);}).catch(e=>{if(live)setError(e.message);}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[path]);
  return {data,error,loading};
}
