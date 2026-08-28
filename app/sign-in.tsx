import { Redirect, router } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  TextStyle,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandButton } from '@/src/components/ui/brand-button';
import { loadOnboardingPending } from '@/src/lib/onboarding-store';
import { useSession } from '@/src/providers/session-provider';
import { tokens } from '@/src/theme/tokens';

export default function SignInScreen() {
  const { accessToken, errorMessage, isLoading, signIn, signUp } = useSession();
  const insets = useSafeAreaInsets();
  const [hasPendingOnboarding, setHasPendingOnboarding] = useState(false);
  const [hasCheckedPending, setHasCheckedPending] = useState(false);
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [authHint, setAuthHint] = useState<string | null>(null);
  const [identifier, setIdentifier] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const emailRef = useRef<TextInput | null>(null);
  const usernameRef = useRef<TextInput | null>(null);
  const passwordRef = useRef<TextInput | null>(null);

  const styles = useMemo(() => createStyles(insets.top), [insets.top]);

  useEffect(() => {
    let mounted = true;

    async function loadPending() {
      const pending = await loadOnboardingPending();
      if (!mounted) return;
      setHasPendingOnboarding(pending);
      setHasCheckedPending(true);
    }

    void loadPending();

    return () => {
      mounted = false;
    };
  }, [accessToken, mode]);

  if (accessToken && hasCheckedPending) {
    return <Redirect href={hasPendingOnboarding ? '/onboarding' : '/(tabs)/dashboard'} />;
  }

  const handleSubmit = () =>
    void (mode === 'sign-in'
      ? signIn(identifier, password)
      : signUp({ email, username, password, displayName: username }));

  const handleForgotPassword = () =>
    router.push({
      pathname: '/forgot-password',
      params: identifier.includes('@') ? { email: identifier.trim() } : undefined,
    });

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.screen}>
      <ImageBackground
        source={require('@/assets/onboarding/activation.webp')}
        resizeMode="cover"
        style={styles.background}>
        <View style={styles.overlay} />
        <ScrollView
          bounces={false}
          contentContainerStyle={styles.scrollContent}
          contentInsetAdjustmentBehavior="always"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.card}>
            <View style={styles.headerCopy}>
              <Text adjustsFontSizeToFit numberOfLines={1} minimumFontScale={0.82} style={styles.title}>
                StitchSense Pro
              </Text>
              <Text style={styles.subtitle}>AI Knitting & Crochet Assistant</Text>
            </View>

            <View style={styles.segmented}>
              <Pressable
                onPress={() => setMode('sign-in')}
                style={[styles.segment, mode === 'sign-in' ? styles.segmentActive : null]}>
                <Text style={[styles.segmentLabel, mode === 'sign-in' ? styles.segmentLabelActive : null]}>
                  Sign in
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setMode('sign-up')}
                style={[styles.segment, mode === 'sign-up' ? styles.segmentActive : null]}>
                <Text style={[styles.segmentLabel, mode === 'sign-up' ? styles.segmentLabelActive : null]}>
                  New Account
                </Text>
              </Pressable>
            </View>

            {mode === 'sign-in' ? (
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Email or username</Text>
                <TextInput
                    autoCapitalize="none"
                    autoCorrect={false}
                    onChangeText={setIdentifier}
                    onFocus={() => setAuthHint(null)}
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  placeholder="Email or username"
                  placeholderTextColor="rgba(255,255,255,0.38)"
                  returnKeyType="next"
                  style={styles.input}
                  value={identifier}
                />
              </View>
            ) : (
              <>
                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Email</Text>
                  <TextInput
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    onChangeText={setEmail}
                    onFocus={() => setAuthHint(null)}
                    onSubmitEditing={() => usernameRef.current?.focus()}
                    placeholder="you@example.com"
                    placeholderTextColor="rgba(255,255,255,0.38)"
                    ref={emailRef}
                    returnKeyType="next"
                    style={styles.input}
                    value={email}
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Username</Text>
                  <TextInput
                    autoCapitalize="none"
                    autoCorrect={false}
                    onChangeText={setUsername}
                    onFocus={() => setAuthHint(null)}
                    onSubmitEditing={() => passwordRef.current?.focus()}
                    placeholder="yourusername"
                    placeholderTextColor="rgba(255,255,255,0.38)"
                    ref={usernameRef}
                    returnKeyType="next"
                    style={styles.input}
                    value={username}
                  />
                </View>
              </>
            )}

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={setPassword}
                onFocus={() => setAuthHint(null)}
                onSubmitEditing={handleSubmit}
                placeholder="Your password"
                placeholderTextColor="rgba(255,255,255,0.38)"
                ref={passwordRef}
                returnKeyType="go"
                secureTextEntry
                style={styles.input}
                value={password}
              />
            </View>

            {mode === 'sign-in' ? (
              <Pressable
                accessibilityRole="button"
                hitSlop={10}
                onPress={handleForgotPassword}
                style={styles.recoveryLinkWrap}>
                <Text style={styles.recoveryLink}>Forgot password?</Text>
              </Pressable>
            ) : null}

            {authHint ? <Text style={styles.hint}>{authHint}</Text> : null}
            {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

            <BrandButton
              label={mode === 'sign-in' ? 'Sign in' : 'New Account'}
              variant="ghost"
              loading={isLoading}
              onPress={handleSubmit}
              style={styles.primaryButton}
            />
          </View>
        </ScrollView>
      </ImageBackground>
    </KeyboardAvoidingView>
  );
}

