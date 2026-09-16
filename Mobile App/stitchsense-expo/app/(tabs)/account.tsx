import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppSection } from '@/src/components/ui/app-section';
import { BrandButton } from '@/src/components/ui/brand-button';
import { ScreenHero } from '@/src/components/ui/screen-hero';
import { InlineBackButton } from '@/src/components/ui/inline-back-button';
import { stitchSenseAPI } from '@/src/lib/api';
import { destructiveAccountActionPrompt } from '@/src/lib/destructive-actions';
import {
  entitlementCopy,
  entitlementHeadline,
  formatAccessSource,
  purchaseStatusMessage,
  trialCountdown,
} from '@/src/lib/entitlement-access';
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

const usesStoreBilling = usesRevenueCatStoreBilling();

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
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
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
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

  async function deleteAccount() {
    if (!accessToken) return;
    setIsDeletingAccount(true);
    try {
      await stitchSenseAPI.deleteAccount(accessToken);
      await clearLibrary();
      setLastExportSummary(null);
      await signOut();
    } catch (error) {
      setStatusMessage(
        getUserFacingErrorMessage(error, { fallback: 'Could not delete your account.' }),
      );
    } finally {
      setIsDeletingAccount(false);
    }
  }

  function confirmDeleteData() {
    const prompt = destructiveAccountActionPrompt('delete_synced_data');
    Alert.alert(prompt.title, prompt.message, [
      { text: 'Cancel', style: 'cancel' },
      { text: prompt.confirmLabel, style: 'destructive', onPress: () => void deleteData() },
    ]);
  }

  function confirmDeleteAccount() {
    const prompt = destructiveAccountActionPrompt('delete_account');
    Alert.alert(prompt.title, prompt.message, [
      { text: 'Cancel', style: 'cancel' },
      { text: prompt.confirmLabel, style: 'destructive', onPress: () => void deleteAccount() },
    ]);
  }

  async function launchCheckout(plan: 'monthly' | 'annual') {
    if (!accessToken) return;
    setIsLaunchingCheckout(plan);
    try {
      if (!usesStoreBilling) {
        throw new Error('Mobile subscriptions require an iOS or Android store build.');
      }
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
      if (!usesStoreBilling || !user?.id || !(entitlement?.accessSource === 'apple' || entitlement?.accessSource === 'google')) {
        throw new Error('Store subscription management is available after a mobile store subscription is active.');
      }
      await openRevenueCatManagement(user.id);
      setStatusMessage('Checking your subscription status...');
      await wait(1500);
      await refreshAccount();
      setStatusMessage('Subscription status refreshed.');
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
              This account has an active legacy web subscription. New mobile subscription changes are handled by the App Store or Google Play.
            </Text>
          ) : null}
        </View>
        <View style={styles.actionStack}>
          {entitlement?.accessSource === 'apple' || entitlement?.accessSource === 'google' ? (
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
            onPress={confirmDeleteData}
            style={styles.fullWidth}
            variant="secondary"
          />
          <BrandButton
            label={isDeletingAccount ? 'Deleting account...' : 'Delete account'}
            onPress={confirmDeleteAccount}
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
