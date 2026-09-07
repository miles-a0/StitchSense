import * as WebBrowser from 'expo-web-browser';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppSection } from '@/src/components/ui/app-section';
import { BrandButton } from '@/src/components/ui/brand-button';
import { ScreenHero } from '@/src/components/ui/screen-hero';
import { InlineBackButton } from '@/src/components/ui/inline-back-button';
import { stitchSenseAPI } from '@/src/lib/api';
import { config } from '@/src/lib/config';
import { getUserFacingErrorMessage } from '@/src/lib/errors';
import {
  openRevenueCatManagement,
  purchaseRevenueCatPlan,
  restoreRevenueCatPurchases,
  usesRevenueCatStoreBilling,
} from '@/src/lib/revenuecat';
import { useLibrary } from '@/src/providers/library-provider';
import { usePreferences } from '@/src/providers/preferences-provider';
import { useSession } from '@/src/providers/session-provider';
import { shadows, tokens } from '@/src/theme/tokens';

const checkoutSuccessUrl = `${config.apiBaseUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`;
const checkoutCancelUrl = `${config.apiBaseUrl}/billing/cancel`;
const billingReturnUrl = `${config.apiBaseUrl}/billing/success`;
const usesStoreBilling = usesRevenueCatStoreBilling();

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function formatAccessSource(source?: string | null) {
  switch (source) {
    case 'manual_lifetime':
      return 'Lifetime access';
    case 'manual_trial':
      return 'Extended trial';
    case 'courtesy_access':
      return 'Courtesy access';
    case 'stripe':
      return 'Stripe subscription';
    case 'apple':
      return 'Apple subscription';
    case 'google':
      return 'Google subscription';
    case 'standard_trial':
      return 'Free trial';
    case 'none':
      return 'No active entitlement';
    default:
      return 'Pending';
  }
}

function entitlementCopy(source?: string | null) {
  switch (source) {
    case 'manual_lifetime':
      return 'You have lifetime Pro access on this account.';
    case 'manual_trial':
      return 'You have extended complimentary access for testing, beta use, or support.';
    case 'courtesy_access':
      return 'This account currently has complimentary Pro access.';
    case 'stripe':
    case 'apple':
    case 'google':
      return 'Your paid StitchSense subscription is active.';
    case 'standard_trial':
      return 'Your free trial is active and all Pro features are currently unlocked.';
    case 'none':
      return 'This account is currently on the free tier and locked out of Pro-only features.';
    default:
      return 'Your subscription details will appear here once the account finishes loading.';
  }
}

function entitlementHeadline(source?: string | null) {
  switch (source) {
    case 'manual_lifetime':
      return 'Lifetime Pro';
    case 'manual_trial':
      return 'Extended Pro access';
    case 'courtesy_access':
      return 'Courtesy Pro access';
    case 'stripe':
    case 'apple':
    case 'google':
      return 'Paid Pro plan';
    case 'standard_trial':
      return 'Free trial active';
    case 'none':
      return 'Upgrade to keep full access';
    default:
      return 'Checking access';
  }
}

function trialCountdown(trialEndsAt?: string | null) {
  if (!trialEndsAt) {
    return null;
  }
  const ms = new Date(trialEndsAt).getTime() - Date.now();
  const days = Math.ceil(ms / (1000 * 60 * 60 * 24));
  if (days <= 0) {
    return 'Ends today';
  }
  if (days === 1) {
    return '1 day remaining';
  }
  return `${days} days remaining`;
}

type ChoicePillProps = {
  label: string;
  active: boolean;
  onPress: () => void;
};

