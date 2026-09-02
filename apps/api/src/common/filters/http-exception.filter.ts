import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { RequestContext } from '../context/request-context';

// stable error shape for every response. non-HttpExceptions get their
// stack logged with requestId, never sent to the client.
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = RequestContext.requestId;

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const message = isHttpException
      ? exception.getResponse()
      : 'Internal server error';

    if (!isHttpException) {
      this.logger.error(
        `Unhandled exception on ${request.method} ${request.url} [requestId=${requestId}]`,
        (exception as Error)?.stack,
      );
    }

    response.status(status).json({
      statusCode: status,
      path: request.url,
      requestId,
      timestamp: new Date().toISOString(),
      ...(typeof message === 'string' ? { message } : message),
    });
  }
}
