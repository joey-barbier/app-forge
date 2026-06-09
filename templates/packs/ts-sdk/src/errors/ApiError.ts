import type { ApiErrorBody } from '../types/index';

interface ApiErrorDetails extends ApiErrorBody {
  statusCode: number;
  rawMessage?: string;
}

const STATUS_NAMES: Record<number, string> = {
  400: 'BadRequest',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'NotFound',
  408: 'RequestTimeout',
  409: 'Conflict',
  422: 'UnprocessableEntity',
  429: 'TooManyRequests',
  500: 'InternalServerError',
  502: 'BadGateway',
  503: 'ServiceUnavailable',
  504: 'GatewayTimeout',
};

/**
 * The ONE error type every non-2xx response becomes (SDK_CONTRACT.md §2).
 * The transport throws it; consumers map `statusCode` to UX in one shared handler.
 * Nothing in this SDK ever swallows a status code or re-parses a response body.
 */
export class ApiError extends Error {
  /** Application-level error code from the wire body (falls back to the HTTP status). */
  public readonly code: number;
  /** Machine-readable error name (`Unauthorized`, `Conflict`, …). */
  public readonly errorName: string;
  /** The HTTP status code of the response. */
  public readonly statusCode: number;
  /** The raw response text, for diagnostics only — never re-parse it downstream. */
  public readonly rawMessage?: string;

  constructor(details: ApiErrorDetails) {
    super(details.description);
    this.name = 'ApiError';
    this.code = details.code;
    this.errorName = details.name;
    this.statusCode = details.statusCode;
    this.rawMessage = details.rawMessage;
  }

  /**
   * Normalize a non-2xx response into an ApiError:
   * 1. try to parse the body as the wire contract `{ code, name, description }`;
   * 2. on shape mismatch or parse failure, build a standard error from the status code.
   */
  static fromResponse(statusCode: number, responseText: string): ApiError {
    try {
      const parsed: unknown = JSON.parse(responseText);
      if (ApiError.isWireBody(parsed)) {
        return new ApiError({ ...parsed, statusCode, rawMessage: responseText });
      }
      return ApiError.fromStatus(statusCode, responseText);
    } catch {
      return ApiError.fromStatus(statusCode, responseText);
    }
  }

  private static isWireBody(value: unknown): value is ApiErrorBody {
    if (typeof value !== 'object' || value === null) return false;
    const body = value as Record<string, unknown>;
    return (
      typeof body['code'] === 'number' &&
      typeof body['name'] === 'string' &&
      typeof body['description'] === 'string'
    );
  }

  private static fromStatus(statusCode: number, message: string): ApiError {
    const name = STATUS_NAMES[statusCode] ?? 'UnknownError';
    return new ApiError({
      code: statusCode,
      name,
      description: `${statusCode} ${name}${message ? ` - ${message}` : ''}`,
      statusCode,
      rawMessage: message,
    });
  }

  toJSON(): ApiErrorBody & { statusCode: number } {
    return {
      code: this.code,
      name: this.errorName,
      description: this.message,
      statusCode: this.statusCode,
    };
  }
}
