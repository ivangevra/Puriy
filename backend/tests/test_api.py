import os
import tempfile
from pathlib import Path
os.environ['DATABASE_URL']='sqlite:///'+str(Path(tempfile.mkdtemp())/'test.db')
os.environ['ADMIN_TOKEN']='test-only-admin-token-long-enough'
from datetime import datetime, timezone, timedelta
from copy import deepcopy
import io
import zipfile
import json
import pytest
from fastapi.testclient import TestClient
from backend.main import app
from backend import storage
from backend.planner import plan
from backend.integrations import position_status

AUTH={'Authorization':'Bearer '+os.environ['ADMIN_TOKEN']}
NET=json.loads((Path(__file__).resolve().parents[2]/'web/lib/network.json').read_text(encoding='utf-8'))
STOPS={s['id']:s for s in NET['stops']}
PAIRS=[pair for r in NET['routes'] for sid in r['stops'][1:] for pair in [(r['stops'][0],sid),(sid,r['stops'][0])]][:30]


def test_lab_private_persistence_revision_and_public_isolation(client):
    assert client.get('/api/admin/lab/state').status_code == 401
    before=client.get('/api/network').json()
    state=client.get('/api/admin/lab/state',headers=AUTH).json()
    assert len(state['places']) == 17
    state['places'][0]['notes']='Observación documental de prueba'
    saved=client.post('/api/admin/lab/state',headers=AUTH,json=state)
    assert saved.status_code == 200, saved.text
    assert saved.json()['revision'] == state['revision']+1
    assert client.get('/api/admin/lab/state',headers=AUTH).json()['places'][0]['notes'] == 'Observación documental de prueba'
    assert client.post('/api/admin/lab/state',headers=AUTH,json=state).status_code == 409
    assert client.get('/api/network').json() == before
    assert 'places' not in client.get('/api/public/workspace').json()


@pytest.mark.parametrize('change', ['duplicate','unlocated','window','coordinates','links','event'])
def test_lab_rejects_malformed_data_atomically(client,change):
    before=client.get('/api/admin/lab/state',headers=AUTH).json()
    data=deepcopy(before)
    if change=='duplicate': data['places'].append(data['places'][0])
    if change=='unlocated': data['places'][0]['point']={'lat':-15.49}
    if change=='window': data['places'][0]['open']='28:30'
    if change=='coordinates': data['places'][0]['point']={'lat':100,'lon':-70}
    if change=='links': data['walking']={'source':'Test','date':'2026-09-18','links':[{'from':'a','to':'b','meters':-1}]}
    if change=='event': data['events'][0]['validation']='reviewed'
    response=client.post('/api/admin/lab/state',headers=AUTH,json=data)
    assert response.status_code==422,response.text
    assert client.get('/api/admin/lab/state',headers=AUTH).json()==before


def test_lab_preserves_private_candidate_geometry(client):
    before=client.get('/api/admin/lab/state',headers=AUTH).json()
    candidate=dict(version=1,id='lab-candidate',name='Alternativa de prueba',code='TEST',color='#357cb7',source='Prueba de persistencia',observedAt='',boarding='',risks='',notes='',checks=[],updatedAt='2026-09-18T07:00:00-05:00',routingMode='manual',outbound=[[-70.13,-15.49],[-70.14,-15.50]],inbound=[[-70.14,-15.50],[-70.13,-15.49]])
    response=client.post('/api/admin/lab/state',headers=AUTH,json={**before,'candidates':[candidate]})
    assert response.status_code==200,response.text
    assert response.json()['candidates'][0]['outbound']==candidate['outbound']
    state=response.json();state['candidates'][0]['passengerVisible']=True
    assert client.post('/api/admin/lab/state',headers=AUTH,json=state).status_code==422
    assert 'candidates' not in client.get('/api/public/workspace').json()


@pytest.fixture
def client():
    with TestClient(app) as c:
        storage.save('network', 'network', NET)
        yield c


def test_empty_network_has_no_example_routes(client):
    storage.delete('network')
    assert client.get('/api/network').json() == {'stops': [], 'routes': []}
    assert client.get('/api/routes').json() == []


@pytest.mark.parametrize('origin,dest',PAIRS)
def test_30_reference_trips(origin,dest):
    result=plan(NET,STOPS[origin],STOPS[dest],datetime(2026,9,6,15,tzinfo=timezone.utc))
    assert 1<=len(result)<=3
    for trip in result:
        assert trip['minutes']>0 and trip['transfers']<=1
        for leg in trip['legs']:
            route=next(r for r in NET['routes'] if r['id']==leg['route_id'])
            ids=route['stops'] if leg['direction']==0 else route['inbound']
            assert ids.index(leg['from']['id'])<ids.index(leg['to']['id'])


def test_no_service_and_coverage():
    assert plan(NET,STOPS['plaza'],STOPS['puno'],datetime(2026,9,6,7,tzinfo=timezone.utc))==[]
    assert plan(NET,{'lat':0,'lon':0},STOPS['puno'],datetime(2026,9,6,15,tzinfo=timezone.utc))==[]


