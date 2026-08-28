import React from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type TextStyle,
  ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';

import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { shadows, tokens } from '@/src/theme/tokens';

type BrandButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
};

export function BrandButton({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  style,
  labelStyle,
}: BrandButtonProps) {
  const reduceMotion = useReducedMotion();
  const pressScale = React.useRef(new Animated.Value(1)).current;

  function animateScale(toValue: number) {
    if (reduceMotion) return;
    Animated.timing(pressScale, {
      duration: toValue < 1 ? 90 : 150,
      easing: Easing.out(Easing.quad),
      toValue,
      useNativeDriver: true,
    }).start();
  }

  return (
    <Animated.View style={[style, { transform: [{ scale: pressScale }] }]}>
      <Pressable
        accessibilityRole="button"
        disabled={disabled || loading}
        onPress={onPress}
        onPressIn={() => {
          animateScale(0.955);
          void Haptics.selectionAsync();
        }}
        onPressOut={() => animateScale(1)}
        style={({ pressed }) => [
          styles.base,
          variant === 'primary' && styles.primary,
          variant === 'secondary' && styles.secondary,
          variant === 'ghost' && styles.ghost,
          pressed && !disabled && !loading ? styles.pressed : null,
          disabled ? styles.disabled : null,
        ]}>
        {loading ? (
          <ActivityIndicator color={variant === 'ghost' ? tokens.color.primary : '#fff'} />
        ) : (
          <Text
            style={[
              styles.label,
              variant === 'ghost' ? styles.ghostLabel : null,
              labelStyle,
            ]}>
            {label}
          </Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 54,
    borderRadius: tokens.radius.large,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.xl,
  },
  primary: {
    backgroundColor: tokens.color.primary,
    ...shadows.soft,
  },
  secondary: {
    backgroundColor: tokens.color.accent,
    ...shadows.soft,
  },
  ghost: {
    backgroundColor: tokens.color.surfaceWarm,
    borderWidth: 1,
    borderColor: tokens.color.border,
  },
  pressed: {
    opacity: 0.95,
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  ghostLabel: {
    color: tokens.color.primary,
  },
});
