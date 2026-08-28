import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { shadows, tokens } from '@/src/theme/tokens';

type InlineBackButtonProps = {
  label?: string;
  onPress: () => void;
};

export function InlineBackButton({
  label = 'Back',
  onPress,
}: InlineBackButtonProps) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.button, pressed ? styles.pressed : null]}>
      <MaterialCommunityIcons color={tokens.color.text} name="arrow-left" size={24} />
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignSelf: 'flex-start',
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.lg,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: 'rgba(255,255,255,0.86)',
    ...shadows.soft,
  },
  label: {
    color: tokens.color.text,
    fontSize: 16,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.92,
    transform: [{ translateY: 1 }],
  },
});
