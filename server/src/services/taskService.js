import mongoose from 'mongoose';
import { Task } from '../models/Task.js';
import { Activity } from '../models/Activity.js';
import { orderBetween, needsRebalance, STEP } from '../lib/ordering.js';
import { workflow } from '../workflow/index.js';
import { notFound, conflict, invalidTransition, HttpError } from '../errors.js';

async function inTransaction(fn) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

function logActivity(session, task, action, actor, extra = {}) {
  return Activity.create([{ taskId: task._id, taskTitle: task.title, action, actor, ...extra }], {
    session,
  });
}

export function listTasks() {
  return Task.find().sort({ columnId: 1, orderIndex: 1 });
}

const sameValue = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function createTask(
  { title, description, priority, tags = [], columnId = workflow.initial.id },
  actor
) {
  if (!workflow.stateOf(columnId).isInitial) {
    throw invalidTransition(`New tasks must start in ${workflow.initial.label}.`);
  }
  return inTransaction(async (session) => {
    const last = await Task.findOne({ columnId }).sort({ orderIndex: -1 }).session(session);
    const [task] = await Task.create(
      [
        {
          title,
          description,
          priority,
          tags,
          columnId,
          orderIndex: orderBetween(last?.orderIndex, null),
        },
      ],
      { session }
    );
    await logActivity(session, task, 'created', actor, { to: columnId });
    return task;
  });
}

export function updateTask(id, { version, ...fields }, actor) {
  return inTransaction(async (session) => {
    const before = await Task.findById(id).session(session);
    if (!before) throw notFound();
    if (before.version !== version) throw conflict();

    const current = before.toObject();
    const changes = Object.keys(fields).filter((key) => !sameValue(fields[key], current[key]));
    if (changes.length === 0) return before;

    const task = await Task.findOneAndUpdate(
      { _id: id, version },
      { $set: fields, $inc: { version: 1 } },
      { new: true, runValidators: true, session }
    );
    if (!task) throw conflict();
    await logActivity(session, task, 'updated', actor, { changes });
    return task;
  });
}

export function deleteTask(id, actor) {
  return inTransaction(async (session) => {
    const task = await Task.findByIdAndDelete(id, { session });
    if (!task) throw notFound();
    await logActivity(session, task, 'deleted', actor, { from: task.columnId });
  });
}

async function rebalanceColumn(columnId, excludeId, session) {
  const tasks = await Task.find({ columnId, _id: { $ne: excludeId } })
    .sort({ orderIndex: 1 })
    .select('_id')
    .session(session);
  await Task.bulkWrite(
    tasks.map((t, i) => ({
      updateOne: { filter: { _id: t._id }, update: { $set: { orderIndex: (i + 1) * STEP } } },
    })),
    { session }
  );
}

async function findSlot(id, columnId, prevId, nextId, session) {
  const inColumn = { columnId, _id: { $ne: id } };
  const load = async (neighbourId) => {
    if (!neighbourId) return null;
    const doc = await Task.findOne({ ...inColumn, _id: neighbourId }).session(session);

    if (!doc) throw conflict('The board changed while you were moving this card. Refreshing.');
    return doc;
  };
  const [prevDoc, nextDoc] = [await load(prevId), await load(nextId)];

  if (prevDoc) {
    const after = await Task.findOne({ ...inColumn, orderIndex: { $gt: prevDoc.orderIndex } })
      .sort({ orderIndex: 1 })
      .session(session);
    return { prev: prevDoc.orderIndex, next: after?.orderIndex };
  }
  if (nextDoc) {
    const before = await Task.findOne({ ...inColumn, orderIndex: { $lt: nextDoc.orderIndex } })
      .sort({ orderIndex: -1 })
      .session(session);
    return { prev: before?.orderIndex, next: nextDoc.orderIndex };
  }
  const last = await Task.findOne(inColumn).sort({ orderIndex: -1 }).session(session);
  return { prev: last?.orderIndex, next: undefined };
}

export function moveTask(id, { toColumnId, prevId, nextId, version }, actor) {
  if (prevId === id || nextId === id) {
    throw new HttpError(400, 'BAD_REQUEST', 'A task cannot be its own neighbour');
  }
  return inTransaction(async (session) => {
    const current = await Task.findById(id).session(session);
    if (!current) throw notFound();
    if (current.version !== version) throw conflict();

    const from = workflow.stateOf(current.columnId);
    if (!from.canMoveTo(toColumnId)) {
      throw invalidTransition(workflow.whyNot(from.id, toColumnId));
    }

    let slot = await findSlot(id, toColumnId, prevId, nextId, session);
    let rebalanced = false;
    if (needsRebalance(slot.prev, slot.next)) {
      await rebalanceColumn(toColumnId, id, session);
      slot = await findSlot(id, toColumnId, prevId, nextId, session);
      rebalanced = true;
    }

    const task = await Task.findOneAndUpdate(
      { _id: id, version },
      {
        $set: { columnId: toColumnId, orderIndex: orderBetween(slot.prev, slot.next) },
        $inc: { version: 1 },
      },
      { new: true, session }
    );
    if (!task) throw conflict();

    await logActivity(session, task, 'moved', actor, { from: current.columnId, to: toColumnId });
    return { task, rebalanced };
  });
}

export async function listActivity({ limit, before }) {
  const filter = before ? { _id: { $lt: before } } : {};

  const items = await Activity.find(filter)
    .sort({ _id: -1 })
    .limit(limit + 1);
  const hasMore = items.length > limit;
  const page = hasMore ? items.slice(0, limit) : items;
  return { items: page, nextCursor: hasMore ? page.at(-1).id : null };
}
