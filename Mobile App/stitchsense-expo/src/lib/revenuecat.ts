import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import Purchases, { LOG_LEVEL, type CustomerInfo, type PurchasesPackage } from 'react-native-purchases';

import { config } from '@/src/lib/config';

export type RevenueCatPlan = 'monthly' | 'annual';
export type RevenueCatPurchaseStatus = 'active' | 'pending' | 'cancelled' | 'syncing';

export class RevenueCatUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RevenueCatUnavailableError';
  }
}

let configuredForUserId: string | null = null;

type RevenueCatErrorLike = {
  code?: string | number;
  message?: string;
  userCancelled?: boolean | null;
  userInfo?: {
    readableErrorCode?: string;
  };
};

function readRevenueCatError(error: unknown): RevenueCatErrorLike {
  if (error && typeof error === 'object') {
    return error as RevenueCatErrorLike;
  }
  return {};
}

function isRevenueCatErrorCode(error: unknown, codes: string[]) {
  const parsed = readRevenueCatError(error);
  const code = parsed.code == null ? '' : String(parsed.code);
  const readableCode = parsed.userInfo?.readableErrorCode ?? '';
  return codes.includes(code) || codes.includes(readableCode);
}

function customerInfoResult(customerInfo: CustomerInfo, status: RevenueCatPurchaseStatus = 'syncing') {
  const hasActiveEntitlement = hasRevenueCatEntitlement(customerInfo);
  return {
    customerInfo,
    hasActiveEntitlement,
    status: hasActiveEntitlement ? 'active' : status,
  };
}

function revenueCatApiKey() {
  if (Platform.OS === 'ios') return config.revenueCat.iosApiKey;
  if (Platform.OS === 'android') return config.revenueCat.androidApiKey;
  return '';
}

export function usesRevenueCatStoreBilling() {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

export function hasRevenueCatApiKey() {
  return Boolean(revenueCatApiKey());
}

export async function configureRevenueCat(userId: string) {
  if (!usesRevenueCatStoreBilling()) {
    throw new RevenueCatUnavailableError('RevenueCat purchases are only available in the iOS and Android app builds.');
  }

  const apiKey = revenueCatApiKey();
  if (!apiKey) {
    throw new RevenueCatUnavailableError('RevenueCat is not configured for this build yet.');
  }

  if (configuredForUserId === userId) {
    return;
  }

  if (configuredForUserId) {
    await Purchases.logIn(userId);
    configuredForUserId = userId;
    return;
  }

  Purchases.setLogLevel(LOG_LEVEL.WARN);
  Purchases.configure({ apiKey, appUserID: userId });
  configuredForUserId = userId;
}

export async function revenueCatLogOut() {
  if (!configuredForUserId) {
    return;
  }

  try {
    await Purchases.logOut();
  } catch {
    // Logging out of RevenueCat is a best-effort clean-up; the StitchSense session is authoritative here.
  } finally {
    configuredForUserId = null;
  }
}

function packageMatchesPlan(candidate: PurchasesPackage, plan: RevenueCatPlan) {
  const packageType = String(candidate.packageType).toLowerCase();
  const identifier = candidate.identifier.toLowerCase();
  const productId = candidate.product.identifier.toLowerCase();
  if (plan === 'annual') {
    return packageType === 'annual' || identifier.includes('annual') || productId.includes('annual') || productId.includes('year');
  }
  return packageType === 'monthly' || identifier.includes('monthly') || productId.includes('monthly') || productId.includes('month');
}

async function packageForPlan(plan: RevenueCatPlan) {
  const offerings = await Purchases.getOfferings();
  const currentOffering = offerings.current;
  if (!currentOffering) {
    throw new RevenueCatUnavailableError('No RevenueCat offering is configured for this app yet.');
  }

  const directPackage = plan === 'annual' ? currentOffering.annual : currentOffering.monthly;
  if (directPackage) {
    return directPackage;
  }

  const matchedPackage = currentOffering.availablePackages.find((candidate) => packageMatchesPlan(candidate, plan));
  if (!matchedPackage) {
    throw new RevenueCatUnavailableError(`No RevenueCat ${plan} package is configured for this app yet.`);
  }

  return matchedPackage;
}

export function hasRevenueCatEntitlement(customerInfo: CustomerInfo) {
  return Boolean(customerInfo.entitlements.active[config.revenueCat.entitlementId]);
}

export async function purchaseRevenueCatPlan(userId: string, plan: RevenueCatPlan) {
  await configureRevenueCat(userId);
  const selectedPackage = await packageForPlan(plan);
  try {
    const purchase = await Purchases.purchasePackage(selectedPackage);
    return customerInfoResult(purchase.customerInfo);
  } catch (error) {
    const parsed = readRevenueCatError(error);
    if (parsed.userCancelled || isRevenueCatErrorCode(error, ['1', 'PURCHASE_CANCELLED_ERROR'])) {
      const customerInfo = await Purchases.getCustomerInfo();
      return customerInfoResult(customerInfo, 'cancelled');
    }

    if (isRevenueCatErrorCode(error, ['20', 'PAYMENT_PENDING_ERROR'])) {
      const customerInfo = await Purchases.getCustomerInfo();
      return customerInfoResult(customerInfo, 'pending');
    }

    if (isRevenueCatErrorCode(error, ['6', 'PRODUCT_ALREADY_PURCHASED_ERROR'])) {
      const customerInfo = await Purchases.getCustomerInfo();
      return customerInfoResult(customerInfo);
    }

    if (isRevenueCatErrorCode(error, ['10', 'NETWORK_ERROR', '35', 'OFFLINE_CONNECTION_ERROR', '32', 'PRODUCT_REQUEST_TIMED_OUT_ERROR'])) {
      throw new Error('The store connection was interrupted. Please check your connection and try again.');
    }

    if (isRevenueCatErrorCode(error, ['5', 'PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR', '23', 'CONFIGURATION_ERROR', '11', 'INVALID_CREDENTIALS_ERROR'])) {
      throw new RevenueCatUnavailableError('This subscription is not available in this build yet. Check the RevenueCat and store product configuration.');
    }

    throw error;
  }
}

export async function restoreRevenueCatPurchases(userId: string) {
  await configureRevenueCat(userId);
  const customerInfo = await Purchases.restorePurchases();
  return customerInfoResult(customerInfo);
}

export async function openRevenueCatManagement(userId: string) {
  await configureRevenueCat(userId);
  const customerInfo = await Purchases.getCustomerInfo();
  if (!customerInfo.managementURL) {
    throw new RevenueCatUnavailableError('No store subscription management link is available yet.');
  }
  await WebBrowser.openBrowserAsync(customerInfo.managementURL);
}
