import os
from pathlib import Path
from datetime import datetime, timezone
from sqlalchemy import create_engine, Column, String, JSON, DateTime
from sqlalchemy.orm import declarative_base, sessionmaker

ROOT = Path(__file__).resolve().parents[1]
DATABASE_URL = os.getenv('DATABASE_URL', f'sqlite:///{ROOT / "juliaca.db"}')
engine = create_engine(DATABASE_URL, connect_args={'check_same_thread': False} if DATABASE_URL.startswith('sqlite') else {}, pool_pre_ping=True)
Session = sessionmaker(bind=engine)
Base = declarative_base()


class Record(Base):
    __tablename__ = 'records'
    id = Column(String(80), primary_key=True)
    kind = Column(String(40), index=True, nullable=False)
    data = Column(JSON, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


def save(key, kind, data):
    with Session.begin() as s:
        obj = s.get(Record, key)
        if obj:
            obj.data = data
        else:
            s.add(Record(id=key, kind=kind, data=data))


def records(kind):
    with Session() as s:
        return [{**r.data, 'id': r.id} for r in s.query(Record).filter_by(kind=kind).order_by(Record.created_at.desc()).all()]


def get(key):
    with Session() as s:
        r = s.get(Record, key)
        return r.data if r else None


def delete(key):
    with Session.begin() as s:
        obj = s.get(Record, key)
        if obj:
            s.delete(obj)
