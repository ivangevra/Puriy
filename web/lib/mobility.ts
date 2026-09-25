import seed from './network.json';

export type Point = { lat: number; lon: number; accuracy?: number; locatedAt?: number };
export type Stop = Point & { id: string; name: string; kind: string };
export type ServiceConfig = { headway?: number; speedKmh?: number; fare?: number; operator?: string; model?: string; start?: string; end?: string };
export type Route = typeof seed.routes[number] & { service?: ServiceConfig; passengerVisible?: boolean };
export const isRoutePublic = (r: Route) =>
  r.passengerVisible !== undefined
    ? r.passengerVisible
    : r.status !== 'proposal';
export type Network = { stops: Stop[]; routes: Route[] };
export type Leg = { route_id: string; direction: number; from: Stop; to: Stop; stops: Stop[]; minutes: number; wait: number | null; fare: number; geometry?: string; coordinates?: number[][] };
export type WalkPath = { coordinates: number[][]; meters: number; seconds: number; streets?: string[] };
export type Journey = { id: string; legs: Leg[]; minutes: number; walk_meters: number; transfers: number; fare: number; mode: string; warning?: string; walk_geometry?: string[]; walking?: WalkPath[]; boarding_meters?: number; service_unknown?: boolean; time_estimated?: boolean; timing?: {walk:number;wait:number|null;ride:number;total:number|null} };
export type Position = Point & { vehicle_id: string; route_id: string; direction: number; timestamp: string; source: string; simulated: boolean; stale?: boolean };
export type Scenario = { id?: string; name: string; route_id: string; frequency: number; removed_stops: string[]; source: string };
export const DEMO_NETWORK: Network = seed;
/** Red vacía para el modo local: no se muestran recorridos de ejemplo. */
export const EMPTY_NETWORK: Network = { stops: [], routes: [] };
export const money = (v: number) => `S/ ${v.toFixed(2)}`;
export const stopById = (net: Network, id: string) => net.stops.find(s => s.id === id)!;

export function distance(a: Point, b: Point) {
  const rad = Math.PI / 180;
  return 12742000 * Math.asin(Math.min(1, Math.sqrt(Math.sin((b.lat-a.lat)*rad/2)**2 + Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin((b.lon-a.lon)*rad/2)**2)));
}
export function routeKm(route: Route) {
  return route.geometry.slice(1).reduce((v,p,i) => v+distance({lon:p[0],lat:p[1]},{lon:route.geometry[i][0],lat:route.geometry[i][1]}),0)/1000;
}
export function isFresh(p: Position, now = Date.now()) {
  const age = now - Date.parse(p.timestamp);
  return !p.simulated && Number.isFinite(age) && age >= -30000 && age <= 90000;
}

/** Geodesic access is deliberately restricted to synthetic demonstrations. */
export function demoPlan(net: Network, origin: Point, destination: Point, hour = '10:00', preference = 'fastest', limit = 3): Journey[] {
  const variants = net.routes.filter(r=>r.status !== 'proposal' && r.start<=hour && hour<r.end).flatMap(r=>[0,1].map(d=>({r,d,ids:d?r.inbound:r.stops})));
  const options: Journey[]=[];
  const ride=(r:Route,d:number,ids:string[],i:number,j:number):Leg=>{
    const stops=ids.slice(i,j+1).map(id=>stopById(net,id));
    const meters=stops.slice(1).reduce((v,s,k)=>v+distance(stops[k],s),0);
    return {route_id:r.id,direction:d,from:stops[0],to:stops.at(-1)!,stops,minutes:Math.ceil(meters/250)+j-i,wait:(r.frequency[0]+r.frequency[1])/4,fare:r.fare};
  };
  const emit=(legs:Leg[])=>{
    const walk=distance(origin,legs[0].from)+distance(destination,legs.at(-1)!.to);
    const minutes=Math.ceil(walk/70+legs.reduce((v,l)=>v+l.minutes+(l.wait||0),0));
    const start=Number(hour.slice(0,2))*60+Number(hour.slice(3));
    if(legs.some(l=>{const end=net.routes.find(r=>r.id===l.route_id)!.end;return start+minutes>Number(end.slice(0,2))*60+Number(end.slice(3));})) return;
    options.push({id:legs.map(l=>`${l.route_id}.${l.direction}.${l.from.id}.${l.to.id}`).join('-'),legs,minutes,walk_meters:Math.round(walk),transfers:legs.length-1,fare:legs.reduce((v,l)=>v+l.fare,0),mode:'demo',warning:'Recorridos y caminatas de demostración.'});
  };
  for(const {r,d,ids} of variants) for(let i=0;i<ids.length-1;i++) {
    if(distance(origin,stopById(net,ids[i]))>650) continue;
    for(let j=i+1;j<ids.length;j++) {
      if(distance(destination,stopById(net,ids[j]))<=650) emit([ride(r,d,ids,i,j)]);
      for(const {r:r2,d:d2,ids:ids2} of variants) {
        const k=ids2.indexOf(ids[j]);
        if(r2.id===r.id || k<0) continue;
        for(let end=k+1;end<ids2.length;end++) if(distance(destination,stopById(net,ids2[end]))<=650) emit([ride(r,d,ids,i,j),ride(r2,d2,ids2,k,end)]);
      }
    }
  }
  options.sort((a,b)=>preference==='walk'?a.walk_meters-b.walk_meters||a.minutes-b.minutes:preference==='transfers'?a.transfers-b.transfers||a.minutes-b.minutes:a.minutes-b.minutes||a.transfers-b.transfers||a.walk_meters-b.walk_meters);
  if (!Number.isFinite(limit)) return options;
  const seen=new Set<string>();
  return options.filter(o=>{const k=o.legs.map(l=>`${l.route_id}.${l.direction}`).join();if(seen.has(k))return false;seen.add(k);return true}).slice(0,limit);
}

