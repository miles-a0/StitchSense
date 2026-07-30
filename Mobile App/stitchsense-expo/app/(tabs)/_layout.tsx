import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import React from 'react';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSession } from '@/src/providers/session-provider';
import { tokens } from '@/src/theme/tokens';

type TabIconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

function tabIcon(name: TabIconName) {
  return function TabBarIcon({ color, size }: { color: string; size: number }) {
    return <MaterialCommunityIcons color={color} name={name} size={size} />;
  };
}

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
        tabBarActiveTintColor: tokens.color.primary,
        tabBarInactiveTintColor: 'rgba(20, 63, 54, 0.52)',
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabBarLabel,
      }}>
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Home',
          tabBarIcon: tabIcon('home-outline'),
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: 'Library',
          tabBarIcon: tabIcon('library-outline'),
        }}
      />
      <Tabs.Screen
        name="workspace"
        options={{
          title: 'Projects',
          tabBarIcon: tabIcon('folder-multiple-outline'),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          tabBarIcon: tabIcon('message-text-outline'),
        }}
      />
      <Tabs.Screen
        name="stash"
        options={{
          title: 'Stash',
          tabBarIcon: tabIcon('basket-outline'),
        }}
      />
      <Tabs.Screen
        name="camera"
        options={{
          href: null,
          title: 'Camera',
          tabBarIcon: tabIcon('camera-outline'),
        }}
      />
      <Tabs.Screen
        name="tools"
        options={{
          href: null,
          title: 'Tools',
          tabBarIcon: tabIcon('hammer-wrench'),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          href: null,
          title: 'Account',
          tabBarIcon: tabIcon('account-circle-outline'),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: 'rgba(255, 253, 250, 0.97)',
    borderTopColor: 'rgba(20, 63, 54, 0.1)',
    borderTopWidth: 1,
    height: 92,
    paddingTop: 10,
    paddingBottom: 18,
    shadowColor: '#1b2b24',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
  },
  tabBarLabel: {
    fontSize: 11,
    fontWeight: '800',
  },
});
