"""Private, versioned mobility studies. This module never writes the public network."""
from typing import Literal
from datetime import datetime
from pathlib import Path
import json
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import update
from sqlalchemy.exc import IntegrityError
from fastapi import HTTPException
from . import storage


class Model(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False, str_max_length=2000, strict=True)


class Point(Model):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)


class Evidence(Model):
    id: str = Field(min_length=1, max_length=160)
    name: str = Field(min_length=1, max_length=160)
    source: str = Field(min_length=1)
    page: int | None = Field(default=None, ge=1, le=10000)
    evidence: Literal['documental','observed','assumption']
    validation: Literal['pending','reviewed','conflict']
    notes: str = ''
    days: list[int] = Field(max_length=7)

    @model_validator(mode='after')
    def valid_days(self):
        if len(set(self.days)) != len(self.days) or any(d not in range(7) for d in self.days):
            raise ValueError('Días inválidos')
        return self


def valid_window(start, end):
    import re
    return (start is None and end is None) or (isinstance(start,str) and isinstance(end,str) and re.fullmatch(r'([01]\d|2[0-3]):[0-5]\d', start) and re.fullmatch(r'([01]\d|2[0-3]):[0-5]\d', end) and start < end)


class Place(Evidence):
    category: Literal['commerce','health','education','connection','public']
    groupId: str = Field(min_length=1, max_length=160)
    point: Point | None
    open: str | None
    close: str | None

    @model_validator(mode='after')
    def window(self):
        if not valid_window(self.open, self.close) or (self.open and not self.days):
            raise ValueError('Horario de destino inválido')
        return self


class Event(Evidence):
    start: str | None
    end: str | None
    routeId: str | None = Field(max_length=160)
    extraCycleMinutes: float | None = Field(ge=0, le=300)
    suspended: bool

    @model_validator(mode='after')
    def window(self):
        if not valid_window(self.start, self.end):
            raise ValueError('Horario de afectación inválido')
        if self.validation == 'reviewed' and (not self.routeId or not self.days or self.start is None or (self.extraCycleMinutes is None and not self.suspended)):
            raise ValueError('Afectación revisada incompleta')
        return self


class Boarding(Point):
    id: str = Field(min_length=1, max_length=160)
    name: str = Field(min_length=1, max_length=160)
    routeId: str = Field(min_length=1, max_length=160)
    direction: Literal[0,1]
    source: str = Field(min_length=1)


class Observation(Model):
    id: str = Field(min_length=1, max_length=160)
    routeId: str = Field(min_length=1, max_length=160)
    date: str = Field(min_length=1, max_length=40)
    phase: Literal['before','after']
    minutes: float = Field(ge=1, le=1440)
    vehicles: int = Field(ge=0, le=100000)
    boardings: int = Field(ge=0, le=100000)
    cycleMinutes: float | None = Field(ge=1, le=1000)
    headways: list[float] = Field(max_length=200)
    source: str = Field(min_length=1)
    notes: str

    @model_validator(mode='after')
    def valid_observation(self):
        datetime.fromisoformat(self.date.replace('Z','+00:00'))
        if any(not 0.1 <= h <= 180 for h in self.headways):
            raise ValueError('Intervalos inválidos')
        return self


class Study(Model):
    name: str = Field(min_length=1, max_length=120)
    routeId: str = Field(min_length=1, max_length=160)
    alternativeId: str = Field(min_length=1, max_length=160)
    day: int = Field(ge=0, le=6)
    hour: str = Field(pattern=r'^([01]\d|2[0-3]):[0-5]\d$')
    fleet: int = Field(ge=1, le=500)
    reserve: int = Field(ge=0, le=499)
    capacity: int = Field(ge=1, le=150)
    speedKmh: float = Field(ge=3, le=60)
    layoverMinutes: float = Field(ge=0, le=180)
    baseHeadway: float = Field(ge=1, le=180)
    proposedHeadway: float = Field(ge=1, le=180)
    walkMeters: float = Field(ge=50, le=2000)
    walkSpeedKmh: float = Field(ge=1, le=7)
    thresholdMinutes: float = Field(ge=5, le=180)
    peakLoadPerHour: float | None = Field(ge=0, le=100000)
    costPerKm: float = Field(ge=0, le=1000)
    costPerHour: float = Field(ge=0, le=10000)
    fare: float = Field(ge=0, le=100)
    removedStops: list[str] = Field(max_length=200)
    source: str = Field(min_length=1)
    applyEvents: bool
    accessMode: Literal['radius','paths']

    @model_validator(mode='after')
    def resources(self):
        if self.reserve >= self.fleet or len(set(self.removedStops)) != len(self.removedStops) or any(not s or len(s)>160 for s in self.removedStops):
            raise ValueError('Reserva o abordajes inválidos')
        return self


