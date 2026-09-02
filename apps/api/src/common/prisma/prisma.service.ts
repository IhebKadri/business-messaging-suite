import {
  INestApplication,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { RequestContext } from '../context/request-context';

// keep in sync with schema.prisma — anything with a tenantId column goes here
const TENANT_SCOPED_MODELS = new Set([
  'User',
  'WhatsappAccount',
  'Contact',
  'Tag',
  'Conversation',
  'Message',
  'Campaign',
  'Flow',
]);

const READ_ACTIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
]);

const WRITE_ACTIONS = new Set([
  'create',
  'createMany',
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
]);

// auto-injects tenantId into every query against a scoped model, pulled
// from RequestContext. services just call prisma.contact.findMany(...)
// like normal, no manual where: { tenantId } to forget.
function tenantScopingExtension(getTenantId: () => string | undefined) {
  return Prisma.defineExtension((client) =>
    client.$extends({
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            const bypass = (args as { __bypassTenantScope?: boolean })
              ?.__bypassTenantScope;
            if (bypass) {
              delete (args as Record<string, unknown>).__bypassTenantScope;
              return query(args);
            }

            if (!model || !TENANT_SCOPED_MODELS.has(model)) {
              return query(args);
            }

            const tenantId = getTenantId();
            if (!tenantId) {
              throw new Error(
                `Tenant-scoped query on ${model}.${operation} attempted with no ` +
                  `tenant in RequestContext. If this is an intentional system-level ` +
                  `operation, use prisma.asSystem() explicitly.`,
              );
            }

            if (READ_ACTIONS.has(operation)) {
              const a = args as Record<string, unknown>;
              a.where = { ...(a.where as object), tenantId };
            } else if (WRITE_ACTIONS.has(operation)) {
              const a = args as Record<string, unknown>;
              if (operation === 'create') {
                a.data = { ...(a.data as object), tenantId };
              } else if (operation === 'createMany') {
                const data = a.data as Record<string, unknown>[];
                a.data = data.map((d) => ({ ...d, tenantId }));
              } else {
                a.where = { ...(a.where as object), tenantId };
              }
            }

            return query(args);
          },
        },
      },
    }),
  );
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  readonly scoped: ReturnType<typeof this.buildScopedClient>;

  constructor() {
    super({
      log:
        process.env.NODE_ENV === 'development'
          ? ['warn', 'error']
          : ['error'],
    });
    this.scoped = this.buildScopedClient();
  }

  private buildScopedClient() {
    return this.$extends(
      tenantScopingExtension(() => RequestContext.tenantId),
    );
  }

  // escape hatch for actual cross-tenant ops (admin tooling, signup flow).
  // named loudly on purpose — every call site here skips tenant isolation.
  asSystem() {
    return this as PrismaClient;
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Prisma connected');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  async enableShutdownHooks(app: INestApplication) {
    process.on('beforeExit', async () => {
      await app.close();
    });
  }
}
