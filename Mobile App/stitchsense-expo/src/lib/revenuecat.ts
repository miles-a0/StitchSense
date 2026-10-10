import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import Purchases, { LOG_LEVEL, type CustomerInfo, type PurchasesPackage } from 'react-native-purchases';

import { config } from '@/src/lib/config';
import { revenueCatEntitlementSnapshot } from '@/src/lib/entitlement-access';
import type { Entitlement } from '@/src/lib/models';
import {
  mapRevenueCatPurchaseError,
  revenueCatNetworkErrorMessage,
  revenueCatUnavailableMessage,
  type RevenueCatPurchaseStatus,
} from '@/src/lib/revenuecat-results';
import {
  revenueCatPlanPriceFromProduct,
  type RevenueCatPlan,
  type RevenueCatPlanPricing,
} from '@/src/lib/revenuecat-pricing';

export type { RevenueCatPlan, RevenueCatPlanPricing } from '@/src/lib/revenuecat-pricing';
export type { RevenueCatPurchaseStatus } from '@/src/lib/revenuecat-results';

export class RevenueCatUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RevenueCatUnavailableError';
  }
}

let configuredForUserId: string | null = null;

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

export function isUsingRevenueCatTestStore() {
  const apiKey = revenueCatApiKey();
  return Boolean(apiKey && config.revenueCat.testStoreApiKey && apiKey === config.revenueCat.testStoreApiKey);
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

export function revenueCatEntitlementFromCustomerInfo(customerInfo: CustomerInfo): Entitlement | null {
  const source = Platform.OS === 'android' ? 'google' : 'apple';
  return revenueCatEntitlementSnapshot(customerInfo, config.revenueCat.entitlementId, source);
}

export async function getRevenueCatEntitlement(userId: string) {
  await configureRevenueCat(userId);
  const customerInfo = await Purchases.getCustomerInfo();
  return revenueCatEntitlementFromCustomerInfo(customerInfo);
}

export async function getRevenueCatPlanPricing(userId: string): Promise<RevenueCatPlanPricing> {
  await configureRevenueCat(userId);
  const pricing: RevenueCatPlanPricing = {};

  for (const plan of ['monthly', 'annual'] satisfies RevenueCatPlan[]) {
    try {
      const selectedPackage = await packageForPlan(plan);
      const planPrice = revenueCatPlanPriceFromProduct(selectedPackage.product);
      if (planPrice) {
        pricing[plan] = planPrice;
      }
    } catch (error) {
      if (error instanceof RevenueCatUnavailableError) {
        continue;
      }
      throw error;
    }
  }

  if (!pricing.monthly && !pricing.annual) {
    throw new RevenueCatUnavailableError('No RevenueCat plan pricing is configured for this app yet.');
  }

  return pricing;
}

export async function purchaseRevenueCatPlan(userId: string, plan: RevenueCatPlan) {
  await configureRevenueCat(userId);
  const selectedPackage = await packageForPlan(plan);
  try {
    const purchase = await Purchases.purchasePackage(selectedPackage);
    return customerInfoResult(purchase.customerInfo);
  } catch (error) {
    const mappedError = mapRevenueCatPurchaseError(error);
    if (mappedError === 'cancelled') {
      const customerInfo = await Purchases.getCustomerInfo();
      return customerInfoResult(customerInfo, 'cancelled');
    }

    if (mappedError === 'pending') {
      const customerInfo = await Purchases.getCustomerInfo();
      return customerInfoResult(customerInfo, 'pending');
    }

    if (mappedError === 'already_purchased') {
      const customerInfo = await Purchases.getCustomerInfo();
      return customerInfoResult(customerInfo);
    }

    if (mappedError === 'network') {
      throw new Error(revenueCatNetworkErrorMessage());
    }

    if (mappedError === 'configuration') {
      throw new RevenueCatUnavailableError(revenueCatUnavailableMessage());
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
  if (isUsingRevenueCatTestStore()) {
    throw new RevenueCatUnavailableError(
      'Subscription management is available after a real App Store or Google Play purchase. RevenueCat Test Store purchases can be changed from the RevenueCat dashboard.',
    );
  }

  await configureRevenueCat(userId);
  const customerInfo = await Purchases.getCustomerInfo();
  if (!customerInfo.managementURL) {
    throw new RevenueCatUnavailableError('No store subscription management link is available yet.');
  }
  await WebBrowser.openBrowserAsync(customerInfo.managementURL);
}
