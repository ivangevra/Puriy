import {it,expect} from 'vitest';
import {advanceVehicle,vehicleAt} from '../lib/vehicle-simulation';
import {newSignal} from '../lib/map-workspace';
const coords=[[-70.13,-15.49],[-70.13,-15.48]];
it('recorre metros por velocidad y no por cantidad de vértices',()=>{
 expect(advanceVehicle(coords,0,1,36,[],0)).toBe(10);
 expect(advanceVehicle([coords[0],[-70.13,-15.489],coords[1]],0,1,36,[],0)).toBe(10);
 expect(vehicleAt(coords,10)?.coordinates[1]).toBeGreaterThan(-15.49);
});
it('detiene antes del semáforo rojo y reanuda en verde',()=>{
 const signal={...newSignal(),lat:-15.4899,lon:-70.13,red:10,green:10,amber:2,updatedAt:new Date(0).toISOString()};
 const stop=advanceVehicle(coords,0,1,36,[signal],1000);
 expect(stop).toBeGreaterThan(4);expect(stop).toBeLessThan(6);
 expect(advanceVehicle(coords,stop,1,36,[signal],2000)).toBeCloseTo(stop);
 expect(advanceVehicle(coords,stop,1,36,[signal],11000)).toBeGreaterThan(stop);
});
it('ignora semáforos lejanos y no reinicia al llegar al final',()=>{
 const signal={...newSignal(),lat:-15.4899,lon:-70.14,red:100,green:10,amber:2,updatedAt:new Date(0).toISOString()};
 expect(advanceVehicle(coords,0,1,36,[signal],1000)).toBe(10);
 expect(advanceVehicle(coords,9999,1,36,[],0)).toBeLessThan(1200);
});
