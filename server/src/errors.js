export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const notFound = (what = 'Task') => new HttpError(404, 'NOT_FOUND', `${what} not found`);

export const conflict = (message = 'Task was changed by someone else. Refresh and try again.') =>
  new HttpError(409, 'VERSION_CONFLICT', message);
