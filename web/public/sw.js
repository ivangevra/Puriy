// Local development must never cache Vite modules or styles across edits.
const LOCAL=['localhost','127.0.0.1','[::1]'].includes(self.location.hostname);
const CACHE='puriy-shell-v1';
self.addEventListener('install',event=>{
 if(!LOCAL)event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(['/','/icon.svg','/manifest.webmanifest'])));
 self.skipWaiting();
});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{
 for(const key of await caches.keys())if(key.startsWith('puriy-shell-')&&(LOCAL||key!==CACHE))await caches.delete(key);
 await self.clients.claim();
 if(LOCAL){await self.registration.unregister();for(const client of await self.clients.matchAll({type:'window'}))client.postMessage({type:'JULIACA_DEV_CACHE_CLEARED'})}
})())});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(LOCAL||event.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api')||url.pathname.includes('__')||event.request.headers.get('rsc')||event.request.headers.get('accept')?.includes('text/x-component'))return;
 if(event.request.mode==='navigate'){
   event.respondWith(fetch(event.request).then(response=>{if(response.ok&&response.headers.get('content-type')?.includes('text/html')){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(c=>c.put('/',copy)))}return response}).catch(async()=>await caches.match('/')||new Response('Sin conexión. Vuelve a conectarte para abrir Puriy.',{status:503})));
 }else if(/^\/assets\/.*\.(js|css|woff2)$/.test(url.pathname)){
   event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(c=>c.put(event.request,copy)))}return response})));
 }
});

