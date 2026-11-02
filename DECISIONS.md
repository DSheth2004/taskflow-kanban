# DECISIONS

## 1. State management: why Zustand

**Choice:** one Zustand store (`client/src/store/boardStore.js`) holding four maps:

| Key            | Meaning                                                                                 |
| -------------- | --------------------------------------------------------------------------------------- |
| `tasks`        | id → task **as shown on screen**, including optimistic changes                          |
| `confirmed`    | id → task **as the server last acknowledged it** (rollback target and `version` source) |
| `pendingMoves` | id → sequence number of the newest unsaved move of that card                            |
| `pendingEdits` | id → sequence number of the newest unsaved content edit                                 |

Columns are **derived** (`sortedColumn(tasks, columnId)`), never stored. A card therefore exists exactly once, which makes "duplicate card after a fast drag" impossible by construction.

**Alternatives considered**

- **Context + useReducer.** Every consumer of the context re-renders on every change. Dragging one card would re-render every card. Working around that needs split contexts or memo plumbing.
- **Redux Toolkit.** It would work well: slices, `createAsyncThunk` and devtools time-travel. But optimistic updates with rollback still have to be written by hand (or with RTK Query's `onQueryStarted` + `patchResult.undo()`), and the boilerplate (slice, thunks, typed selectors, Provider) is several times larger for a board with one entity.
- **TanStack Query.** Very good for caching and refetching server state. Its optimistic pattern (`onMutate` snapshot, `onError` restore) is per mutation, not per entity. It also does not serialise mutations across different cards, which is exactly the hard part here.

**Why Zustand wins here**

- Selector subscriptions: `useBoardStore(s => s.pendingMoves[id] != null)` re-renders only the card whose "Saving" dot changes. The store replaces just the changed task object, so `memo(TaskCard)` skips every other card.
- Actions are plain functions that can call `get()` at any time. The queued job reads the **latest** state when it starts, not the state from when the drag happened, which is what makes coalescing trivial.
- No Provider, so the store can be created fresh per test (`createBoardStore()`).

**Limitations**

- No built-in devtools time-travel (Zustand has a `devtools` middleware; I didn't add it).
- No cache invalidation, background refetch or request dedupe. I hand-wrote the small parts I needed (`refresh()`).
- The "two copies" model (`tasks` + `confirmed`) is extra memory and something to keep in sync. At 50k tasks it would need normalising per column (see Q4).

## 2. Race conditions: five drags in one second on 3G

The scenario: the user drags five cards (some of them twice) within a second, and each request takes ~2s.

**Client** (`boardStore.moveTask` → `lib/mutationQueue.js`)

1. **Instant UI.** Each drag updates `tasks[id]` right away with a local `orderIndex` guess (`orderBetween(prev, next)`). `pendingMoves[id]` gets a new sequence number, and the card shows a "Saving" dot.
2. **One request at a time.** The job is appended to a promise chain, so requests leave in exactly the order the user acted and never overtake each other on the network.
3. **Coalescing.** Jobs are keyed `move:<id>`. If card A already has a job **waiting** (not yet sent), the second drag of A doesn't enqueue anything. The waiting job reads A's position when it starts, so it sends only the final position. Five drags become at most one request per card, plus one per card already in flight.
4. **Neighbours come from settled cards only.** When a job runs, it sends `prevId`/`nextId` = the nearest cards in that column that **don't** have a pending move. Those are the only cards guaranteed to be where the server thinks they are. A card still waiting to sync will position itself relative to this one when its own job runs. Because jobs are serial, by then this one is confirmed.
5. **Stale responses can't win.** The job remembers the sequence number it sent. If the user moved the card again while the request was in flight, the response updates `confirmed` (new version) but **not** the on-screen position.
6. **Version.** Each request carries `confirmed[id].version`, so serial requests always carry the latest version.

**Server** (`server/src/services/taskService.js → moveTask`)

7. Inside a transaction: load the card, return **409** if `version` doesn't match, and load the named neighbours. Return **409** if a neighbour has left the target column, because the client's board is stale.
8. The slot is computed **from the server's own data**. It anchors on `prev`, looks up the real next card, and takes the midpoint. A card the client hasn't seen can never end up with the same `orderIndex` (there's a test for this).
9. **One atomic write:** `findOneAndUpdate({ _id, version }, { $set: { columnId, orderIndex }, $inc: { version: 1 } })`. No other card is rewritten, so there is no "overwrite the whole column array" bug. Zero matches means someone else won, and we return 409. Two simultaneous requests with the same version give exactly one 200 and one 409 (tested).
10. The activity entry is inserted in **the same transaction**, so a failed or conflicting move never shows up in the log.
11. **Rebalancing.** When the gap between neighbours drops below `1e-6` (about 40 consecutive inserts into the same gap), the column is renumbered 1000, 2000, … with one `bulkWrite` inside the same transaction. The response says `rebalanced: true` and the client refreshes. Renumbering doesn't bump other cards' versions, because no card's relative order changes and bumping would cause pointless 409s for other users.

**Failure handling**

- A 500 or network error reverts the card to `confirmed[id]` and shows a toast. A newer queued move of the same card is dropped too (its job finds no pending entry), so the card lands on the last state the server definitely has.
- A 409 also triggers `refresh()`. The refresh goes **through the queue**, so it runs after every request already sent. Local changes still queued behind it are kept on top of the fresh data.

**Why version numbers instead of locks?** Conflicts are rare and requests are short. Optimistic concurrency costs one extra field and one filter condition. Locks would need lock documents, expiry and cleanup when a client disappears mid-drag.

## 3. AI retrospective

I used Claude (via Claude Code) to scaffold the project, review the concurrency design and draft tests. Every suggestion was run, tested and read before I kept it. Where it was wrong:

1. **Test assumed the queue starts jobs synchronously.** The first draft of the coalescing test called `moveTask` three times in a row and expected one request to already be in flight. In fact the queue starts each job on a later microtask, so all three calls were folded into one job. That behaviour is better, but the test was asserting something false. I added a `flush()` between calls so the test checks "in flight + queued" separately from "queued + queued".
2. **Neighbours that are themselves moving.** The first idea was to send the card's on-screen neighbours. With fast drags, one of those neighbours can have its own move still queued, so the server still sees it in its old column and returns 409. Normal fast use would cause constant refreshes. Fix: pick only neighbours with no pending move (point 4 above).
3. **Rebalancing caused false conflicts.** An early version renumbered the whole column _including_ the card being moved and bumped every version. The card's own conditional update then failed against its new version, and other users got 409s for cards whose order hadn't changed. Fix: exclude the moving card and don't bump versions during a rebalance.
4. **Node version mismatch.** It suggested `node --env-file-if-exists`, which only exists in Node 22.9+, while the project targets Node 20. I switched to `dotenv`.
5. **Zustand v5 selector returning a new array.** A selector like `s => sortedColumn(s.tasks, id)` returns a new array every time, which in Zustand v5 causes an infinite render loop. The columns are now derived with `useMemo` from the `tasks` map in `Board.jsx`.

_(Add anything else you hit while building, such as deployment issues and dnd-kit quirks. Real mistakes are what this section is graded on.)_

## 4. At scale: 50,000 tasks and 100 concurrent users

**What breaks first**

1. **`GET /api/tasks` returns everything.** 50k documents is roughly 15–25 MB of JSON on every load and every 409 refresh. That's seconds of transfer and parse, and the client then sorts 50k items per column on each change (`sortedColumn` is O(n log n) over all tasks).
2. **Rendering.** 50k DOM cards with dnd-kit sortable hooks will freeze the tab. dnd-kit measures every droppable on drag start.
3. **No real-time sync.** With 100 users, boards go stale within seconds. Stale boards turn into 409s, each 409 triggers a full reload (point 1), and the result is a refresh storm.
4. **Hot gaps.** Many users inserting at the top of "To Do" exhaust the float gap quickly, so rebalances (which renumber a whole column in one transaction) become frequent and contend with each other.
5. **The activity collection** grows without bound, at about 1 entry per action.

**Re-architecture**

- **Paginate per column:** `GET /api/columns/:id/tasks?after=<orderIndex>&limit=50`, served by the existing `{ columnId, orderIndex }` index. Add infinite scroll per column and **virtualise** with `react-window` / `@tanstack/virtual`. dnd-kit can work with virtual lists if only the visible window is registered.
- **Normalise the store per column** (sorted id arrays kept up to date incrementally) instead of re-sorting a 50k map.
- **Real-time:** MongoDB **change streams** into a Socket.IO (or SSE) gateway. Clients apply remote patches to `confirmed` and to `tasks` (except where a local change is pending). 409s become rare, and a 409 updates one card instead of reloading everything.
- **Ordering:** switch from floats to **LexoRank-style string keys**, which have effectively unlimited precision between two neighbours. Rebalances become rare background jobs per bucket instead of a blocking transaction.
- **Activity:** TTL index or monthly archiving, a `{ taskId, createdAt }` index for per-card history, and writing the log through the change stream (outbox pattern) instead of inside every transaction.
- **Infrastructure:** move off the M0 tier (shared CPU, connection limits), run a connection pool per API instance, and add rate limiting on write routes. Serverless cold starts (~1s on Vercel) would also matter at this scale, so use a long-running Node service once WebSockets are needed.
