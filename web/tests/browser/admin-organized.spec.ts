import {test,expect} from '@playwright/test';
import {resetWorkspace} from './helpers';
const draft={version:1,id:'saved-n40',name:'Recorrido N40',code:'N40',color:'#299b50',routingMode:'manual',outbound:[[-70.134,-15.49],[-70.134,-15.5]],inbound:[],source:'Campo',observedAt:'',boarding:'',risks:'',notes:'',checks:[],updatedAt:new Date().toISOString(),service:{headway:10,start:'06:00',end:'22:00',fare:1.5}};
test('panel estable, recuperación de borrador y visibilidad del pasajero',async({page,request})=>{
 await resetWorkspace(request);
 await page.addInitScript(d=>localStorage.setItem('juliaca-route-workbench-v1',JSON.stringify({active:d.id,drafts:[d]})),draft);
 await page.goto('/');await expect(page.locator('.app-shell')).toHaveAttribute('data-ready','true');
 await expect(page.getByLabel('Desde',{exact:true})).toHaveValue('');
 await page.getByRole('button',{name:'Administrar plataforma'}).click();await page.getByRole('button',{name:'Entrar al panel local'}).click();
 const nav=page.getByRole('navigation',{name:'Herramientas de administración'});const before=await nav.boundingBox();
 await nav.getByRole('button',{name:'Mis recorridos',exact:true}).click();
 await expect(page.getByText('N40 · Recorrido N40',{exact:true})).toBeVisible();
 for(const name of ['Red de rutas','Semáforos','Importar y exportar','Reportes','Mis recorridos']){
  await nav.getByRole('button',{name,exact:true}).click();const after=await nav.boundingBox();expect(after!.x).toBeCloseTo(before!.x);expect(after!.width).toBeCloseTo(before!.width);expect(after!.height).toBeCloseTo(before!.height);
 }
 await page.getByRole('button',{name:'Recuperar en el editor'}).click();await expect(page.getByLabel('Código',{exact:true})).toHaveValue('N40');
 await page.getByRole('button',{name:'Publicar en mi mapa',exact:true}).click();
 await expect(page.getByRole('button',{name:'Mostrar a pasajeros'})).toBeVisible();await page.getByRole('button',{name:'Mostrar a pasajeros'}).click();
 await expect(page.getByText('Visible para pasajeros',{exact:true})).toBeVisible();
 await page.setViewportSize({width:1440,height:960});await page.screenshot({path:'../artifacts/admin-organized.png',fullPage:true});
 await page.getByRole('button',{name:'Ver como pasajero'}).click();await page.getByRole('button',{name:'Rutas',exact:true}).click();await expect(page.getByText('Recorrido N40',{exact:true})).toBeVisible();
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
});
