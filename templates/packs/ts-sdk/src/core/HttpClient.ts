import { ApiError } from '../errors/ApiError';
import type { HttpMethod } from '../types/index';
import { noopLogger, type SDKLogger } from './Logger';

export interface RequestOptions {
  /** Bearer token added as the Authorization header when present. */
  token?: string | null;
  /** JSON-serialized unless it is FormData. */
  body?: unknown;
  headers?: Record<string, string>;
}

/**
 * Transport port. Clients and use cases depend on THIS interface, never on
 * `fetch` — tests stub it, alternative transports implement it.
 */
export interface HttpTransport {
  request<T>(method: HttpMethod, path: string, options?: RequestOptions): Promise<T>;
}

export interface HttpClientOptions {
  baseURL: string;
  /** Injected for tests/polyfills; defaults to the global fetch (Node 20+/browsers). */
  fetchFn?: typeof fetch;
  logger?: SDKLogger;
}

/**
 * The fetch adapter (L2). Single responsibility: send the request, normalize
 * every non-2xx response into an ApiError. No retries, no auth logic — that
 * lives in clients/AuthClient.ts.
 */
export class HttpClient implements HttpTransport {
  private readonly baseURL: string;
  private readonly fetchFn: typeof fetch;
  private readonly logger: SDKLogger;

  constructor(options: HttpClientOptions) {
    this.baseURL = options.baseURL.replace(/\/+$/, '');
    this.fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
    this.logger = options.logger ?? noopLogger;
  }

  async request<T>(method: HttpMethod, path: string, options: RequestOptions = {}): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };
    if (options.token) headers['Authorization'] = `Bearer ${options.token}`;

    let body: BodyInit | undefined;
    if (options.body !== undefined) {
      if (options.body instanceof FormData) {
        body = options.body;
      } else {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(options.body);
      }
    }

    // Method + path only — never headers, never token material (CONVENTIONS_TS.md §4).
    this.logger.debug('http request', { method, path });

    const response = await this.fetchFn(`${this.baseURL}${path}`, { method, headers, body });
    if (!response.ok) {
      throw ApiError.fromResponse(response.status, await response.text());
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }
}
