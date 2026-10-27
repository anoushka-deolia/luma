import mongoose from 'mongoose';
import { HttpError } from '../lib/errors.js';

export function notFoundHandler(req, res) {
  res.status(404).json({ error: 'We could not find that.', code: 'NOT_FOUND' });
}

// Every error leaves the API in one shape: { error, code, fields? }.
// Internal details are logged on the server and never sent to the user.
export function errorHandler(err, req, res, _next) {
  if (err instanceof HttpError) {
    return res
      .status(err.status)
      .json({ error: err.message, code: err.code, ...(err.details ? { fields: err.details } : {}) });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'The request was not valid JSON.', code: 'BAD_JSON' });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'That is too large to save.', code: 'TOO_LARGE' });
  }
  if (err instanceof mongoose.Error.CastError) {
    return res.status(404).json({ error: 'We could not find that.', code: 'NOT_FOUND' });
  }
  if (err instanceof mongoose.Error.ValidationError) {
    return res.status(400).json({ error: 'Some of the details are not valid.', code: 'VALIDATION_ERROR' });
  }
  if (err?.code === 11000) {
    return res.status(409).json({ error: 'That already exists.', code: 'DUPLICATE' });
  }
  console.error(`[${req.method} ${req.originalUrl}]`, err);
  return res
    .status(500)
    .json({ error: 'Something went wrong on our side. Your data is safe.', code: 'SERVER_ERROR' });
}
