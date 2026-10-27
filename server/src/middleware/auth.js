import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { config } from '../config.js';
import { unauthorized } from '../lib/errors.js';
import { User } from '../models/User.js';

const TOKEN_TTL = '7d';

export function signToken(userId) {
  return jwt.sign({ sub: userId.toString() }, config.jwtSecret, { expiresIn: TOKEN_TTL });
}

export function verifyToken(token) {
  const payload = jwt.verify(token, config.jwtSecret);
  if (!mongoose.isValidObjectId(payload.sub)) throw new Error('Bad subject');
  return payload.sub;
}

function readToken(req) {
  const header = req.get('authorization') || '';
  const [scheme, token] = header.split(' ');
  return scheme === 'Bearer' && token ? token : null;
}

export async function requireAuth(req, _res, next) {
  const token = readToken(req);
  if (!token) return next(unauthorized());
  try {
    req.userId = verifyToken(token);
  } catch (err) {
    const expired = err?.name === 'TokenExpiredError';
    const error = unauthorized(
      expired ? 'Your login has expired. Please log in again.' : 'Please log in to continue.',
    );
    error.code = expired ? 'TOKEN_EXPIRED' : 'UNAUTHORIZED';
    return next(error);
  }
  // A valid token for an account that was deleted (or reset by the demo
  // seed) means "log in again", not a confusing error on every screen.
  try {
    if (!(await User.exists({ _id: req.userId }))) {
      const error = unauthorized('This account no longer exists. Please log in again.');
      error.code = 'ACCOUNT_GONE';
      return next(error);
    }
  } catch (err) {
    return next(err);
  }
  return next();
}

// For routes anyone can use, where a logged-in user gets a little more
// (for example, the feed marks the user's own posts).
export function optionalAuth(req, _res, next) {
  const token = readToken(req);
  if (token) {
    try {
      req.userId = verifyToken(token);
    } catch {
      // An expired token on a public route just means "browse as a guest".
    }
  }
  next();
}
