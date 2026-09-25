import os
import secrets
import uuid
from datetime import datetime, timezone
from contextlib import asynccontextmanager
from typing import Literal
from fastapi import FastAPI, Depends, HTTPException, Header, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import text
from . import storage
from .models import Network, PlanRequest, Position, Report, Observation, Scenario
from .planner import plan, compare
from .integrations import position_status, fetch_provider, otp_plan
from .gtfs import gtfs_zip
from .spatial import sync_network
from . import lab
from . import auth

DEMO_MODE=os.getenv('DEMO_MODE','true').lower()=='true'


@asynccontextmanager
async def lifespan(app):
    storage.Base.metadata.create_all(storage.engine)
    if storage.engine.dialect.name=='postgresql':
        with storage.engine.begin() as conn:
            conn.exec_driver_sql((storage.ROOT/'backend/migrations/001_spatial.sql').read_text())
    yield


app=FastAPI(title='Puriy',version='0.1.0',lifespan=lifespan)
app.add_middleware(CORSMiddleware,allow_origins=os.getenv('CORS_ORIGINS','http://localhost:5173,http://127.0.0.1:5173').split(','),allow_methods=['GET','POST','PATCH','PUT'],allow_headers=['Content-Type','Authorization'])
app.include_router(auth.router)


@app.middleware('http')
async def protect(request:Request, call_next):
    if request.method in ('POST','PATCH'):
        body=await request.body()
        if len(body)>2_000_000:return Response('Payload too large',status_code=413)
    response=await call_next(request)
    response.headers['X-Content-Type-Options']='nosniff'
    if request.url.path.startswith('/api/admin') or request.url.path in ('/api/positions','/api/plan'):
        response.headers['Cache-Control']='no-store'
    return response


def admin(authorization:str=Header(default='')):
    if not authorization.startswith('Bearer '):
        raise HTTPException(401,'Inicia sesión para continuar.')
    raw=authorization[7:]
    user=auth.resolve_session(raw)
    if user and user.get('role')=='admin':
        return
    # Legacy API fixtures can opt into a private test token. This path is
    # disabled in normal deployments and never exposed in the web UI.
    if os.getenv('ALLOW_ADMIN_TOKEN_FOR_TESTS')=='true':
        token=os.getenv('ADMIN_TOKEN','')
        if len(token)>=24 and secrets.compare_digest(raw,token):
            return
    raise HTTPException(403,'Tu cuenta no tiene permisos de administración.')


def network():
    net=storage.get('network')
    if not net:return {'stops':[], 'routes':[]}
    if not DEMO_MODE and any(r['status']=='demo' for r in net['routes']):
        raise HTTPException(503,'La red de demostración no puede publicarse en modo real')
    return net


@app.get('/api/admin/lab/state', dependencies=[Depends(admin)])
def get_lab_state():
    return lab.load()


@app.post('/api/admin/lab/state', dependencies=[Depends(admin)])
def save_lab_state(payload:lab.LabState):
    return lab.save(payload)


@app.get('/api/health')
def health():
    with storage.engine.connect() as c:c.execute(text('SELECT 1'))
    return {'status':'ok','mode':'demo' if DEMO_MODE else 'real','otp_configured':bool(os.getenv('OTP_URL')),'gps_configured':bool(os.getenv('GPS_PROVIDER_URL'))}


@app.get('/api/network')
def get_network():return network()


@app.get('/api/routes')
def routes():return network()['routes']


@app.get('/api/routes/{route_id}')
def route(route_id:str):
    item=next((r for r in network()['routes'] if r['id']==route_id),None)
    if not item:raise HTTPException(404,'Ruta no encontrada')
    return item


@app.post('/api/plan')
async def plan_trip(req:PlanRequest):
    net=network()
    if DEMO_MODE:
        result=plan(net,req.origin.model_dump(),req.destination.model_dump(),req.departure,req.preference)
    else:
        try:result=await otp_plan(req,net)
        except Exception:raise HTTPException(503,'El planificador real no está disponible. Revisa la conexión y la red OTP.')
    return {'itineraries':result,'mode':'demo' if DEMO_MODE else 'scheduled','source':'Red sintética' if DEMO_MODE else 'OpenTripPlanner'}


@app.get('/api/positions')
def positions():return [position_status(p) for p in storage.records('positions') if not p.get('simulated') and (datetime.now(timezone.utc)-datetime.fromisoformat(p['timestamp'])).total_seconds()<86400]


