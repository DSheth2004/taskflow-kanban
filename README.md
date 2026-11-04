# TaskFlow: a resilient MERN Kanban board

TaskFlow is a Kanban board (**To Do → In Progress → Done**) built with MongoDB, Express, React and Node.js. Beyond plain CRUD, it focuses on the hard parts of a real board:

- cards that move instantly and roll back cleanly when the server fails
- no corrupted order or duplicate cards when you drag quickly on a slow network
- atomic MongoDB writes
- a dark/light theme that never flashes on reload
- a workflow defined entirely on the backend (State pattern)
- a persisted audit log of every change

> **Live demo:** _add your deployed URL here_ · **Design write-up:** [DECISIONS.md](DECISIONS.md)

---

## Contents

1. [Requirements coverage](#1-requirements-coverage)
2. [Features](#2-features)
3. [Tech stack](#3-tech-stack)
4. [Getting started](#4-getting-started)
5. [Environment variables](#5-environment-variables)
6. [Scripts](#6-scripts)
7. [How to try each feature](#7-how-to-try-each-feature)
8. [Architecture](#8-architecture)
9. [Data model](#9-data-model)
10. [REST API](#10-rest-api)
11. [The workflow (State pattern)](#11-the-workflow-state-pattern)
12. [Optimistic UI and concurrency](#12-optimistic-ui-and-concurrency)
13. [Theming and responsive layout](#13-theming-and-responsive-layout)
14. [Testing](#14-testing)
15. [Project structure](#15-project-structure)
16. [Deployment](#16-deployment)
17. [Git workflow](#17-git-workflow)
18. [Troubleshooting](#18-troubleshooting)
19. [AI usage](#19-ai-usage)

---

## 1. Requirements coverage

| Requirement (from the brief)                                                         | Where it lives                                                                                                           |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| 3 columns: To Do, In Progress, Done                                                  | `server/src/workflow/` defines the states; the UI renders them from `GET /api/workflow`                                  |
| Task schema: title, description, priority (Low/Medium/High), column id, `orderIndex` | `server/src/models/Task.js`, also with `tags` and `version`                                                              |
| Move across columns and reorder within a column                                      | Drag and drop (`@dnd-kit`, mouse, touch and keyboard) plus "Move to …" buttons in the edit dialog                        |
| Instant client updates                                                               | `client/src/store/boardStore.js` → `moveTask` updates state before any request                                           |
| Rollback with an error toast on network drop or a 500                                | `_sendMove` / `_sendEdit` / `deleteTask` restore the last server-confirmed copy and call `toast.error`                   |
| Rapid-interaction guard, no duplicate cards                                          | Serialised mutation queue with per-card coalescing, columns derived from a single id → task map, version checks          |
| Atomic MongoDB writes, no array overwrites                                           | A single-document `findOneAndUpdate` with `$set` and `$inc` on version, wrapped in a transaction with the activity entry |
| Light/dark theme with contrast across cards, badges and modals                       | Tailwind `darkMode: 'class'`, colour pairs checked against WCAG AA                                                       |
| Theme stored in `localStorage` with zero flicker                                     | Inline script in `client/index.html` sets the class before first paint                                                   |
| Wildcard, Option 2: audit and activity log                                           | `Activity` collection plus a slide-over drawer: "Task 'Setup Auth' moved from 'To Do' to 'In Progress' by User at 14:22" |
| `DECISIONS.md` answering the 4 questions                                             | [DECISIONS.md](DECISIONS.md) in the repo root                                                                            |
| `npm run seed` with realistic cards across all 3 columns, varied priorities and tags | `server/src/seed.js` (15 cards)                                                                                          |
| `.env.example`, clear run commands                                                   | `server/.env.example`, `client/.env.example`, [Getting started](#4-getting-started)                                      |
| Feature branches merged into `main` with conventional commits                        | See [Git workflow](#17-git-workflow)                                                                                     |

---

## 2. Features

- **Board and tasks.**
  - Create, edit and delete tasks, each with a title, description, priority and up to 5 tags.
  - New tasks start in To Do.
- **Drag and drop.**
  - Reorder within a column or move between columns.
  - Works with a mouse, on touch screens (long-press for about 0.2s, so normal swiping still scrolls) and with the keyboard (Space to pick up, arrow keys to move, Space to drop).
- **Workflow rules.**
  - Cards move forward one step at a time. They can't go backwards or skip a step, and Done is final.
  - While you drag, columns a card can't go to are greyed out and marked "Not allowed".
  - The edit dialog shows one "Move to …" button per allowed next state.
- **Optimistic UI.**
  - Every move, edit and delete shows on screen immediately, with a "Saving" dot on the card.
  - If the server fails, the change is undone and a toast says why.
- **Chaos mode.** The ⚡ button in the header makes every save fail with a simulated 500, so you can watch the rollback without unplugging anything.
- **Activity log.**
  - The clock button opens a slide-over drawer listing every change, newest first, with who made it and when.
  - Older entries load with cursor pagination.
  - The drawer refreshes after your own changes, and every 10s for other people's.
  - Your display name is set at the top of the drawer.
- **Theme.** Light and dark, following your OS until you choose one, saved in `localStorage`, with no flash on reload.
- **Responsive layout.** The same board on phones, tablets and desktops (see [section 13](#13-theming-and-responsive-layout)).

---

## 3. Tech stack

| Layer         | Choice                                              | Why                                                                                                   |
| ------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Frontend      | React 18, Vite 6, Tailwind CSS 3                    | Fast dev server, utility classes with class-based dark mode                                           |
| State         | Zustand 5                                           | Small explicit store, selector subscriptions, easy snapshot and rollback (comparison in DECISIONS.md) |
| Drag and drop | `@dnd-kit/core` and `@dnd-kit/sortable`             | Maintained, accessible, keyboard and touch sensors (`react-beautiful-dnd` is deprecated)              |
| Toasts        | `react-hot-toast`                                   | Tiny, accessible                                                                                      |
| Backend       | Node 20+, Express 5                                 | Express 5 forwards rejected promises to the error handler, so there's no try/catch boilerplate        |
| Database      | MongoDB with Mongoose 8                             | Transactions (needs a replica set), schema validation                                                 |
| Validation    | zod                                                 | Request schemas with clear 400 errors                                                                 |
| Tests         | Vitest, Supertest, mongodb-memory-server            | Real HTTP tests against an in-memory **replica set**, so transactions are exercised                   |
| Tooling       | ESLint 9 (flat config), Prettier, GitHub Actions CI | Lint, tests and build on every PR                                                                     |

---

## 4. Getting started

### Prerequisites

- **Node.js 20 or newer** (`node -v`)
- A **MongoDB replica set**. Transactions don't work on a standalone `mongod`. Either:
  - **MongoDB Atlas** (the free M0 tier is a replica set), or
  - **Docker** running a single-node replica set (below).

### Install and run

```bash
git clone https://github.com/DSheth2004/taskflow-kanban.git
```

```bash
cd taskflow-kanban
```

```bash
npm install
```

Copy the environment templates:

```bash
cp server/.env.example server/.env
```

```bash
cp client/.env.example client/.env
```

Then edit `server/.env` and set `MONGODB_URI` (see the next section). Then load the sample data and start the app:

```bash
npm run seed
```

```bash
npm run dev
```

`npm run dev` starts the API on http://localhost:4000 and the client on http://localhost:5173. Open the client URL that Vite prints. If 5173 is taken, it uses the next free port, such as 5174.

### Option A: MongoDB Atlas (free)

1. Create a free **M0** cluster at https://www.mongodb.com/cloud/atlas.
2. Under **Database Access**, add a user with a password.
3. Under **Network Access**, allow your IP. Use `0.0.0.0/0` if you deploy to Vercel, whose IPs change.
4. Under **Connect → Drivers**, copy the `mongodb+srv://…` string, add `/taskflow` before any `?`, and put it in `server/.env` as `MONGODB_URI`.

### Option B: local MongoDB with Docker

Start a single-node replica set:

```bash
docker run -d -p 27017:27017 --name mongo mongo:7 --replSet rs0
```

```bash
docker exec mongo mongosh --eval "rs.initiate()"
```

Then use this in `server/.env`:

```
MONGODB_URI=mongodb://localhost:27017/taskflow?replicaSet=rs0&directConnection=true
```

Next time, start the container again with `docker start mongo`.

---

## 5. Environment variables

**`server/.env`**

| Variable      | Required | Default   | Meaning                                                                                                                       |
| ------------- | -------- | --------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `MONGODB_URI` | yes      | none      | Connection string. It must point at a replica set.                                                                            |
| `PORT`        | no       | `4000`    | API port                                                                                                                      |
| `CORS_ORIGIN` | no       | allow all | Comma-separated browser origins allowed to call the API, e.g. `http://localhost:5173` or your deployed client URL             |
| `CHAOS_RATE`  | no       | `0`       | Probability (0–1) that **any** write request fails with a simulated 500. Use it to demo rollback; keep it at 0 in production. |

**`client/.env`**

| Variable       | Required | Default | Meaning                                                                                                                                                       |
| -------------- | -------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_API_URL` | no       | `/api`  | API base URL. In development, Vite proxies `/api` to `localhost:4000`. In production, set it to the deployed API, e.g. `https://taskflow-api.vercel.app/api`. |

`.env` files are git-ignored; only the `.env.example` templates are committed.

---

## 6. Scripts

Run these from the repository root (npm workspaces).

| Command          | What it does                                                                                                                                             |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm install`    | Installs dependencies for the root, `client` and `server`                                                                                                |
| `npm run dev`    | Runs the API (`node --watch`) and the client (Vite) together                                                                                             |
| `npm run seed`   | **Resets** the database: deletes all tasks and activity, then inserts 15 realistic cards (6 / 4 / 5 across the columns, mixed priorities, 1–2 tags each) |
| `npm test`       | Server API and unit tests, then client store and unit tests                                                                                              |
| `npm run lint`   | ESLint over the whole repo                                                                                                                               |
| `npm run format` | Prettier over the whole repo                                                                                                                             |
| `npm run build`  | Production build of the client into `client/dist`                                                                                                        |

Run them per workspace with `-w`, for example `npm test -w server` or `npm run dev -w client`.

---

## 7. How to try each feature

| What to check                 | How                                                                                                                                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Instant move and persistence  | Drag a card from To Do to In Progress. It moves immediately with a "Saving" dot, and after a reload it's still there.                                                                       |
| Rollback on a simulated 500   | Turn on **⚡ Chaos** in the header, drag a card, and watch it snap back with a toast. Turn Chaos off again.                                                                                 |
| Rollback on a network drop    | In DevTools → Network, choose **Offline** and drag a card. It snaps back and the toast says you're offline.                                                                                 |
| Rapid moves on a slow network | In DevTools → Network, choose **Slow 3G** and drag several cards quickly, some twice. The "Saving" dots clear one by one, there are no duplicates, and a reload matches the screen exactly. |
| Conflicts between users       | Open two tabs and move the same card in both. The second save gets a 409 and that tab refreshes to the real state.                                                                          |
| Workflow rules                | Drag a To Do card toward Done. Done is greyed out, and dropping there shows a toast instead of moving it.                                                                                   |
| Theme with no flicker         | Switch to dark and hard-reload (Ctrl+Shift+R). There's no white flash.                                                                                                                      |
| Activity log                  | Open the clock icon. Each change reads like "Task 'Setup Auth' moved from 'To Do' to 'In Progress'", with "by &lt;name&gt; at 14:22" underneath. Set your name at the top of the drawer.    |
| Phone layout                  | Open DevTools' device toolbar (or a real phone). Swipe between columns, or tap the column tabs.                                                                                             |

---

## 8. Architecture

```
React (Vite)                                   Express API                           MongoDB
──────────────────────────────────            ─────────────────────────────         ───────────
Board / Column / TaskCard (dnd-kit)
        │ onDragEnd
        ▼
boardStore.moveTask  ── optimistic set ──▶ UI re-renders the one changed card
        │ enqueue (serialised, per-card coalescing)
        ▼
_sendMove ── api.moveTask ── PATCH /api/tasks/:id/move ──▶ validate (zod)
                                                          ▶ controller
                                                          ▶ taskService.moveTask
                                                              ├ start transaction
                                                              ├ version check ............ 409
                                                              ├ workflow state check ...... 422
                                                              ├ compute slot from neighbours
                                                              ├ (rebalance column if needed)
                                                              ├ findOneAndUpdate($set,$inc) ─▶ tasks
                                                              └ insert activity entry ──────▶ activities
        ◀── 200 { task, rebalanced } ─────────────────────────┘ commit
apply server orderIndex / version  (or roll back + toast on any error)
```

- **Client:** components render from the Zustand store, and all writes go through the store's mutation queue.
- **Server:** routes → `validate` middleware (zod) → controllers (HTTP only) → services (business logic and transactions) → Mongoose models. A central `errorHandler` turns every error into `{ "error": { "code", "message", "details?" } }` with the right status code.

---

## 9. Data model

**Task** (`tasks` collection)

| Field                    | Type                          | Notes                                                                                         |
| ------------------------ | ----------------------------- | --------------------------------------------------------------------------------------------- |
| `title`                  | String                        | Required, trimmed, at most 120 characters                                                     |
| `description`            | String                        | At most 2000 characters, default `''`                                                         |
| `priority`               | `'Low' \| 'Medium' \| 'High'` | Default `'Medium'`                                                                            |
| `tags`                   | String[]                      | At most 5, each at most 20 characters, lower-cased and de-duplicated                          |
| `columnId`               | String                        | The workflow state id (`todo`, `in_progress` or `done`). The enum is built from the workflow. |
| `orderIndex`             | Number                        | Fractional position within the column                                                         |
| `version`                | Number                        | Bumped on every write; used for optimistic concurrency (stale writes get 409)                 |
| `createdAt`, `updatedAt` | Date                          | Mongoose timestamps                                                                           |

Index: `{ columnId: 1, orderIndex: 1 }`, which serves both board loading and neighbour lookups.

**Activity** (`activities` collection): `taskId`, `taskTitle` (copied, so entries survive deletion), `action` (`created`, `updated`, `moved` or `deleted`), `from`, `to`, `changes` (the field names, for updates), `actor`, `createdAt`. Index: `{ createdAt: -1 }`. `from` and `to` deliberately have no enum, so history stays valid if a workflow state is later removed.

---

## 10. REST API

The base URL is `/api`. JSON in, JSON out. Every error has the same shape:

```json
{
  "error": {
    "code": "VERSION_CONFLICT",
    "message": "Task was changed by someone else. Refresh and try again."
  }
}
```

| Method | Path                  | Body / query                                           | Success                                                                   | Errors                           |
| ------ | --------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------- | -------------------------------- |
| GET    | `/api/health`         | none                                                   | 200 `{ ok: true }`                                                        | none                             |
| GET    | `/api/workflow`       | none                                                   | 200 `{ states: [{ id, label, color, isInitial, isFinal, transitions }] }` | none                             |
| GET    | `/api/tasks`          | none                                                   | 200 `Task[]`                                                              | none                             |
| POST   | `/api/tasks`          | `{ title, description?, priority?, tags?, columnId? }` | 201 `Task`                                                                | 400, 422 (not the initial state) |
| PATCH  | `/api/tasks/:id`      | `{ title?, description?, priority?, tags?, version }`  | 200 `Task`                                                                | 400, 404, 409                    |
| DELETE | `/api/tasks/:id`      | none                                                   | 204                                                                       | 400, 404                         |
| PATCH  | `/api/tasks/:id/move` | `{ toColumnId, prevId?, nextId?, version }`            | 200 `{ task, rebalanced }`                                                | 400, 404, 409, 422               |
| GET    | `/api/activity`       | `?limit=30&before=<id>`                                | 200 `{ items, nextCursor }`                                               | 400                              |

| Status                                              | When                                                                                                    |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 400 `VALIDATION_ERROR` / `BAD_REQUEST` / `BAD_JSON` | The body or id fails validation, or the JSON is malformed                                               |
| 404 `NOT_FOUND` / `ROUTE_NOT_FOUND`                 | The task or route doesn't exist                                                                         |
| 409 `VERSION_CONFLICT`                              | `version` is stale, or a named neighbour has left the target column                                     |
| 422 `INVALID_TRANSITION`                            | The workflow doesn't allow the move (for example To Do → Done), or a create targets a non-initial state |
| 500 `CHAOS` / `INTERNAL`                            | Simulated failure (chaos mode) or an unexpected error                                                   |

Notes:

- **PATCH `/api/tasks/:id`** can't change `columnId` or `orderIndex`; those only change through `/move`.
- **Chaos mode for a single request:** add `?fail=1` or the header `x-chaos: 1` to any write request.
- **Display name:** sent in the `x-actor` header (URI-encoded). It defaults to "Anonymous".

Example move (place a card between two others in In Progress):

```bash
curl -X PATCH http://localhost:4000/api/tasks/<id>/move -H "Content-Type: application/json" -d "{\"toColumnId\":\"in_progress\",\"prevId\":\"<idAbove>\",\"nextId\":\"<idBelow>\",\"version\":0}"
```

---

## 11. The workflow (State pattern)

The columns and the rules for moving between them are defined **only on the backend**, in `server/src/workflow/`:

| File                                                        | Role                                                                                                                                                                                    |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WorkflowState.js`                                          | Base class: `id`, `label`, `color`, `isInitial`, `transitions`, `isFinal`, `canMoveTo()`                                                                                                |
| `states/TodoState.js`, `InProgressState.js`, `DoneState.js` | One small class per state                                                                                                                                                               |
| `Workflow.js`                                               | Holds the states in column order. It checks the configuration at startup (unique ids, exactly one initial state, no unknown transition targets) and provides `pathTo()` and `whyNot()`. |
| `index.js`                                                  | The single list that defines the board                                                                                                                                                  |

The client fetches `GET /api/workflow` and builds everything from it: columns, colours, phone tabs, drop locks, the create button and "Move to …" buttons. The client code contains no state names.

**Add a state**, for example Review between In Progress and Done:

1. Create `server/src/workflow/states/ReviewState.js`:
   ```js
   import { WorkflowState } from '../WorkflowState.js';

   export class ReviewState extends WorkflowState {
     id = 'review';
     label = 'Review';
     color = 'amber';
     transitions = ['done', 'in_progress'];
   }
   ```
2. In `InProgressState.js`, set `transitions = ['review']`.
3. In `index.js`, add `new ReviewState()` to the list, after `new InProgressState()`.

Restart the API and the board shows a Review column with the new rules. No UI changes are needed.

**Remove a state:** first move any tasks still in it, e.g. `db.tasks.updateMany({ columnId: 'review' }, { $set: { columnId: 'done' } })`. Then delete the class, remove it from the list and fix any `transitions` that pointed at it. The server refuses to start while a transition points at a state that no longer exists.

Available colour tokens: `slate`, `gray`, `indigo`, `blue`, `sky`, `violet`, `amber`, `orange`, `rose`, `teal`, `emerald`. Any other token falls back to slate.

---

## 12. Optimistic UI and concurrency

[DECISIONS.md](DECISIONS.md) has the full walkthrough. In short:

- **Two copies of each task.** `tasks` is what's on screen; `confirmed` is what the server last acknowledged. Rollback copies `confirmed` back.
- **One request at a time.** Writes go through a promise-chain queue, so they reach the server in the order you made them.
- **Coalescing.** If a card already has a move waiting to be sent, a newer drag doesn't add a second request; the waiting job sends the newest position when it runs.
- **Stale responses are ignored.** Each local change gets a sequence number. A late response updates `confirmed` but doesn't move a card you've since moved again.
- **Neighbours.** A move sends the ids of the closest cards that aren't themselves waiting to sync. The server works out the actual slot from its own data, so positions never tie.
- **Atomic write.** `findOneAndUpdate({ _id, version }, { $set: { columnId, orderIndex }, $inc: { version: 1 } })` runs inside a transaction together with the activity insert. A stale version matches nothing, so the server returns 409 and the client refreshes.
- **Rebalancing.** When the gap between two cards falls below 1e-6, the column is renumbered (1000, 2000, …) in the same transaction.
- **Duplicate cards are impossible.** Columns are derived from a single id → task map, so a card can't appear twice.

---

## 13. Theming and responsive layout

- **Theme:** an inline script in `client/index.html` reads `localStorage['taskflow.theme']`, or falls back to `prefers-color-scheme`. It sets `class="dark"` on `<html>` before CSS or React load, so there's never a flash. `useTheme` handles the toggle afterwards, and follows OS changes until you've picked a theme yourself.
- **Contrast:** text, badge and modal colour pairs are chosen to meet WCAG AA (at least 4.5:1) in both themes.
- **Same layout on every device:** the app fills exactly one screen (`100dvh`), and each column scrolls on its own.
  - **Phones:** each column is about 86% of the screen wide and snaps into place. You swipe between columns, or tap the column tabs, which show counts.
  - **Tablet and desktop:** the columns share the width equally, with a maximum width on very large monitors.
  - **Header:** one row everywhere; labels collapse to icons on narrow screens.
  - **Dialogs:** open as a bottom sheet on phones and a centred dialog on larger screens.
  - **Notches:** spacing allows for iPhone notches and the home bar.

---

## 14. Testing

```bash
npm test
```

- **Server** (`server/tests`, Vitest and Supertest): tests run against **mongodb-memory-server as a replica set**, so transactions behave as they do on Atlas. They cover:
  - CRUD status codes and validation, including tags
  - version conflicts (409)
  - two concurrent moves with the same version, where exactly one gets 200 and the other 409
  - rebalancing keeping order
  - every illegal workflow transition (422)
  - `GET /api/workflow`
  - the activity log and pagination
  - chaos mode
  - workflow configuration validation, and a four-state branching workflow
- **Client** (`client/src/**/*.test.js`, Vitest): store tests with a mocked API. They cover:
  - optimistic updates
  - rollback on 500, offline, 409 and failed deletes or edits (including tags)
  - serialisation and coalescing
  - ignoring stale responses
  - no duplicate cards
  - the workflow rules, step replay, and a four-state workflow from the "server"
  - ordering math and tag parsing

The first server test run downloads a MongoDB binary (about 70 MB) into `node_modules/.cache`. CI caches it.

---

## 15. Project structure

```
taskflow-kanban/
├─ client/                      React app (Vite)
│  ├─ index.html                inline zero-flicker theme script
│  ├─ public/favicon.svg
│  └─ src/
│     ├─ api/client.js          fetch wrapper, ApiError, endpoints
│     ├─ components/            Board, Column, TaskCard, TaskModal, ActivityDrawer, Header, ...
│     ├─ hooks/useTheme.js      theme toggle and OS-change listener
│     ├─ lib/                   ordering math, mutation queue, workflow (built from the API)
│     ├─ store/                 boardStore (optimistic logic), settingsStore (name, chaos)
│     └─ constants.js           priorities, badge styles, colour palette, tag rules
├─ server/
│  ├─ api/index.js              Vercel serverless entry
│  ├─ src/
│  │  ├─ workflow/              State pattern: WorkflowState, Workflow, states/, index.js
│  │  ├─ models/                Task, Activity
│  │  ├─ services/              taskService (transactions, moves, rebalancing, activity)
│  │  ├─ controllers/           HTTP layer
│  │  ├─ middleware/            validate (zod), chaos, errorHandler
│  │  ├─ lib/ordering.js        midpoint orderIndex math
│  │  ├─ routes.js, app.js, db.js, index.js, validation.js, errors.js, constants.js
│  │  └─ seed.js                npm run seed
│  └─ tests/                    API, concurrency and workflow tests
├─ .github/workflows/ci.yml     lint, tests and build on PRs and on main
├─ DECISIONS.md                 design decisions (the 4 required questions and more)
└─ package.json                 npm workspaces and root scripts
```

---

## 16. Deployment

Both parts can be deployed on Vercel's free tier, with MongoDB Atlas M0 as the database.

1. Push the repo to GitHub.
2. **API project:** in Vercel, choose **New Project**, import the repo and set the root directory to `server`. Add the environment variables `MONGODB_URI` and `CORS_ORIGIN` (the client URL). `server/api/index.js` exports the Express app, and `server/vercel.json` routes every path to it. The Mongo connection is cached between invocations.
3. **Client project:** import the same repo again, with root directory `client` and the Vite framework preset. Set `VITE_API_URL=https://<api-project>.vercel.app/api`.
4. In Atlas → Network Access, allow `0.0.0.0/0`, because Vercel's IPs change.
5. Run `npm run seed` locally against the Atlas URI once, so the board starts with data.
6. Put the client URL at the top of this README.

The serverless API has a cold start of about 1s after it's been idle.

---

## 17. Git workflow

- All work arrives on `main` through feature branches merged by pull request with a merge commit; nothing is committed to `main` directly.
- Branches: `chore/project-setup`, `feature/task-api`, `feature/seed-script`, `test/concurrency-guard`, `feature/optimistic-ui`, `feature/board-ui`, `docs/decisions-ci`, `feature/configurable-workflow`, …
- Commits follow [Conventional Commits](https://www.conventionalcommits.org/), for example `feat(server): atomic moves with fractional orderIndex and activity transaction`.
- CI (`.github/workflows/ci.yml`) runs lint, tests and the client build on every PR.

---

## 18. Troubleshooting

| Symptom                                                        | Cause and fix                                                                                                                                                     |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Transaction numbers are only allowed on a replica set member` | MongoDB is a standalone server. Use Atlas, or the Docker command above with `--replSet rs0`, then `rs.initiate()`.                                                |
| The board stays on the loading skeleton                        | The API is still connecting to MongoDB (it can take 10–30s on a slow network), or `MONGODB_URI` is wrong. Watch the `[server]` lines in the `npm run dev` output. |
| The board loads but is empty                                   | The database hasn't been seeded. Run `npm run seed`.                                                                                                              |
| `Port 5173 is in use, trying another one...`                   | Another dev server is running. Use the URL Vite prints, or stop the other process.                                                                                |
| Server tests fail with `fassert() failure` or time out         | The disk is full, or the MongoDB test binary failed to download. Free some disk space and run `npm test` from the repo root.                                      |
| Lots of "modified" files after `npm run format` on Windows     | Line endings. `.gitattributes` keeps the repo on LF, and `git add` normalises them.                                                                               |

---

## 19. AI usage

The brief allows transparent AI use. I built this project with help from Claude (Anthropic) for scaffolding, reviewing the concurrency design and drafting tests. I reviewed, ran and can explain every line. The real mistakes the AI made, and how I caught and fixed them, are in [DECISIONS.md → AI retrospective](DECISIONS.md#3-ai-retrospective).
