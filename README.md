# Family Tree App (MVP)

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