@app.get('/api/arrivals/{route_id}/{stop_id}')
def arrivals(route_id:str,stop_id:str):
    r=route(route_id)
    if stop_id not in r['stops']+r['inbound']:raise HTTPException(404,'Punto fuera de la ruta')
    return {'route_id':route_id,'stop_id':stop_id,'eta_minutes':None,'frequency':r['frequency'],'source':r['source'],'reason':'Predicciones pendientes de calibración y validación en campo'}


@app.get('/api/alerts')
def alerts():return [a for a in storage.records('alerts') if a['active']]


@app.post('/api/reports',status_code=201)
def report(item:Report,request:Request):
    route(item.route_id)
    # Moderation is mandatory; no personal location or identity fields.
    key=str(uuid.uuid4());data={**item.model_dump(),'status':'pending','created_at':datetime.now(timezone.utc).isoformat()}
    storage.save(key,'reports',data)
    return {'id':key,'status':'pending'}


@app.get('/api/admin/status',dependencies=[Depends(admin)])
def admin_status():return {'authenticated':True}


@app.post('/api/admin/network/import',dependencies=[Depends(admin)])
def import_network(net:Network):
    data=net.model_dump()
    if any(r.status=='proposal' for r in net.routes):raise HTTPException(422,'Las propuestas no pueden importarse a la red pública')
    if not DEMO_MODE and any(r.status=='demo' for r in net.routes):raise HTTPException(422,'No se permiten datos de demostración en modo real')
    with storage.Session.begin() as s:
        old=s.get(storage.Record,'network')
        if old:
            s.add(storage.Record(id=str(uuid.uuid4()),kind='network_versions',data=old.data));old.data=data
        else:s.add(storage.Record(id='network',kind='network',data=data))
        sync_network(s,data)
    return {'routes':len(net.routes),'stops':len(net.stops),'status':'imported'}


@app.get('/api/admin/{kind}',dependencies=[Depends(admin)])
def admin_records(kind:Literal['reports','observations','scenarios','network_versions','alerts']):return storage.records(kind)


class ReportDecision(BaseModel):
    status:Literal['reviewed','dismissed']


@app.patch('/api/admin/reports/{key}',dependencies=[Depends(admin)])
def review(key:str,item:ReportDecision):
    old=storage.get(key)
    if not old or 'category' not in old:raise HTTPException(404,'Reporte inexistente')
    storage.save(key,'reports',{**old,'status':item.status})
    return {'id':key,'status':item.status}


@app.post('/api/admin/observations',dependencies=[Depends(admin)],status_code=201)
def observation(item:Observation):
    ids={s['id'] for s in network()['stops']}
    if item.stop_id not in ids or (item.destination_stop_id and item.destination_stop_id not in ids):raise HTTPException(422,'Punto de observación o destino inexistente')
    if item.observed_at.tzinfo is None:raise HTTPException(422,'Incluye zona horaria en la observación')
    key=str(uuid.uuid4());storage.save(key,'observations',item.model_dump(mode='json'));return {'id':key}


@app.post('/api/admin/scenarios',dependencies=[Depends(admin)],status_code=201)
def scenario(item:Scenario):
    r=route(item.route_id)
    if not set(item.removed_stops)<=set(r['stops']+r['inbound']):raise HTTPException(422,'La propuesta contiene puntos ajenos a la ruta')
    if any(s in item.removed_stops for s in [r['stops'][0],r['stops'][-1],r['inbound'][0],r['inbound'][-1]]):raise HTTPException(422,'Se deben conservar los extremos del recorrido')
    key=str(uuid.uuid4());storage.save(key,'scenarios',item.model_dump());return {'id':key}


def ingest(items):
    ids={r['id'] for r in network()['routes']}
    if any(p.route_id not in ids for p in items):raise HTTPException(422,'Hay posiciones de rutas no registradas')
    count=0
    with storage.Session.begin() as s:
        for p in items:
            key=f'position-{p.vehicle_id}';old=s.get(storage.Record,key)
            if old and datetime.fromisoformat(old.data['timestamp'])>=p.timestamp:continue
            data=p.model_dump(mode='json')
            if old:old.data=data
            else:s.add(storage.Record(id=key,kind='positions',data=data))
            s.add(storage.Record(id=str(uuid.uuid4()),kind='gps_history',data=data));count+=1
    return {'accepted':count}


