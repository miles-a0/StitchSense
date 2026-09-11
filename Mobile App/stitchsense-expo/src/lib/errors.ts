import { APIError } from './api-error';

type ErrorMessageOptions = {
  fallback?: string;
};

function normalizeMessage(message: string) {
  return message.replace(/\s+/g, ' ').trim();
}

function withSupportCode(message: string, requestId?: string | null) {
  return requestId ? `${message} (support code: ${requestId})` : message;
}

export function getUserFacingErrorMessage(
  error: unknown,
  options: ErrorMessageOptions = {},
) {
  const fallback = options.fallback ?? 'Something went wrong. Please try again.';

  if (error instanceof APIError) {
    const rawMessage = normalizeMessage(error.message || '');

    if (
      error.statusCode === 401 ||
      /authentication required|session expired|sign in again/i.test(rawMessage)
    ) {
      return 'Your session needs refreshing. Please sign in again.';
    }

    if (error.statusCode === 402) {
      return 'This feature needs an active StitchSense Pro plan.';
    }

    if (
      error.statusCode === 404 &&
      /route .*not found|no route was found matching the url/i.test(rawMessage)
    ) {
      return 'This feature needs the latest StitchSense WordPress plugin and API bridge deployed before it can work.';
    }

    if (error.statusCode === 404) {
      return withSupportCode(rawMessage || 'That item could not be found anymore.', error.requestId);
    }

    if (error.statusCode === 429 || /rate limit|please wait \d+/i.test(rawMessage)) {
      return 'You’re doing a lot at once. Please wait a moment and try again.';
    }

    if (/invalid key provided to securestore/i.test(rawMessage)) {
      return 'Secure storage hit a device-side problem. Please fully close and reopen the app, then try again.';
    }

    if (rawMessage && !/^server returned \d+/i.test(rawMessage)) {
      return withSupportCode(rawMessage, error.requestId);
    }

    return withSupportCode(fallback, error.requestId);
  }

  if (error instanceof Error) {
    const rawMessage = normalizeMessage(error.message || '');

    if (/authentication required|session expired|sign in again/i.test(rawMessage)) {
      return 'Your session needs refreshing. Please sign in again.';
    }

    if (/rate limit|please wait \d+/i.test(rawMessage)) {
      return 'You’re doing a lot at once. Please wait a moment and try again.';
    }

    if (/invalid key provided to securestore/i.test(rawMessage)) {
      return 'Secure storage hit a device-side problem. Please fully close and reopen the app, then try again.';
    }

    return rawMessage || fallback;
  }

  return fallback;
}
