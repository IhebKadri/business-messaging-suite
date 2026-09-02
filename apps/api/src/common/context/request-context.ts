import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContextStore {
  requestId: string;
  tenantId?: string;
  userId?: string;
}

// tenant/user/request id, available anywhere in the call stack without
// threading params through every function. Prisma's tenant extension
// reads tenantId from here (common/prisma/prisma.service.ts).
export class RequestContext {
  private static readonly storage = new AsyncLocalStorage<RequestContextStore>();

  static run<T>(store: RequestContextStore, fn: () => T): T {
    return this.storage.run(store, fn);
  }

  static get(): RequestContextStore | undefined {
    return this.storage.getStore();
  }

  static get tenantId(): string | undefined {
    return this.storage.getStore()?.tenantId;
  }

  static get userId(): string | undefined {
    return this.storage.getStore()?.userId;
  }

  static get requestId(): string | undefined {
    return this.storage.getStore()?.requestId;
  }
}