function ChoicePill({ label, active, onPress }: ChoicePillProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.choicePill,
        active ? styles.choicePillActive : null,
        pressed ? styles.choicePillPressed : null,
      ]}>
      <Text style={[styles.choicePillLabelBase, active ? styles.choicePillActiveLabel : styles.choicePillLabel]}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function AccountScreen() {
  const router = useRouter();
  const { accessToken, entitlement, refreshAccount, signOut, user } = useSession();
  const { clearLibrary, refreshPatterns } = useLibrary();
  const { settings, saveSettings: savePreferenceSettings } = usePreferences();
  const [draftSettings, setDraftSettings] = useState(settings);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLaunchingCheckout, setIsLaunchingCheckout] = useState<string | null>(null);
  const [isOpeningBillingPortal, setIsOpeningBillingPortal] = useState(false);
  const [isRestoringPurchases, setIsRestoringPurchases] = useState(false);
  const [lastExportSummary, setLastExportSummary] = useState<string | null>(null);

  useEffect(() => {
    setDraftSettings(settings);
  }, [settings]);

  const accountStats = [
    { label: 'Plan', value: entitlement?.plan ?? 'Free' },
    { label: 'Status', value: entitlement?.status ?? 'Unknown' },
    {
      label: 'Access',
      value: trialCountdown(entitlement?.trialEndsAt) ?? formatAccessSource(entitlement?.accessSource),
    },
  ];

  async function saveSettings() {
    if (!accessToken) return;
    setIsSaving(true);
    setStatusMessage(null);
    try {
      await savePreferenceSettings(draftSettings);
      setStatusMessage('Preferences saved.');
    } catch (error) {
      setStatusMessage(
        getUserFacingErrorMessage(error, { fallback: 'Could not save preferences.' }),
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRefreshAccount() {
    setIsRefreshing(true);
    setStatusMessage(null);
    try {
      await refreshAccount();
      setStatusMessage('Subscription status refreshed.');
    } catch (error) {
      setStatusMessage(
        getUserFacingErrorMessage(error, { fallback: 'Could not refresh account.' }),
      );
    } finally {
      setIsRefreshing(false);
    }
  }

  async function exportData() {
    if (!accessToken) return;
    setIsExporting(true);
    try {
      const response = await stitchSenseAPI.userExport(accessToken);
      setLastExportSummary(
        `${response.patterns.length} patterns, ${response.projects.length} projects, ${response.stashItems.length} stash items, ${response.chatSessions.length} chats, ${response.chatMessages.length} messages, ${response.rewriteSessions.length} rewrites · exported ${new Date(response.exportedAt).toLocaleString()}`,
      );
      setStatusMessage('Export prepared. Summary loaded below.');
    } catch (error) {
      setStatusMessage(
        getUserFacingErrorMessage(error, { fallback: 'Could not export data.' }),
      );
    } finally {
      setIsExporting(false);
    }
  }

  async function deleteData() {
    if (!accessToken) return;
    setIsDeleting(true);
    try {
      await stitchSenseAPI.deleteUserData(accessToken);
      await clearLibrary();
      await refreshPatterns();
      setLastExportSummary(null);
      setStatusMessage('Synced mobile data deleted.');
    } catch (error) {
      setStatusMessage(
        getUserFacingErrorMessage(error, { fallback: 'Could not delete synced data.' }),
      );
    } finally {
      setIsDeleting(false);
    }
  }

  async function launchCheckout(plan: 'monthly' | 'annual') {
    if (!accessToken) return;
    setIsLaunchingCheckout(plan);
    try {
      if (usesStoreBilling) {
        if (!user?.id) {
          throw new Error('Sign in before starting a subscription.');
        }
        const purchase = await purchaseRevenueCatPlan(user.id, plan);
        setStatusMessage(
          purchase.hasActiveEntitlement
            ? 'Purchase complete. Syncing your StitchSense access...'
            : 'Purchase sent to the store. Syncing your StitchSense access...',
        );
        await wait(1500);
        await refreshAccount();
        setStatusMessage('Subscription status refreshed.');
        return;
      }

      const response = await stitchSenseAPI.createCheckout(accessToken, {
        plan,
        successUrl: checkoutSuccessUrl,
        cancelUrl: checkoutCancelUrl,
      });
      await WebBrowser.openBrowserAsync(response.checkoutUrl);
      setStatusMessage('Checking your subscription status...');
      await wait(1500);
      await refreshAccount();
      setStatusMessage('Account status refreshed.');
    } catch (error) {
      const message = getUserFacingErrorMessage(error, {
        fallback: 'Could not refresh checkout status.',
      });
      setStatusMessage(message);
    } finally {
      setIsLaunchingCheckout(null);
    }
  }

  async function openBillingPortal() {
    if (!accessToken) return;
    setIsOpeningBillingPortal(true);
    setStatusMessage(null);
    try {
      if (usesStoreBilling && user?.id && (entitlement?.accessSource === 'apple' || entitlement?.accessSource === 'google')) {
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
          fallback: 'Could not open subscription management.',
        }),
      );
    } finally {
      setIsOpeningBillingPortal(false);
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

  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.screen}>
      <InlineBackButton
        onPress={() =>
          router.canGoBack() ? router.back() : router.replace('/(tabs)/dashboard')
        }
      />
      <ScreenHero
        copy={entitlementCopy(entitlement?.accessSource)}
        eyebrow="Account"
        icon="account-circle-outline"
        title={user?.displayName ?? user?.email ?? 'StitchSense account'}>
        <Text style={styles.accountHeadline}>{entitlementHeadline(entitlement?.accessSource)}</Text>
        <View style={styles.accountStatsGrid}>
          {accountStats.map((stat) => (
            <View key={stat.label} style={styles.accountStat}>
              <Text numberOfLines={1} adjustsFontSizeToFit style={styles.accountStatValue}>
                {stat.value}
              </Text>
              <Text style={styles.accountStatLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>
        {statusMessage ? <Text style={styles.statusBanner}>{statusMessage}</Text> : null}
      </ScreenHero>

      <AppSection
        style={styles.sectionCard}
        subtitle="Choose, change, or cancel your StitchSense Pro subscription."
        title="Subscription">
        <View style={styles.planSummaryCard}>
          <Text style={styles.featureTitle}>{formatAccessSource(entitlement?.accessSource)}</Text>
          <Text style={styles.planSummaryTitle}>{entitlement?.plan ?? 'free'}</Text>
          <Text style={styles.meta}>
            Status: {entitlement?.status ?? 'unknown'}
            {entitlement?.trialEndsAt
              ? ` · ${new Date(entitlement.trialEndsAt).toLocaleDateString()}`
              : ''}
          </Text>
          {entitlement?.accessSource === 'stripe' ? (
            <Text style={styles.meta}>
              To cancel, open Stripe billing. Cancelling stops renewal and keeps Pro access until the paid period ends.
            </Text>
          ) : null}
        </View>
        <View style={styles.actionStack}>
          {entitlement?.accessSource === 'stripe' ? (
            <BrandButton
              label={isOpeningBillingPortal ? 'Opening billing...' : 'Manage or cancel subscription'}
              onPress={() =>
                Alert.alert(
                  'Manage subscription',
                  'This opens Stripe billing, where you can cancel renewal, change plan, update payment details, or view invoices.',
                  [
                    { text: 'Not now', style: 'cancel' },
                    { text: 'Open Stripe billing', onPress: () => void openBillingPortal() },
                  ],
                )
              }
              loading={isOpeningBillingPortal}
              style={styles.fullWidth}
            />
          ) : entitlement?.accessSource === 'apple' || entitlement?.accessSource === 'google' ? (
            <BrandButton
              label={isOpeningBillingPortal ? 'Opening store settings...' : 'Manage or cancel store subscription'}
              onPress={() =>
                Alert.alert(
                  'Manage subscription',
                  'This opens the App Store or Google Play subscription management page for your current plan.',
                  [
                    { text: 'Not now', style: 'cancel' },
                    { text: 'Open store settings', onPress: () => void openBillingPortal() },
                  ],
                )
              }
              loading={isOpeningBillingPortal}
              style={styles.fullWidth}
            />
          ) : (
            <>
              <BrandButton
                label="See all plans"
                onPress={() => router.push('/paywall')}
                style={styles.fullWidth}
              />
              <View style={styles.planButtonRow}>
                <BrandButton
                  label={isLaunchingCheckout === 'monthly' ? 'Opening...' : 'Monthly'}
                  onPress={() => void launchCheckout('monthly')}
                  style={styles.planButton}
                  variant="ghost"
                />
                <BrandButton
                  label={isLaunchingCheckout === 'annual' ? 'Opening...' : 'Annual'}
                  onPress={() => void launchCheckout('annual')}
                  style={styles.planButton}
                  variant="secondary"
                />
              </View>
              {usesStoreBilling ? (
                <BrandButton
                  label={isRestoringPurchases ? 'Restoring purchases...' : 'Restore purchases'}
                  onPress={() => void restorePurchases()}
                  loading={isRestoringPurchases}
                  style={styles.fullWidth}
                  variant="ghost"
                />
              ) : null}
            </>
          )}
          <BrandButton
            label={isRefreshing ? 'Refreshing...' : 'Refresh status'}
            onPress={() => void handleRefreshAccount()}
            style={styles.fullWidth}
            variant="ghost"
          />
        </View>
      </AppSection>

      <AppSection
        style={styles.sectionCard}
        subtitle="Set the defaults the app should use when it opens patterns, tools, and AI help."
        title="Preferences">
        <View style={styles.preferenceGroup}>
          <Text style={styles.fieldLabel}>Default skill level</Text>
          <View style={styles.pillRow}>
            {['beginner', 'intermediate', 'advanced'].map((value) => (
              <ChoicePill
                active={draftSettings.defaultSkill === value}
                key={value}
                label={value}
                onPress={() => setDraftSettings((current) => ({ ...current, defaultSkill: value }))}
              />
            ))}
          </View>
        </View>

        <View style={styles.preferenceGroup}>
          <Text style={styles.fieldLabel}>Units</Text>
          <View style={styles.pillRow}>
            {[
              ['metric', 'Metric'],
              ['imperial', 'Imperial'],
            ].map(([value, label]) => (
              <ChoicePill
                active={draftSettings.measurementUnit === value}
                key={value}
                label={label}
                onPress={() =>
                  setDraftSettings((current) => ({ ...current, measurementUnit: value }))
                }
              />
            ))}
          </View>
        </View>

        <View style={styles.preferenceGroup}>
          <Text style={styles.fieldLabel}>Language</Text>
          <View style={styles.pillRow}>
            {[
              ['uk', 'UK'],
              ['us', 'US'],
            ].map(([value, label]) => (
              <ChoicePill
                active={draftSettings.language === value}
                key={value}
                onPress={() => setDraftSettings((current) => ({ ...current, language: value }))}
                label={label}
              />
            ))}
          </View>
        </View>

        <BrandButton
          label={isSaving ? 'Saving...' : 'Save preferences'}
          onPress={() => void saveSettings()}
          style={styles.fullWidth}
        />
      </AppSection>

      <AppSection
        style={styles.sectionCard}
        subtitle="Export your synced platform data for review, or clear the mobile copy if you need a clean reset."
        title="Data and privacy">
        {lastExportSummary ? <Text style={styles.statusBanner}>{lastExportSummary}</Text> : null}
        <View style={styles.actionStack}>
          <BrandButton
            label={isExporting ? 'Preparing export...' : 'Export my data'}
            onPress={() => void exportData()}
            style={styles.fullWidth}
            variant="ghost"
          />
          <BrandButton
            label={isDeleting ? 'Deleting...' : 'Delete synced data'}
            onPress={() =>
              Alert.alert(
                'Delete synced mobile data?',
                'This removes synced chats, rewrites, and saved platform settings for this account.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: () => void deleteData() },
                ],
              )
            }
            style={styles.fullWidth}
            variant="secondary"
          />
        </View>
      </AppSection>

      <BrandButton
        label="Sign out"
        onPress={() =>
          Alert.alert('Sign out?', 'You can sign back in at any time with your StitchSense or WordPress account.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
          ])
        }
        style={styles.signOutButton}
      />
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
    paddingBottom: tokens.spacing.xxl,
  },
  accountHeadline: {
    color: tokens.color.primary,
    fontFamily: tokens.font.display,
    fontSize: 24,
    lineHeight: 30,
  },
  accountStatsGrid: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
    marginTop: tokens.spacing.sm,
  },
  accountStat: {
    flex: 1,
    minHeight: 74,
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: 'rgba(20, 63, 54, 0.11)',
    backgroundColor: 'rgba(255, 253, 250, 0.97)',
    padding: tokens.spacing.sm,
    justifyContent: 'center',
    ...shadows.soft,
  },
  accountStatValue: {
    color: tokens.color.text,
    fontFamily: tokens.font.display,
    fontSize: 18,
    lineHeight: 22,
    textTransform: 'capitalize',
  },
  accountStatLabel: {
    color: tokens.color.muted,
    fontFamily: tokens.font.body,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 16,
  },
  statusBanner: {
    color: tokens.color.primary,
    fontFamily: tokens.font.body,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '800',
    backgroundColor: 'rgba(255, 253, 250, 0.86)',
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: 'rgba(20, 63, 54, 0.1)',
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
    marginTop: tokens.spacing.sm,
  },
  sectionCard: {
    borderRadius: 22,
    borderColor: 'rgba(20, 63, 54, 0.11)',
    backgroundColor: 'rgba(255, 253, 250, 0.78)',
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  pill: {
    backgroundColor: '#efe1d3',
    borderRadius: tokens.radius.pill,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: 8,
  },
  pillLabel: {
    color: tokens.color.primary,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  meta: {
    color: tokens.color.muted,
    fontFamily: tokens.font.body,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 21,
  },
  fieldLabel: {
    color: tokens.color.accent,
    fontFamily: tokens.font.body,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  preferenceGroup: {
    gap: tokens.spacing.sm,
  },
  featureCard: {
    borderRadius: tokens.radius.medium,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: '#fffaf6',
    padding: tokens.spacing.md,
    gap: tokens.spacing.xs,
  },
  accessSummaryCard: {
    borderRadius: tokens.radius.medium,
    borderWidth: 1,
    borderColor: 'rgba(63, 143, 85, 0.22)',
    backgroundColor: '#f2f8f0',
    padding: tokens.spacing.md,
    gap: tokens.spacing.xs,
  },
  planSummaryCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(20, 63, 54, 0.11)',
    backgroundColor: 'rgba(255, 253, 250, 0.97)',
    padding: tokens.spacing.lg,
    gap: tokens.spacing.sm,
    ...shadows.soft,
  },
  planSummaryTitle: {
    color: tokens.color.primary,
    fontFamily: tokens.font.display,
    fontSize: 28,
    lineHeight: 34,
    textTransform: 'capitalize',
  },
  planButtonRow: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  planButton: {
    flex: 1,
  },
  mobileChecklistCard: {
    borderRadius: tokens.radius.medium,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: '#fffaf6',
    padding: tokens.spacing.md,
    gap: tokens.spacing.xs,
  },
  featureTitle: {
    color: tokens.color.accent,
    fontFamily: tokens.font.body,
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  featureList: {
    gap: 6,
  },
  featureItem: {
    color: tokens.color.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  environmentCard: {
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: '#dbc3ac',
    backgroundColor: '#fffaf4',
    padding: tokens.spacing.md,
    gap: tokens.spacing.sm,
  },
  environmentLabel: {
    color: tokens.color.accent,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  environmentValue: {
    color: tokens.color.text,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  environmentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
    marginTop: tokens.spacing.xs,
  },
  environmentPill: {
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: 8,
  },
  environmentPillLabel: {
    color: tokens.color.primary,
    fontSize: 12,
    fontWeight: '800',
  },
  environmentPillWarning: {
    borderColor: '#efb3a7',
    backgroundColor: '#fff0ec',
  },
  environmentHint: {
    color: tokens.color.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  actionStack: {
    gap: tokens.spacing.sm,
    marginTop: tokens.spacing.xs,
  },
  fullWidth: {
    width: '100%',
  },
  choicePill: {
    flexGrow: 1,
    alignItems: 'center',
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: 'rgba(20, 63, 54, 0.13)',
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 253, 250, 0.97)',
  },
  choicePillActive: {
    backgroundColor: tokens.color.primary,
    borderColor: tokens.color.primary,
  },
  choicePillPressed: {
    opacity: 0.92,
  },
  choicePillLabelBase: {
    fontFamily: tokens.font.body,
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'capitalize',
  },
  choicePillLabel: {
    color: tokens.color.primary,
  },
  choicePillActiveLabel: {
    color: '#fff',
  },
  signOutButton: {
    width: '100%',
    marginTop: tokens.spacing.xs,
  },
});
