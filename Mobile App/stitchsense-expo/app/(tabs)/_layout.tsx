import { Redirect, Tabs } from 'expo-router';
import React from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSession } from '@/src/providers/session-provider';
import { tokens } from '@/src/theme/tokens';

export default function TabLayout() {
  const { accessToken } = useSession();
  const insets = useSafeAreaInsets();

  if (!accessToken) {
    return <Redirect href="/sign-in" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: {
          backgroundColor: tokens.color.background,
          paddingTop: insets.top + 12,
        },
      }}
      tabBar={() => null}>
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Home',
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: 'Library',
        }}
      />
      <Tabs.Screen
        name="workspace"
        options={{
          title: 'Projects',
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
        }}
      />
      <Tabs.Screen
        name="stash"
        options={{
          title: 'Stash',
        }}
      />
      <Tabs.Screen
        name="camera"
        options={{
          href: null,
          title: 'Camera',
        }}
      />
      <Tabs.Screen
        name="tools"
        options={{
          href: null,
          title: 'Tools',
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          href: null,
          title: 'Account',
        }}
      />
    </Tabs>
  );
}
