import { timingSafeEqual } from 'node:crypto';

export function secureStringEquals(expected: string, supplied: unknown) {
  if (typeof supplied !== 'string') {
    return false;
  }

  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  return expectedBuffer.length === suppliedBuffer.length && timingSafeEqual(expectedBuffer, suppliedBuffer);
}
