import {chromium} from '@playwright/test';
const browser=await chromium.launch();const page=await browser.newPage();page.on('pageerror',e=>console.log('ERROR',e.message));
await page.goto('http://localhost:5173/');await page.locator('.app-shell[data-ready=true]').waitFor();
await page.getByLabel('Hasta',{exact:true}).fill('Aeropuerto Inca Manco Cápac');console.log('filled',await page.getByLabel('Hasta',{exact:true}).inputValue());
await page.waitForTimeout(500);console.log('later',await page.getByLabel('Hasta',{exact:true}).inputValue());
await page.getByRole('button',{name:'Buscar mi ruta'}).click();await page.waitForTimeout(500);console.log('after',await page.locator('.travel-panel').innerText());
await browser.close();