class WalkLink(Model):
    from_: str = Field(alias='from', min_length=1, max_length=200)
    to: str = Field(min_length=1, max_length=200)
    meters: float = Field(ge=0, le=100000)


class Walking(Model):
    source: str = Field(min_length=1)
    date: str = Field(min_length=1, max_length=40)
    pointFingerprint: str = Field(min_length=1, max_length=100)
    links: list[WalkLink] = Field(max_length=30000)

    @model_validator(mode='after')
    def valid_links(self):
        datetime.fromisoformat(self.date.replace('Z','+00:00'))
        if len({(l.from_, l.to) for l in self.links}) != len(self.links):
            raise ValueError('Conexiones repetidas')
        return self


class CoverageResult(Model):
    population: int = Field(ge=0, le=10**12)
    covered: int = Field(ge=0, le=10**12)
    reachable: int = Field(ge=0, le=10**12)
    unknownBlocks: int = Field(ge=0, le=10**12)
    median: float | None = Field(ge=0, le=10**9)
    p90: float | None = Field(ge=0, le=10**9)
    disconnected: int = Field(ge=0, le=10**12)
    evaluatedPlaces: int = Field(ge=0, le=300)

    @model_validator(mode='after')
    def population_bounds(self):
        if max(self.covered,self.reachable,self.disconnected)>self.population:
            raise ValueError('Cobertura mayor que población')
        return self


class FleetResult(Model):
    km: float = Field(ge=0, le=10**12)
    cycle: float = Field(ge=0, le=10**12)
    requestedHeadway: float = Field(ge=0, le=10**12)
    effectiveHeadway: float = Field(ge=0, le=10**12)
    vehiclesRequired: int = Field(ge=0, le=10**12)
    vehiclesUsed: int = Field(ge=0, le=500)
    available: int = Field(ge=0, le=500)
    targetFeasible: bool
    capacityPerHour: float = Field(ge=0, le=10**12)
    overload: bool | None
    costPerHour: float = Field(ge=0, le=10**12)
    vehicleKmPerHour: float = Field(ge=0, le=10**12)


class ZoneResult(Model):
    name: str = Field(min_length=1,max_length=200)
    known: int = Field(ge=0,le=10**12)
    base: int = Field(ge=0,le=10**12)
    proposed: int = Field(ge=0,le=10**12)
    lost: int = Field(ge=0,le=10**12)


class Evaluation(Model):
    version: str = Field(min_length=1,max_length=100)
    calculatedAt: str = Field(min_length=1,max_length=40)
    fingerprint: str = Field(min_length=1,max_length=100)
    study: Study
    base: CoverageResult
    proposed: CoverageResult
    baseFleet: FleetResult
    proposedFleet: FleetResult
    gained: int = Field(ge=0,le=10**12)
    lost: int = Field(ge=0,le=10**12)
    improved: int = Field(ge=0,le=10**12)
    worsened: int = Field(ge=0,le=10**12)
    zones: list[ZoneResult] = Field(max_length=2000)
    warnings: list[str] = Field(max_length=400)
    appliedEvents: list[str] = Field(max_length=400)


class SavedStudy(Model):
    id: str = Field(min_length=1, max_length=160)
    name: str = Field(min_length=1, max_length=120)
    createdAt: str = Field(max_length=40)
    status: Literal['draft','review','pilot','retired']
    study: Study
    result: Evaluation

    @model_validator(mode='after')
    def result_shape(self):
        datetime.fromisoformat(self.createdAt.replace('Z','+00:00'))
        datetime.fromisoformat(self.result.calculatedAt.replace('Z','+00:00'))
        if len(self.result.model_dump_json()) > 90000:
            raise ValueError('Resultado demasiado grande')
        return self


