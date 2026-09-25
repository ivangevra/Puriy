"""Synthetic network planner. Never used as a walking router in production."""
from math import radians, sin, cos, asin, sqrt, ceil
from datetime import timedelta, timezone
from copy import deepcopy


def distance(a, b):
    lat1, lat2 = radians(a['lat']), radians(b['lat'])
    return 6371000 * 2 * asin(min(1, sqrt(sin((lat2-lat1)/2)**2 + cos(lat1)*cos(lat2)*sin(radians(b['lon']-a['lon'])/2)**2)))


def plan(network, origin, destination, departure, preference='fastest'):
    stops = {s['id']: s for s in network['stops']}
    local = departure.astimezone(timezone(timedelta(hours=-5)))
    clock = local.strftime('%H:%M')
    variants = [(r, d, r['stops'] if d == 0 else r['inbound']) for r in network['routes'] if r['status'] != 'proposal' and r['start'] <= clock < r['end'] for d in (0, 1)]
    options = []

    def ride(r, d, ids, i, j):
        chain = [stops[s] for s in ids[i:j+1]]
        meters = sum(distance(a,b) for a,b in zip(chain, chain[1:]))
        return {'route_id':r['id'], 'direction':d, 'from':chain[0], 'to':chain[-1], 'stops':chain, 'minutes':ceil(meters/250)+(j-i), 'wait':sum(r['frequency'])/4, 'fare':r['fare']}

    def emit(legs):
        walk = distance(origin, legs[0]['from']) + distance(legs[-1]['to'], destination)
        minutes = ceil(walk/70 + sum(l['minutes']+l['wait'] for l in legs))
        if any((local + timedelta(minutes=minutes)).strftime('%H:%M') > next(r['end'] for r in network['routes'] if r['id']==l['route_id']) for l in legs):
            return
        options.append({'id':'-'.join(f"{l['route_id']}.{l['direction']}.{l['from']['id']}.{l['to']['id']}" for l in legs), 'legs':legs, 'minutes':minutes, 'walk_meters':round(walk), 'transfers':len(legs)-1, 'fare':sum(l['fare'] for l in legs), 'mode':'demo', 'warning':'Recorridos y caminatas de demostración; no usar como guía de viaje.'})

    for r,d,ids in variants:
        for i, sid in enumerate(ids[:-1]):
            if distance(origin,stops[sid]) > 650: continue
            for j in range(i+1,len(ids)):
                if distance(destination,stops[ids[j]]) <= 650:
                    emit([ride(r,d,ids,i,j)])
                for r2,d2,ids2 in variants:
                    if r2['id']==r['id'] or ids[j] not in ids2: continue
                    k=ids2.index(ids[j])
                    for end in range(k+1,len(ids2)):
                        if distance(destination,stops[ids2[end]]) <= 650:
                            emit([ride(r,d,ids,i,j),ride(r2,d2,ids2,k,end)])
    keys={'fastest':lambda o:(o['minutes'],o['transfers'],o['walk_meters']), 'walk':lambda o:(o['walk_meters'],o['minutes']), 'transfers':lambda o:(o['transfers'],o['minutes'])}
    options.sort(key=keys[preference])
    unique=[]
    seen=set()
    for o in options:
        signature=tuple((l['route_id'],l['direction']) for l in o['legs'])
        if signature not in seen:
            unique.append(o); seen.add(signature)
    return unique[:3]


def compare(network, scenario):
    before=deepcopy(network)
    after=deepcopy(network)
    route=next(r for r in after['routes'] if r['id']==scenario['route_id'])
    route['frequency']=[scenario['frequency']]*2
    removed=set(scenario['removed_stops'])
    route['stops']=[s for s in route['stops'] if s not in removed]
    route['inbound']=[s for s in route['inbound'] if s not in removed]
    # This scenario changes boarding stops, not road geometry. Label that limitation.
    return before,after
