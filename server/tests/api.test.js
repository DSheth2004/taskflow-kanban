import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { createApp } from '../src/app.js';
import { connectDB, disconnectDB } from '../src/db.js';
import { Task } from '../src/models/Task.js';
import { Activity } from '../src/models/Activity.js';

let replSet;
const app = createApp();

beforeAll(async () => {
  // A replica set (not a standalone mongod) so transactions behave as they do on Atlas.
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await connectDB(replSet.getUri('taskflow-test'));
  await Task.init();
  await Activity.init();
});

afterAll(async () => {
  await disconnectDB();
  await replSet?.stop();
});

beforeEach(async () => {
  await Promise.all([Task.deleteMany({}), Activity.deleteMany({})]);
});

const create = (body) => request(app).post('/api/tasks').send(body);
const move = (id, body) => request(app).patch(`/api/tasks/${id}/move`).send(body);
const columnTitles = async (columnId) =>
  (await Task.find({ columnId }).sort({ orderIndex: 1 })).map((t) => t.title);

describe('task CRUD', () => {
  it('creates a task with defaults and returns 201', async () => {
    const res = await create({ title: '  Write tests  ' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      title: 'Write tests',
      priority: 'Medium',
      columnId: 'todo',
      orderIndex: 1000,
      version: 0,
    });
    expect(res.body.id).toMatch(/^[a-f\d]{24}$/);
  });

  it('appends new tasks to the end of the column', async () => {
    await create({ title: 'A' });
    const res = await create({ title: 'B' });
    expect(res.body.orderIndex).toBe(2000);
  });

  it('rejects invalid input with 400 and an error envelope', async () => {
    const res = await create({ title: '', priority: 'Urgent' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.length).toBeGreaterThan(0);
  });

  it('updates with the current version and bumps it', async () => {
    const { body: task } = await create({ title: 'Old' });
    const res = await request(app)
      .patch(`/api/tasks/${task.id}`)
      .send({ title: 'New', version: 0 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ title: 'New', version: 1 });
  });

  it('returns 409 when updating with a stale version', async () => {
    const { body: task } = await create({ title: 'Old' });
    await request(app).patch(`/api/tasks/${task.id}`).send({ title: 'First', version: 0 });
    const res = await request(app)
      .patch(`/api/tasks/${task.id}`)
      .send({ title: 'Second', version: 0 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('VERSION_CONFLICT');
  });

  it('refuses to change columnId through PATCH', async () => {
    const { body: task } = await create({ title: 'X' });
    const res = await request(app)
      .patch(`/api/tasks/${task.id}`)
      .send({ columnId: 'done', version: 0 });
    expect(res.status).toBe(400);
  });

  it('deletes with 204, then 404', async () => {
    const { body: task } = await create({ title: 'Bye' });
    expect((await request(app).delete(`/api/tasks/${task.id}`)).status).toBe(204);
    expect((await request(app).delete(`/api/tasks/${task.id}`)).status).toBe(404);
  });

  it('returns 400 for malformed ids and 404 for unknown routes', async () => {
    expect((await request(app).delete('/api/tasks/not-an-id')).status).toBe(400);
    expect((await request(app).get('/api/nope')).status).toBe(404);
  });
});

describe('moving tasks', () => {
  it('places a card between its neighbours with a single-document write', async () => {
    const a = (await create({ title: 'A', columnId: 'done' })).body;
    const b = (await create({ title: 'B', columnId: 'done' })).body;
    const x = (await create({ title: 'X' })).body;

    const res = await move(x.id, { toColumnId: 'done', prevId: a.id, nextId: b.id, version: 0 });
    expect(res.status).toBe(200);
    expect(res.body.task).toMatchObject({ columnId: 'done', orderIndex: 1500, version: 1 });
    expect(await columnTitles('done')).toEqual(['A', 'X', 'B']);

    // Neighbours were not rewritten.
    const untouched = await Task.find({ _id: { $in: [a.id, b.id] } });
    expect(untouched.map((t) => t.version)).toEqual([0, 0]);
  });

  it('moves to the top and bottom of a column', async () => {
    const a = (await create({ title: 'A' })).body;
    const b = (await create({ title: 'B' })).body;
    const c = (await create({ title: 'C' })).body;

    await move(c.id, { toColumnId: 'todo', prevId: null, nextId: a.id, version: 0 });
    expect(await columnTitles('todo')).toEqual(['C', 'A', 'B']);

    await move(a.id, { toColumnId: 'todo', prevId: b.id, nextId: null, version: 0 });
    expect(await columnTitles('todo')).toEqual(['C', 'B', 'A']);
  });

  it('never ties with a card the client did not know about', async () => {
    const a = (await create({ title: 'A', columnId: 'done' })).body;
    await create({ title: 'Unseen', columnId: 'done' }); // client thinks A is last
    const x = (await create({ title: 'X' })).body;

    await move(x.id, { toColumnId: 'done', prevId: a.id, nextId: null, version: 0 });
    expect(await columnTitles('done')).toEqual(['A', 'X', 'Unseen']);
  });

  it('returns 409 when a named neighbour is no longer in the target column', async () => {
    const a = (await create({ title: 'A', columnId: 'done' })).body;
    const x = (await create({ title: 'X' })).body;
    await move(a.id, { toColumnId: 'in_progress', version: 0 });

    const res = await move(x.id, { toColumnId: 'done', prevId: a.id, version: 0 });
    expect(res.status).toBe(409);
  });

  it('lets exactly one of two concurrent moves with the same version win', async () => {
    const x = (await create({ title: 'X' })).body;
    const results = await Promise.all([
      move(x.id, { toColumnId: 'in_progress', version: 0 }),
      move(x.id, { toColumnId: 'done', version: 0 }),
    ]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 409]);

    const winner = results.find((r) => r.status === 200).body.task;
    const saved = await Task.findById(x.id);
    expect(saved.columnId).toBe(winner.columnId);
    expect(saved.version).toBe(1);
    // Only the winning move was logged.
    expect(await Activity.countDocuments({ action: 'moved' })).toBe(1);
  });

  it('rebalances a column when the gap gets too small, keeping order', async () => {
    const [a, b] = await Task.insertMany([
      { title: 'A', columnId: 'done', orderIndex: 1000 },
      { title: 'B', columnId: 'done', orderIndex: 1000 + 1e-7 },
      { title: 'C', columnId: 'done', orderIndex: 5000 },
    ]);
    const x = (await create({ title: 'X' })).body;

    const res = await move(x.id, {
      toColumnId: 'done',
      prevId: a.id,
      nextId: b.id,
      version: 0,
    });
    expect(res.status).toBe(200);
    expect(res.body.rebalanced).toBe(true);
    expect(await columnTitles('done')).toEqual(['A', 'X', 'B', 'C']);
    const indexes = (await Task.find({ columnId: 'done' }).sort({ orderIndex: 1 })).map(
      (t) => t.orderIndex
    );
    expect(indexes).toEqual([1000, 1500, 2000, 3000]);
  });

  it('rejects a task being its own neighbour', async () => {
    const x = (await create({ title: 'X' })).body;
    const res = await move(x.id, { toColumnId: 'todo', prevId: x.id, version: 0 });
    expect(res.status).toBe(400);
  });
});

describe('activity log', () => {
  it('records every mutation, newest first, with cursor pagination', async () => {
    const x = (await create({ title: 'Ship it' })).body;
    await move(x.id, { toColumnId: 'in_progress', version: 0 });
    await request(app).patch(`/api/tasks/${x.id}`).send({ priority: 'High', version: 1 });
    await request(app).delete(`/api/tasks/${x.id}`);

    const page1 = await request(app).get('/api/activity?limit=3');
    expect(page1.status).toBe(200);
    expect(page1.body.items.map((a) => a.action)).toEqual(['deleted', 'updated', 'moved']);
    expect(page1.body.items[2]).toMatchObject({ from: 'todo', to: 'in_progress' });
    expect(page1.body.items[1].changes).toEqual(['priority']);

    const page2 = await request(app).get(`/api/activity?limit=3&before=${page1.body.nextCursor}`);
    expect(page2.body.items.map((a) => a.action)).toEqual(['created']);
    expect(page2.body.nextCursor).toBeNull();
  });

  it('records the actor from the x-actor header', async () => {
    await create({ title: 'Mine' }).set('x-actor', 'Dhrumil');
    const { body } = await request(app).get('/api/activity');
    expect(body.items[0].actor).toBe('Dhrumil');
  });

  it('does not log anything when the write fails', async () => {
    const x = (await create({ title: 'X' })).body;
    await move(x.id, { toColumnId: 'done', version: 99 });
    expect(await Activity.countDocuments({ action: 'moved' })).toBe(0);
  });
});

describe('chaos middleware', () => {
  it('fails writes with 500 on ?fail=1 and leaves the data untouched', async () => {
    const x = (await create({ title: 'X' })).body;
    const res = await request(app)
      .patch(`/api/tasks/${x.id}/move?fail=1`)
      .send({ toColumnId: 'done', version: 0 });
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('CHAOS');
    expect((await Task.findById(x.id)).columnId).toBe('todo');
  });

  it('does not affect reads', async () => {
    expect((await request(app).get('/api/tasks').set('x-chaos', '1')).status).toBe(200);
  });
});
