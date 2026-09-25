CREATE EXTENSION IF NOT EXISTS postgis;
CREATE TABLE IF NOT EXISTS route_geometries (
  route_id text NOT NULL,
  direction smallint NOT NULL CHECK(direction IN (0,1)),
  shape geometry(LineString,4326) NOT NULL,
  source text NOT NULL,
  PRIMARY KEY(route_id,direction)
);
CREATE INDEX IF NOT EXISTS route_geometries_shape_idx ON route_geometries USING gist(shape);
CREATE TABLE IF NOT EXISTS boarding_points (
  stop_id text PRIMARY KEY,
  name text NOT NULL,
  kind text NOT NULL,
  location geometry(Point,4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS boarding_points_location_idx ON boarding_points USING gist(location);
