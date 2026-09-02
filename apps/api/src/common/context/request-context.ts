import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContextStore {
  requestId: string;
  tenantId?: string;
  userId?: string;
}

/**
 * Carries per-request state (tenant, user, request id) across the async
 * call stack without threading it through every function signature.
 *
 * This is what lets PrismaTenantExtension inject `WHERE tenantId = ...`
 * automatically: the extension reads the current tenant from here rather
 * than from an argument the caller could forget to pass.
 *
 * Deliberately NOT a global mutable — AsyncLocalStorage gives each
 * concurrent request its own isolated store, which is what makes this
 * safe under Node's concurrency model.
 */
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
