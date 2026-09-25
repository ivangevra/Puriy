import json
from sqlalchemy import text


def sync_network(session, network):
    """Run inside the same publication transaction as the versioned JSON catalog."""
    if session.bind.dialect.name!='postgresql':return
    session.execute(text('DELETE FROM route_geometries'))
    session.execute(text('DELETE FROM boarding_points'))
    for route in network['routes']:
        for direction,key in [(0,'geometry'),(1,'inbound_geometry')]:
            session.execute(text('INSERT INTO route_geometries(route_id,direction,shape,source) VALUES (:id,:direction,ST_SetSRID(ST_GeomFromGeoJSON(:geo),4326),:source)'),{'id':route['id'],'direction':direction,'geo':json.dumps({'type':'LineString','coordinates':route[key]}),'source':route['source']})
    for stop in network['stops']:
        session.execute(text('INSERT INTO boarding_points(stop_id,name,kind,location) VALUES (:id,:name,:kind,ST_SetSRID(ST_MakePoint(:lon,:lat),4326))'),stop)
