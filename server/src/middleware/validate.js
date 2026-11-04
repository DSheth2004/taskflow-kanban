import { HttpError } from '../errors.js';

export const validate = (schemas) => (req, _res, next) => {
  for (const [part, schema] of Object.entries(schemas)) {
    const result = schema.safeParse(req[part] ?? {});
    if (!result.success) {
      const details = result.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      }));
      const first = details[0];
      return next(
        new HttpError(400, 'VALIDATION_ERROR', `${first.path || part} ${first.message}`, details)
      );
    }

    req.valid = { ...req.valid, [part]: result.data };
  }
  next();
};
