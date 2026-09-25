import {chromium} from '@playwright/test';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:960}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://localhost:5173');await page.locator('.app-shell[data-ready=true]').waitFor();await page.locator('.transit-map[data-base-ready=true]').waitFor();
for(let i=0;i<3;i++){await page.getByRole('button',{name:'Acercar mapa'}).click();await page.waitForTimeout(400);}
await page.screenshot({path:'../artifacts/map-full-arrows.png'});
await page.getByLabel('Hasta',{exact:true}).fill('Gonzales Prada');await page.getByRole('option',{name:/Jirón Gonzales Prada/}).waitFor({timeout:15000});await page.screenshot({path:'../artifacts/search-live.png'});
await page.getByRole('option',{name:/Jirón Gonzales Prada/}).click();await page.getByLabel('Hasta',{exact:true}).fill('aeropuerto');await page.getByRole('option',{name:/Aeropuerto Inca Manco Cápac/}).first().click();await page.getByRole('button',{name:'Buscar mi ruta'}).click();await page.getByText('Tu viaje, paso a paso').waitFor();await page.screenshot({path:'../artifacts/journeys-redesigned.png'});
await page.getByRole('button',{name:'Tema oscuro',exact:true}).click();await page.waitForTimeout(800);await page.screenshot({path:'../artifacts/journeys-redesigned-dark.png'});
await page.setViewportSize({width:390,height:844});await page.screenshot({path:'../artifacts/journeys-redesigned-mobile.png',fullPage:true});console.log({errors,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)});await browser.close();
