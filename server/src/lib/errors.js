export class HttpError extends Error {
  constructor(status, message, code, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message, code = 'BAD_REQUEST', details) =>
  new HttpError(400, message, code, details);
export const unauthorized = (message = 'Please log in to continue.') =>
  new HttpError(401, message, 'UNAUTHORIZED');
export const forbidden = (message = 'You do not have access to this.', code = 'FORBIDDEN') =>
  new HttpError(403, message, code);
export const notFound = (message = 'We could not find that.') =>
  new HttpError(404, message, 'NOT_FOUND');
export const conflict = (message, code = 'CONFLICT') => new HttpError(409, message, code);
