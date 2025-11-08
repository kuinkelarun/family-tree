# Family Tree App

A full‑stack web app to build and explore hierarchical family trees with collaboration and optional AI assistance.

## Structure
- `client/` – React app (Vite) with React Flow for the visual tree builder
- `server/` – Node.js + Express + MongoDB (Mongoose) REST API
- `ai/` – Optional AI helpers (OpenAI) used by the server route `/api/ai/*`

## Quick start
1. Copy `.env.example` to `.env` and fill values.
2. Install dependencies and run:
   - Backend: `cd server` then `npm run dev`
   - Frontend: `cd client` then `npm run dev`

## Environment
See `.env.example` for all variables. Minimal:
- `MONGO_URI` – MongoDB connection string
- `JWT_SECRET` – secret for signing JWTs
- `OPENAI_API_KEY` – optional, enables AI routes
- `PORT` – server port (default 4000)
- `VITE_API_BASE_URL` – client API base (e.g., http://localhost:4000)

## Notes
- Trees are private by default. Sharing uses per‑tree permissions.
- Relationship types validated server‑side; client shows warnings for conflicts.
- AI routes gracefully degrade when `OPENAI_API_KEY` is missing.

## Relationship validation

The API enforces relationship integrity (e.g., prevents parent/child between siblings, spouse between ancestor/descendant, and duplicate edges). A validation-only endpoint is available at `POST /api/relationships/validate` for client prechecks. See `VALIDATION-RULES.md` for details and how to extend rules.

Admin users can configure per-tree rule severities (error|warn|off) from the Admin console (`#/admin`). The rule list and defaults are provided by the server. See `VALIDATION-RULE-METADATA.md` for the Admin API and usage.

## Setup Instructions

### 1. Clone the repository

```
git clone <your-repo-url>
cd family-tree-only
```

### 2. Install dependencies

#### Client
```
cd client
npm install
```

#### Server
```
cd ../server
npm install
```

### 3. Start the servers

#### Server
```
npm run dev
```

#### Client
Open a new terminal:
```
cd client
npm run dev
```

### 4. Common Issues & Fixes

- **nodemon not recognized**:
  - Install globally: `npm install -g nodemon`
  - Or locally: `npm install nodemon --save-dev`

- **vite not recognized**:
  - Make sure you ran `npm install` in the `client` folder.
  - If still broken: `npm install vite --save-dev`

- **Cannot find package 'express'**:
  - Run: `npm install express` in the `server` folder.

- **Other missing packages**:
  - Run `npm install` in both `client` and `server` folders after restoring from GitHub.

### 5. Environment Variables

Edit `.env` or `family-tree-only.env` as needed for MongoDB, JWT, and API base URL.

Example:
```
PORT=4000
MONGO_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/?appName=ClusterAK
JWT_SECRET=replace_me
VITE_API_BASE_URL=http://localhost:4000
```

---

## Usage
- Open [http://localhost:5173](http://localhost:5173) in your browser after starting both servers.
- Register/login, create a tree, add members, drag to canvas, and build your family tree!

---

## SPA route fallback (production)

This client app uses the browser History API for route-like behavior (for example the Admin page at `/admin`). In development Vite serves the SPA and responds to direct route loads; in production you must configure your static server to return `index.html` for unknown paths so direct visits to `/admin` (or other client routes) load the SPA entry point. Examples:

- Express (Node):
```js
app.use(express.static(path.join(__dirname, 'dist')));
app.get('/*', (_, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));
```
- Netlify: add a `_redirects` file with:
```
/*    /index.html   200
```
- Vercel: use a rewrite rule to serve `index.html` for client routes or rely on default SPA behavior.

Without this fallback, directly loading `/admin` from the browser will produce a 404 from the static host instead of the app.


If you encounter any errors, copy the error message and ask for help.

