import mongoose from 'mongoose';
import { HttpError } from '../errors.js';

export function notFoundRoute(req, _res, next) {
  next(new HttpError(404, 'ROUTE_NOT_FOUND', `No route for ${req.method} ${req.path}`));
}

// eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity (4 args)
export function errorHandler(err, _req, res, _next) {
  let error = err;
  if (err instanceof mongoose.Error.ValidationError) {
    error = new HttpError(400, 'VALIDATION_ERROR', err.message);
  } else if (err instanceof mongoose.Error.CastError) {
    error = new HttpError(400, 'BAD_REQUEST', `Invalid ${err.path}`);
  } else if (err.type === 'entity.parse.failed') {
    error = new HttpError(400, 'BAD_JSON', 'Request body is not valid JSON');
  } else if (!(err instanceof HttpError)) {
    console.error(err);
    error = new HttpError(500, 'INTERNAL', 'Something went wrong');
  }

  const body = { error: { code: error.code, message: error.message } };
  if (error.details) body.error.details = error.details;
  res.status(error.status).json(body);
}
