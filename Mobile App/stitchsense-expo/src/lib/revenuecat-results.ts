export type RevenueCatPurchaseStatus = 'active' | 'pending' | 'cancelled' | 'syncing';

export type RevenueCatErrorLike = {
  code?: string | number;
  message?: string;
  userCancelled?: boolean | null;
  userInfo?: {
    readableErrorCode?: string;
  };
};

export type RevenueCatMappedError = 'cancelled' | 'pending' | 'already_purchased' | 'network' | 'configuration' | 'unknown';

export function readRevenueCatError(error: unknown): RevenueCatErrorLike {
  if (error && typeof error === 'object') {
    return error as RevenueCatErrorLike;
  }
  return {};
}

export function isRevenueCatErrorCode(error: unknown, codes: string[]) {
  const parsed = readRevenueCatError(error);
  const code = parsed.code == null ? '' : String(parsed.code);
  const readableCode = parsed.userInfo?.readableErrorCode ?? '';
  return codes.includes(code) || codes.includes(readableCode);
}

export function mapRevenueCatPurchaseError(error: unknown): RevenueCatMappedError {
  const parsed = readRevenueCatError(error);
  if (parsed.userCancelled || isRevenueCatErrorCode(error, ['1', 'PURCHASE_CANCELLED_ERROR'])) {
    return 'cancelled';
  }

  if (isRevenueCatErrorCode(error, ['20', 'PAYMENT_PENDING_ERROR'])) {
    return 'pending';
  }

  if (isRevenueCatErrorCode(error, ['6', 'PRODUCT_ALREADY_PURCHASED_ERROR'])) {
    return 'already_purchased';
  }

  if (isRevenueCatErrorCode(error, ['10', 'NETWORK_ERROR', '35', 'OFFLINE_CONNECTION_ERROR', '32', 'PRODUCT_REQUEST_TIMED_OUT_ERROR'])) {
    return 'network';
  }

  if (isRevenueCatErrorCode(error, ['5', 'PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR', '23', 'CONFIGURATION_ERROR', '11', 'INVALID_CREDENTIALS_ERROR'])) {
    return 'configuration';
  }

  return 'unknown';
}

export function revenueCatUnavailableMessage() {
  return 'This subscription is not available in this build yet. Check the RevenueCat and store product configuration.';
}

export function revenueCatNetworkErrorMessage() {
  return 'The store connection was interrupted. Please check your connection and try again.';
}
