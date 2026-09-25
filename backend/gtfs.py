import csv
import io
import zipfile
from datetime import date, timedelta
from .planner import distance


def gtfs_zip(network, demo=True):
    tables={}
    tables['agency.txt']=[['agency_id','agency_name','agency_url','agency_timezone'],['juliaca','Juliaca DEMOSTRACIÓN' if demo else 'Red Juliaca','https://www.gob.pe/munisanroman','America/Lima']]
    tables['stops.txt']=[['stop_id','stop_name','stop_lat','stop_lon']]+[[s['id'],s['name'],s['lat'],s['lon']] for s in network['stops']]
    tables['routes.txt']=[['route_id','agency_id','route_short_name','route_long_name','route_type','route_color']]+[[r['id'],'juliaca',r['code'],r['name'],3,r['color'][1:]] for r in network['routes']]
    today=date.today()
    tables['calendar.txt']=[['service_id','monday','tuesday','wednesday','thursday','friday','saturday','sunday','start_date','end_date'],['daily',1,1,1,1,1,1,1,today.strftime('%Y%m%d'),(today+timedelta(days=90)).strftime('%Y%m%d')]]
    tables['trips.txt']=[['route_id','service_id','trip_id','trip_headsign','direction_id','shape_id']]
    tables['stop_times.txt']=[['trip_id','arrival_time','departure_time','stop_id','stop_sequence']]
    tables['shapes.txt']=[['shape_id','shape_pt_lat','shape_pt_lon','shape_pt_sequence']]
    tables['frequencies.txt']=[['trip_id','start_time','end_time','headway_secs','exact_times']]
    stops={s['id']:s for s in network['stops']}
    def hhmm(seconds):return f'{seconds//3600:02}:{seconds%3600//60:02}:{seconds%60:02}'
    for r in network['routes']:
        for d in (0,1):
            trip=f"{r['id']}-{d}"
            ids=r['stops'] if d==0 else r['inbound']
            tables['trips.txt'].append([r['id'],'daily',trip,stops[ids[-1]]['name'],d,trip])
            elapsed=0
            for i,sid in enumerate(ids):
                if i: elapsed+=round(distance(stops[ids[i-1]],stops[sid])/250*60)+60
                tables['stop_times.txt'].append([trip,hhmm(elapsed),hhmm(elapsed),sid,i+1])
            geometry=r['geometry'] if d==0 else r['inbound_geometry']
            for i,p in enumerate(geometry):tables['shapes.txt'].append([trip,p[1],p[0],i+1])
            end=int(r['end'][:2])*3600+int(r['end'][3:])*60-elapsed
            tables['frequencies.txt'].append([trip,r['start']+':00',hhmm(end),round(sum(r['frequency'])/2*60),0])
    buf=io.BytesIO()
    with zipfile.ZipFile(buf,'w',zipfile.ZIP_DEFLATED) as archive:
        for name,rows in tables.items():
            stream=io.StringIO(newline='');csv.writer(stream).writerows(rows);archive.writestr(name,stream.getvalue())
    return buf.getvalue()
