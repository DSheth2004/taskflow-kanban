import { HttpError } from '../errors.js';

// Parses req[part] with a zod schema and replaces it with the parsed (defaulted, trimmed) value.
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
    // Express 5 makes req.query a getter, so store parsed values on a separate key.
    req.valid = { ...req.valid, [part]: result.data };
  }
  next();
};
