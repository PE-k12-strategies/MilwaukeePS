# MPS Long-Range Facilities Plan Strategy Tool

Local rebuild of the MPS LRFMP strategy sorting and prioritization tool.

## Features (v1)

- Reload default sample school data or upload a GeoJSON FeatureCollection
- **Step 3** — Summary of initial sorting into Strategy Candidate Groups
- **Step 4** — Prioritize within groups via weighted criteria; select a school to highlight its decision flowchart path

School-level detail and interactive map tabs are deferred.

## View in Live Server

Open **`index.html`** with Live Server / Go Live. No terminal step is required to **view** the app — it loads the committed `bundle/` files (same idea as a static HTML dashboard).

This project uses React + TypeScript, so those `bundle/` files are the compiled output. Cursor can rebuild them automatically when you open the folder (allow automatic tasks if prompted). After you change code under `src/`, either:

- wait for the automatic watch task, or
- double-click `start-build-watch.cmd`, or  
- run `npm.cmd run build` in the Dashboard folder

then refresh the browser.

## Develop with Vite HMR (optional)

```bash
npm.cmd run dev
```

Opens `app.html` with hot reload (separate from Live Server).

## Data format

Each GeoJSON feature should include properties such as:

- `schoolId`, `schoolName`
- `utilizationRate`, `projectedUtilization10yr`, `enrollmentGrowth5yr`
- `buildingScore`, `programmaticOfferings`
- `nearbyCapacityAvailable`, `siteExpansionCapacity`, `nearUnderutilizedSchool`
- Prioritization fields: `studentsInAttendanceArea`, `economicDisadvantageRate`, `academicPerformance`, `pre1978LeadRisk`, `adaAccessible`, `acCoverage`, `specialtyProgramCount`, `regionalSpecialtyProgramCount`, `nonMpsSchoolsWithin1Mile`, `specialEdProgramCount`, `overutilizedMpsWithin1Mile`, `receivesDisplacedStudents`

## Deploy

Build with `npm.cmd run build` and host `index.html` + `bundle/` (or the Vite `bundle/` output) on any static host.
