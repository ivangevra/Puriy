import {test,expect} from '@playwright/test';
import {resetWorkspace,seedPublication} from './helpers';
test('pasajero limpio, acceso administrativo y cierre de sesión',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await expect(page.locator('.app-shell')).toHaveAttribute('data-ready','true');
 await expect(page.getByRole('button',{name:'Dibujar',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Semáforos',exact:true})).toHaveCount(0);
 await expect(page.getByText('Modo demostración',{exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Simular un micro',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Rutas',exact:true}).click();await expect(page.getByRole('button',{name:'Administrar rutas · editar y eliminar',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Administrar plataforma',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Administración',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Entrar al panel local'}).click();
 await expect(page.getByRole('heading',{name:'Panel de administración'})).toBeVisible();
 await page.getByRole('button',{name:'Rutas',exact:true}).click();
 await page.getByRole('button',{name:'Administrar rutas · editar y eliminar'}).click();await expect(page.getByRole('heading',{name:'Administrar rutas',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Volver al catálogo'}).click();
 await expect(page.locator('.map-footer')).toContainText('rutas en el piloto');
 await page.getByRole('button',{name:'Administrar plataforma',exact:true}).click();
 await page.setViewportSize({width:1440,height:960});await page.screenshot({path:'../artifacts/admin-hub.png',fullPage:true});
 await page.getByRole('button',{name:'Ver como pasajero'}).click();await expect(page.getByRole('button',{name:'Simular un micro',exact:true})).toHaveCount(0);
 await page.screenshot({path:'../artifacts/passenger-clean.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
 await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click();
 await page.getByRole('button',{name:'Administrar plataforma',exact:true}).click();await expect(page.getByRole('button',{name:'Entrar al panel local'})).toBeVisible();
 expect(errors).toEqual([]);
});

test('publicación revisada visible al pasajero sin controles administrativos',async({page,request})=>{
 await resetWorkspace(request);
 await seedPublication(request,{version:1,id:'approved',name:'Ruta revisada',code:'N40',color:'#299b50',routingMode:'manual',passengerVisible:true,outbound:[[-70.134,-15.49],[-70.134,-15.5]],inbound:[],source:'Registro de campo',observedAt:'',boarding:'',risks:'',notes:'',checks:[],updatedAt:new Date().toISOString(),service:{headway:10,start:'06:00',end:'22:00',fare:1.5}});
 await page.goto('/');await expect(page.locator('.app-shell')).toHaveAttribute('data-ready','true');
 await page.getByRole('button',{name:'Rutas',exact:true}).click();
 await expect(page.getByText('Ruta revisada',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Simular un micro',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:/N40 Ruta revisada/}).click();
 await expect(page.getByRole('heading',{name:'Ruta revisada',exact:true})).toBeVisible();
 await expect(page.getByText('10–10 min',{exact:true})).toBeVisible();
});
