import * as WebBrowser from 'expo-web-browser';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BrandButton } from '@/src/components/ui/brand-button';
import { stitchSenseAPI } from '@/src/lib/api';
import { config as appConfig } from '@/src/lib/config';
import { getUserFacingErrorMessage } from '@/src/lib/errors';
import {
  openRevenueCatManagement,
  purchaseRevenueCatPlan,
  restoreRevenueCatPurchases,
  usesRevenueCatStoreBilling,
  type RevenueCatPlan,
} from '@/src/lib/revenuecat';
import { useSession } from '@/src/providers/session-provider';
import { tokens } from '@/src/theme/tokens';

type BillingPlan = RevenueCatPlan;

const planOptions: {
  id: BillingPlan;
  label: string;
  price: string;
  cadence: string;
  helper: string;
  badge?: string;
}[] = [
  {
    id: 'annual',
    label: 'Annual',
    price: '£96',
    cadence: 'per year',
    helper: 'Best value if StitchSense will be part of your regular making routine.',
    badge: 'Save £24',
  },
  {
    id: 'monthly',
    label: 'Monthly',
    price: '£10',
    cadence: 'per month',
    helper: 'Flexible access while you try the full platform or work through a project.',
  },
];

const proFeatures = [
  'Pattern-aware AI chat',
  'PDF library and project clones',
  'Ravelry search and imports',
  'Rewrite and simplify tools',
  'Stitch Vision photo help',
  'Stash-aware suggestions',
  'Row counters, notes, and markers',
  'Web and mobile sync',
];

const reassuranceRows = [
  'Secure mobile checkout is handled by the App Store or Google Play.',
  'You can refresh access after payment from this screen.',
  'RevenueCat keeps app subscriptions and entitlements in sync.',
  'Existing Stripe subscribers can still manage billing from the app.',
  'Courtesy and beta access still works from WordPress admin.',
];

const checkoutSuccessUrl = `${appConfig.apiBaseUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`;
const checkoutCancelUrl = `${appConfig.apiBaseUrl}/billing/cancel`;
const billingReturnUrl = `${appConfig.apiBaseUrl}/billing/success`;
const usesStoreBilling = usesRevenueCatStoreBilling();

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function accessHeadline(accessSource?: string | null) {
  switch (accessSource) {
    case 'manual_lifetime':
      return 'Lifetime Pro access';
    case 'manual_trial':
      return 'Extended complimentary access';
    case 'courtesy_access':
      return 'Courtesy Pro access';
    case 'stripe':
    case 'apple':
    case 'google':
      return 'Your Pro plan is active';
    case 'standard_trial':
      return 'Free trial active';
    case 'none':
      return 'Keep StitchSense unlocked';
    default:
      return 'Choose your StitchSense plan';
  }
}

function accessCopy(accessSource?: string | null) {
  switch (accessSource) {
    case 'manual_lifetime':
      return 'This account has permanent Pro access. You do not need to subscribe unless you want to test checkout behaviour.';
    case 'manual_trial':
      return 'This account has extended free access for beta use, testing, or support.';
    case 'courtesy_access':
      return 'This account currently has complimentary Pro access managed from the StitchSense admin tools.';
    case 'stripe':
    case 'apple':
    case 'google':
      return 'Your account already has active Pro billing. You can refresh your account status or manage billing below.';
    case 'standard_trial':
      return 'You are inside the free trial window, with the same core Pro features available while you decide.';
    case 'none':
      return 'Choose a plan to keep AI chat, rewrites, Stitch Vision, Ravelry imports, and project guidance available.';
    default:
      return 'Pro keeps the full StitchSense toolset available across web and mobile.';
  }
}

function trialLabel(trialEndsAt?: string | null) {
  if (!trialEndsAt) return null;
  const end = new Date(trialEndsAt);
  const remaining = end.getTime() - Date.now();
  if (!Number.isFinite(remaining)) return null;
  if (remaining <= 0) return 'Trial ended';
  const days = Math.ceil(remaining / (1000 * 60 * 60 * 24));
  return days === 1 ? '1 day left in trial' : `${days} days left in trial`;
}

