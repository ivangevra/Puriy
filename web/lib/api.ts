import { planLocalStreets } from './local-planner';
import {EMPTY_NETWORK, readLocal, writeLocal, type Network, type Point, type Journey, type Position} from './mobility';
export const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/,'');
export const IS_LOCAL_DEMO = !API_BASE;
let authToken='';
export const setAuthToken=(token:string)=>{authToken=token};
export async function request<T>(path:string,body?:unknown,method?:string):Promise<T>{
  const bearer=authToken;
  let response:Response;
  try {
    response=await fetch(`${API_BASE}/api${path}`,{method:method||(body?'POST':'GET'),headers:{'Content-Type':'application/json',...(bearer?{Authorization:`Bearer ${bearer}`}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
  } catch {
    throw new Error((import.meta.env as unknown as {DEV:boolean}).DEV
      ? `No se pudo conectar con la API (${API_BASE}). Inicia web y API con npm run dev (en la carpeta web).`
      : 'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.');
  }
  if(!response.ok){const err=await response.json().catch(()=>({})) as {detail?:unknown};throw new Error(typeof err.detail==='string'?err.detail:`No se pudo completar la solicitud (${response.status}).`)}
  return response.json();
}
export async function getNetwork():Promise<Network>{
  if(IS_LOCAL_DEMO)return EMPTY_NETWORK;
  try{const net=await request<Network>('/network');writeLocal('juliaca-network',net);return net}catch(e){if(!navigator.onLine){const cached=readLocal<Network|null>('juliaca-network',null);if(cached)return {...cached,routes:cached.routes.filter(r=>r.status!=='demo')}}throw e}
}
export async function getPlan(net:Network,origin:Point,destination:Point,hour:string,preference:string,onProgress?:(results:Journey[])=>void):Promise<Journey[]>{
  if(IS_LOCAL_DEMO || net.routes.some(r=>r.status==='proposal'))return planLocalStreets(net,origin,destination,hour,preference,undefined,onProgress);
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  return (await request<{itineraries:Journey[]}>('/plan',{origin,destination,departure:`${date}T${hour}:00-05:00`,preference})).itineraries;
}
export async function getPositions():Promise<Position[]>{return IS_LOCAL_DEMO?[]:request<Position[]>('/positions')}
export async function listRecords<T>(kind:string):Promise<T[]>{return IS_LOCAL_DEMO?readLocal<T[]>(`juliaca-${kind}`,[]):request<T[]>(`/admin/${kind}`)}
export async function saveRecord<T extends object>(kind:string,data:T){
  if(IS_LOCAL_DEMO){const row={...data,id:crypto.randomUUID(),status:kind==='reports'?'pending':undefined};const items=readLocal<object[]>(`juliaca-${kind}`,[]);writeLocal(`juliaca-${kind}`,[row,...items]);return row}
  return request(kind==='reports'?'/reports':`/admin/${kind}`,data);
}
export function downloadJSON(name:string,value:unknown){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
