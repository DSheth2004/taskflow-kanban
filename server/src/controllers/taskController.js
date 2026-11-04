import * as tasks from '../services/taskService.js';
import { workflow } from '../workflow/index.js';

function actorOf(req) {
  let actor = req.get('x-actor') || '';
  try {
    actor = decodeURIComponent(actor);
  } catch {}
  return actor.trim().slice(0, 40) || 'Anonymous';
}

export function getWorkflow(_req, res) {
  res.json(workflow);
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
