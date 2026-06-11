import { describe, test, expect } from 'vitest';
import { ApiError, HttpClient } from '../src/index';

/**
 * Transport adapter tests (CONVENTIONS_TS.md §7 — the one place a fake `fetch` is allowed).
 *
 * Pins the no-body contract: a 2xx with an empty or non-JSON body must resolve to `undefined`,
 * never throw a raw SyntaxError from response.json() — that would escape the ApiError contract
 * (consumers expect either T or an ApiError, never a SyntaxError).
 */

function fetchReturning(status: number, body: string, contentType?: string): typeof fetch {
  const headers = new Headers();
  if (contentType) headers.set('content-type', contentType);
  return (async () => new Response(body.length ? body : null, { status, headers })) as unknown as typeof fetch;
}

describe('HttpClient — no-body success responses', () => {
  test('204 resolves to undefined', async () => {
    const http = new HttpClient({ baseURL: 'https://api.test', fetchFn: fetchReturning(204, '') });
    await expect(http.request('DELETE', '/items/1')).resolves.toBeUndefined();
  });

  test('200 with an empty body resolves to undefined (no SyntaxError)', async () => {
    const http = new HttpClient({ baseURL: 'https://api.test', fetchFn: fetchReturning(200, '') });
    await expect(http.request('POST', '/items/1/touch')).resolves.toBeUndefined();
  });

  test('200 with a non-JSON content-type resolves to undefined', async () => {
    const http = new HttpClient({
      baseURL: 'https://api.test',
      fetchFn: fetchReturning(200, 'OK', 'text/plain'),
    });
    await expect(http.request('GET', '/ping')).resolves.toBeUndefined();
  });

  test('200 with a JSON body still parses normally', async () => {
    const http = new HttpClient({
      baseURL: 'https://api.test',
      fetchFn: fetchReturning(200, JSON.stringify({ id: 'x', name: 'First' }), 'application/json'),
    });
    await expect(http.request('GET', '/items/x')).resolves.toEqual({ id: 'x', name: 'First' });
  });

  test('a JSON content-type with a malformed body surfaces a typed ApiError, not a SyntaxError', async () => {
    const http = new HttpClient({
      baseURL: 'https://api.test',
      fetchFn: fetchReturning(200, '{ not json', 'application/json'),
    });
    await expect(http.request('GET', '/items/x')).rejects.toBeInstanceOf(ApiError);
  });

  test('a non-2xx response still throws an ApiError', async () => {
    const http = new HttpClient({
      baseURL: 'https://api.test',
      fetchFn: fetchReturning(409, JSON.stringify({ code: 4090, name: 'Conflict', description: 'exists' }), 'application/json'),
    });
    await expect(http.request('POST', '/items')).rejects.toMatchObject({ statusCode: 409, errorName: 'Conflict' });
  });
});
