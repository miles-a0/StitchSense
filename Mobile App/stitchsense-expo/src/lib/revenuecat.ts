import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import Purchases, { LOG_LEVEL, type CustomerInfo, type PurchasesPackage } from 'react-native-purchases';

import { config } from '@/src/lib/config';

export type RevenueCatPlan = 'monthly' | 'annual';

export class RevenueCatUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RevenueCatUnavailableError';
  }
}

let configuredForUserId: string | null = null;

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
  const purchase = await Purchases.purchasePackage(selectedPackage);
  return {
    customerInfo: purchase.customerInfo,
    hasActiveEntitlement: hasRevenueCatEntitlement(purchase.customerInfo),
  };
}

export async function restoreRevenueCatPurchases(userId: string) {
  await configureRevenueCat(userId);
  const customerInfo = await Purchases.restorePurchases();
  return {
    customerInfo,
    hasActiveEntitlement: hasRevenueCatEntitlement(customerInfo),
  };
}

export async function openRevenueCatManagement(userId: string) {
  await configureRevenueCat(userId);
  const customerInfo = await Purchases.getCustomerInfo();
  if (!customerInfo.managementURL) {
    throw new RevenueCatUnavailableError('No store subscription management link is available yet.');
  }
  await WebBrowser.openBrowserAsync(customerInfo.managementURL);
}
