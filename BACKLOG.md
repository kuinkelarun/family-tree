# Project Backlog

This backlog captures planned work items, priorities, and short implementation notes for the Family Tree project.

---

## High priority

### 1) Client: Robust Export — High-resolution fallback (Implemented)
- Status: Done (prototype)
- Description: When exporting a large graph, call React Flow `fitView()` then rasterize the DOM at an increased pixel ratio so labels remain readable. Cap the pixel ratio and canvas dimensions to avoid browser OOM.
- Files touched: `client/src/App.jsx`
- Notes: Runtime cap at ~16k px per dimension; shows toast when resolution capped.

### 2) Client: Tiled Export & Stitching
- Status: Backlog
- Priority: High
- Estimated effort: 4-8 hours
- Description: Export very large graphs by splitting the full bounding box into tiles, capture each tile in the browser, stitch tiles into one large canvas (or provide ZIP of tiles). Provide progress UI and a safety fallback to ZIP if final image exceeds browser limits.
- Acceptance criteria:
  - Exports include every node/edge in the produced image(s).
  - No browser OOM for medium-large graphs; if final image exceeds browser limits, produce ZIP of tiles.
  - Progress indicator and cancel support.
- Notes: Client-only approach; implement first to validate UX before adding server work.

---

## Medium priority (Server-side)

### 3) Server: Headless Chromium export (Puppeteer / Playwright)
- Status: Backlog
- Priority: Medium
- Estimated effort: 6-10 hours (including queue & job management)
- Description: Server worker uses headless Chromium to load a minimal rendering page (or mount the tree UI), call `window.fitView()`/render and take a full-page screenshot or PDF. Useful for exact client UI fidelity and multi-page PDF.
- Acceptance criteria:
  - Expose an authenticated API endpoint to request export jobs.
  - Job queue with progress and safe resource limits (max runtime, memory).
  - Worker returns a downloadable file (PNG/PDF) when complete.
- Notes: Easier to match client visuals, but heavier on server resources and requires secure sandboxing.

### 4) Server: Server-side SVG → raster (resvg / sharp)
- Status: Backlog (Recommended long-term)
- Priority: Medium-High
- Estimated effort: 6-12 hours
- Description: Convert `mapTreeToGraph` output to server-generated SVG primitives (nodes, edges, labels) then rasterize with `resvg` or `sharp` to PNG/PDF. Much faster and lower-memory than headless Chromium; best for batch/print exports.
- Acceptance criteria:
  - Server endpoint to generate an SVG and rasterize to PNG/PDF at arbitrary DPI.
  - Correct visual parity with client (node positions, labels, styling) or documented differences.
  - Scales to very large trees without client memory constraints.
- Notes: Recommended for production-grade exports.

---

## Lower priority / Nice-to-have

### 5) Export options UI
- Status: Backlog
- Priority: Low
- Description: Add an Export modal that offers options: "Visible (current view)", "All (fit and export)", "High-res (2×)" and "Advanced (tiled or server)". Display warnings and estimated file sizes when helpful.

### 6) Server job UI / Notifications
- Status: Backlog
- Priority: Low
- Description: If server-side export is added, add status tracking (queued, running, complete), and provide a download link, with email or in-app notification for large jobs.

---

## Next recommended steps (short term)
1. Implement client-side tiled export & stitching (prototype). This will handle many large graphs without server changes.
2. If client-side hits limits, implement server-side SVG-based renderer (resvg) next.
3. Add Export options UI to give users control over resolution and method.

---

*Created on 2025-11-04* 
