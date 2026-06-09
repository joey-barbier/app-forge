import { describe, test, expect } from 'vitest';
import { ApiError } from '../src/index';

describe('ApiError.fromResponse — error normalization (SDK_CONTRACT.md §2)', () => {
  test('parses the wire contract { code, name, description }', () => {
    const body = JSON.stringify({ code: 4091, name: 'TeamAlreadyExists', description: 'A team with this name exists' });

    const error = ApiError.fromResponse(409, body);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ApiError');
    expect(error.code).toBe(4091);
    expect(error.errorName).toBe('TeamAlreadyExists');
    expect(error.message).toBe('A team with this name exists');
    expect(error.statusCode).toBe(409);
    expect(error.rawMessage).toBe(body);
  });

  test('falls back to a standard error when the body is not JSON', () => {
    const error = ApiError.fromResponse(500, '<html>Internal blowup</html>');

    expect(error.statusCode).toBe(500);
    expect(error.code).toBe(500);
    expect(error.errorName).toBe('InternalServerError');
    expect(error.message).toContain('500');
    expect(error.rawMessage).toBe('<html>Internal blowup</html>');
  });

  test('falls back when the JSON does not match the wire shape', () => {
    const error = ApiError.fromResponse(400, JSON.stringify({ message: 'wrong shape' }));

    expect(error.errorName).toBe('BadRequest');
    expect(error.code).toBe(400);
    expect(error.statusCode).toBe(400);
  });

  test('unknown status codes still normalize', () => {
    const error = ApiError.fromResponse(418, 'teapot');

    expect(error.errorName).toBe('UnknownError');
    expect(error.statusCode).toBe(418);
  });

  test('toJSON round-trips the frozen wire shape', () => {
    const error = ApiError.fromResponse(
      403,
      JSON.stringify({ code: 4030, name: 'Forbidden', description: 'No access to this resource' }),
    );

    expect(error.toJSON()).toEqual({
      code: 4030,
      name: 'Forbidden',
      description: 'No access to this resource',
      statusCode: 403,
    });
  });
});
