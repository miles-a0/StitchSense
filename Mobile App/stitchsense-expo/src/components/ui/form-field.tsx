import React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { tokens } from '@/src/theme/tokens';

type FormFieldProps = {
  label: string;
  hint?: string;
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
};

export function FormField({ label, hint, children, style }: FormFieldProps) {
  return (
    <View style={[styles.field, style]}>
      <View style={styles.copyWrap}>
        <Text style={styles.label}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: tokens.spacing.sm,
  },
  copyWrap: {
    gap: tokens.spacing.xxs,
  },
  label: {
    color: tokens.color.text,
    fontSize: tokens.type.label,
    lineHeight: 18,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  hint: {
    color: tokens.color.muted,
    fontSize: 13,
    lineHeight: 18,
  },
});
