/**
 * Storage port — the SDK never touches `document.cookie` or framework internals
 * directly (SDK_CONTRACT.md §3, "Storage is an injected port").
 *
 * The skeleton ships the in-memory adapter only (tests, CLI, server-side jobs).
 * Adding a browser or SSR adapter is a recorded decision: read the token-storage
 * tradeoff table in SDK_CONTRACT.md §3 and write the choice + mitigations into
 * `.claude/memory/DECISIONS.md` — never inherit a default silently.
 */

export interface CookieOptions {
  path?: string;
  maxAge?: number;
  domain?: string;
  secure?: boolean;
  sameSite?: 'strict' | 'lax' | 'none';
}

export interface SDKContext {
  getCookie(name: string): string | null;
  setCookie(name: string, value: string, options?: CookieOptions): void;
  removeCookie(name: string): void;
}

/**
 * In-memory adapter: process-local, non-persistent.
 * The default context — and the reference implementation for any other adapter.
 */
export function createMemoryContext(): SDKContext {
  const store = new Map<string, string>();
  return {
    getCookie: (name) => store.get(name) ?? null,
    setCookie: (name, value) => {
      store.set(name, value);
    },
    removeCookie: (name) => {
      store.delete(name);
    },
  };
}
