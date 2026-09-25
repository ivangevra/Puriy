import {test,expect} from '@playwright/test';
test('configura y publica frecuencia y datos del micro',async({page})=>{
 await page.addInitScript(()=>{const draft={version:1,id:'service-test',name:'Servicio de prueba',code:'N40',color:'#299b50',routingMode:'manual',outbound:[[-70.134,-15.49],[-70.134,-15.5]],inbound:[],source:'Prueba',observedAt:'',boarding:'',risks:'',notes:'',checks:[],updatedAt:new Date().toISOString()};localStorage.setItem('juliaca-route-workbench-v1',JSON.stringify({active:draft.id,drafts:[draft]}));});
 await page.goto('/');await expect(page.locator('.app-shell')).toHaveAttribute('data-ready','true');
 await page.getByRole('button',{name:'Dibujar',exact:true}).click();
 await page.getByText('Configurar servicio del micro',{exact:true}).click();
 await page.getByLabel('Intervalo de salida (min)',{exact:true}).fill('10');
 await page.getByLabel('Velocidad media operativa (km/h)',{exact:true}).fill('15');
 await page.getByLabel('Modelo o identificación visual',{exact:true}).fill('Combi blanca tipo Hiace');
 await page.getByLabel('Tarifa (S/)',{exact:true}).fill('1.5');
 await page.getByRole('button',{name:'Publicar en mi mapa',exact:true}).click();
 const service=await page.evaluate(()=>JSON.parse(localStorage.getItem('juliaca-published-map-v1')!)[0].draft.service);
 expect(service).toMatchObject({headway:10,speedKmh:15,fare:1.5,model:'Combi blanca tipo Hiace'});
 await page.getByRole('button',{name:'Simular un micro',exact:true}).click();
 await expect(page.locator('.maplibregl-canvas')).toBeVisible();
 await expect(page.getByText('Cargando el mapa de Juliaca…',{exact:true})).not.toBeVisible({timeout:15000});
 await page.waitForTimeout(1800);
 await page.screenshot({path:'../artifacts/combi-top-view.png',fullPage:true});
});
