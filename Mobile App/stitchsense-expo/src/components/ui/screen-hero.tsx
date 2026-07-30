import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { tokens } from '@/src/theme/tokens';

import { AppCard } from './app-card';

type ScreenHeroProps = {
  eyebrow: string;
  title: string;
  copy: string;
  icon?: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  iconAccessibilityLabel?: string;
  onIconPress?: () => void;
  children?: React.ReactNode;
};

export function ScreenHero({
  eyebrow,
  title,
  copy,
  icon = 'book-multiple-outline',
  iconAccessibilityLabel,
  onIconPress,
  children,
}: ScreenHeroProps) {
  const { width } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const iconFloat = useRef(new Animated.Value(0)).current;
  const compact = width < 430;
  const extraCompact = width < 390;
  const ultraCompact = width < 360;
  const styles = useMemo(
    () => createStyles(compact, extraCompact, ultraCompact),
    [compact, extraCompact, ultraCompact],
  );

  useEffect(() => {
    if (reduceMotion) {
      iconFloat.setValue(0);
      return;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(iconFloat, {
          duration: 1900,
          easing: Easing.inOut(Easing.sin),
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(iconFloat, {
          duration: 1900,
          easing: Easing.inOut(Easing.sin),
          toValue: 0,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [iconFloat, reduceMotion]);

  return (
    <AppCard elevated warm style={styles.hero}>
      <View style={styles.header}>
        <View style={styles.copyWrap}>
          <Text style={styles.eyebrow}>{eyebrow}</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.copy}>{copy}</Text>
        </View>
        <Animated.View
          style={{
            transform: [{
              translateY: iconFloat.interpolate({
                inputRange: [0, 1],
                outputRange: [0, -4],
              }),
            }],
          }}>
          <Pressable
            accessibilityLabel={iconAccessibilityLabel}
            accessibilityRole={onIconPress ? 'button' : undefined}
            disabled={!onIconPress}
            onPress={onIconPress}
            style={({ pressed }) => [styles.iconWrap, pressed && onIconPress ? styles.iconPressed : null]}>
            <MaterialCommunityIcons color="#fffdf8" name={icon} size={24} />
          </Pressable>
        </Animated.View>
      </View>
      {children ? <View style={styles.childPanel}>{children}</View> : null}
    </AppCard>
  );
}

function createStyles(compact: boolean, extraCompact: boolean, ultraCompact: boolean) {
  return StyleSheet.create({
    hero: {
      overflow: 'hidden',
      gap: tokens.spacing.lg,
      borderColor: 'rgba(20, 63, 54, 0.11)',
      borderRadius: 26,
      backgroundColor: 'rgba(255, 253, 250, 0.7)',
      paddingTop: ultraCompact ? tokens.spacing.lg : tokens.spacing.xl2,
      paddingBottom: ultraCompact ? tokens.spacing.lg : tokens.spacing.xl2,
      paddingHorizontal: ultraCompact
        ? tokens.spacing.md
        : extraCompact
          ? tokens.spacing.lg
          : tokens.spacing.xl,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: tokens.spacing.md,
    },
    copyWrap: {
      flex: 1,
      gap: extraCompact ? tokens.spacing.xs : tokens.spacing.sm,
      paddingRight: compact ? 0 : tokens.spacing.md,
    },
    eyebrow: {
      color: tokens.color.accent,
      fontFamily: tokens.font.body,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1.5,
      textTransform: 'uppercase',
    },
    title: {
      color: tokens.color.primary,
      fontFamily: tokens.font.display,
      fontSize: ultraCompact ? 23 : extraCompact ? 25 : compact ? 26 : 28,
      lineHeight: ultraCompact ? 29 : extraCompact ? 31 : compact ? 32 : 34,
      maxWidth: compact ? '100%' : 520,
    },
    copy: {
      color: '#183b35',
      fontFamily: tokens.font.body,
      fontSize: ultraCompact ? 13 : 14,
      lineHeight: ultraCompact ? 20 : 22,
      maxWidth: compact ? '100%' : 520,
    },
    iconWrap: {
      width: ultraCompact ? 42 : extraCompact ? 46 : compact ? 50 : 54,
      height: ultraCompact ? 42 : extraCompact ? 46 : compact ? 50 : 54,
      borderRadius: tokens.radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: tokens.color.primary,
      borderWidth: 1,
      borderColor: 'rgba(255, 253, 250, 0.72)',
      flexShrink: 0,
    },
    iconPressed: {
      opacity: 0.88,
      transform: [{ translateY: 1 }],
    },
    childPanel: {
      backgroundColor: 'rgba(255,255,255,0.74)',
      borderRadius: tokens.radius.large,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.72)',
      paddingHorizontal: tokens.spacing.md,
      paddingVertical: tokens.spacing.sm,
    },
  });
}
