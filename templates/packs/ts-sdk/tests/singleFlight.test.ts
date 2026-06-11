import { describe, test, expect } from 'vitest';
import {
  ApiError,
  AuthClient,
  createMemoryContext,
  type HttpMethod,
  type HttpTransport,
  type RequestOptions,
  type TokenPair,
} from '../src/index';

/**
 * THE concurrency regression suite (SDK_CONTRACT.md §3) — non-negotiable.
 *
 * Pins a real production bug: refresh-on-401 without synchronization sent N
 * simultaneous refreshes; the rotating refresh token was single-use, so N−1
 * calls failed and randomly logged users out. The fake API below ENFORCES
 * single-use rotation — a broken single-flight fails on behavior, not just
 * on call counts.
 */

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

interface FakeApiOptions {
  refreshDelayMs?: number;
  failRefresh?: boolean;
  hangRefresh?: boolean;
}

function createFakeApi(options: FakeApiOptions = {}) {
  let validAccess = 'access-0';
  let validRefresh = 'refresh-1';
  let refreshCalls = 0;

  const transport: HttpTransport = {
    async request<T>(method: HttpMethod, path: string, reqOptions: RequestOptions = {}): Promise<T> {
      if (method === 'POST' && path === '/auth/refresh') {
        refreshCalls += 1;
        if (options.hangRefresh) return new Promise<T>(() => {}); // never settles
        await delay(options.refreshDelayMs ?? 20);
        const sent = (reqOptions.body as { refreshToken?: string } | undefined)?.refreshToken;
        if (options.failRefresh || sent !== validRefresh) {
          // single-use enforcement: a second refresh with the same token is rejected
          throw ApiError.fromResponse(
            401,
            JSON.stringify({ code: 401, name: 'Unauthorized', description: 'refresh token already used' }),
          );
        }
        validRefresh = `refresh-${refreshCalls + 1}`; // rotate: previous token is now burnt
        validAccess = `access-${refreshCalls}`;
        return { accessToken: validAccess, refreshToken: validRefresh } as T;
      }
      if (reqOptions.token !== validAccess) {
        throw ApiError.fromResponse(401, 'token expired');
      }
      return { path, ok: true } as T;
    },
  };

  return {
    transport,
    refreshCalls: () => refreshCalls,
    currentRefreshToken: () => validRefresh,
  };
}

function createClient(api: ReturnType<typeof createFakeApi>, refreshTimeoutMs?: number) {
  const context = createMemoryContext();
  const auth = new AuthClient(api.transport, context, { refreshTimeoutMs });
  // Session as left by a login flow, with an access token that has since expired:
  auth.setTokens({ accessToken: 'expired-access', refreshToken: 'refresh-1' } satisfies TokenPair);
  return auth;
}

describe('single-flight token refresh', () => {
  test('N concurrent 401s trigger exactly ONE refresh call', async () => {
    const api = createFakeApi();
    const auth = createClient(api);
    const N = 8;

    const results = await Promise.all(
      Array.from({ length: N }, (_, i) => auth.request<{ path: string; ok: boolean }>('GET', `/items/${i}`)),
    );

    // every request recovered and succeeded after the shared refresh
    expect(results).toHaveLength(N);
    results.forEach((result, i) => expect(result).toEqual({ path: `/items/${i}`, ok: true }));
    // …through exactly one refresh call (single-use token: a second call would have thrown)
    expect(api.refreshCalls()).toBe(1);
    // and the rotated pair landed in storage
    expect(api.currentRefreshToken()).toBe('refresh-2');
    expect(auth.getAccessToken()).toBe('access-1');
  });

  test('a 401 refresh rejection clears tokens and rejects ALL waiters', async () => {
    // failRefresh makes the fake API answer the refresh with a 401 (a real auth rejection:
    // the refresh token is no longer valid) — the session is genuinely dead, drop it.
    const api = createFakeApi({ failRefresh: true });
    const auth = createClient(api);

    const results = await Promise.allSettled([
      auth.request('GET', '/endpoint1'),
      auth.request('GET', '/endpoint2'),
    ]);

    expect(results[0].status).toBe('rejected');
    expect(results[1].status).toBe('rejected');
    expect(api.refreshCalls()).toBe(1); // failure was shared, not retried per-waiter
    expect(auth.getAccessToken()).toBeNull(); // 401 = auth rejection → tokens cleared
  });

  test('refresh timeout rejects waiters with RefreshTimeout but KEEPS tokens', async () => {
    // A timeout is a transport failure, not a verdict on the refresh token. Clearing tokens
    // here would force a logout over a flaky/slow network (JP finding #4) — keep the session
    // so a later retry can succeed once connectivity returns.
    const api = createFakeApi({ hangRefresh: true });
    const auth = createClient(api, 25);

    const results = await Promise.allSettled([
      auth.request('GET', '/endpoint1'),
      auth.request('GET', '/endpoint2'),
    ]);

    for (const result of results) {
      expect(result.status).toBe('rejected');
      if (result.status === 'rejected') {
        expect(result.reason).toBeInstanceOf(ApiError);
        expect((result.reason as ApiError).errorName).toBe('RefreshTimeout');
        expect((result.reason as ApiError).statusCode).toBe(408);
      }
    }
    expect(api.refreshCalls()).toBe(1);
    expect(auth.getAccessToken()).toBe('expired-access'); // transport failure → tokens kept
  });

  test('a transport failure (network error) rejects waiters but KEEPS tokens', async () => {
    // The refresh request never reaches the server (offline/DNS/refused): a raw Error, not an
    // ApiError. Waiters fail, but the session is untouched — no gratuitous forced logout.
    const transport: HttpTransport = {
      async request<T>(method: HttpMethod, path: string, reqOptions: RequestOptions = {}): Promise<T> {
        if (method === 'POST' && path === '/auth/refresh') {
          throw new TypeError('fetch failed'); // what Node/undici throws when the host is unreachable
        }
        if (reqOptions.token !== 'access-0') throw ApiError.fromResponse(401, 'token expired');
        return { ok: true } as T;
      },
    };
    const context = createMemoryContext();
    const auth = new AuthClient(transport, context);
    auth.setTokens({ accessToken: 'expired-access', refreshToken: 'refresh-1' });

    const results = await Promise.allSettled([
      auth.request('GET', '/endpoint1'),
      auth.request('GET', '/endpoint2'),
    ]);

    expect(results[0].status).toBe('rejected');
    expect(results[1].status).toBe('rejected');
    expect(auth.getAccessToken()).toBe('expired-access'); // network failure → tokens kept
  });

  test('a valid access token never triggers a refresh', async () => {
    const api = createFakeApi();
    const auth = new AuthClient(api.transport, createMemoryContext());
    auth.setTokens({ accessToken: 'access-0', refreshToken: 'refresh-1' });

    const result = await auth.request<{ ok: boolean }>('GET', '/me');

    expect(result.ok).toBe(true);
    expect(api.refreshCalls()).toBe(0);
  });

  test('non-401 errors propagate untouched, without refreshing', async () => {
    const transport: HttpTransport = {
      request: async () => {
        throw ApiError.fromResponse(
          409,
          JSON.stringify({ code: 4090, name: 'Conflict', description: 'already exists' }),
        );
      },
    };
    const auth = new AuthClient(transport, createMemoryContext());
    auth.setTokens({ accessToken: 'a', refreshToken: 'r' });

    await expect(auth.request('POST', '/teams', { name: 'x' })).rejects.toMatchObject({
      statusCode: 409,
      errorName: 'Conflict',
      code: 4090,
    });
  });
});
