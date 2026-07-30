import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { tokens } from '@/src/theme/tokens';

import { BrandButton } from './brand-button';
import { AppCard } from './app-card';

type EmptyStateProps = {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  title: string;
  copy: string;
  actionLabel?: string;
  onActionPress?: () => void;
};

export function EmptyState({
  icon,
  title,
  copy,
  actionLabel,
  onActionPress,
}: EmptyStateProps) {
  return (
    <AppCard warm elevated style={styles.card}>
      <View style={styles.iconWrap}>
        <MaterialCommunityIcons color={tokens.color.primary} name={icon} size={28} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.copy}>{copy}</Text>
      {actionLabel && onActionPress ? (
        <BrandButton label={actionLabel} onPress={onActionPress} style={styles.action} />
      ) : null}
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'flex-start',
    gap: tokens.spacing.md,
    padding: tokens.spacing.xl,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: tokens.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f3e8dc',
  },
  title: {
    color: tokens.color.text,
    fontSize: tokens.type.title,
    lineHeight: 28,
    fontWeight: '800',
  },
  copy: {
    color: tokens.color.muted,
    fontSize: tokens.type.body,
    lineHeight: 23,
  },
  action: {
    width: '100%',
    marginTop: tokens.spacing.xs,
  },
});
