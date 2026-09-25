# Product
<!-- impeccable:product-schema 1 -->

## Platform
web

## Stack
User-approved: React, TypeScript, MapLibre, FastAPI, PostgreSQL/PostGIS and OpenTripPlanner. SQLite is a local development fallback only. Sites may host the demonstration frontend; production API requires its own hosting.

## Users
Passengers in Juliaca looking for a micro, and the project owner analyzing urban mobility with operators and field researchers.

## Product Purpose
Find routes and boarding directions, distinguish service frequency from GPS arrival estimates, and compare evidence-based route proposals without changing published services.

## Operating Context
Mobile first, outdoors, intermittent connectivity. Owner initially maintains data. Operator GPS exists but provider and API access remain unknown. Fieldwork can be coordinated. Budget exists but amount is unknown.

## Capabilities and Constraints
Passenger planning, route catalog and favorites, tracking when verified, moderated reports, administrative imports, field observations, coverage and scenario analysis. City-wide ambition with a 3–5 route pilot. All seed data is synthetic and must remain visibly marked. No claims of real GPS, safety, authorization, or current fares without evidence.

## Evidence on Hand
Empty workspace. No route dataset, GPS credentials, deployment credentials for a backend, or field observations supplied. Municipality and MTC documents are contextual references, not current route truth.

## Product Principles
Truth before precision. Route direction matters. Proposals stay separate from published data. Passenger location remains private. Useful without signing in.

## Accessibility & Inclusion
Keyboard navigation, readable contrast and mobile touch targets, reduced motion, manual origin entry when geolocation is denied.

## Visual commitments
The user requested a modern, minimalist professional redesign informed by relevant DESIGN.md references on styles.refero.design, with light/dark themes and purposeful animation. The cartographic workbench, restrained typography and neutral surfaces are the current direction. See DESIGN.md for the implemented design and source links.
