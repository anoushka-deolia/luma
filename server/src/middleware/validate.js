import { badRequest } from '../lib/errors.js';

/**
 * Parses req[part] with a zod schema and replaces it with the parsed value,
 * so handlers only ever see validated, trimmed data.
 */
export function validate(schema, part = 'body') {
  return (req, _res, next) => {
    const result = schema.safeParse(req[part] ?? {});
    if (!result.success) {
      const fields = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join('.') || part;
        if (!fields[key]) fields[key] = issue.message;
      }
      return next(badRequest('Some of the details are not valid.', 'VALIDATION_ERROR', fields));
    }
    if (part === 'query') {
      req.validatedQuery = result.data; // req.query is read-only in Express 5
    } else {
      req[part] = result.data;
    }
    return next();
  };
}
