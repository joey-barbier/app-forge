/**
 * Composition root (L5) — the ONLY file that constructs adapters and wires
 * transport → auth → resource clients. It re-exports the entire public surface;
 * anything not exported here (or from ./types) does not exist for consumers.
 */
import { AuthClient } from './clients/AuthClient';
import { HttpClient } from './core/HttpClient';
import { gateDebug, noopLogger, type SDKLogger } from './core/Logger';
import { createMemoryContext, type SDKContext } from './core/SDKContext';

export interface SDKOptions {
  /** API origin, e.g. `https://api.example.com` (no trailing slash needed). */
  baseURL: string;
  /** Storage adapter. Defaults to the in-memory context — see SDKContext.ts. */
  context?: SDKContext;
  /** Consumer-owned logger; silent no-op by default. */
  logger?: SDKLogger;
  /** Enables logger.debug output. The CONSUMER owns this switch. */
  debug?: boolean;
  /** Injected fetch for tests/polyfills. */
  fetchFn?: typeof fetch;
  refreshPath?: string;
  refreshTimeoutMs?: number;
}

export class {{PROJECT_NAME}}Sdk {
  /** Raw transport — for public (unauthenticated) endpoints. */
  readonly http: HttpClient;
  /** Authenticated requests with single-flight token refresh. */
  readonly auth: AuthClient;
  // Add resource clients as the API grows (docs-architecture/ARCHITECTURE.md §4):
  //   readonly projects: ProjectClient;

  constructor(options: SDKOptions) {
    const logger = gateDebug(options.logger ?? noopLogger, options.debug ?? false);
    const context = options.context ?? createMemoryContext();
    this.http = new HttpClient({ baseURL: options.baseURL, fetchFn: options.fetchFn, logger });
    this.auth = new AuthClient(this.http, context, {
      logger,
      refreshPath: options.refreshPath,
      refreshTimeoutMs: options.refreshTimeoutMs,
    });
    //   this.projects = new ProjectClient(this.auth);
  }
}

export function createSdk(options: SDKOptions): {{PROJECT_NAME}}Sdk {
  return new {{PROJECT_NAME}}Sdk(options);
}

// ── Public surface (keep scripts/verify-dist.mjs in sync) ──────────────────
export { ApiError } from './errors/ApiError';
export { AuthClient, type AuthClientOptions } from './clients/AuthClient';
export {
  HttpClient,
  type HttpTransport,
  type RequestOptions,
  type HttpClientOptions,
} from './core/HttpClient';
export { createMemoryContext, type SDKContext, type CookieOptions } from './core/SDKContext';
export { noopLogger, type SDKLogger } from './core/Logger';
export type { ApiErrorBody, HttpMethod, TokenPair } from './types/index';
