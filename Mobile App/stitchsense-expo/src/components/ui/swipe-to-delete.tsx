import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';

import { tokens } from '@/src/theme/tokens';

import { MotionView } from './motion-view';

const DELETE_WIDTH = 96;

type SwipeToDeleteProps = {
  children: React.ReactNode;
  label?: string;
  onDelete: () => void;
  entranceDelay?: number;
};

export function SwipeToDelete({
  children,
  label = 'Delete',
  onDelete,
  entranceDelay = 0,
}: SwipeToDeleteProps) {
  const [contentWidth, setContentWidth] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  function measure(event: LayoutChangeEvent) {
    const nextWidth = Math.round(event.nativeEvent.layout.width);
    if (nextWidth > 0 && nextWidth !== contentWidth) setContentWidth(nextWidth);
  }

  return (
    <MotionView delay={entranceDelay} distance={22} style={styles.shell} onLayout={measure}>
      <ScrollView
        ref={scrollRef}
        horizontal
        bounces={false}
        decelerationRate="fast"
        directionalLockEnabled
        overScrollMode="never"
        showsHorizontalScrollIndicator={false}
        snapToOffsets={contentWidth ? [0, DELETE_WIDTH] : undefined}
        snapToStart
        style={styles.scroll}
        contentContainerStyle={styles.content}>
        <View style={contentWidth ? { width: contentWidth } : styles.unmeasuredContent}>
          {children}
        </View>
        <Pressable
          accessibilityHint="Deletes this item after confirmation"
          accessibilityLabel={label}
          accessibilityRole="button"
          onPress={() => {
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            onDelete();
            scrollRef.current?.scrollTo({ animated: true, x: 0 });
          }}
          style={({ pressed }) => [styles.deleteButton, pressed ? styles.deletePressed : null]}>
          <MaterialCommunityIcons color="#fffdf8" name="trash-can-outline" size={24} />
          <Text style={styles.deleteText}>{label}</Text>
        </Pressable>
      </ScrollView>
    </MotionView>
  );
}

const styles = StyleSheet.create({
  shell: {
    width: '100%',
    borderRadius: 18,
    overflow: 'hidden',
  },
  scroll: {
    width: '100%',
    borderRadius: 18,
  },
  content: {
    alignItems: 'stretch',
  },
  unmeasuredContent: {
    width: '100%',
  },
  deleteButton: {
    width: DELETE_WIDTH,
    alignSelf: 'stretch',
    backgroundColor: tokens.color.danger,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  deletePressed: {
    backgroundColor: '#96382f',
  },
  deleteText: {
    color: '#fffdf8',
    fontSize: 12,
    fontWeight: '900',
  },
});
