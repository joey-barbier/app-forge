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

    // No-body responses: 204/205, or any 2xx whose body is empty or not JSON. Calling
    // response.json() on those throws a raw SyntaxError that escapes the ApiError contract
    // (consumers expect either T or an ApiError, never a SyntaxError). Read the text once,
    // return undefined when there is nothing to parse, parse only genuine JSON.
    if (response.status === 204 || response.status === 205) return undefined as T;

    const contentType = response.headers.get('content-type') ?? '';
    const text = await response.text();
    if (text.length === 0) return undefined as T;
    if (!contentType.includes('json')) return undefined as T;

    try {
      return JSON.parse(text) as T;
    } catch {
      // A JSON content-type with an unparseable body is a malformed success response;
      // surface it as a typed ApiError instead of leaking the SyntaxError.
      throw ApiError.fromResponse(response.status, text);
    }
  }
}
