import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { tokens } from '@/src/theme/tokens';

import { AppCard } from './app-card';

type AppSectionProps = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  headerAccessory?: React.ReactNode;
  warm?: boolean;
};

export function AppSection({
  title,
  subtitle,
  children,
  style,
  headerAccessory,
  warm = false,
}: AppSectionProps) {
  return (
    <AppCard elevated style={[styles.card, style]} warm={warm}>
      <View style={styles.header}>
        <View style={styles.copyWrap}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {headerAccessory ? <View style={styles.accessory}>{headerAccessory}</View> : null}
      </View>
      <View style={styles.body}>{children}</View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: tokens.spacing.md,
    padding: tokens.spacing.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: tokens.spacing.md,
  },
  copyWrap: {
    flex: 1,
    gap: tokens.spacing.xs,
  },
  title: {
    color: tokens.color.text,
    fontSize: tokens.type.title,
    lineHeight: 28,
    fontWeight: '800',
  },
  subtitle: {
    color: tokens.color.muted,
    fontSize: tokens.type.body,
    lineHeight: 22,
  },
  accessory: {
    flexShrink: 0,
  },
  body: {
    gap: tokens.spacing.md,
  },
});
