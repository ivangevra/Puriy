import {describe,it,expect} from 'vitest';
import {DEMO_NETWORK as net,demoPlan,stopById,isFresh,scenarioNetwork,compareScenario} from '../lib/mobility';
const pairs=net.routes.flatMap(r=>r.stops.slice(1).flatMap(id=>[[r.stops[0],id],[id,r.stops[0]]])).slice(0,30);
describe('30 viajes de referencia sintéticos',()=>{
 for(const [i,[from,to]] of pairs.entries())it(`viaje ${i+1}: ${from} → ${to}`,()=>{
   const trips=demoPlan(net,stopById(net,from),stopById(net,to));expect(trips.length).toBeGreaterThan(0);expect(trips.length).toBeLessThanOrEqual(3);
   for(const t of trips){expect(t.minutes).toBeGreaterThan(0);expect(t.transfers).toBeLessThanOrEqual(1);expect(t.walk_meters).toBeLessThanOrEqual(1300);for(const l of t.legs){const r=net.routes.find(r=>r.id===l.route_id)!;const stops=l.direction?r.inbound:r.stops;expect(stops.indexOf(l.to.id)).toBeGreaterThan(stops.indexOf(l.from.id));}}
 });
});
it('sin servicio de madrugada y fuera de cobertura',()=>{expect(demoPlan(net,net.stops[0],net.stops[3],'02:00')).toEqual([]);expect(demoPlan(net,{lat:0,lon:0},net.stops[3])).toEqual([])});
it('incluye un transbordo para dos extremos no conectados',()=>{const trips=demoPlan(net,stopById(net,'cusco'),stopById(net,'aeropuerto'));expect(trips.length).toBeGreaterThan(0);expect(trips.every(t=>t.transfers===1)).toBe(true)});
it('GPS expira después de 90 segundos; simulación nunca es real',()=>{const now=Date.now();const p={vehicle_id:'v',route_id:'D01',direction:0,source:'test',lat:-15.49,lon:-70.13,simulated:false,timestamp:new Date(now-90000).toISOString()};expect(isFresh(p,now)).toBe(true);expect(isFresh(p,now+1)).toBe(false);expect(isFresh({...p,simulated:true},now)).toBe(false);expect(isFresh({...p,timestamp:'bad'},now)).toBe(false)});
it('escenarios no mutan la red y comparan los mismos pares',()=>{const original=JSON.stringify(net);const scenario={name:'Frecuencia',route_id:'D01',frequency:4,removed_stops:[],source:'test'};const changed=scenarioNetwork(net,scenario);expect(changed.routes[0].frequency).toEqual([4,4]);expect(JSON.stringify(net)).toBe(original);const result=compareScenario(net,scenario);expect(result.count).toBeGreaterThan(0);expect(result.newMinutes).toBeLessThanOrEqual(result.baseMinutes);expect(result.baseCoverage).toBe(result.newCoverage)});