function purchaseStatusMessage(status: string, hasActiveEntitlement: boolean) {
  if (hasActiveEntitlement || status === 'active') {
    return 'Purchase complete. Syncing your StitchSense access...';
  }
  if (status === 'pending') {
    return 'Purchase is pending with the store. We’ll refresh your access as soon as Apple or Google confirms it.';
  }
  if (status === 'cancelled') {
    return 'Purchase cancelled. No payment was taken.';
  }
  return 'Purchase sent to the store. Syncing your StitchSense access...';
}

export default function PaywallScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    plan?: string;
    promoCode?: string;
    couponId?: string;
    promotionCodeId?: string;
    autoCheckout?: string;
  }>();
  const requestedPlan = params.plan === 'monthly' ? 'monthly' : params.plan === 'annual' ? 'annual' : null;
  const { accessToken, entitlement, refreshAccount, user } = useSession();
  const [selectedPlan, setSelectedPlan] = useState<BillingPlan>(requestedPlan ?? 'annual');
  const [isLaunchingCheckout, setIsLaunchingCheckout] = useState<BillingPlan | null>(null);
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);
  const [isRestoringPurchases, setIsRestoringPurchases] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const hasActivePaidOrCourtesyAccess = useMemo(() => {
    if (!entitlement) return false;
    if (entitlement.status === 'expired') return false;
    return entitlement.accessSource !== 'none';
  }, [entitlement]);

  const selectedPlanOption = planOptions.find((option) => option.id === selectedPlan) ?? planOptions[0];
  const promoCode = typeof params.promoCode === 'string' ? params.promoCode : '';
  const couponId = typeof params.couponId === 'string' ? params.couponId : '';
  const promotionCodeId = typeof params.promotionCodeId === 'string' ? params.promotionCodeId : '';
  const trialStatus = trialLabel(entitlement?.trialEndsAt);
  const canManageStripeBilling = entitlement?.accessSource === 'stripe';
  const canManageStoreBilling = entitlement?.accessSource === 'apple' || entitlement?.accessSource === 'google';

  useEffect(() => {
    if (requestedPlan) {
      setSelectedPlan(requestedPlan);
    }
  }, [requestedPlan]);

  useEffect(() => {
    if (params.autoCheckout === '1' && requestedPlan && accessToken) {
      void launchCheckout(requestedPlan);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, params.autoCheckout, requestedPlan, user?.id]);

  async function launchCheckout(plan: BillingPlan) {
    if (!accessToken) return;
    setIsLaunchingCheckout(plan);
    setStatusMessage(null);
    try {
      if (usesStoreBilling) {
        if (!user?.id) {
          throw new Error('Sign in before starting a subscription.');
        }
        const purchase = await purchaseRevenueCatPlan(user.id, plan);
        setStatusMessage(purchaseStatusMessage(purchase.status, purchase.hasActiveEntitlement));
        if (purchase.status === 'cancelled') {
          return;
        }
        await wait(1500);
        await refreshAccount();
        setStatusMessage(
          purchase.status === 'pending'
            ? 'Subscription is still pending. Tap refresh after the store confirms payment.'
            : 'Subscription status refreshed.',
        );
        return;
      }

      const response = await stitchSenseAPI.createCheckout(accessToken, {
        plan,
        successUrl: checkoutSuccessUrl,
        cancelUrl: checkoutCancelUrl,
        promoCode: promoCode || undefined,
        couponId: couponId || undefined,
        promotionCodeId: promotionCodeId || undefined,
        allowPromotionCodes: Boolean(promoCode && !couponId && !promotionCodeId),
      });
      await WebBrowser.openBrowserAsync(response.checkoutUrl);
      setStatusMessage('Checking your subscription status...');
      await wait(1500);
      await refreshAccount();
      setStatusMessage('Account status refreshed. If Stripe is still processing, tap refresh again in a moment.');
    } catch (error) {
      setStatusMessage(
        getUserFacingErrorMessage(error, {
          fallback: 'Could not refresh checkout status.',
        }),
      );
    } finally {
      setIsLaunchingCheckout(null);
    }
  }

  async function openBillingPortal() {
    if (!accessToken) return;
    setIsOpeningPortal(true);
    setStatusMessage(null);
    try {
      if (usesStoreBilling && user?.id && canManageStoreBilling) {
        await openRevenueCatManagement(user.id);
        setStatusMessage('Checking your subscription status...');
        await wait(1500);
        await refreshAccount();
        setStatusMessage('Subscription status refreshed.');
        return;
      }

      const response = await stitchSenseAPI.createBillingPortal(accessToken, {
        returnUrl: billingReturnUrl,
      });
      await WebBrowser.openBrowserAsync(response.portalUrl);
      setStatusMessage('Checking your billing status...');
      await wait(1500);
      await refreshAccount();
      setStatusMessage('Billing status refreshed.');
    } catch (error) {
      setStatusMessage(
        getUserFacingErrorMessage(error, {
          fallback: 'Could not open billing management.',
        }),
      );
    } finally {
      setIsOpeningPortal(false);
    }
  }

  async function restorePurchases() {
    if (!user?.id) return;
    setIsRestoringPurchases(true);
    setStatusMessage(null);
    try {
      const restored = await restoreRevenueCatPurchases(user.id);
      setStatusMessage(
        restored.hasActiveEntitlement
          ? 'Store purchase restored. Syncing your StitchSense access...'
          : 'No active store subscription was found for this account.',
      );
      await wait(1500);
      await refreshAccount();
    } catch (error) {
      setStatusMessage(
        getUserFacingErrorMessage(error, {
          fallback:
            'Could not restore purchases. RevenueCat keys, store products, and an Expo development build are required for real purchase testing.',
        }),
      );
    } finally {
      setIsRestoringPurchases(false);
    }
  }

  async function refreshStatus() {
    setIsRefreshing(true);
    setStatusMessage(null);
    try {
      await refreshAccount();
      setStatusMessage('Subscription status refreshed.');
    } catch (error) {
      setStatusMessage(
        getUserFacingErrorMessage(error, { fallback: 'Could not refresh your account.' }),
      );
    } finally {
      setIsRefreshing(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.screen}>
      <View style={styles.hero}>
        <View style={styles.heroHeader}>
          <View style={styles.heroText}>
            <Text style={styles.eyebrow}>StitchSense Pro</Text>
            <Text style={styles.title}>{accessHeadline(entitlement?.accessSource)}</Text>
          </View>
          {trialStatus ? <Text style={styles.trialBadge}>{trialStatus}</Text> : null}
        </View>
        <Text style={styles.copy}>{accessCopy(entitlement?.accessSource)}</Text>
        {promoCode || couponId || promotionCodeId ? (
          <Text style={styles.promoBanner}>
            Offer applied{promoCode ? `: ${promoCode}` : ''}. Choose a plan to continue.
          </Text>
        ) : null}
        <View style={styles.valueGrid}>
          <View style={styles.valueTile}>
            <Text style={styles.valueNumber}>AI</Text>
            <Text style={styles.valueLabel}>Pattern help</Text>
          </View>
          <View style={styles.valueTile}>
            <Text style={styles.valueNumber}>PDF</Text>
            <Text style={styles.valueLabel}>Library tools</Text>
          </View>
          <View style={styles.valueTile}>
            <Text style={styles.valueNumber}>Sync</Text>
            <Text style={styles.valueLabel}>Web + mobile</Text>
          </View>
        </View>
        {statusMessage ? <Text style={styles.statusBanner}>{statusMessage}</Text> : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionEyebrow}>Choose plan</Text>
        <Text style={styles.sectionTitle}>Simple Pro access</Text>
        <View style={styles.planGrid}>
          {planOptions.map((option) => {
            const isSelected = option.id === selectedPlan;
            return (
              <Pressable
                key={option.id}
                accessibilityRole="button"
                onPress={() => setSelectedPlan(option.id)}
                style={[styles.planCard, isSelected ? styles.selectedPlanCard : null]}>
                <View style={styles.planHeader}>
                  <View>
                    <Text style={styles.planLabel}>{option.label}</Text>
                    <Text style={styles.planPrice}>{option.price}</Text>
                    <Text style={styles.planMeta}>{option.cadence}</Text>
                  </View>
                  <View style={[styles.radio, isSelected ? styles.radioActive : null]}>
                    {isSelected ? <View style={styles.radioDot} /> : null}
                  </View>
                </View>
                {option.badge ? <Text style={styles.savingsBadge}>{option.badge}</Text> : null}
                <Text style={styles.planCopy}>{option.helper}</Text>
              </Pressable>
            );
          })}
        </View>
        <BrandButton
          label={
            canManageStripeBilling
              ? isOpeningPortal
                ? 'Opening billing...'
              : 'Manage or change plan'
              : canManageStoreBilling
                ? isOpeningPortal
                  ? 'Opening store settings...'
                  : 'Manage or change plan'
              : usesStoreBilling
                ? isLaunchingCheckout === selectedPlan
                  ? 'Opening store purchase...'
                  : `Subscribe ${selectedPlanOption.label.toLowerCase()}`
              : isLaunchingCheckout === selectedPlan
                ? 'Opening checkout...'
                : `Continue with ${selectedPlanOption.label.toLowerCase()}`
          }
          onPress={() => void (canManageStripeBilling || canManageStoreBilling ? openBillingPortal() : launchCheckout(selectedPlan))}
          loading={canManageStripeBilling || canManageStoreBilling ? isOpeningPortal : isLaunchingCheckout === selectedPlan}
          style={styles.fullWidth}
        />
        <Text style={styles.meta}>
          {canManageStripeBilling
            ? 'Stripe will show your current subscription, plan change options, cancellation controls, invoices, and payment details.'
            : canManageStoreBilling
              ? 'Your store subscription is managed through the App Store or Google Play.'
              : usesStoreBilling
                ? 'You will review the final price in the App Store or Google Play before paying.'
                : 'Web checkout is legacy-only while mobile subscriptions move to RevenueCat.'}
        </Text>
        {usesStoreBilling ? (
          <BrandButton
            label={isRestoringPurchases ? 'Restoring purchases...' : 'Restore purchases'}
            onPress={() => void restorePurchases()}
            loading={isRestoringPurchases}
            style={styles.fullWidth}
            variant="ghost"
          />
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionEyebrow}>Included</Text>
        <Text style={styles.sectionTitle}>Everything makers need while working</Text>
        <View style={styles.featureGrid}>
          {proFeatures.map((feature) => (
            <View key={feature} style={styles.featureTile}>
              <Text style={styles.featureItem}>{feature}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionEyebrow}>Account</Text>
        <Text style={styles.sectionTitle}>Current access</Text>
        <View style={styles.pillRow}>
          <View style={styles.pill}>
            <Text style={styles.pillLabel}>{entitlement?.plan ?? 'free'}</Text>
          </View>
          <View style={styles.pill}>
            <Text style={styles.pillLabel}>{entitlement?.status ?? 'unknown'}</Text>
          </View>
          <View style={styles.pill}>
            <Text style={styles.pillLabel}>{entitlement?.accessSource ?? 'pending'}</Text>
          </View>
        </View>
        {entitlement?.trialEndsAt ? (
          <Text style={styles.meta}>Access checkpoint: {new Date(entitlement.trialEndsAt).toLocaleString()}</Text>
        ) : null}
        <Text style={styles.meta}>
          {hasActivePaidOrCourtesyAccess
            ? 'Your account currently has access. Refresh if the app looks out of sync.'
            : 'If you have just paid or been granted access, refresh your account status here.'}
        </Text>
        <View style={styles.actionStack}>
          <BrandButton
            label={isRefreshing ? 'Refreshing...' : 'Refresh account status'}
            onPress={() => void refreshStatus()}
            loading={isRefreshing}
            style={styles.fullWidth}
            variant="ghost"
          />
          {canManageStripeBilling ? (
            <BrandButton
              label={isOpeningPortal ? 'Opening billing...' : 'Manage Stripe billing'}
              onPress={() => void openBillingPortal()}
              loading={isOpeningPortal}
              style={styles.fullWidth}
              variant="ghost"
            />
          ) : null}
          {canManageStoreBilling ? (
            <BrandButton
              label={isOpeningPortal ? 'Opening store settings...' : 'Manage store subscription'}
              onPress={() => void openBillingPortal()}
              loading={isOpeningPortal}
              style={styles.fullWidth}
              variant="ghost"
            />
          ) : null}
          <BrandButton
            label={hasActivePaidOrCourtesyAccess ? 'Back to account' : 'Not now'}
            onPress={() => router.replace('/(tabs)/account')}
            style={styles.fullWidth}
            variant="ghost"
          />
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionEyebrow}>Billing</Text>
        <Text style={styles.sectionTitle}>Clear and manageable</Text>
        <View style={styles.reassuranceList}>
          {reassuranceRows.map((row) => (
            <View key={row} style={styles.reassuranceRow}>
              <Text style={styles.check}>✓</Text>
              <Text style={styles.copySmall}>{row}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Need a manual access change?</Text>
        <Text style={styles.copySmall}>
          Beta testers, friends, internal admins, and courtesy accounts can be managed in the WordPress admin under StitchSense Users.
        </Text>
        <BrandButton
          label="Okay"
          onPress={() =>
            Alert.alert(
              'Manual access',
              'Lifetime and extended trial access are managed from the StitchSense Users admin screen in WordPress.',
            )
          }
          style={styles.fullWidth}
          variant="ghost"
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: tokens.color.background,
  },
  content: {
    padding: tokens.spacing.lg,
    gap: tokens.spacing.lg,
  },
  hero: {
    backgroundColor: tokens.color.surfaceWarm,
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: tokens.color.border,
    padding: tokens.spacing.xl,
    gap: tokens.spacing.sm,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: tokens.spacing.md,
  },
  heroText: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    color: tokens.color.accent,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  title: {
    color: tokens.color.text,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
  },
  trialBadge: {
    flexShrink: 1,
    color: tokens.color.primary,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    paddingHorizontal: tokens.spacing.sm,
    paddingVertical: 7,
    overflow: 'hidden',
  },
  copy: {
    color: tokens.color.muted,
    fontSize: 16,
    lineHeight: 24,
  },
  copySmall: {
    flex: 1,
    color: tokens.color.muted,
    fontSize: 14,
    lineHeight: 21,
  },
  valueGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  valueTile: {
    flexGrow: 1,
    minWidth: 92,
    minHeight: 70,
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    padding: tokens.spacing.md,
    justifyContent: 'center',
    gap: 2,
  },
  valueNumber: {
    color: tokens.color.primary,
    fontSize: 18,
    fontWeight: '900',
  },
  valueLabel: {
    color: tokens.color.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
  },
  statusBanner: {
    color: tokens.color.primary,
    fontSize: 14,
    lineHeight: 20,
    backgroundColor: '#fff8f0',
    borderRadius: tokens.radius.medium,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
  },
  promoBanner: {
    color: tokens.color.primary,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '900',
    backgroundColor: '#f4fbfb',
    borderRadius: tokens.radius.medium,
    borderWidth: 1,
    borderColor: '#c5e1df',
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
  },
  card: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: tokens.color.border,
    padding: tokens.spacing.xl,
    gap: tokens.spacing.sm,
  },
  sectionEyebrow: {
    color: tokens.color.accent,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  sectionTitle: {
    color: tokens.color.text,
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '700',
  },
  featureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  featureTile: {
    width: '48%',
    minHeight: 56,
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surfaceWarm,
    padding: tokens.spacing.md,
    justifyContent: 'center',
  },
  featureItem: {
    color: tokens.color.text,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700',
  },
  planGrid: {
    gap: tokens.spacing.md,
  },
  planCard: {
    backgroundColor: tokens.color.surfaceWarm,
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: tokens.color.border,
    padding: tokens.spacing.lg,
    gap: tokens.spacing.sm,
  },
  selectedPlanCard: {
    borderColor: tokens.color.primary,
    backgroundColor: '#fff8f0',
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: tokens.spacing.md,
  },
  radio: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: tokens.color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: {
    borderColor: tokens.color.primary,
  },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: tokens.color.primary,
  },
  savingsBadge: {
    alignSelf: 'flex-start',
    borderRadius: tokens.radius.pill,
    backgroundColor: '#e7f4eb',
    color: tokens.color.success,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: 7,
    fontSize: 12,
    fontWeight: '900',
    overflow: 'hidden',
  },
  planLabel: {
    color: tokens.color.accent,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  planPrice: {
    color: tokens.color.text,
    fontSize: 36,
    lineHeight: 40,
    fontWeight: '700',
  },
  planMeta: {
    color: tokens.color.muted,
    fontSize: 14,
  },
  planCopy: {
    color: tokens.color.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  fullWidth: {
    width: '100%',
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  pill: {
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.background,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: 10,
  },
  pillLabel: {
    color: tokens.color.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  meta: {
    color: tokens.color.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  actionStack: {
    gap: tokens.spacing.sm,
    marginTop: tokens.spacing.xs,
  },
  reassuranceList: {
    gap: tokens.spacing.sm,
  },
  reassuranceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: tokens.spacing.sm,
  },
  check: {
    width: 22,
    color: tokens.color.success,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '900',
  },
});
