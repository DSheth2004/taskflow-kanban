import { Router } from 'express';
import * as c from './controllers/taskController.js';
import { validate } from './middleware/validate.js';
import {
  idParams,
  createTaskBody,
  updateTaskBody,
  moveTaskBody,
  activityQuery,
} from './validation.js';

export const router = Router();

router.get('/health', (_req, res) => res.json({ ok: true }));

router.get('/workflow', c.getWorkflow);

router.get('/tasks', c.list);
router.post('/tasks', validate({ body: createTaskBody }), c.create);
router.patch('/tasks/:id', validate({ params: idParams, body: updateTaskBody }), c.update);
router.delete('/tasks/:id', validate({ params: idParams }), c.remove);
router.patch('/tasks/:id/move', validate({ params: idParams, body: moveTaskBody }), c.move);

router.get('/activity', validate({ query: activityQuery }), c.activity);