@app.post('/api/admin/gps/positions',dependencies=[Depends(admin)])
def ingest_positions(items:list[Position]):
    if len(items)>10000:raise HTTPException(422,'Demasiadas posiciones')
    return ingest(items)


@app.post('/api/admin/gps/sync',dependencies=[Depends(admin)])
async def sync_gps():
    try:return ingest(await fetch_provider())
    except HTTPException:raise
    except Exception:raise HTTPException(503,'No se pudo sincronizar el proveedor. Revisa el contrato y acceso en el servidor.')


class Alert(BaseModel):
    route_id:str
    title:str=Field(min_length=5,max_length=150)
    description:str=Field(min_length=10,max_length=1000)
    source:str=Field(min_length=3,max_length=200)
    active:bool=True


@app.post('/api/admin/alerts',dependencies=[Depends(admin)])
def create_alert(item:Alert):
    route(item.route_id);key=str(uuid.uuid4());storage.save(key,'alerts',{**item.model_dump(),'updated_at':datetime.now(timezone.utc).isoformat()});return {'id':key}


@app.get('/api/admin/export/gtfs',dependencies=[Depends(admin)])
def export_gtfs():
    if not DEMO_MODE:raise HTTPException(409,'Este exportador usa tiempos sintéticos. Para servicio real importa un GTFS validado con calendario y tiempos observados.')
    return Response(gtfs_zip(network()),media_type='application/zip',headers={'Content-Disposition':'attachment; filename=juliaca-DEMO-gtfs.zip'})


@app.get('/api/gtfs-rt/vehicles')
def realtime():
    from google.transit import gtfs_realtime_pb2
    feed=gtfs_realtime_pb2.FeedMessage();feed.header.gtfs_realtime_version='2.0';feed.header.timestamp=int(datetime.now(timezone.utc).timestamp())
    for p in positions():
        if p['stale']:continue
        e=feed.entity.add();e.id=p['vehicle_id'];e.vehicle.vehicle.id=p['vehicle_id'];e.vehicle.trip.route_id=p['route_id'];e.vehicle.trip.direction_id=p['direction'];e.vehicle.position.latitude=p['lat'];e.vehicle.position.longitude=p['lon'];e.vehicle.timestamp=int(datetime.fromisoformat(p['timestamp']).timestamp())
    return Response(feed.SerializeToString(),media_type='application/x-protobuf')

class WorkspacePayload(BaseModel):
    publications: list[dict] = Field(default_factory=list, max_length=100)
    signals: list[dict] = Field(default_factory=list, max_length=1000)

    @classmethod
    def checked(cls, payload):
        ids=set()
        for item in payload.publications:
            d=item.get('draft',{})
            if not isinstance(d.get('id'),str) or d['id'] in ids:
                raise HTTPException(422,'Identificador de ruta inválido o duplicado')
            ids.add(d['id'])
            for key in ('outbound','inbound'):
                coords=d.get(key,[])
                if not isinstance(coords,list) or len(coords)>1000:
                    raise HTTPException(422,'Geometría inválida')
                for p in coords:
                    if not isinstance(p,list) or len(p)!=2 or not all(isinstance(v,(int,float)) for v in p) or not (-180<=p[0]<=180 and -90<=p[1]<=90):
                        raise HTTPException(422,'Coordenadas inválidas')
        return payload.model_dump()


@app.get('/api/admin/workspace/state', dependencies=[Depends(admin)])
def admin_workspace():
    return storage.get('workspace') or {'publications':[], 'signals':[]}


@app.post('/api/admin/workspace/state', dependencies=[Depends(admin)])
def save_workspace(payload:WorkspacePayload):
    data=WorkspacePayload.checked(payload)
    storage.save('workspace','workspace',data)
    return data


@app.get('/api/public/workspace')
def public_workspace():
    data=storage.get('workspace') or {'publications':[]}
    # Only owner-reviewed services are exposed; signal cycles remain internal.
    publications=[]
    for item in data.get('publications',[]):
        if item.get('draft',{}).get('passengerVisible') is True:
            d=dict(item['draft'])
            for field in ('notes','risks','checks'):
                d[field]=[] if field=='checks' else ''
            publications.append({**item,'draft':d})
    return {'publications':publications,'signals':[]}
