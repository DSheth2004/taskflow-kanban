import { useSettingsStore } from '../store/settingsStore';

const BASE = import.meta.env.VITE_API_URL || '/api';

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status; // 0 means the request never reached the server
    this.code = code;
  }
}

async function request(path, { method = 'GET', body } = {}) {
  const { actor, chaos } = useSettingsStore.getState();
  const headers = { 'Content-Type': 'application/json' };
  // Header values must be ASCII, so the name is URI-encoded and decoded on the server.
  if (actor) headers['x-actor'] = encodeURIComponent(actor);
  if (chaos) headers['x-chaos'] = '1';

  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'You appear to be offline');
  }

  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(
      res.status,
      data?.error?.code ?? 'HTTP_ERROR',
      data?.error?.message ?? `Request failed (${res.status})`
    );
  }
  return data;
}

export const api = {
  listTasks: () => request('/tasks'),
  createTask: (task) => request('/tasks', { method: 'POST', body: task }),
  updateTask: (id, changes) => request(`/tasks/${id}`, { method: 'PATCH', body: changes }),
  deleteTask: (id) => request(`/tasks/${id}`, { method: 'DELETE' }),
  moveTask: (id, move) => request(`/tasks/${id}/move`, { method: 'PATCH', body: move }),
  listActivity: ({ limit = 30, before } = {}) =>
    request(`/activity?limit=${limit}${before ? `&before=${before}` : ''}`),
};