def test_admin_protected_and_report_moderated(client):
    assert client.get('/api/admin/reports').status_code==401
    r=client.post('/api/reports',json={'route_id':'D01','category':'incident','description':'Una observación de prueba sin datos personales'})
    assert r.status_code==201 and r.json()['status']=='pending'
    key=r.json()['id']
    assert client.patch('/api/admin/reports/'+key,json={'status':'reviewed'},headers=AUTH).status_code==200
    assert client.get('/api/routes/D01').json()==NET['routes'][0]


def test_atomic_import_and_proposal_isolation(client):
    before=client.get('/api/network').json()
    bad=deepcopy(before);bad['routes'][0]['stops'][0]='missing'
    assert client.post('/api/admin/network/import',json=bad,headers=AUTH).status_code==422
    assert client.get('/api/network').json()==before
    proposal={'name':'Hipótesis de prueba','route_id':'D01','frequency':4,'removed_stops':[],'source':'test'}
    assert client.post('/api/admin/scenarios',json=proposal,headers=AUTH).status_code==201
    assert client.get('/api/network').json()==before
    bad=deepcopy(before);bad['routes'][0]['status']='proposal'
    assert client.post('/api/admin/network/import',json=bad,headers=AUTH).status_code==422


def test_gps_timestamp_and_staleness(client):
    now=datetime.now(timezone.utc)
    p={'vehicle_id':'test','route_id':'D01','direction':0,'lat':-15.49,'lon':-70.13,'timestamp':(now-timedelta(seconds=91)).isoformat(),'source':'test','simulated':False}
    assert position_status(p,now)['stale']
    assert client.post('/api/admin/gps/positions',json=[p],headers=AUTH).status_code==200
    assert client.get('/api/positions').json()[0]['stale']
    p['timestamp']=(now+timedelta(hours=1)).isoformat()
    assert client.post('/api/admin/gps/positions',json=[p],headers=AUTH).status_code==422
    assert client.get('/api/arrivals/D01/plaza').json()['eta_minutes'] is None


def test_observation_and_gtfs(client):
    data={'stop_id':'plaza','observed_at':'2026-09-06T10:00:00-05:00','passengers':12,'vehicles':3,'minutes':30,'source':'Test field team'}
    assert client.post('/api/admin/observations',json=data,headers=AUTH).status_code==201
    data['vehicles']=-1
    assert client.post('/api/admin/observations',json=data,headers=AUTH).status_code==422
    response=client.get('/api/admin/export/gtfs',headers=AUTH)
    assert response.status_code==200
    with zipfile.ZipFile(io.BytesIO(response.content)) as z:
        assert {'agency.txt','routes.txt','trips.txt','stop_times.txt','calendar.txt','frequencies.txt','shapes.txt','stops.txt'}<=set(z.namelist())
        assert 'DEMO' in z.read('agency.txt').decode()


def test_real_mode_never_uses_demo(client,monkeypatch):
    import backend.main as main
    monkeypatch.setattr(main,'DEMO_MODE',False)
    assert client.get('/api/network').status_code==503


def test_sqlite_backup_restore(client,tmp_path):
    import sqlite3
    from backend import storage
    path=storage.DATABASE_URL.removeprefix('sqlite:///')
    backup=tmp_path/'backup.db'
    with sqlite3.connect(path) as source,sqlite3.connect(backup) as dest:source.backup(dest)
    with sqlite3.connect(backup) as restored:
        assert restored.execute("SELECT count(*) FROM records WHERE kind='network'").fetchone()[0]==1
        assert restored.execute('PRAGMA integrity_check').fetchone()[0]=='ok'


def test_workspace_requires_admin_and_filters_passenger_publications(client):
    assert client.post('/api/admin/workspace/state',json={}).status_code==401
    assert client.get('/api/admin/workspace/state').status_code==401
    draft={'id':'private','outbound':[[0,0],[0,1]],'inbound':[]}
    visible={**draft,'id':'visible','passengerVisible':True,'source':'Campo','service':{'headway':10,'start':'06:00','end':'20:00','fare':1.5},'notes':'private note'}
    data={'publications':[{'draft':draft},{'draft':visible}],'signals':[{'id':'signal'}]}
    assert client.post('/api/admin/workspace/state',json=data,headers=AUTH).status_code==200
    public=client.get('/api/public/workspace').json()
    assert len(public['publications'])==1
    assert public['publications'][0]['draft']['notes']==''
    assert public['signals']==[]
    assert len(client.get('/api/admin/workspace/state',headers=AUTH).json()['publications'])==2
    bad={'publications':[{'draft':{**visible,'outbound':[[0,200]]}}]}
    assert client.post('/api/admin/workspace/state',json=bad,headers=AUTH).status_code==422
    minimal={'publications':[{'draft':{**draft,'id':'minimal','passengerVisible':True}}]}
    assert client.post('/api/admin/workspace/state',json=minimal,headers=AUTH).status_code==200
    public=client.get('/api/public/workspace').json()
    assert [p['draft']['id'] for p in public['publications']]==['minimal']
