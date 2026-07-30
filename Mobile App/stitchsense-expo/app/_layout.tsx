import { router, Stack } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LibraryProvider } from '@/src/providers/library-provider';
import { PromoPopup } from '@/src/components/promos/promo-popup';
import { PreferencesProvider } from '@/src/providers/preferences-provider';
import { ProjectsProvider } from '@/src/providers/projects-provider';
import { SessionProvider, useSession } from '@/src/providers/session-provider';
import { StashProvider } from '@/src/providers/stash-provider';
import { tokens } from '@/src/theme/tokens';

const editorialHeaderOptions = {
  headerTitle: '',
  headerStyle: { backgroundColor: tokens.color.background },
  headerTintColor: tokens.color.primary,
  headerShadowVisible: false,
  headerTitleStyle: {
    color: tokens.color.primary,
    fontFamily: tokens.font.display,
    fontSize: 22,
    fontWeight: '400' as const,
  },
  headerBackTitleStyle: {
    fontFamily: tokens.font.body,
  },
};

function HeaderBackButton({ fallback = '/(tabs)/dashboard' }: { fallback?: string }) {
  return (
    <Pressable
      accessibilityLabel="Go back"
      accessibilityRole="button"
      onPress={() => {
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace(fallback as never);
        }
      }}
      style={styles.headerBackButton}>
      <MaterialCommunityIcons color={tokens.color.primary} name="arrow-left" size={22} />
      <Text style={styles.headerBackLabel}>Back</Text>
    </Pressable>
  );
}

function AppNavigator() {
  const { isReady } = useSession();

  if (!isReady) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={tokens.color.primary} />
      </View>
    );
  }

  return (
    <LibraryProvider>
      <PreferencesProvider>
        <ProjectsProvider>
          <StashProvider>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: tokens.color.background },
              }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="onboarding" />
              <Stack.Screen name="sign-in" />
              <Stack.Screen name="forgot-password" />
              <Stack.Screen name="(tabs)" />
              <Stack.Screen
                name="pattern/[id]"
                options={{
                  headerShown: true,
                  title: '',
                  headerBackTitle: 'Back',
                  ...editorialHeaderOptions,
                }}
              />
              <Stack.Screen
                name="pattern-viewer"
                options={{
                  headerShown: true,
                  title: '',
                  headerBackTitle: 'Back',
                  ...editorialHeaderOptions,
                }}
              />
              <Stack.Screen
                name="project/[id]"
                options={{
                  headerShown: true,
                  title: '',
                  headerBackTitle: 'Back',
                  ...editorialHeaderOptions,
                }}
              />
              <Stack.Screen
                name="project/new"
                options={{
                  headerShown: true,
                  title: '',
                  headerBackTitle: 'Back',
                  ...editorialHeaderOptions,
                }}
              />
              <Stack.Screen
                name="pattern-chat"
                options={{
                  headerShown: true,
                  title: '',
                  headerBackVisible: false,
                  headerLeft: () => <HeaderBackButton fallback="/(tabs)/library" />,
                  ...editorialHeaderOptions,
                }}
              />
              <Stack.Screen
                name="pattern-upload"
                options={{
                  headerShown: true,
                  title: '',
                  headerBackVisible: false,
                  headerLeft: () => <HeaderBackButton fallback="/(tabs)/library" />,
                  ...editorialHeaderOptions,
                }}
              />
              <Stack.Screen
                name="pattern-rewrite"
                options={{
                  headerShown: true,
                  title: '',
                  ...editorialHeaderOptions,
                }}
              />
              <Stack.Screen
                name="gauge-calculator"
                options={{
                  headerShown: true,
                  title: '',
                  ...editorialHeaderOptions,
                }}
              />
              <Stack.Screen
                name="quick-counter"
                options={{
                  headerShown: true,
                  title: '',
                  ...editorialHeaderOptions,
                }}
              />
              <Stack.Screen
                name="stitch-dictionary"
                options={{
                  headerShown: true,
                  title: '',
                  ...editorialHeaderOptions,
                }}
              />
              <Stack.Screen
                name="ravelry"
                options={{
                  headerShown: true,
                  title: '',
                  ...editorialHeaderOptions,
                }}
              />
              <Stack.Screen
                name="paywall"
                options={{
                  headerShown: true,
                  title: '',
                  ...editorialHeaderOptions,
                }}
              />
            </Stack>
            <PromoPopup />
            <StatusBar style="dark" />
          </StashProvider>
        </ProjectsProvider>
      </PreferencesProvider>
    </LibraryProvider>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <AppNavigator />
      </SessionProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.color.background,
  },
  headerBackButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingRight: tokens.spacing.md,
  },
  headerBackLabel: {
    color: tokens.color.primary,
    fontFamily: tokens.font.body,
    fontSize: 16,
    fontWeight: '800',
  },
});
