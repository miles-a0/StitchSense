import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandButton } from '@/src/components/ui/brand-button';
import { stitchSenseAPI } from '@/src/lib/api';
import { tokens } from '@/src/theme/tokens';

type Step = 'email' | 'code' | 'done';

export default function ForgotPasswordScreen() {
  const params = useLocalSearchParams<{ email?: string }>();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState(typeof params.email === 'string' ? params.email : '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function requestCode() {
    setError(null);
    setMessage(null);
    if (!email.trim().includes('@')) {
      setError('Enter the email address used for your StitchSense account.');
      return;
    }
    setIsLoading(true);
    try {
      const response = await stitchSenseAPI.requestPasswordReset(email.trim());
      setMessage(response.message);
      setStep('code');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not request a reset code.');
    } finally {
      setIsLoading(false);
    }
  }

  async function resetPassword() {
    setError(null);
    setMessage(null);
    if (!/^\d{6}$/.test(code)) {
      setError('Enter the 6-digit code from your email.');
      return;
    }
    if (password.length < 8) {
      setError('Your new password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('The new passwords do not match.');
      return;
    }
    setIsLoading(true);
    try {
      const response = await stitchSenseAPI.confirmPasswordReset({
        email: email.trim(),
        code,
        password,
      });
      setMessage(response.message);
      setStep('done');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not reset your password.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top + 18, 32) }]}
        keyboardShouldPersistTaps="handled">
        <Pressable accessibilityRole="button" onPress={() => router.replace('/sign-in')} style={styles.back}>
          <Text style={styles.backText}>← Back to sign in</Text>
        </Pressable>

        <View style={styles.card}>
          <Text style={styles.eyebrow}>ACCOUNT RECOVERY</Text>
          <Text style={styles.title}>{step === 'done' ? 'Password reset' : 'Forgot your password?'}</Text>
          <Text style={styles.intro}>
            {step === 'email'
              ? 'Enter your email and we’ll send you a one-time code and a link back to this screen.'
              : step === 'code'
                ? `Enter the 6-digit code sent to ${email}.`
                : 'Your password has been changed. You can sign in with it now.'}
          </Text>

          {step === 'email' ? (
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Email address</Text>
              <TextInput
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
                keyboardType="email-address"
                onChangeText={setEmail}
                onSubmitEditing={() => void requestCode()}
                placeholder="you@example.com"
                returnKeyType="send"
                style={styles.input}
                value={email}
              />
            </View>
          ) : null}

          {step === 'code' ? (
            <>
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>One-time code</Text>
                <TextInput
                  autoComplete="one-time-code"
                  keyboardType="number-pad"
                  maxLength={6}
                  onChangeText={(value) => setCode(value.replace(/\D/g, ''))}
                  placeholder="123456"
                  style={[styles.input, styles.codeInput]}
                  value={code}
                />
              </View>
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>New password</Text>
                <TextInput
                  autoCapitalize="none"
                  autoComplete="new-password"
                  onChangeText={setPassword}
                  placeholder="At least 8 characters"
                  secureTextEntry
                  style={styles.input}
                  value={password}
                />
              </View>
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Confirm new password</Text>
                <TextInput
                  autoCapitalize="none"
                  autoComplete="new-password"
                  onChangeText={setConfirmPassword}
                  onSubmitEditing={() => void resetPassword()}
                  placeholder="Repeat your new password"
                  secureTextEntry
                  style={styles.input}
                  value={confirmPassword}
                />
              </View>
            </>
          ) : null}

          {message ? <Text style={styles.message}>{message}</Text> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}

          {step === 'email' ? (
            <BrandButton label="Send reset code" loading={isLoading} onPress={() => void requestCode()} />
          ) : step === 'code' ? (
            <>
              <BrandButton label="Reset password" loading={isLoading} onPress={() => void resetPassword()} />
              <Pressable disabled={isLoading} onPress={() => void requestCode()} style={styles.linkButton}>
                <Text style={styles.linkText}>Send a new code</Text>
              </Pressable>
            </>
          ) : (
            <BrandButton label="Return to sign in" onPress={() => router.replace('/sign-in')} />
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.color.background },
  content: { flexGrow: 1, justifyContent: 'center', padding: 20, paddingBottom: 36 },
  back: { alignSelf: 'flex-start', paddingVertical: 10, marginBottom: 8 },
  backText: { color: tokens.color.primary, fontSize: 16, fontWeight: '800' },
  card: {
    backgroundColor: '#fffdf9',
    borderColor: 'rgba(104, 64, 42, 0.12)',
    borderRadius: 28,
    borderWidth: 1,
    gap: 18,
    padding: 24,
  },
  eyebrow: { color: tokens.color.accent, fontSize: 12, fontWeight: '900', letterSpacing: 1.2 },
  title: { color: tokens.color.text, fontFamily: tokens.font.display, fontSize: 34, lineHeight: 39 },
  intro: { color: tokens.color.muted, fontSize: 16, lineHeight: 24 },
  fieldGroup: { gap: 8 },
  label: { color: tokens.color.text, fontSize: 16, fontWeight: '800' },
  input: {
    backgroundColor: '#ffffff',
    borderColor: 'rgba(104, 64, 42, 0.18)',
    borderRadius: 18,
    borderWidth: 1,
    color: tokens.color.text,
    fontSize: 17,
    minHeight: 58,
    paddingHorizontal: 16,
  },
  codeInput: { fontSize: 24, fontWeight: '800', letterSpacing: 8, textAlign: 'center' },
  message: { color: tokens.color.primary, fontSize: 14, fontWeight: '700', lineHeight: 20 },
  error: { color: '#a63d32', fontSize: 14, fontWeight: '700', lineHeight: 20 },
  linkButton: { alignItems: 'center', paddingVertical: 8 },
  linkText: { color: tokens.color.primary, fontSize: 15, fontWeight: '800' },
});
