from datetime import datetime, timezone
from typing import Literal
from pydantic import BaseModel, Field, model_validator


class Point(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)


class Stop(Point):
    id: str = Field(pattern=r'^[a-zA-Z0-9_-]{1,60}$')
    name: str = Field(min_length=1, max_length=120)
    kind: Literal['official', 'observed', 'demo'] = 'demo'


class Route(BaseModel):
    id: str = Field(pattern=r'^[a-zA-Z0-9_-]{1,60}$')
    code: str = Field(min_length=1, max_length=12)
    name: str = Field(min_length=1, max_length=120)
    operator: str = Field(min_length=1, max_length=160)
    color: str = Field(pattern=r'^#[0-9A-Fa-f]{6}$')
    fare: float = Field(ge=0, le=100)
    frequency: list[int] = Field(min_length=2, max_length=2)
    start: str = Field(pattern=r'^([01][0-9]|2[0-3]):[0-5][0-9]$')
    end: str = Field(pattern=r'^([01][0-9]|2[0-3]):[0-5][0-9]$')
    stops: list[str] = Field(min_length=2, max_length=200)
    inbound: list[str] = Field(min_length=2, max_length=200)
    geometry: list[list[float]] = Field(min_length=2, max_length=10000)
    inbound_geometry: list[list[float]] = Field(min_length=2, max_length=10000)
    source: str = Field(min_length=1, max_length=300)
    verified_at: str | None = None
    status: Literal['demo', 'observed', 'authorized', 'proposal']
    observation_period: str | None = None
    fleet_coverage: float | None = Field(default=None, ge=0, le=1)

    @model_validator(mode='after')
    def consistent(self):
        if self.frequency[0] < 1 or self.frequency[1] < self.frequency[0] or self.frequency[1] > 180:
            raise ValueError('Frecuencia inválida')
        for p in self.geometry + self.inbound_geometry:
            if len(p) != 2 or not (-180 <= p[0] <= 180 and -90 <= p[1] <= 90):
                raise ValueError('Coordenadas inválidas')
        if self.start >= self.end:
            raise ValueError('Esta versión admite servicio dentro del mismo día; divida servicios nocturnos')
        if self.status == 'observed' and not self.observation_period:
            raise ValueError('Un recorrido observado requiere periodo de observación')
        if self.status in ('observed', 'authorized') and not self.verified_at:
            raise ValueError('Falta fecha de verificación')
        return self


class Network(BaseModel):
    stops: list[Stop] = Field(min_length=2, max_length=5000)
    routes: list[Route] = Field(min_length=0, max_length=500)

    @model_validator(mode='after')
    def references(self):
        ids = {s.id for s in self.stops}
        if len(ids) != len(self.stops) or len({r.id for r in self.routes}) != len(self.routes):
            raise ValueError('Identificadores duplicados')
        for r in self.routes:
            if not set(r.stops + r.inbound) <= ids:
                raise ValueError('La ruta hace referencia a paraderos inexistentes')
        return self


class PlanRequest(BaseModel):
    origin: Point
    destination: Point
    departure: datetime
    preference: Literal['fastest', 'walk', 'transfers'] = 'fastest'

    @model_validator(mode='after')
    def aware(self):
        if self.departure.tzinfo is None:
            raise ValueError('La hora debe incluir zona horaria')
        return self


class Position(Point):
    vehicle_id: str = Field(pattern=r'^[a-zA-Z0-9_-]{1,60}$')
    route_id: str = Field(max_length=60)
    direction: Literal[0, 1]
    timestamp: datetime
    source: str = Field(min_length=1, max_length=120)
    simulated: bool = False

    @model_validator(mode='after')
    def timestamp_valid(self):
        if self.timestamp.tzinfo is None:
            raise ValueError('Falta zona horaria')
        if (self.timestamp - datetime.now(timezone.utc)).total_seconds() > 30:
            raise ValueError('Posición con fecha futura')
        return self


class Report(BaseModel):
    route_id: str = Field(max_length=60)
    category: Literal['route', 'fare', 'incident', 'service']
    description: str = Field(min_length=10, max_length=2000)


class Observation(BaseModel):
    stop_id: str = Field(max_length=60)
    observed_at: datetime
    passengers: int = Field(ge=0, le=100000)
    vehicles: int = Field(ge=0, le=10000)
    minutes: int = Field(ge=1, le=1440)
    source: str = Field(min_length=3, max_length=200)
    notes: str = Field(default='', max_length=2000)
    destination_stop_id: str | None = None
    boarding_conditions: str = Field(default='', max_length=1000)


class Scenario(BaseModel):
    name: str = Field(min_length=3, max_length=120)
    route_id: str = Field(max_length=60)
    frequency: int = Field(ge=1, le=180)
    removed_stops: list[str] = Field(default_factory=list, max_length=200)
    source: str = Field(default='Hipótesis del administrador', max_length=300)