export function networkMetrics(net: Network) {
  const used=new Set(net.routes.flatMap(r=>r.stops));
  const segments=new Map<string,Set<string>>();
  for(const r of net.routes) for(let i=1;i<r.stops.length;i++){
    const key=[r.stops[i-1],r.stops[i]].sort().join('|');
    if(!segments.has(key))segments.set(key,new Set());
    segments.get(key)!.add(r.id);
  }
  const overlap=[...segments].filter(([,routes])=>routes.size>1).map(([key,routes])=>({stops:key.split('|'),routes:[...routes]}));
  // Fixed geographic sampling frame, not population coverage.
  let covered=0,total=0;
  for(let lat=-15.52;lat<=-15.46;lat+=0.003)for(let lon=-70.16;lon<=-70.105;lon+=0.003){total++;if(net.stops.some(s=>used.has(s.id)&&distance(s,{lat,lon})<=650))covered++}
  return {stops:used.size,km:net.routes.reduce((v,r)=>v+routeKm(r),0),overlap,coverage:Math.round(100*covered/total),samples:total};
}

export function scenarioNetwork(net: Network, s: Scenario): Network {
  return {...net,routes:net.routes.map(r=>r.id===s.route_id?{...r,frequency:[s.frequency,s.frequency],stops:r.stops.filter(id=>!s.removed_stops.includes(id)),inbound:r.inbound.filter(id=>!s.removed_stops.includes(id))}:r)};
}
export function compareScenario(net: Network, scenario: Scenario) {
  const changed=scenarioNetwork(net,scenario);
  const pairs=net.stops.flatMap((a,i)=>net.stops.slice(i+1).map(b=>[a,b]));
  let baseMinutes=0,newMinutes=0,baseWalk=0,newWalk=0,baseTransfers=0,newTransfers=0,count=0,lost=0,gained=0;
  for(const [a,b] of pairs){
    const before=demoPlan(net,a,b)[0],after=demoPlan(changed,a,b)[0];
    if(before&&!after)lost++;if(!before&&after)gained++;
    if(before&&after){count++;baseMinutes+=before.minutes;newMinutes+=after.minutes;baseWalk+=before.walk_meters;newWalk+=after.walk_meters;baseTransfers+=before.transfers;newTransfers+=after.transfers}
  }
  return {count,lost,gained,baseMinutes:count?baseMinutes/count:0,newMinutes:count?newMinutes/count:0,baseWalk:count?baseWalk/count:0,newWalk:count?newWalk/count:0,baseTransfers:count?baseTransfers/count:0,newTransfers:count?newTransfers/count:0,baseCoverage:networkMetrics(net).coverage,newCoverage:networkMetrics(changed).coverage};
}

export function readLocal<T>(key:string,fallback:T):T { try{return JSON.parse(localStorage.getItem(key)||'null')??fallback}catch{return fallback} }
export function writeLocal(key:string,value:unknown){localStorage.setItem(key,JSON.stringify(value))}
