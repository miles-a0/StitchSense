export function externalServiceErrorLogContext(error: unknown) {
  if (!error || typeof error !== 'object') {
    return {
      errorType: typeof error,
      hasErrorMessage: false,
      errorMessageLength: 0,
    };
  }

  const record = error as { name?: unknown; message?: unknown; code?: unknown; status?: unknown; statusCode?: unknown };
  const message = typeof record.message === 'string' ? record.message : '';
  return {
    errorType: typeof record.name === 'string' ? record.name : error.constructor.name,
    errorCode: typeof record.code === 'string' || typeof record.code === 'number' ? record.code : undefined,
    statusCode: typeof record.statusCode === 'number' ? record.statusCode : typeof record.status === 'number' ? record.status : undefined,
    hasErrorMessage: message.length > 0,
    errorMessageLength: message.length,
  };
}
