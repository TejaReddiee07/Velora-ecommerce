import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';

/**
 * Validates request input against Zod schemas. Parsed values are written to
 * `req.body`, `req.valid.query` and `req.valid.params` — handlers must only
 * read validated data, which also blocks NoSQL operator injection
 * (objects such as `{ "$gt": "" }` never pass a string/number schema).
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      valid: { query: any; params: any };
    }
  }
}

export function validate(schemas: { body?: ZodType; query?: ZodType; params?: ZodType }) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.valid = req.valid ?? { query: {}, params: {} };
      if (schemas.params) req.valid.params = schemas.params.parse(req.params);
      if (schemas.query) req.valid.query = schemas.query.parse(req.query);
      if (schemas.body) req.body = schemas.body.parse(req.body ?? {});
      next();
    } catch (err) {
      next(err);
    }
  };
}