function createStyles(topInset: number) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: '#0d0b09',
    },
    background: {
      flex: 1,
    },
    overlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(9, 7, 6, 0.56)',
    },
    scrollContent: {
      flexGrow: 1,
      paddingHorizontal: 22,
      paddingVertical: 18,
      justifyContent: 'center',
    },
    card: {
      marginTop: Math.max(topInset, 10),
      backgroundColor: 'rgba(18, 12, 10, 0.66)',
      borderRadius: 36,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.14)',
      paddingHorizontal: 18,
      paddingTop: 24,
      paddingBottom: 20,
      gap: 18,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 20 },
      shadowOpacity: 0.28,
      shadowRadius: 28,
      elevation: 12,
    },
    headerCopy: {
      alignItems: 'flex-start',
      gap: 6,
    },
    subtitle: {
      color: 'rgba(255,255,255,0.94)',
      fontSize: 17,
      fontWeight: '700',
      textAlign: 'left',
    },
    title: {
      color: '#ffffff',
      fontSize: 34,
      lineHeight: 38,
      fontWeight: '900',
      textAlign: 'left',
      width: '100%',
    },
    segmented: {
      flexDirection: 'row',
      backgroundColor: 'rgba(255,255,255,0.06)',
      borderRadius: 28,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.14)',
      padding: 6,
      gap: 6,
    },
    segment: {
      flex: 1,
      minHeight: 56,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
    },
    segmentActive: {
      backgroundColor: '#ffffff',
    },
    segmentLabel: {
      color: '#ffffff',
      fontSize: 17,
      fontWeight: '900',
      textAlign: 'center',
    } satisfies TextStyle,
    segmentLabelActive: {
      color: tokens.color.primary,
    },
    fieldGroup: {
      gap: 10,
    },
    label: {
      color: '#ffffff',
      fontSize: 17,
      fontWeight: '800',
    },
    input: {
      minHeight: 60,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.14)',
      backgroundColor: 'rgba(255,255,255,0.04)',
      color: '#ffffff',
      paddingHorizontal: 18,
      fontSize: 18,
    },
    hint: {
      color: 'rgba(255,255,255,0.72)',
      fontSize: 14,
      lineHeight: 20,
    },
    error: {
      color: '#ffb3ad',
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '700',
    },
    recoveryLinkWrap: {
      alignSelf: 'flex-start',
      marginTop: -2,
    },
    recoveryLink: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '800',
    },
    primaryButton: {
      marginTop: 4,
      backgroundColor: '#ffffff',
      borderColor: 'transparent',
      minHeight: 62,
      borderRadius: 24,
    },
  });
}
