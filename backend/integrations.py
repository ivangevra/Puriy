"""Adapters isolate provider credentials and upstream schemas from the browser."""
import os
from datetime import datetime, timezone, timedelta
from math import ceil
import httpx
from .models import Position


def position_status(data, now=None):
    now = now or datetime.now(timezone.utc)
    age = (now - datetime.fromisoformat(data['timestamp'].replace('Z','+00:00'))).total_seconds()
    return {**data, 'stale': age > 90 or age < -30, 'age_seconds': max(0, round(age)), 'eta_minutes': None}


async def fetch_provider():
    url = os.getenv('GPS_PROVIDER_URL')
    if not url:
        raise ValueError('Proveedor GPS aún no configurado')
    if not url.startswith('https://'):
        raise ValueError('El proveedor GPS debe usar HTTPS')
    # Contract: normalized list. A vendor-specific translator belongs here.
    async with httpx.AsyncClient(timeout=15, follow_redirects=False) as client:
        response = await client.get(url, headers={'Authorization': f"Bearer {os.getenv('GPS_PROVIDER_TOKEN', '')}"})
        response.raise_for_status()
        payload = response.json()
    if not isinstance(payload,list) or len(payload)>10000:
        raise ValueError('Respuesta GPS incompatible con el contrato normalizado')
    return [Position.model_validate(row) for row in payload]


OTP_QUERY = '''query Trip($from: InputCoordinates!, $to: InputCoordinates!, $date: String!, $time: String!) {
  plan(from:$from, to:$to, date:$date, time:$time, numItineraries:6, maxTransfers:1,
       transportModes:[{mode:WALK},{mode:TRANSIT}], locale:"es") {
    itineraries { duration walkDistance legs { mode duration distance
      from { name lat lon stop { gtfsId } } to { name lat lon stop { gtfsId } }
      route { gtfsId shortName } trip { directionId }
      legGeometry { points }
    } }
  }
}'''


async def otp_plan(req, network):
    url = os.getenv('OTP_URL')
    if not url:
        raise ValueError('Planificador real no configurado. Falta una red GTFS y peatonal validada.')
    local = req.departure.astimezone(timezone(timedelta(hours=-5)))
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(url, json={'query':OTP_QUERY,'variables':{
            'from':req.origin.model_dump(),'to':req.destination.model_dump(),
            'date':local.strftime('%Y-%m-%d'),'time':local.strftime('%H:%M:%S')}})
        response.raise_for_status()
        body = response.json()
    if body.get('errors'):
        raise ValueError('El contrato de OpenTripPlanner no coincide. Revisar versión y grafo.')
    routes = {r['id']:r for r in network['routes']}
    results=[]
    for idx,item in enumerate(body['data']['plan']['itineraries']):
        legs=[]
        walk_geometry=[]
        for leg in item['legs']:
            if leg['mode']=='WALK':
                walk_geometry.append(leg['legGeometry']['points']);continue
            rid=leg['route']['gtfsId'].split(':')[-1]
            if rid not in routes:
                raise ValueError('La red OTP y el catálogo de rutas no coinciden')
            def place(p):
                return {'id':(p.get('stop') or {}).get('gtfsId',p['name']).split(':')[-1], 'name':p['name'],'lat':p['lat'],'lon':p['lon'],'kind':'observed'}
            start,end=place(leg['from']),place(leg['to'])
            legs.append({'route_id':rid,'direction':int((leg.get('trip') or {}).get('directionId') or 0),'from':start,'to':end,'stops':[start,end],'minutes':ceil(leg['duration']/60),'wait':None,'fare':routes[rid]['fare'],'geometry':leg['legGeometry']['points']})
        if legs:
            results.append({'id':f'otp-{idx}','legs':legs,'minutes':ceil(item['duration']/60),'walk_meters':round(item['walkDistance']),'transfers':len(legs)-1,'fare':sum(l['fare'] for l in legs),'mode':'scheduled','walk_geometry':walk_geometry,'warning':'Estimación del servicio planificado, no llegada GPS.'})
    key={'fastest':lambda o:o['minutes'],'walk':lambda o:o['walk_meters'],'transfers':lambda o:(o['transfers'],o['minutes'])}[req.preference]
    return sorted(results,key=key)[:3]
