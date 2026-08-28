import React from 'react';
import { StyleSheet, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';

import { shadows, tokens } from '@/src/theme/tokens';
import { MotionView } from './motion-view';

type AppCardProps = ViewProps & {
  elevated?: boolean;
  warm?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function AppCard({ elevated = false, warm = false, style, ...props }: AppCardProps) {
  return (
    <MotionView
      {...props}
      style={[
        styles.base,
        warm ? styles.warm : styles.defaultSurface,
        elevated ? styles.elevated : styles.soft,
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: tokens.radius.xlarge,
    borderWidth: 1,
    borderColor: tokens.color.border,
    padding: tokens.spacing.lg,
  },
  defaultSurface: {
    backgroundColor: tokens.color.surface,
  },
  warm: {
    backgroundColor: tokens.color.surfaceWarm,
  },
  soft: shadows.soft,
  elevated: shadows.raised,
});
