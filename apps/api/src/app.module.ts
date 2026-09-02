import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { BullModule } from '@nestjs/bullmq';
import { randomUUID } from 'crypto';

import { PrismaModule } from './common/prisma/prisma.module';
import { RequestContextMiddleware } from './common/middleware/request-context.middleware';

// feature modules get added here as each phase lands, see ROADMAP.
// nothing under modules/ exists yet beyond empty folders.

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    LoggerModule.forRoot({
      pinoHttp: {
        genReqId: (req) =>
          (req.headers['x-request-id'] as string) || randomUUID(),
        redact: ['req.headers.authorization'],
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { singleLine: true } }
            : undefined,
      },
    }),

    PrometheusModule.register({ path: '/metrics' }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),

    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST ?? 'localhost',
        port: Number(process.env.REDIS_PORT ?? 6379),
      },
    }),

    PrismaModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
