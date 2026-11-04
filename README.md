# TaskFlow

A MERN Kanban board (To Do / In Progress / Done) built for an internship assessment. Beyond CRUD it focuses on:

- **Optimistic UI with rollback.** Cards move instantly. If the save fails (offline, a 500, or a conflict), the card goes back to its last saved position and a toast explains what happened.
- **Race-condition safety.** Writes are serialised and coalesced on the client. Each move is a single-document `findOneAndUpdate` with a version check, so a stale write gets a `409` instead of corrupting the order.
- **Zero-flicker theming.** An inline script sets the theme class before first paint. The choice is saved in `localStorage` and falls back to the OS setting.
- **Configurable workflow (State pattern).** Each column is a backend state class that lists the states it may move to (currently **To Do → In Progress → Done**, forward only, with Done final; reordering within a column is always allowed). The server publishes the workflow at `GET /api/workflow`, and the UI builds its columns, tabs, drop rules and "Move to …" buttons from it. Adding or removing a state is a backend-only change (see [DECISIONS.md](DECISIONS.md#extra-workflow-rules-with-the-state-pattern)). Illegal moves get a `422`.
- **Wildcard: audit and activity log.** Every create, edit, move and delete writes an activity entry **in the same MongoDB transaction** as the change. A slide-over drawer shows the log with cursor pagination.

Design reasoning lives in [DECISIONS.md](DECISIONS.md).

**Live demo:** _add your Vercel URL here_

![TaskFlow screenshot](docs/screenshot.png)

---

## Tech stack

| Layer    | Choice                                                                  |
| -------- | ----------------------------------------------------------------------- |
| Frontend | React 18, Vite, Tailwind CSS, Zustand, @dnd-kit, react-hot-toast        |
| Backend  | Node 20+, Express 5, Mongoose 8, zod                                    |
| Database | MongoDB Atlas (M0 free tier; it is a replica set, so transactions work) |
| Tests    | Vitest, Supertest, mongodb-memory-server (in-memory replica set)        |

## Getting started

Requirements: Node 20+ and a MongoDB **replica set** (Atlas M0, or local Docker as shown below).

```bash
git clone https://github.com/DSheth2004/taskflow-kanban.git
cd taskflow-kanban
npm install
cp server/.env.example server/.env   # then fill in MONGODB_URI
npm run seed                          # resets the DB to ~15 realistic tasks
npm run dev                           # API on :4000, client on :5173
```

Open http://localhost:5173.

### Local MongoDB with Docker (instead of Atlas)

Transactions need a replica set, so start mongod as a single-node one:

```bash
docker run -d -p 27017:27017 --name mongo mongo:7 --replSet rs0
docker exec mongo mongosh --eval "rs.initiate()"
```

Then set `MONGODB_URI=mongodb://localhost:27017/taskflow?replicaSet=rs0&directConnection=true`.

## Environment variables

**`server/.env`** (see `server/.env.example`)

| Variable      | Purpose                                                              |
| ------------- | -------------------------------------------------------------------- |
| `MONGODB_URI` | Connection string (must be a replica set)                            |
| `PORT`        | API port, default `4000`                                             |
| `CORS_ORIGIN` | Comma-separated allowed origins; empty allows all                    |
| `CHAOS_RATE`  | 0..1 probability that a write fails with a simulated 500 (demo only) |

**`client/.env`** (see `client/.env.example`)

| Variable       | Purpose                                                |
| -------------- | ------------------------------------------------------ |
| `VITE_API_URL` | API base URL. `/api` in dev (Vite proxies it to :4000) |

## Scripts (run from the repo root)

| Script          | What it does                                   |
| --------------- | ---------------------------------------------- |
| `npm run dev`   | Runs API and client together (concurrently)    |
| `npm run seed`  | Clears tasks and activity, inserts sample data |
| `npm test`      | Server API tests and client store tests        |
| `npm run lint`  | ESLint across the monorepo                     |
| `npm run build` | Production build of the client                 |

## API

All errors use the shape `{ "error": { "code", "message", "details?" } }`.

| Method | Path                  | Body                                            | Success | Errors             |
| ------ | --------------------- | ----------------------------------------------- | ------- | ------------------ |
| GET    | `/api/workflow`       |                                                 | 200     |                    |
| GET    | `/api/tasks`          |                                                 | 200     |                    |
| POST   | `/api/tasks`          | `{ title, description?, priority?, columnId? }` | 201     | 400, 422           |
| PATCH  | `/api/tasks/:id`      | `{ title?, description?, priority?, version }`  | 200     | 400, 404, 409      |
| DELETE | `/api/tasks/:id`      |                                                 | 204     | 400, 404           |
| PATCH  | `/api/tasks/:id/move` | `{ toColumnId, prevId?, nextId?, version }`     | 200     | 400, 404, 409, 422 |
| GET    | `/api/activity`       | query `limit`, `before` (cursor)                | 200     | 400                |

## Seeing the hard parts work

- **Rollback:** turn on **Chaos** in the header (or open DevTools, go to Network and pick _Offline_) and drag a card. It snaps back and a toast appears.
- **Rapid moves:** set DevTools Network to _Slow 3G_ and drag several cards quickly. The "Saving" dots clear one by one, and a reload matches the screen exactly.
- **Conflicts:** open two tabs and move the same card in both. The second tab gets a 409 and refreshes to the true state.
- **Workflow:** drag a To Do card. The Done column greys out and shows "Not allowed", and dropping there shows a toast instead of moving the card. Calling the API directly with `todo → done` returns `422 INVALID_TRANSITION`.
- **Theme:** switch to dark and hard-reload. There is no white flash.
- **Activity:** open the Activity drawer. Each change appears with who made it and when.

## Project structure

```
client/                 React app
  index.html            inline zero-flicker theme script
  src/store/            boardStore (optimistic logic), settingsStore
  src/lib/              ordering math, mutation queue, workflow (built from the API)
  src/components/       Board, Column, TaskCard, TaskModal, ActivityDrawer, Header
server/
  src/workflow/         State pattern: one class per state + the Workflow registry
  src/models/           Task, Activity
  src/services/         taskService: transactions, moves, rebalancing
  src/middleware/       validate (zod), chaos, errorHandler
  src/seed.js           npm run seed
  api/index.js          Vercel serverless entry
  tests/                API and concurrency tests
```

## Deployment (Vercel)

1. Create two Vercel projects from this repo: one with root directory `server`, one with root directory `client`.
2. On the server project, set `MONGODB_URI` and `CORS_ORIGIN` (the client URL).
3. On the client project, set `VITE_API_URL` to `https://<server-project>.vercel.app/api`.

## AI usage

I built this with help from Claude (Anthropic) through Claude Code. I used it for scaffolding, reviewing the concurrency design and drafting tests. I reviewed, ran and can explain every line. The mistakes it made and what I changed are listed in [DECISIONS.md](DECISIONS.md#3-ai-retrospective).
