import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  smartAssistantCategories,
  smartAssistants,
  type SmartAssistant,
} from '@/src/lib/smart-assistants';
import { shadows, tokens } from '@/src/theme/tokens';
import { InlineBackButton } from '@/src/components/ui/inline-back-button';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

function AssistantTile({
  assistant,
  onPress,
}: {
  assistant: SmartAssistant;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.assistantTile, pressed ? styles.pressed : null]}>
      <View style={styles.assistantIcon}>
        <MaterialCommunityIcons
          color={tokens.color.primary}
          name={assistant.icon as IconName}
          size={21}
        />
      </View>
      <View style={styles.assistantBody}>
        <Text numberOfLines={1} style={styles.assistantKicker}>
          {assistant.kicker}
        </Text>
        <Text numberOfLines={2} style={styles.assistantTitle}>
          {assistant.title}
        </Text>
        <Text numberOfLines={3} style={styles.assistantCopy}>
          {assistant.description}
        </Text>
      </View>
      <MaterialCommunityIcons color={tokens.color.primary} name="chevron-right" size={22} />
    </Pressable>
  );
}

export default function ToolsScreen() {
  const router = useRouter();

  function openSmartAssistant(assistant: SmartAssistant) {
    const { destination } = assistant;
    if (destination.type === 'gauge') {
      router.push('/gauge-calculator');
      return;
    }
    if (destination.type === 'dictionary') {
      router.push(
        destination.query
          ? { pathname: '/stitch-dictionary', params: { query: destination.query } }
          : '/stitch-dictionary',
      );
      return;
    }
    if (destination.type === 'vision') {
      router.push('/(tabs)/camera');
      return;
    }
    router.push({
      pathname: '/(tabs)/chat',
      params: {
        title: destination.title,
        prompt: destination.starter,
        context: destination.context,
        toolMode: destination.toolMode,
      },
    });
  }

  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.screen}>
      <InlineBackButton
        onPress={() =>
          router.canGoBack() ? router.back() : router.replace('/(tabs)/dashboard')
        }
      />
      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <MaterialCommunityIcons color="#fffdf8" name="hammer-wrench" size={24} />
        </View>
        <Text style={styles.eyebrow}>Smart Assistants</Text>
        <Text style={styles.title}>Focused help when you need it</Text>
        <Text style={styles.copy}>
          Choose the kind of making question you have, then StitchSense opens the right helper with a useful starting prompt.
        </Text>
      </View>

      <View style={styles.quickRow}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/(tabs)/chat')}
          style={({ pressed }) => [styles.quickButton, pressed ? styles.pressed : null]}>
          <MaterialCommunityIcons color={tokens.color.primary} name="message-text-outline" size={19} />
          <Text style={styles.quickButtonText}>General chat</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/(tabs)/camera')}
          style={({ pressed }) => [styles.quickButton, pressed ? styles.pressed : null]}>
          <MaterialCommunityIcons color={tokens.color.primary} name="camera-outline" size={19} />
          <Text style={styles.quickButtonText}>Photo help</Text>
        </Pressable>
      </View>

      {smartAssistantCategories.map((category) => {
        const assistants = smartAssistants.filter((assistant) => assistant.category === category);
        return (
          <View key={category} style={styles.section}>
            <Text style={styles.sectionTitle}>{category}</Text>
            <View style={styles.assistantList}>
              {assistants.map((assistant) => (
                <AssistantTile
                  key={assistant.id}
                  assistant={assistant}
                  onPress={() => openSmartAssistant(assistant)}
                />
              ))}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const displayFont = tokens.font.display;
const bodyFont = tokens.font.body;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: tokens.color.background,
  },
  content: {
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.lg,
    paddingBottom: 118,
    gap: tokens.spacing.xl,
  },
  hero: {
    backgroundColor: tokens.color.surfaceWarm,
    borderColor: tokens.color.border,
    borderRadius: 18,
    borderWidth: 1,
    gap: tokens.spacing.sm,
    overflow: 'hidden',
    padding: tokens.spacing.xl,
    ...shadows.soft,
  },
  heroIcon: {
    alignItems: 'center',
    backgroundColor: tokens.color.primary,
    borderRadius: 999,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  eyebrow: {
    color: tokens.color.accent,
    fontFamily: bodyFont,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.1,
    lineHeight: 16,
    textTransform: 'uppercase',
  },
  title: {
    color: tokens.color.primary,
    fontFamily: displayFont,
    fontSize: 34,
    letterSpacing: 0,
    lineHeight: 39,
  },
  copy: {
    color: tokens.color.muted,
    fontFamily: bodyFont,
    fontSize: 15,
    lineHeight: 23,
  },
  quickRow: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  quickButton: {
    alignItems: 'center',
    backgroundColor: tokens.color.surface,
    borderColor: tokens.color.border,
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: tokens.spacing.sm,
    justifyContent: 'center',
    minHeight: 54,
    paddingHorizontal: tokens.spacing.sm,
    ...shadows.soft,
  },
  quickButtonText: {
    color: tokens.color.primary,
    fontFamily: bodyFont,
    fontSize: 13,
    fontWeight: '900',
  },
  section: {
    gap: tokens.spacing.sm,
  },
  sectionTitle: {
    color: tokens.color.primary,
    fontFamily: displayFont,
    fontSize: 24,
    lineHeight: 29,
  },
  assistantList: {
    gap: tokens.spacing.sm,
  },
  assistantTile: {
    alignItems: 'center',
    backgroundColor: tokens.color.surface,
    borderColor: 'rgba(20, 63, 54, 0.12)',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: tokens.spacing.md,
    minHeight: 112,
    padding: tokens.spacing.md,
    ...shadows.soft,
  },
  assistantIcon: {
    alignItems: 'center',
    backgroundColor: tokens.color.surfaceWarm,
    borderColor: tokens.color.border,
    borderRadius: 999,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  assistantBody: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  assistantKicker: {
    color: tokens.color.accent,
    fontFamily: bodyFont,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.7,
    lineHeight: 15,
    textTransform: 'uppercase',
  },
  assistantTitle: {
    color: tokens.color.primary,
    fontFamily: displayFont,
    fontSize: 20,
    lineHeight: 24,
  },
  assistantCopy: {
    color: tokens.color.muted,
    fontFamily: bodyFont,
    fontSize: 13,
    lineHeight: 18,
  },
  pressed: {
    opacity: 0.94,
    transform: [{ translateY: 1 }],
  },
});
