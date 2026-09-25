"""Rebuild the documentary seed from the reviewed audit; no PDF OCR is trusted here."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
audit = (ROOT / 'docs/AUDITORIA_PDU_MOVILIDAD.md').read_text(encoding='utf-8')
lines = []
for row, code, name, combis, micros in re.findall(r'^\| (\d+) \| ([^|]+) \| ([^|]+) \| (\d+) \| (\d+) \|$', audit, re.M):
    lines.append(dict(id=f'pdu-line-{row}', code=code.strip(), name=name.strip(), combis=int(combis), microbuses=int(micros), page='177–178', table=95, validation='conflict', evidence='documental'))
assert len(lines) == 40
assert sum(r['combis'] for r in lines) == 1814
assert sum(r['microbuses'] for r in lines) == 155

places = []
names = [
    ('Mercado San José','commerce',184),('Las Mercedes','commerce',184),
    ('Túpac Amaru','commerce',184),('Óvalo Cusco','connection',184),
    ('Centro Comercial N.º 2','commerce',184),('Jr. Moquegua','commerce',184),
    ('Jr. San Martín','commerce',184),('Plaza Mayor','public',184),
    ('Real Plaza / Plaza Vea','commerce',184),('Santa Bárbara','commerce',185),
    ('Manco Cápac','commerce',185),('Plaza Bolognesi','public',185),
    ('Zarumilla','public',185),('Pedro Vilcapaza','commerce',185),
    ('Plaza San Miguel','public',185),('EsSalud La Capilla','health',185),
    ('Hospital Carlos Monge Medrano','health',185),
]
for i, (name, category, page) in enumerate(names):
    key = f'pdu-place-{i+1}'
    places.append(dict(id=key,name=name,category=category,groupId='complejo-real-plaza' if i in (6,8) else key,point=None,source='PDU Juliaca 2026–2035 · consulta pública',page=page,evidence='documental',validation='pending',notes='Entrada, afluencia y horario pendientes de verificar.',open=None,close=None,days=[]))
events = []
for i, (name, days, page, note) in enumerate([
    ('Ocupación permanente de vías',list(range(7)),191,'Tabla 104: 30 registros. Localizar tramos y medir efecto.'),
    ('Feria del lunes',[1],192,'Tabla 105: 4,33 km reportados; no equivalen a cierre de vías.'),
    ('Actividad comercial del sábado',[6],193,'Tabla 106: 1,4 km reportados. Horario pendiente.'),
    ('Feria del domingo',[0],194,'Tabla 107: 5,81 km reportados. Horario pendiente.'),
    ('Festividades',[],195,'Tabla 108: 3,36 km reportados. Confirmar fechas y tramos.'),
]):
    events.append(dict(id=f'pdu-event-{i+1}',name=name,source='PDU Juliaca 2026–2035 · consulta pública',page=page,days=days,start=None,end=None,routeId=None,extraCycleMinutes=None,suspended=False,evidence='documental',validation='pending',notes=note))
claims=[]
for code, page, finding, limit in re.findall(r'^\| (E\d+) \| ([^|]+) \| ([^|]+) \| ([^|]+) \|$',audit,re.M):
    claims.append(dict(id=code,reference=page.strip(),finding=finding.strip(),limit=limit.strip()))
data=dict(version='PDU-consulta-2026-audit-2026-09-18',source='PDU Juliaca 2026–2035 · IMP / Municipalidad Provincial de San Román',url='https://munisanroman.gob.pe/web/pdu-plan-de-desarrollo-urbano-juliaca/',reportedFleet=1963,calculatedFleet=1969,lines=lines,places=places,events=events,claims=claims)
(ROOT/'web/lib/pdu-catalog.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(f'{len(lines)} líneas, {len(places)} atractores, {len(events)} calendarios, {len(claims)} evidencias')
