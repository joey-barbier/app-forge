import { ApiError } from '../errors/ApiError';
import type { HttpTransport } from '../core/HttpClient';
import type { SDKContext } from '../core/SDKContext';
import { noopLogger, type SDKLogger } from '../core/Logger';
import { withTimeout } from '../core/withTimeout';
import type { HttpMethod, TokenPair } from '../types/index';

const ACCESS_TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';
const DEFAULT_REFRESH_PATH = '/auth/refresh';
const DEFAULT_REFRESH_TIMEOUT_MS = 10_000;

export interface AuthClientOptions {
  /** Refresh endpoint path. Default: `/auth/refresh`. */
  refreshPath?: string;
  /** Upper bound on how long any request may wait for a refresh. Default: 10s. */
  refreshTimeoutMs?: number;
  logger?: SDKLogger;
}

/**
 * Secure-request use case with SINGLE-FLIGHT token refresh (SDK_CONTRACT.md §3).
 *
 * Refresh tokens are rotating and single-use: when N concurrent requests hit 401,
 * exactly ONE refresh call may go out — the first failure starts it, every other
 * waiter joins the same inflight promise. Without this, N−1 refreshes burn an
 * already-rotated token and randomly log users out (a real production bug; the
 * regression test in tests/singleFlight.test.ts is non-negotiable).
 *
 * Invariants — do not "simplify" any of these away:
 * - one shared inflight promise; latecomers await it
 * - the wait is bounded (withTimeout) — waiters reject, they never hang
 * - the original request is retried exactly ONCE after a successful refresh
 * - every waiter is failed on any refresh failure (a half-authenticated session is worse
 *   than a clean error), BUT tokens are cleared ONLY on a real auth rejection (401 /
 *   invalid_grant). A transport failure (offline, DNS, refused, timeout, 5xx) means the
 *   refresh never reached a verdict — clearing tokens there forces a gratuitous logout on
 *   a session that may still be valid. Network failures propagate; the session survives.
 * - the refresh call uses the raw transport, never request() (no recursion on 401)
 */
export class AuthClient {
  private refreshing: Promise<void> | null = null;
  private readonly refreshPath: string;
  private readonly refreshTimeoutMs: number;
  private readonly logger: SDKLogger;

  constructor(
    private readonly http: HttpTransport,
    private readonly context: SDKContext,
    options: AuthClientOptions = {},
  ) {
    this.refreshPath = options.refreshPath ?? DEFAULT_REFRESH_PATH;
    this.refreshTimeoutMs = options.refreshTimeoutMs ?? DEFAULT_REFRESH_TIMEOUT_MS;
    this.logger = options.logger ?? noopLogger;
  }

  /** Wire the tokens obtained by the consumer's login flow into the SDK. */
  setTokens(tokens: TokenPair): void {
    this.context.setCookie(ACCESS_TOKEN_KEY, tokens.accessToken);
    this.context.setCookie(REFRESH_TOKEN_KEY, tokens.refreshToken);
  }

  clearTokens(): void {
    this.context.removeCookie(ACCESS_TOKEN_KEY);
    this.context.removeCookie(REFRESH_TOKEN_KEY);
  }

  getAccessToken(): string | null {
    return this.context.getCookie(ACCESS_TOKEN_KEY);
  }

  /** An authenticated request: 401 → join/start the single-flight refresh → retry once. */
  async request<T>(method: HttpMethod, path: string, body?: unknown): Promise<T> {
    const attempt = async (): Promise<T> => {
      const token = this.getAccessToken();
      if (!token) {
        throw new ApiError({
          code: 401,
          name: 'MissingToken',
          description: 'No access token available — authenticate first',
          statusCode: 401,
        });
      }
      return this.http.request<T>(method, path, { token, body });
    };

    try {
      return await attempt();
    } catch (error) {
      if (!AuthClient.isUnauthorized(error)) throw error;
      this.logger.debug('401 received — joining token refresh', { path });
      await this.refreshTokens();
      return attempt(); // retry exactly ONCE with the refreshed token
    }
  }

  /** Single-flight: all concurrent 401s share one inflight refresh promise. */
  private refreshTokens(): Promise<void> {
    if (!this.refreshing) {
      this.refreshing = this.doRefresh().finally(() => {
        this.refreshing = null;
      });
    }
    return this.refreshing;
  }

  private async doRefresh(): Promise<void> {
    const refreshToken = this.context.getCookie(REFRESH_TOKEN_KEY);
    if (!refreshToken) {
      this.clearTokens();
      throw new ApiError({
        code: 401,
        name: 'MissingRefreshToken',
        description: 'No refresh token available — cannot refresh the session',
        statusCode: 401,
      });
    }

    try {
      const pair = await withTimeout(
        // Raw transport on purpose: a 401 from the refresh endpoint must not recurse.
        this.http.request<TokenPair>('POST', this.refreshPath, { body: { refreshToken } }),
        this.refreshTimeoutMs,
        () =>
          new ApiError({
            code: 408,
            name: 'RefreshTimeout',
            description: `Token refresh timed out after ${this.refreshTimeoutMs}ms`,
            statusCode: 408,
          }),
      );
      this.setTokens(pair);
      this.logger.debug('token refresh succeeded');
    } catch (error) {
      // Fail every waiter regardless — a half-authenticated session is worse than a clean
      // error. But only DROP the session when the server actually rejected the refresh token
      // (401 / invalid_grant). A transport failure (offline/DNS/refused/timeout/5xx) never
      // reached a verdict: clearing here would log the user out over a flaky network.
      if (AuthClient.isAuthRejection(error)) {
        this.clearTokens();
        this.logger.error('token refresh rejected — tokens cleared');
      } else {
        this.logger.error('token refresh failed (transport) — tokens kept');
      }
      throw error;
    }
  }

  private static isUnauthorized(error: unknown): boolean {
    return error instanceof ApiError && error.statusCode === 401;
  }

  /**
   * True only for a genuine auth rejection from the refresh endpoint — a 401, or a 400
   * carrying the OAuth `invalid_grant` code. Timeouts (RefreshTimeout, 408), 5xx and raw
   * network errors are transport failures, NOT a verdict on the refresh token.
   */
  private static isAuthRejection(error: unknown): boolean {
    if (!(error instanceof ApiError)) return false;
    if (error.statusCode === 401) return true;
    if (error.statusCode === 400) {
      // OAuth refresh rejection: the wire body's name is `invalid_grant`, or the raw body
      // mentions it (servers vary). A plain 400 without that signal is NOT an auth verdict.
      return error.errorName === 'invalid_grant' || /invalid_grant/i.test(error.rawMessage ?? '');
    }
    return false;
  }
}
