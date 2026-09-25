export async function configureOffline(){
 if(!('serviceWorker' in navigator))return;
 const local=['localhost','127.0.0.1','[::1]'].includes(location.hostname);
 if(local){
   const registrations=await navigator.serviceWorker.getRegistrations();
   for(const registration of registrations){
     const script=registration.active?.scriptURL||registration.waiting?.scriptURL||registration.installing?.scriptURL;
     if(script&&new URL(script).pathname==='/sw.js')await registration.unregister();
   }
   for(const key of await caches.keys())if(key.startsWith('juliaca-shell-'))await caches.delete(key);
   const controller=navigator.serviceWorker.controller;
   if(controller&&new URL(controller.scriptURL).pathname==='/sw.js'&&!sessionStorage.getItem('juliaca-dev-cache-v3')){
     sessionStorage.setItem('juliaca-dev-cache-v3','1');location.reload();
   }
 }else{
   const registration=await navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'});
   await registration.update();
 }
}
