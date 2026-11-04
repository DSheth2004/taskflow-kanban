import 'dotenv/config';
import { connectDB, disconnectDB } from './db.js';
import { Task } from './models/Task.js';
import { Activity } from './models/Activity.js';
import { STEP } from './lib/ordering.js';
import { workflow } from './workflow/index.js';

const SEED = {
  todo: [
    ['Set up OAuth login', 'Google + GitHub providers via passport.', 'High', ['auth', 'backend']],
    [
      'Design empty states',
      'Illustrations for empty columns and activity log.',
      'Low',
      ['design', 'ux'],
    ],
    [
      'Write API rate limiter',
      'Token bucket per IP on write routes.',
      'Medium',
      ['backend', 'security'],
    ],
    [
      'Add keyboard shortcuts',
      'N = new task, / = focus search, ? = help.',
      'Low',
      ['frontend', 'a11y'],
    ],
    [
      'Audit npm dependencies',
      'Run npm audit and bump anything critical.',
      'Medium',
      ['security', 'chore'],
    ],
    ['Plan Q3 roadmap review', 'Collect input from design and support.', 'Medium', ['planning']],
  ],
  in_progress: [
    [
      'Migrate images to CDN',
      'Move uploads from the API box to object storage.',
      'High',
      ['infra', 'performance'],
    ],
    [
      'Refactor board store',
      'Split selectors from actions for readability.',
      'Medium',
      ['frontend', 'refactor'],
    ],
    [
      'Fix Safari drag ghosting',
      'Drag preview renders offset on Safari 17.',
      'High',
      ['bug', 'frontend'],
    ],
    ['Write onboarding emails', 'Three-email drip for new workspaces.', 'Low', ['marketing']],
  ],
  done: [
    [
      'Project scaffolding',
      'Vite client, Express server, shared lint config.',
      'Medium',
      ['chore'],
    ],
    [
      'Task CRUD endpoints',
      'Create, read, update, delete with zod validation.',
      'High',
      ['backend', 'api'],
    ],
    ['Database seeder', 'npm run seed resets the board to this data.', 'Low', ['backend', 'dx']],
    ['CI pipeline', 'Lint and tests on every pull request.', 'Medium', ['devops']],
    ['Dark mode palette', 'Checked badge colours against WCAG AA.', 'Low', ['design', 'a11y']],
  ],
};

async function seed() {
  for (const columnId of Object.keys(SEED)) {
    if (!workflow.has(columnId)) throw new Error(`Seed data uses unknown state "${columnId}"`);
  }
  await connectDB();
  await Promise.all([Task.deleteMany({}), Activity.deleteMany({})]);

  const docs = Object.entries(SEED).flatMap(([columnId, rows]) =>
    rows.map(([title, description, priority, tags], i) => ({
      title,
      description,
      priority,
      tags,
      columnId,
      orderIndex: (i + 1) * STEP,
    }))
  );
  const tasks = await Task.insertMany(docs);
  await Activity.insertMany(
    tasks.map((t) => ({
      taskId: t._id,
      taskTitle: t.title,
      action: 'created',
      to: t.columnId,
      actor: 'Seeder',
    }))
  );

  const counts = Object.entries(SEED).map(([col, rows]) => `${col}: ${rows.length}`);
  console.log(`Seeded ${tasks.length} tasks (${counts.join(', ')}).`);
}

seed()
  .catch((err) => {
    console.error('Seeding failed:', err.message);
    process.exitCode = 1;
  })
  .finally(disconnectDB);
