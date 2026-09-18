import { describe, it, expect } from 'vitest';
import { ApiError, isApiError, toErrorMessage } from './api';

describe('ApiError / toErrorMessage', () => {
  it('classifies an offline error with offline wording', () => {
    const err = new ApiError('offline', 'You are offline.', {});
    expect(isApiError(err)).toBe(true);
    expect(err.kind).toBe('offline');
    expect(toErrorMessage(err, 'fallback')).toContain('offline');
  });

  it('prefers the server message for http errors', () => {
    const err = new ApiError('http', 'generic', {
      status: 409,
      serverMessage: 'Already voted in this election',
    });
    expect(toErrorMessage(err, 'fallback')).toBe('Already voted in this election');
    expect(err.status).toBe(409);
  });

  it('falls back to the error message when no server message', () => {
    const err = new ApiError('http', 'Request failed', { status: 500 });
    expect(toErrorMessage(err, 'fallback')).toBe('Request failed');
  });

  it('maps timeout kind to connection guidance', () => {
    const err = new ApiError('timeout', 'Request timed out.', {});
    expect(toErrorMessage(err, 'fallback')).toContain('timed out');
  });

  it('returns the plain message for ordinary errors', () => {
    expect(toErrorMessage(new Error('boom'), 'fallback')).toBe('boom');
  });

  it('returns the fallback for unknown thrown values', () => {
    expect(toErrorMessage('something odd', 'fallback')).toBe('fallback');
    expect(toErrorMessage(undefined, 'fallback')).toBe('fallback');
    expect(toErrorMessage(null, 'fallback')).toBe('fallback');
  });

  it('isApiError is false for non-ApiError values', () => {
    expect(isApiError(new Error('x'))).toBe(false);
    expect(isApiError(null)).toBe(false);
    expect(isApiError({ kind: 'offline' })).toBe(false);
  });
});