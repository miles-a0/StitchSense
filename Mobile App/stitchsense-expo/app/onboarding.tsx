import { Image } from 'expo-image';
import { Redirect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { stitchSenseAPI } from '@/src/lib/api';
import { getUserFacingErrorMessage } from '@/src/lib/errors';
import {
  loadOnboardingComplete,
  loadOnboardingPending,
  saveOnboardingComplete,
  saveOnboardingPending,
} from '@/src/lib/onboarding-store';
import type { RavelryStatusResponse, UserSettings } from '@/src/lib/models';
import { usePreferences } from '@/src/providers/preferences-provider';
import { useSession } from '@/src/providers/session-provider';
import { shadows, tokens } from '@/src/theme/tokens';

type StepId =
  | 'welcome'
  | 'features'
  | 'projects'
  | 'auth'
  | 'preferences'
  | 'ravelry'
  | 'ready';

type AuthMode = 'sign-in' | 'sign-up';

const stepOrder: StepId[] = [
  'welcome',
  'features',
  'projects',
  'auth',
  'preferences',
  'ravelry',
  'ready',
];

const backgroundByStep: Record<StepId, any> = {
  welcome: require('@/assets/onboarding/brand-emotional.webp'),
  features: require('@/assets/onboarding/brand-emotional.webp'),
  projects: require('@/assets/onboarding/brand-emotional.webp'),
  auth: require('@/assets/onboarding/activation.webp'),
  preferences: require('@/assets/onboarding/functional-setup.webp'),
  ravelry: require('@/assets/onboarding/functional-setup.webp'),
  ready: require('@/assets/onboarding/activation.webp'),
};

const skillOptions = [
  { key: 'beginner', label: 'Beginner' },
  { key: 'intermediate', label: 'Intermediate' },
  { key: 'advanced', label: 'Advanced' },
];

const unitOptions = [
  { key: 'metric', label: 'Metric' },
  { key: 'imperial', label: 'Imperial' },
];

const languageOptions = [
  { key: 'uk', label: 'UK' },
  { key: 'us', label: 'US' },
];

function StepDots({ currentStep }: { currentStep: StepId }) {
  return (
    <View style={styles.dotsRow}>
      {stepOrder.map((step) => (
        <View
          key={step}
          style={[
            styles.dot,
            step === currentStep ? styles.dotActive : null,
          ]}
        />
      ))}
    </View>
  );
}

function LightButton({
  label,
  onPress,
  secondary,
  disabled,
  loading,
}: {
  label: string;
  onPress?: () => void;
  secondary?: boolean;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.lightButton,
        secondary ? styles.lightButtonSecondary : null,
        pressed && !disabled && !loading ? styles.pressed : null,
        disabled ? styles.disabled : null,
      ]}>
      {loading ? (
        <ActivityIndicator color={secondary ? '#ffffff' : tokens.color.primary} />
      ) : (
        <Text style={[styles.lightButtonLabel, secondary ? styles.lightButtonLabelSecondary : null]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

function IntroCard({
  eyebrow,
  title,
  body,
  kicker,
  compact,
}: {
  eyebrow: string;
  title: string;
  body: string;
  kicker?: string;
  compact?: boolean;
}) {
  return (
    <View style={[styles.sheet, compact ? styles.sheetCompact : null]}>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={[styles.heroTitle, compact ? styles.heroTitleCompact : null]}>{title}</Text>
      <Text style={[styles.heroBody, compact ? styles.heroBodyCompact : null]}>{body}</Text>
      {kicker ? (
        <View style={[styles.kickerCard, compact ? styles.kickerCardCompact : null]}>
          <Text style={styles.kickerEyebrow}>Smart shortcut</Text>
          <Text style={styles.kickerText}>{kicker}</Text>
        </View>
      ) : null}
    </View>
  );
}

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const router = useRouter();
  const { accessToken, errorMessage, isLoading, signIn, signUp } = useSession();
  const { saveSettings: savePreferenceSettings } = usePreferences();
  const isCompact = height < 860;
  const isVeryCompact = height < 760;

  const [isCheckingGate, setIsCheckingGate] = useState(true);
  const [hasCompleted, setHasCompleted] = useState(false);
  const [hasPendingOnboarding, setHasPendingOnboarding] = useState(false);
  const [step, setStep] = useState<StepId>('welcome');
  const [authMode, setAuthMode] = useState<AuthMode>('sign-up');
  const [identifier, setIdentifier] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [settings, setSettings] = useState<UserSettings>({
    defaultSkill: 'beginner',
    measurementUnit: 'metric',
    language: 'uk',
    preferences: {},
  });
  const [isSavingPreferences, setIsSavingPreferences] = useState(false);
  const [localMessage, setLocalMessage] = useState<string | null>(null);
  const [isLoadingRavelry, setIsLoadingRavelry] = useState(false);
  const [isConnectingRavelry, setIsConnectingRavelry] = useState(false);
  const [ravelryStatus, setRavelryStatus] = useState<RavelryStatusResponse | null>(null);
  const passwordRef = useRef<TextInput | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadGate() {
      const [completed, pending] = await Promise.all([
        loadOnboardingComplete(),
        loadOnboardingPending(),
      ]);
      if (!mounted) return;
      setHasCompleted(completed);
      setHasPendingOnboarding(pending);
      setIsCheckingGate(false);
    }

    void loadGate();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (accessToken && step === 'auth') {
      setStep('preferences');
      setLocalMessage(null);
    }
  }, [accessToken, step]);

  const refreshRavelryStatus = useCallback(async () => {
    if (!accessToken) return;
    setIsLoadingRavelry(true);
    try {
      const response = await stitchSenseAPI.ravelryStatus(accessToken);
      setRavelryStatus(response);
      setLocalMessage(
        response.connected
          ? response.username
            ? `Connected as ${response.username}`
            : 'Ravelry connected.'
          : 'Ravelry is optional. You can connect now or later from the app.',
      );
    } catch (error) {
      setLocalMessage(
        getUserFacingErrorMessage(error, {
          fallback: 'Could not load Ravelry status right now.',
        }),
      );
    } finally {
      setIsLoadingRavelry(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (accessToken && step === 'ravelry') {
      void refreshRavelryStatus();
    }
  }, [accessToken, refreshRavelryStatus, step]);

  async function connectRavelry() {
    if (!accessToken) return;
    setIsConnectingRavelry(true);
    try {
      const response = await stitchSenseAPI.ravelryConnectUrl(accessToken);
      if (!response.url) {
        setLocalMessage('Ravelry authorisation is not ready yet.');
        return;
      }

      try {
        await WebBrowser.openBrowserAsync(response.url);
      } catch {
        await Linking.openURL(response.url);
      }

      setLocalMessage('Finish approval in Ravelry, then tap refresh connection.');
    } catch (error) {
      setLocalMessage(
        getUserFacingErrorMessage(error, {
          fallback: 'Could not start the Ravelry connection.',
        }),
      );
    } finally {
      setIsConnectingRavelry(false);
    }
  }

  async function completeOnboarding() {
    await saveOnboardingComplete(true);
    await saveOnboardingPending(false);
    setHasCompleted(true);
    setHasPendingOnboarding(false);
    router.replace(accessToken ? '/(tabs)/dashboard' : '/sign-in');
  }

  function nextStep() {
    const currentIndex = stepOrder.indexOf(step);
    const next = stepOrder[currentIndex + 1];
    if (next) {
      setStep(next);
    }
  }

  function prevStep() {
    const currentIndex = stepOrder.indexOf(step);
    const previous = stepOrder[currentIndex - 1];
    if (previous) {
      setStep(previous);
    }
  }

  async function handleAuthSubmit() {
    setLocalMessage(null);
    if (authMode === 'sign-in') {
      await signIn(identifier, password);
      return;
    }

    await signUp({
      email,
      username,
      password,
    });
  }

  async function handleSavePreferences() {
    if (!accessToken) return;
    setIsSavingPreferences(true);
    setLocalMessage(null);
    try {
      await savePreferenceSettings(settings);
      setLocalMessage('Preferences saved.');
      setStep('ravelry');
    } catch (error) {
      setLocalMessage(
        getUserFacingErrorMessage(error, {
          fallback: 'Could not save your preferences just now.',
        }),
      );
    } finally {
      setIsSavingPreferences(false);
    }
  }

  const activeBackground = backgroundByStep[step];
  const stepIndex = stepOrder.indexOf(step) + 1;

  const canSkipToAuth = step === 'welcome' || step === 'features' || step === 'projects';

  if (isCheckingGate) {
    return <View style={styles.loadingScreen} />;
  }

  if (hasCompleted && !hasPendingOnboarding) {
    return <Redirect href={accessToken ? '/(tabs)/dashboard' : '/sign-in'} />;
  }

  return (
    <ImageBackground source={activeBackground} style={styles.background} resizeMode="cover">
      <StatusBar style="light" />
      <View style={styles.overlay} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[
          styles.root,
          { paddingTop: insets.top + (isCompact ? tokens.spacing.sm : tokens.spacing.lg) },
        ]}
      >
        <View style={styles.topBar}>
          <View style={styles.progressBlock}>
            <StepDots currentStep={step} />
            <Text style={styles.progressLabel}>Step {stepIndex} of {stepOrder.length}</Text>
          </View>
          {canSkipToAuth ? (
            <Pressable onPress={() => setStep('auth')} style={styles.skipButton}>
              <Text style={styles.skipLabel}>Skip</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.flexGrow}>
          {step === 'welcome' ? (
            <>
              <IntroCard
                eyebrow="Welcome"
                title="Your knitting assistant, wherever you are"
                body="Keep patterns, projects, counters, rewrites, and stitch help together in one calm place."
                kicker="Pattern-aware from the start"
                compact={isCompact}
              />
              <View style={[styles.microRoutePanel, isCompact ? styles.microRoutePanelCompact : null]}>
                <Text style={styles.microRouteTitle}>Start from patterns, stash, projects, or a question.</Text>
                <Text style={styles.microRouteCopy}>The app keeps each route connected so you are not starting over every time.</Text>
              </View>
            </>
          ) : null}

          {step === 'features' ? (
            <>
              <IntroCard
                eyebrow="Pattern help"
                title="Understand tricky instructions faster"
                body="Ask questions about a pattern, simplify dense sections, and rewrite steps into something easier to follow."
                kicker="Chat, rewrite, then carry on"
                compact={isCompact}
              />
              <View style={[styles.microFeatureGrid, isCompact ? styles.microFeatureGridCompact : null]}>
                {['Ask', 'Rewrite', 'Mark', 'Track'].map((label) => (
                  <View key={label} style={styles.microFeaturePill}>
                    <Text style={styles.microFeatureText}>{label}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}

          {step === 'projects' ? (
            <IntroCard
              eyebrow="Projects"
              title="Turn saved patterns into active makes"
              body="Track rows, log progress, save photos, and pick up exactly where you left off even across devices."
              kicker="Library and Projects work side by side"
              compact={isCompact}
            />
          ) : null}

          {step === 'auth' ? (
            <ScrollView
              contentContainerStyle={[styles.authScroll, isCompact ? styles.authScrollCompact : null]}
              contentInsetAdjustmentBehavior="always"
              keyboardShouldPersistTaps="handled">
              <View style={[styles.sheet, isCompact ? styles.sheetCompact : null, isVeryCompact ? styles.sheetVeryCompact : null]}>
                <View style={styles.authHeaderRow}>
                  <Image contentFit="contain" source={require('@/assets/logo.png')} style={styles.logo} />
                  <View style={styles.authHeaderCopy}>
                    <Text style={[styles.authTitle, isCompact ? styles.authTitleCompact : null]}>StitchSense Pro</Text>
                    <Text style={[styles.authSubtitle, isCompact ? styles.authSubtitleCompact : null]}>
                      Create an account or sign in to sync your patterns and projects.
                    </Text>
                  </View>
                </View>

                <View style={styles.authTrustRow}>
                  <Text style={styles.authTrustItem}>Syncs web and mobile</Text>
                  <Text style={styles.authTrustItem}>Keeps your projects private</Text>
                </View>

                <View style={styles.segmented}>
                  <Pressable
                    onPress={() => setAuthMode('sign-up')}
                    style={[styles.segment, authMode === 'sign-up' ? styles.segmentActive : null]}>
                    <Text style={[styles.segmentLabel, authMode === 'sign-up' ? styles.segmentLabelActive : null]}>
                      Create account
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setAuthMode('sign-in')}
                    style={[styles.segment, authMode === 'sign-in' ? styles.segmentActive : null]}>
                    <Text style={[styles.segmentLabel, authMode === 'sign-in' ? styles.segmentLabelActive : null]}>
                      Sign in
                    </Text>
                  </Pressable>
                </View>

                {authMode === 'sign-up' ? (
                  <>
                    <View style={styles.fieldGroup}>
                      <Text style={styles.fieldLabel}>Email</Text>
                      <TextInput
                        autoCapitalize="none"
                        autoCorrect={false}
                        keyboardType="email-address"
                        onChangeText={setEmail}
                        placeholder="you@example.com"
                        placeholderTextColor="rgba(255,255,255,0.56)"
                        style={[styles.darkInput, isCompact ? styles.darkInputCompact : null]}
                        value={email}
                      />
                    </View>
                    <View style={styles.fieldGroup}>
                      <Text style={styles.fieldLabel}>Username</Text>
                      <TextInput
                        autoCapitalize="none"
                        autoCorrect={false}
                        onChangeText={setUsername}
                        onSubmitEditing={() => passwordRef.current?.focus()}
                        placeholder="yourusername"
                        placeholderTextColor="rgba(255,255,255,0.56)"
                        style={[styles.darkInput, isCompact ? styles.darkInputCompact : null]}
                        value={username}
                      />
                    </View>
                  </>
                ) : (
                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>Email or username</Text>
                    <TextInput
                      autoCapitalize="none"
                      autoCorrect={false}
                      onChangeText={setIdentifier}
                      onSubmitEditing={() => passwordRef.current?.focus()}
                      placeholder="dedication@zu-media.co.uk or admin"
                      placeholderTextColor="rgba(255,255,255,0.56)"
                      style={[styles.darkInput, isCompact ? styles.darkInputCompact : null]}
                      value={identifier}
                    />
                  </View>
                )}

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Password</Text>
                  <TextInput
                    autoCapitalize="none"
                    autoCorrect={false}
                    onChangeText={setPassword}
                    onSubmitEditing={() => void handleAuthSubmit()}
                    placeholder="Your password"
                    placeholderTextColor="rgba(255,255,255,0.56)"
                    ref={passwordRef}
                    returnKeyType="go"
                    secureTextEntry
                    style={[styles.darkInput, isCompact ? styles.darkInputCompact : null]}
                    value={password}
                  />
                </View>

                {errorMessage || localMessage ? (
                  <Text style={styles.inlineMessage}>{errorMessage ?? localMessage}</Text>
                ) : null}

                <LightButton
                  label={authMode === 'sign-up' ? 'Create account' : 'Sign in'}
                  loading={isLoading}
                  onPress={() => void handleAuthSubmit()}
                />
              </View>
            </ScrollView>
          ) : null}

          {step === 'preferences' ? (
            <ScrollView
              bounces={false}
              contentContainerStyle={[
                styles.onboardingScroll,
                isCompact ? styles.onboardingScrollCompact : null,
                styles.onboardingScrollWithActions,
              ]}
              showsVerticalScrollIndicator={false}>
            <View style={[styles.sheet, isCompact ? styles.sheetCompact : null, isVeryCompact ? styles.sheetVeryCompact : null]}>
              <Text style={styles.eyebrow}>Set up</Text>
              <Text style={[styles.heroTitle, isCompact ? styles.heroTitleCompact : null]}>Tune StitchSense</Text>
              <Text style={[styles.heroBody, isCompact ? styles.heroBodyCompact : null]}>
                We’ll use these defaults across chat, patterns, and tools from the start.
              </Text>
              <View style={styles.preferencePreview}>
                <Text style={styles.preferencePreviewText}>
                  Current setup: {settings.defaultSkill}, {settings.measurementUnit}, {settings.language.toUpperCase()} terms
                </Text>
              </View>

              <View style={styles.preferenceGroup}>
                <Text style={styles.preferenceLabel}>Skill level</Text>
                <View style={styles.choiceGrid}>
                  {skillOptions.map((option) => (
                    <Pressable
                      key={option.key}
                      onPress={() => setSettings((current) => ({ ...current, defaultSkill: option.key }))}
                      style={[
                        styles.choiceChip,
                        styles.choiceChipGrid,
                        isCompact ? styles.choiceChipCompact : null,
                        settings.defaultSkill === option.key ? styles.choiceChipActive : null,
                      ]}>
                      <Text
                        style={[
                          styles.choiceLabel,
                          isCompact ? styles.choiceLabelCompact : null,
                          settings.defaultSkill === option.key ? styles.choiceLabelActive : null,
                        ]}>
                        {option.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.preferenceGroup}>
                <Text style={styles.preferenceLabel}>Units</Text>
                <View style={styles.choiceGrid}>
                  {unitOptions.map((option) => (
                    <Pressable
                      key={option.key}
                      onPress={() => setSettings((current) => ({ ...current, measurementUnit: option.key }))}
                      style={[
                        styles.choiceChip,
                        styles.choiceChipGrid,
                        isCompact ? styles.choiceChipCompact : null,
                        settings.measurementUnit === option.key ? styles.choiceChipActive : null,
                      ]}>
                      <Text
                        style={[
                          styles.choiceLabel,
                          isCompact ? styles.choiceLabelCompact : null,
                          settings.measurementUnit === option.key ? styles.choiceLabelActive : null,
                        ]}>
                        {option.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.preferenceGroup}>
                <Text style={styles.preferenceLabel}>Language style</Text>
                <View style={styles.choiceGrid}>
                  {languageOptions.map((option) => (
                    <Pressable
                      key={option.key}
                      onPress={() => setSettings((current) => ({ ...current, language: option.key }))}
                      style={[
                        styles.choiceChip,
                        styles.choiceChipGrid,
                        isCompact ? styles.choiceChipCompact : null,
                        settings.language === option.key ? styles.choiceChipActive : null,
                      ]}>
                      <Text
                        style={[
                          styles.choiceLabel,
                          isCompact ? styles.choiceLabelCompact : null,
                          settings.language === option.key ? styles.choiceLabelActive : null,
                        ]}>
                        {option.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {localMessage ? <Text style={styles.inlineMessage}>{localMessage}</Text> : null}

              <View style={[styles.preferenceCta, isCompact ? styles.preferenceCtaCompact : null]}>
                <LightButton
                  label="Save preferences"
                  loading={isSavingPreferences}
                  onPress={() => void handleSavePreferences()}
                />
              </View>
            </View>
            </ScrollView>
          ) : null}

          {step === 'ravelry' ? (
            <ScrollView
              bounces={false}
              contentContainerStyle={[
                styles.onboardingScroll,
                isCompact ? styles.onboardingScrollCompact : null,
                styles.onboardingScrollWithActions,
              ]}
              showsVerticalScrollIndicator={false}>
            <View style={[styles.sheet, isCompact ? styles.sheetCompact : null, isVeryCompact ? styles.sheetVeryCompact : null]}>
              <Text style={styles.eyebrow}>Optional setup</Text>
              <Text style={[styles.heroTitle, isCompact ? styles.heroTitleCompact : null]}>Connect Ravelry</Text>
              <Text style={[styles.heroBody, isCompact ? styles.heroBodyCompact : null]}>
                Bring saved or purchased patterns into StitchSense more easily. You can always do this later from the app.
              </Text>
              <View style={styles.ravelryBenefitList}>
                <Text style={styles.ravelryBenefit}>Import saved patterns into Library.</Text>
                <Text style={styles.ravelryBenefit}>Use Ravelry search from stash ideas.</Text>
                <Text style={styles.ravelryBenefit}>Skip this now and connect later.</Text>
              </View>

              <View style={[styles.statusPanel, isCompact ? styles.statusPanelCompact : null]}>
                <Text style={styles.statusTitle}>
                  {isLoadingRavelry
                    ? 'Checking connection…'
                    : ravelryStatus?.connected
                      ? ravelryStatus.username
                        ? `Connected as ${ravelryStatus.username}`
                        : 'Connected'
                      : 'Not connected yet'}
                </Text>
                <Text style={styles.statusBody}>
                  {ravelryStatus?.connected
                    ? 'You are ready to browse, import, and revisit your Ravelry patterns from mobile.'
                    : isCompact
                      ? 'Connect now if you want your Ravelry library ready straight away.'
                      : 'Connect now if you want your Ravelry library available straight away.'}
                </Text>
              </View>

              {localMessage ? <Text style={styles.inlineMessage}>{localMessage}</Text> : null}

              <View style={styles.ctaColumn}>
                <LightButton
                  label={ravelryStatus?.connected ? 'Refresh connection' : 'Connect Ravelry'}
                  loading={isConnectingRavelry}
                  onPress={() => void (ravelryStatus?.connected ? refreshRavelryStatus() : connectRavelry())}
                />
              </View>
            </View>
            </ScrollView>
          ) : null}

          {step === 'ready' ? (
            <ScrollView
              bounces={false}
              contentContainerStyle={[
                styles.onboardingScroll,
                isCompact ? styles.onboardingScrollCompact : null,
              ]}
              showsVerticalScrollIndicator={false}>
            <View style={[styles.sheet, isCompact ? styles.sheetCompact : null, isVeryCompact ? styles.sheetVeryCompact : null]}>
              <Text style={styles.eyebrow}>You’re ready</Text>
              <Text style={[styles.heroTitle, isCompact ? styles.heroTitleCompact : null]}>Start where it feels most useful</Text>
              <Text style={[styles.heroBody, isCompact ? styles.heroBodyCompact : null]}>
                Upload a pattern, connect Ravelry, or head into your dashboard and explore at your own pace.
              </Text>

              <View style={styles.startCards}>
                <Pressable
                  onPress={() => router.replace('/(tabs)/library')}
                  style={[styles.startCard, isCompact ? styles.startCardCompact : null]}>
                  <Text style={[styles.startCardTitle, isCompact ? styles.startCardTitleCompact : null]}>Library</Text>
                  <Text style={[styles.startCardBody, isCompact ? styles.startCardBodyCompact : null]}>
                    {isCompact
                      ? 'Upload a pattern or pick up one you already synced.'
                      : 'Upload a pattern or pick up one you already synced.'}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => router.replace('/ravelry')}
                  style={[styles.startCard, isCompact ? styles.startCardCompact : null]}>
                  <Text style={[styles.startCardTitle, isCompact ? styles.startCardTitleCompact : null]}>Ravelry</Text>
                  <Text style={[styles.startCardBody, isCompact ? styles.startCardBodyCompact : null]}>
                    {isCompact
                      ? 'Browse, connect, and import patterns.'
                      : 'Browse, connect, and import patterns into the app.'}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => router.replace('/(tabs)/stash')}
                  style={[styles.startCard, isCompact ? styles.startCardCompact : null]}>
                  <Text style={[styles.startCardTitle, isCompact ? styles.startCardTitleCompact : null]}>Stash</Text>
                  <Text style={[styles.startCardBody, isCompact ? styles.startCardBodyCompact : null]}>
                    Record yarn and tools so suggestions use what you already own.
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => router.replace('/(tabs)/chat')}
                  style={[styles.startCard, isCompact ? styles.startCardCompact : null]}>
                  <Text style={[styles.startCardTitle, isCompact ? styles.startCardTitleCompact : null]}>Chat</Text>
                  <Text style={[styles.startCardBody, isCompact ? styles.startCardBodyCompact : null]}>
                    Ask any knitting or crochet question without choosing a pattern first.
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => router.replace('/(tabs)/dashboard')}
                  style={[styles.startCard, isCompact ? styles.startCardCompact : null]}>
                  <Text style={[styles.startCardTitle, isCompact ? styles.startCardTitleCompact : null]}>Dashboard</Text>
                  <Text style={[styles.startCardBody, isCompact ? styles.startCardBodyCompact : null]}>
                    {isCompact
                      ? 'Jump into projects, tools, and your day-to-day flow.'
                      : 'Jump into projects, tools, and your day-to-day making flow.'}
                  </Text>
                </Pressable>
              </View>

              <View style={styles.readySummary}>
                <Text style={styles.readySummaryTitle}>Your first three useful moves</Text>
                <Text style={styles.readySummaryCopy}>1. Add or import one pattern.</Text>
                <Text style={styles.readySummaryCopy}>2. Record one stash item.</Text>
                <Text style={styles.readySummaryCopy}>3. Start one project workspace.</Text>
              </View>

              <LightButton label="Start using StitchSense" onPress={() => void completeOnboarding()} />
            </View>
            </ScrollView>
          ) : null}
        </View>

        {step !== 'auth' && step !== 'ready' ? (
          <View style={styles.bottomBar}>
            {step !== 'welcome' ? (
              <LightButton label="Back" onPress={prevStep} secondary />
            ) : (
              <View style={styles.spacer} />
            )}
            <LightButton
              label={step === 'ravelry' ? 'Continue' : 'Next'}
              onPress={() => (step === 'ravelry' ? setStep('ready') : nextStep())}
            />
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    backgroundColor: '#120f0c',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(7, 7, 8, 0.54)',
  },
  root: {
    flex: 1,
    paddingHorizontal: tokens.spacing.lg,
    paddingBottom: tokens.spacing.lg,
  },
  loadingScreen: {
    flex: 1,
    backgroundColor: '#120f0c',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: tokens.spacing.sm,
  },
  progressBlock: {
    gap: 4,
  },
  progressLabel: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.xs,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: tokens.radius.pill,
    backgroundColor: 'rgba(255,255,255,0.24)',
  },
  dotActive: {
    width: 28,
    backgroundColor: '#ffffff',
  },
  skipButton: {
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
  },
  skipLabel: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  flexGrow: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: 'rgba(9, 10, 12, 0.5)',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    padding: tokens.spacing.md,
    ...shadows.raised,
  },
  sheetCompact: {
    borderRadius: 24,
    padding: tokens.spacing.md,
  },
  sheetVeryCompact: {
    padding: tokens.spacing.sm,
  },
  eyebrow: {
    color: 'rgba(255,255,255,0.76)',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: tokens.spacing.xs,
  },
  heroTitle: {
    color: '#ffffff',
    fontSize: 19,
    lineHeight: 24,
    fontWeight: '800',
    marginBottom: tokens.spacing.xs,
  },
  heroTitleCompact: {
    fontSize: 15,
    lineHeight: 19,
  },
  heroBody: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 14,
    lineHeight: 20,
  },
  heroBodyCompact: {
    fontSize: 11,
    lineHeight: 16,
  },
  kickerCard: {
    marginTop: tokens.spacing.md,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: tokens.radius.xlarge,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    padding: tokens.spacing.sm,
  },
  kickerCardCompact: {
    marginTop: tokens.spacing.sm,
    padding: tokens.spacing.sm,
  },
  kickerEyebrow: {
    color: 'rgba(255,255,255,0.68)',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: tokens.spacing.xs,
  },
  kickerText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  microRoutePanel: {
    marginTop: tokens.spacing.sm,
    borderRadius: tokens.radius.xlarge,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.1)',
    padding: tokens.spacing.md,
    gap: 4,
  },
  microRoutePanelCompact: {
    padding: tokens.spacing.sm,
  },
  microRouteTitle: {
    color: '#ffffff',
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '800',
  },
  microRouteCopy: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 12,
    lineHeight: 17,
  },
  microFeatureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.xs,
    marginTop: tokens.spacing.sm,
  },
  microFeatureGridCompact: {
    marginTop: tokens.spacing.xs,
  },
  microFeaturePill: {
    flexGrow: 1,
    minWidth: 72,
    minHeight: 34,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.sm,
  },
  microFeatureText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
  bottomBar: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
    marginTop: tokens.spacing.xs,
  },
  spacer: {
    flex: 1,
  },
  lightButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: tokens.radius.large,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  lightButtonSecondary: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  lightButtonLabel: {
    color: tokens.color.primary,
    fontSize: 14,
    fontWeight: '800',
  },
  lightButtonLabelSecondary: {
    color: '#ffffff',
  },
  pressed: {
    opacity: 0.94,
    transform: [{ translateY: 1 }],
  },
  disabled: {
    opacity: 0.55,
  },
  authScroll: {
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  authScrollCompact: {
    paddingBottom: tokens.spacing.xs,
  },
  onboardingScroll: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    paddingBottom: tokens.spacing.sm,
  },
  onboardingScrollCompact: {
    paddingBottom: tokens.spacing.md,
  },
  onboardingScrollWithActions: {
    paddingBottom: 72,
  },
  authHeaderRow: {
    flexDirection: 'row',
    gap: tokens.spacing.md,
    alignItems: 'center',
    marginBottom: tokens.spacing.lg,
  },
  logo: {
    width: 68,
    height: 68,
  },
  authHeaderCopy: {
    flex: 1,
  },
  authTrustRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.xs,
    marginBottom: tokens.spacing.md,
  },
  authTrustItem: {
    color: '#ffffff',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: tokens.spacing.sm,
    paddingVertical: 7,
  },
  authTitle: {
    color: '#ffffff',
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '800',
    marginBottom: tokens.spacing.xs,
  },
  authTitleCompact: {
    fontSize: 21,
    lineHeight: 24,
  },
  authSubtitle: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 14,
    lineHeight: 20,
  },
  authSubtitleCompact: {
    fontSize: 13,
    lineHeight: 18,
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: tokens.radius.large,
    padding: 4,
    gap: 4,
    marginBottom: tokens.spacing.lg,
  },
  segment: {
    flex: 1,
    minHeight: 48,
    borderRadius: tokens.radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.sm,
  },
  segmentActive: {
    backgroundColor: '#ffffff',
  },
  segmentLabel: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  segmentLabelActive: {
    color: tokens.color.primary,
  },
  fieldGroup: {
    marginBottom: tokens.spacing.md,
  },
  fieldLabel: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: tokens.spacing.sm,
  },
  darkInput: {
    minHeight: 54,
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    color: '#ffffff',
    paddingHorizontal: tokens.spacing.lg,
    fontSize: 17,
  },
  darkInputCompact: {
    minHeight: 48,
    fontSize: 16,
    paddingHorizontal: tokens.spacing.md,
  },
  inlineMessage: {
    color: '#ffffff',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: tokens.spacing.sm,
  },
  preferenceGroup: {
    marginTop: tokens.spacing.sm,
  },
  preferencePreview: {
    marginTop: tokens.spacing.sm,
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.1)',
    padding: tokens.spacing.sm,
  },
  preferencePreviewText: {
    color: '#ffffff',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },
  preferenceLabel: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: tokens.spacing.xs,
  },
  choiceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.xs,
  },
  choiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.xs,
  },
  choiceChip: {
    minHeight: 38,
    borderRadius: tokens.radius.pill,
    paddingHorizontal: tokens.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  choiceChipGrid: {
    minWidth: 120,
    flexGrow: 1,
  },
  choiceChipCompact: {
    minHeight: 36,
    paddingHorizontal: tokens.spacing.sm,
  },
  choiceChipActive: {
    backgroundColor: '#ffffff',
  },
  choiceLabel: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  choiceLabelCompact: {
    fontSize: 12,
  },
  choiceLabelActive: {
    color: tokens.color.primary,
  },
  preferenceCta: {
    marginTop: tokens.spacing.lg,
  },
  preferenceCtaCompact: {
    marginTop: tokens.spacing.xl2,
  },
  statusPanel: {
    marginTop: tokens.spacing.md,
    marginBottom: tokens.spacing.md,
    borderRadius: tokens.radius.xlarge,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    padding: tokens.spacing.md,
  },
  statusPanelCompact: {
    marginTop: tokens.spacing.sm,
    marginBottom: tokens.spacing.sm,
    padding: tokens.spacing.sm,
  },
  statusTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  statusBody: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 12,
    lineHeight: 17,
  },
  ctaColumn: {
    gap: tokens.spacing.sm,
  },
  ravelryBenefitList: {
    gap: tokens.spacing.xs,
    marginTop: tokens.spacing.sm,
  },
  ravelryBenefit: {
    color: 'rgba(255,255,255,0.86)',
    fontSize: 12,
    lineHeight: 17,
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: tokens.spacing.sm,
    paddingVertical: 7,
  },
  startCards: {
    gap: tokens.spacing.sm,
    marginTop: tokens.spacing.sm,
    marginBottom: tokens.spacing.sm,
  },
  startCard: {
    borderRadius: tokens.radius.xlarge,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    padding: tokens.spacing.md,
  },
  startCardCompact: {
    padding: tokens.spacing.sm,
  },
  startCardTitle: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 4,
  },
  startCardTitleCompact: {
    fontSize: 15,
  },
  startCardBody: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 13,
    lineHeight: 18,
  },
  startCardBodyCompact: {
    fontSize: 11,
    lineHeight: 15,
  },
  readySummary: {
    borderRadius: tokens.radius.xlarge,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    padding: tokens.spacing.md,
    gap: 3,
    marginBottom: tokens.spacing.sm,
  },
  readySummaryTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 3,
  },
  readySummaryCopy: {
    color: 'rgba(255,255,255,0.84)',
    fontSize: 12,
    lineHeight: 17,
  },
});
