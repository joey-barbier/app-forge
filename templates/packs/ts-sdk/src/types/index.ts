/**
 * Wire types — the shapes that cross the network, mirroring the backend DTOs.
 *
 * RULES (docs-architecture/ARCHITECTURE.md §2):
 * - This module imports NOTHING else in the package (it is the SDK's L0).
 * - Declarations only: interfaces, type aliases, string-literal unions. No runtime code.
 * - Plain .ts, never .d.ts (declaration generators skip .d.ts sources silently).
 *
 * Consumers reach these through the types-only subpath:
 *   import type { TokenPair } from '{{BUNDLE_ID}}/types'
 */

/** HTTP methods the transport accepts. */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** Auth token pair returned by the refresh endpoint. Refresh tokens are single-use. */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/**
 * The frozen wire shape of an API error body.
 * Renaming a field here is a breaking change in TWO repos (SDK_CONTRACT.md §2).
 */
export interface ApiErrorBody {
  code: number;
  name: string;
  description: string;
}

// Add resource wire types below (one file per resource once a resource has >1 type),
// and re-export them from this index so they ship through "./types".
