import * as tasks from '../services/taskService.js';

// The UI asks for a display name and sends it on every request; there is no auth in scope.
// The client URI-encodes it because header values must be ASCII.
function actorOf(req) {
  let actor = req.get('x-actor') || '';
  try {
    actor = decodeURIComponent(actor);
  } catch {
    // not encoded; use as-is
  }
  return actor.trim().slice(0, 40) || 'Anonymous';
}

export async function list(_req, res) {
  res.json(await tasks.listTasks());
}

export async function create(req, res) {
  res.status(201).json(await tasks.createTask(req.valid.body, actorOf(req)));
}

export async function update(req, res) {
  res.json(await tasks.updateTask(req.valid.params.id, req.valid.body, actorOf(req)));
}

export async function remove(req, res) {
  await tasks.deleteTask(req.valid.params.id, actorOf(req));
  res.status(204).end();
}

export async function move(req, res) {
  res.json(await tasks.moveTask(req.valid.params.id, req.valid.body, actorOf(req)));
}

export async function activity(req, res) {
  res.json(await tasks.listActivity(req.valid.query));
}
