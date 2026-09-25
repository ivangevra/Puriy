import {test,expect} from '@playwright/test';

test('mapa visible, con calles, encuadre y controles en escritorio y celular',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewportSize({width:1440,height:960});await page.goto('/');
 await expect(page.locator('.transit-map')).toHaveAttribute('data-map-ready','true');
 await expect(page.locator('.transit-map')).toHaveAttribute('data-base-ready','true',{timeout:20000});
 expect(await page.locator('.map-canvas').evaluate(e=>e.getBoundingClientRect().height)).toBeGreaterThan(500);
 await page.getByRole('button',{name:'Acercar mapa'}).click();await page.getByRole('button',{name:'Centrar en Juliaca'}).click();
 await page.screenshot({path:'../artifacts/map-desktop-fixed.png',fullPage:true});
 for(const width of [320,375,414,768]){
   await page.setViewportSize({width,height:900});
   await expect(page.locator('.transit-map')).toHaveAttribute('data-map-ready','true');
   const bounds=await page.locator('.map-canvas').evaluate(e=>({height:e.getBoundingClientRect().height,width:e.getBoundingClientRect().width}));
   expect(bounds.height).toBeGreaterThan(250);expect(bounds.width).toBeGreaterThan(250);
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 await page.setViewportSize({width:375,height:900});await page.screenshot({path:'../artifacts/map-mobile-fixed.png',fullPage:true});
 await page.getByRole('button',{name:'Marcar destino en mapa'}).click();await page.locator('.map-canvas').click({position:{x:180,y:140}});
 await expect(page.getByLabel('Hasta',{exact:true})).toHaveValue('Destino elegido en el mapa');
 expect(errors).toEqual([]);
});

test('usa mapa de respaldo si el proveedor vectorial falla',async({page})=>{
 await page.route('https://tiles.openfreemap.org/**',route=>route.abort());
 await page.goto('/');
 await expect(page.locator('.transit-map')).toHaveAttribute('data-renderer','raster',{timeout:20000});
 await expect(page.locator('.leaflet-tile-loaded').first()).toBeVisible({timeout:15000});
 await expect(page.locator('.leaflet-overlay-pane path').first()).toBeAttached();
 await page.getByRole('button',{name:'Acercar mapa'}).click();
 await page.screenshot({path:'../artifacts/map-fallback.png'});
});

test('sin WebGL conserva calles, rutas y selección de destino',async({page})=>{
 await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,type:string,...args:unknown[]){if(type.includes('webgl'))return null;return original.apply(this,[type,...args] as never)} as typeof original});
 await page.goto('/');await expect(page.locator('.transit-map')).toHaveAttribute('data-renderer','raster',{timeout:20000});
 await expect(page.locator('.leaflet-tile-loaded').first()).toBeVisible({timeout:15000});
 await page.getByRole('button',{name:'Marcar destino en mapa'}).click();await page.locator('.map-canvas').click({position:{x:200,y:250}});
 await expect(page.getByLabel('Hasta',{exact:true})).toHaveValue('Destino elegido en el mapa');
});

test('desarrollo elimina la caché vieja sin perder favoritos',async({page})=>{
 await page.goto('/');await expect(page.locator('.app-shell')).toHaveAttribute('data-ready','true');
 await page.evaluate(async()=>{localStorage.setItem('juliaca-favorites','["D01"]');const c=await caches.open('juliaca-shell-v1');await c.put('/app/mobility.css',new Response('.map-canvas{height:0}'))});
 await page.reload();await expect(page.locator('.app-shell')).toHaveAttribute('data-ready','true');
 await expect.poll(()=>page.evaluate(async()=>(await caches.keys()).filter(k=>k.startsWith('juliaca-shell-')))).toEqual([]);
 await page.getByRole('button',{name:'Rutas guardadas'}).click();await expect(page.getByText('Corredor norte–sur',{exact:true})).toBeVisible();
});
