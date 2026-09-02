import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { RequestContext } from '../context/request-context';

/**
 * Opens the RequestContext AsyncLocalStorage scope for every request.
 *
 * tenantId/userId are NOT known yet at this point (auth runs later, as a
 * guard) — this middleware only guarantees a requestId exists from the
 * very start of the request lifecycle, e.g. for log correlation on
 * requests that fail before auth even runs. JwtAuthGuard populates
 * tenantId/userId once the token is verified; see auth/jwt-auth.guard.ts.
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const requestId =
      (req.headers['x-request-id'] as string) || randomUUID();
    res.setHeader('x-request-id', requestId);

    RequestContext.run({ requestId }, () => next());
  }
}
