import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { RequestContext } from '../context/request-context';

// Opens the RequestContext scope for every request. tenantId/userId get
// filled in later by JwtAuthGuard once we've verified who's calling —
// this just guarantees a requestId exists from the start, so failed
// requests (even pre-auth ones) still show up correlated in the logs.
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const requestId =
      (req.headers['x-request-id'] as string) || randomUUID();
    res.setHeader('x-request-id', requestId);

    RequestContext.run({ requestId }, () => next());
  }
}
