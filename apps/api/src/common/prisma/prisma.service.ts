import {
  INestApplication,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { RequestContext } from '../context/request-context';

// Every Prisma model below that carries a `tenantId` column must be listed
// here. This is intentionally an explicit allowlist rather than something
// inferred by introspection: a model added to schema.prisma without also
// being added here is *never silently unscoped* — the extension simply
// leaves it alone, and a reviewer added a tenantId column to see it in this
// list too, in the same PR.
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

/**
 * Injects `tenantId` into every query against a tenant-scoped model, using
 * the tenant currently bound in RequestContext.
 *
 * This is the enforcement point for multi-tenant isolation: individual
 * services call `this.prisma.contact.findMany(...)` exactly as they would
 * in a single-tenant app, and correctness doesn't depend on every
 * developer remembering to add `where: { tenantId }` by hand — a mistake
 * there is exactly how cross-tenant data leaks happen in real SaaS
 * incidents.
 *
 * `bypassTenantScope` exists for the narrow set of legitimate cross-tenant
 * operations (platform-admin tooling, the tenant-signup flow itself) and
 * must be used explicitly and sparingly — see PrismaService.asSystem().
 */
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

  /**
   * Escape hatch for genuinely cross-tenant operations (tenant
   * provisioning, platform admin). Named loudly on purpose so it stands
   * out in a diff/review — every call site is a place tenant isolation is
   * NOT being enforced by the framework and must be justified in code
   * review.
   */
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