class LabState(Model):
    version: Literal[1]
    revision: int = Field(ge=0, le=1000000000)
    places: list[Place] = Field(max_length=300)
    events: list[Event] = Field(max_length=200)
    boarding: list[Boarding] = Field(max_length=500)
    observations: list[Observation] = Field(max_length=1000)
    studies: list[SavedStudy] = Field(max_length=20)
    walking: Walking | None
    candidates: list[dict] = Field(default_factory=list,max_length=20)

    @model_validator(mode='after')
    def unique_ids(self):
        for rows in (self.places,self.events,self.boarding,self.observations,self.studies):
            if len({r.id for r in rows}) != len(rows):
                raise ValueError('Identificadores duplicados')
        import math
        ids=set()
        for candidate in self.candidates:
            if candidate.get('version') != 1 or not isinstance(candidate.get('id'),str) or not candidate['id'] or candidate['id'] in ids:
                raise ValueError('Alternativa inválida o duplicada')
            ids.add(candidate['id'])
            for key in ('name','code','color','source','observedAt','boarding','risks','notes','updatedAt'):
                if not isinstance(candidate.get(key),str) or len(candidate[key])>4000:
                    raise ValueError('Campos de alternativa inválidos')
            import re
            if not re.fullmatch(r'#[a-fA-F0-9]{6}',candidate['color']) or candidate.get('routingMode','roads') not in ('roads','manual') or candidate.get('roadAlignment','direction') not in ('direction','nearest') or not isinstance(candidate.get('checks'),list) or any(not isinstance(c,str) for c in candidate['checks']):
                raise ValueError('Configuración de alternativa inválida')
            if 'service' in candidate:
                service=candidate['service']
                if not isinstance(service,dict):
                    raise ValueError('Servicio de alternativa inválido')
                for key,minimum,maximum in (('headway',1,180),('speedKmh',3,60),('fare',0,100)):
                    if key in service and (type(service[key]) not in (int,float) or not math.isfinite(service[key]) or not minimum<=service[key]<=maximum):
                        raise ValueError('Parámetros de servicio inválidos')
                for key in ('operator','model','start','end'):
                    if key in service and (not isinstance(service[key],str) or len(service[key])>120):
                        raise ValueError('Detalle de servicio inválido')
                if not valid_window(service.get('start') or None,service.get('end') or None):
                    raise ValueError('Horario de alternativa inválido')
            if candidate.get('passengerVisible') is True:
                raise ValueError('Las alternativas del laboratorio no pueden habilitar pasajeros')
            geometries=[]
            for key in ('outbound','inbound'):
                coords=candidate.get(key)
                if not isinstance(coords,list) or len(coords)>1000:
                    raise ValueError('Referencias de alternativa inválidas')
                geometries.append(coords)
            roads=candidate.get('roads',{})
            if not isinstance(roads,dict) or not set(roads)<= {'outbound','inbound'}:
                raise ValueError('Geometría de calles inválida')
            for road in roads.values():
                if not isinstance(road,dict) or not all(isinstance(road.get(k),str) for k in ('key','provider','calculatedAt')) or not isinstance(road.get('geometry'),list) or len(road['geometry'])>50000:
                    raise ValueError('Geometría de calles inválida')
                geometries.append(road['geometry'])
            for coords in geometries:
                if any(not isinstance(p,list) or len(p)!=2 or not all(type(v) in (int,float) and math.isfinite(v) for v in p) or abs(p[0])>180 or abs(p[1])>90 for p in coords):
                    raise ValueError('Coordenadas de alternativa inválidas')
        if len(self.model_dump_json(by_alias=True).encode()) > 1900000:
            raise ValueError('El laboratorio supera 1,9 MB')
        return self


def seed():
    data=json.loads((Path(__file__).resolve().parents[1]/'web/lib/pdu-catalog.json').read_text(encoding='utf-8'))
    return dict(version=1,revision=0,places=data['places'],events=data['events'],boarding=[],observations=[],studies=[],walking=None)


def load():
    return storage.get('mobility-lab') or seed()


def save(payload:LabState):
    data=payload.model_dump(mode='json',by_alias=True)
    data['revision']+=1
    try:
        with storage.Session.begin() as session:
            old=session.get(storage.Record,'mobility-lab')
            if old is None:
                if payload.revision != 0:
                    raise HTTPException(409,'El laboratorio cambió. Recarga antes de guardar.')
                session.add(storage.Record(id='mobility-lab',kind='mobility-lab',data=data))
            else:
                # Compare-and-swap on the JSON revision protects simultaneous editors.
                result=session.execute(update(storage.Record).where(storage.Record.id=='mobility-lab',storage.Record.data['revision'].as_integer()==payload.revision).values(data=data).execution_options(synchronize_session=False))
                if result.rowcount != 1:
                    raise HTTPException(409,'Otro administrador cambió el laboratorio. Exporta tus cambios y recarga.')
    except IntegrityError:
        raise HTTPException(409,'Otro administrador creó el laboratorio. Recarga antes de guardar.')
    return data
