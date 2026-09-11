import type { APIErrorShape } from './models';

export class APIError extends Error {
  statusCode: number;
  requestId?: string | null;

  constructor({ statusCode, message, requestId }: APIErrorShape) {
    super(message);
    this.name = 'APIError';
    this.statusCode = statusCode;
    this.requestId = requestId ?? null;
  }
}
