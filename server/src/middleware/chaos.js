import { HttpError } from '../errors.js';

const WRITE_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

// Fails write requests on purpose so the client's rollback path can be demoed and tested.
// Triggered per request by ?fail=1 or an `x-chaos: 1` header, or randomly via CHAOS_RATE.
export function chaos(req, _res, next) {
  if (!WRITE_METHODS.has(req.method)) return next();
  const forced = req.query.fail === '1' || req.get('x-chaos') === '1';
  const rate = Number(process.env.CHAOS_RATE) || 0;
  if (forced || Math.random() < rate) {
    return next(new HttpError(500, 'CHAOS', 'Simulated server failure (chaos mode)'));
  }
  next();
}
