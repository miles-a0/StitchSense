import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { tokens } from '@/src/theme/tokens';

type CounterMode = 'row' | 'stitch';
type VoiceCommand = 'stitch' | 'row' | 'remove stitch' | 'remove row' | 'reset';

const MAX_VISIBLE_MARKS = 160;

function modeLabel(mode: CounterMode) {
  return mode === 'row' ? 'Row' : 'Stitch';
}

function pluralLabel(mode: CounterMode, count: number) {
  if (mode === 'row') return count === 1 ? 'row' : 'rows';
  return count === 1 ? 'stitch' : 'stitches';
}

function clampCount(value: number) {
  return Math.max(0, Math.min(9999, value));
}

function CounterMarks({ count, mode }: { count: number; mode: CounterMode }) {
  const visibleCount = Math.min(count, MAX_VISIBLE_MARKS);
  const marks = useMemo(() => Array.from({ length: visibleCount }, (_, index) => index + 1), [visibleCount]);

  return (
    <View style={styles.markPanel}>
      {count === 0 ? (
        <Text style={styles.emptyMarks}>No {pluralLabel(mode, 0)} counted yet.</Text>
      ) : (
        <View style={mode === 'row' ? styles.rowMarks : styles.stitchMarks}>
          {marks.map((mark) => (
            <View
              key={mark}
              style={[
                mode === 'row' ? styles.rowMark : styles.stitchMark,
                mark % 10 === 0 ? styles.tenthMark : null,
              ]}
            />
          ))}
        </View>
      )}
      {count > MAX_VISIBLE_MARKS ? (
        <Text style={styles.overflowText}>Showing first {MAX_VISIBLE_MARKS} of {count}.</Text>
      ) : null}
    </View>
  );
}

export default function QuickCounterScreen() {
  const [mode, setMode] = useState<CounterMode>('row');
  const [rows, setRows] = useState(0);
  const [stitches, setStitches] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const [status, setStatus] = useState('Ready');

  const activeCount = mode === 'row' ? rows : stitches;
  const inactiveMode = mode === 'row' ? 'stitch' : 'row';
  const inactiveCount = mode === 'row' ? stitches : rows;

  function setActiveCount(nextValue: number) {
    const next = clampCount(nextValue);
    if (mode === 'row') {
      setRows(next);
    } else {
      setStitches(next);
    }
  }

  function adjustActive(direction: 'add' | 'remove') {
    const next = direction === 'add' ? activeCount + 1 : activeCount - 1;
    setActiveCount(next);
    setStatus(`${modeLabel(mode)} count ${direction === 'add' ? 'added' : 'removed'}.`);
  }

  function resetActive() {
    setActiveCount(0);
    setStatus(`${modeLabel(mode)} count reset.`);
  }

  function applyVoiceCommand(command: VoiceCommand) {
    if (command === 'stitch') {
      setStitches((current) => clampCount(current + 1));
      setStatus('Stitch count added.');
      return;
    }
    if (command === 'row') {
      setRows((current) => clampCount(current + 1));
      setStatus('Row count added.');
      return;
    }
    if (command === 'remove stitch') {
      setStitches((current) => clampCount(current - 1));
      setStatus('Stitch count removed.');
      return;
    }
    if (command === 'remove row') {
      setRows((current) => clampCount(current - 1));
      setStatus('Row count removed.');
      return;
    }
    resetActive();
  }

  function toggleVoice() {
    const next = !isListening;
    setIsListening(next);
    setStatus(next ? 'Voice input is ready for the native app build.' : 'Voice input paused.');
  }

  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.screen}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>Quick counter</Text>
        <Text style={styles.title}>Row & Stitch Counter</Text>
        <Text style={styles.copy}>
          A fast standalone counter for making sessions that do not need a saved project.
        </Text>
      </View>

      <View style={styles.toggleWrap}>
        <Pressable
          accessibilityRole="button"
          onPress={() => setMode('row')}
          style={[styles.toggleButton, mode === 'row' ? styles.toggleButtonActive : null]}>
          <Text style={[styles.toggleText, mode === 'row' ? styles.toggleTextActive : null]}>Rows</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => setMode('stitch')}
          style={[styles.toggleButton, mode === 'stitch' ? styles.toggleButtonActive : null]}>
          <Text style={[styles.toggleText, mode === 'stitch' ? styles.toggleTextActive : null]}>Stitches</Text>
        </Pressable>
      </View>

      <View style={styles.countCard}>
        <View style={styles.countHeader}>
          <View>
            <Text style={styles.countKicker}>Counting {pluralLabel(mode, 2)}</Text>
            <Text style={styles.countNumber}>{activeCount}</Text>
          </View>
          <View style={styles.sideCount}>
            <Text style={styles.sideCountNumber}>{inactiveCount}</Text>
            <Text style={styles.sideCountLabel}>{pluralLabel(inactiveMode, inactiveCount)}</Text>
          </View>
        </View>

        <CounterMarks count={activeCount} mode={mode} />

        <View style={styles.stepperRow}>
          <Pressable
            accessibilityLabel={`Remove one ${modeLabel(mode).toLowerCase()}`}
            accessibilityRole="button"
            onPress={() => adjustActive('remove')}
            style={({ pressed }) => [styles.stepperButton, styles.minusButton, pressed ? styles.pressed : null]}>
            <Text style={styles.stepperText}>-</Text>
          </Pressable>
          <Pressable
            accessibilityLabel={`Add one ${modeLabel(mode).toLowerCase()}`}
            accessibilityRole="button"
            onPress={() => adjustActive('add')}
            style={({ pressed }) => [styles.stepperButton, styles.plusButton, pressed ? styles.pressed : null]}>
            <Text style={styles.stepperText}>+</Text>
          </Pressable>
        </View>

        <View style={styles.resetRow}>
          <Pressable
            accessibilityRole="button"
            onPress={resetActive}
            style={({ pressed }) => [styles.resetButton, pressed ? styles.pressed : null]}>
            <Text style={styles.resetText}>Reset {modeLabel(mode)}</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Toggle voice commands"
            accessibilityRole="button"
            onPress={toggleVoice}
            style={({ pressed }) => [
              styles.micButton,
              isListening ? styles.micButtonActive : null,
              pressed ? styles.pressed : null,
            ]}>
            <MaterialCommunityIcons color={isListening ? '#fffdf8' : tokens.color.primary} name="microphone" size={24} />
          </Pressable>
        </View>

        <Text style={styles.statusText}>{status}</Text>
      </View>

      <View style={styles.commandPanel}>
        <Text style={styles.commandTitle}>Voice commands</Text>
        <View style={styles.commandGrid}>
          {(['stitch', 'row', 'remove stitch', 'remove row', 'reset'] as VoiceCommand[]).map((command) => (
            <Pressable
              key={command}
              accessibilityRole="button"
              onPress={() => applyVoiceCommand(command)}
              style={({ pressed }) => [styles.commandChip, pressed ? styles.pressed : null]}>
              <Text style={styles.commandText}>{command}</Text>
            </Pressable>
          ))}
        </View>
      </View>
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
    gap: tokens.spacing.lg,
    padding: tokens.spacing.lg,
    paddingBottom: 80,
  },
  hero: {
    backgroundColor: tokens.color.surfaceWarm,
    borderColor: tokens.color.border,
    borderRadius: 24,
    borderWidth: 1,
    gap: tokens.spacing.xs,
    padding: tokens.spacing.xl,
  },
  eyebrow: {
    color: tokens.color.accent,
    fontFamily: bodyFont,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.2,
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
    lineHeight: 22,
  },
  toggleWrap: {
    backgroundColor: tokens.color.surface,
    borderColor: tokens.color.border,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    padding: 5,
  },
  toggleButton: {
    alignItems: 'center',
    borderRadius: 999,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
  },
  toggleButtonActive: {
    backgroundColor: tokens.color.primary,
  },
  toggleText: {
    color: tokens.color.primary,
    fontFamily: bodyFont,
    fontSize: 15,
    fontWeight: '900',
  },
  toggleTextActive: {
    color: '#fffdf8',
  },
  countCard: {
    backgroundColor: tokens.color.surface,
    borderColor: tokens.color.border,
    borderRadius: 24,
    borderWidth: 1,
    gap: tokens.spacing.lg,
    padding: tokens.spacing.xl,
  },
  countHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: tokens.spacing.md,
  },
  countKicker: {
    color: tokens.color.accent,
    fontFamily: bodyFont,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  countNumber: {
    color: tokens.color.primary,
    fontFamily: displayFont,
    fontSize: 76,
    letterSpacing: 0,
    lineHeight: 84,
  },
  sideCount: {
    alignItems: 'center',
    backgroundColor: tokens.color.surfaceWarm,
    borderColor: tokens.color.border,
    borderRadius: 18,
    borderWidth: 1,
    minWidth: 94,
    padding: tokens.spacing.md,
  },
  sideCountNumber: {
    color: tokens.color.primary,
    fontFamily: displayFont,
    fontSize: 30,
    lineHeight: 35,
  },
  sideCountLabel: {
    color: tokens.color.muted,
    fontFamily: bodyFont,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  markPanel: {
    backgroundColor: '#fffaf4',
    borderColor: tokens.color.border,
    borderRadius: 18,
    borderWidth: 1,
    minHeight: 156,
    padding: tokens.spacing.md,
  },
  rowMarks: {
    gap: 6,
  },
  rowMark: {
    backgroundColor: tokens.color.accent,
    borderRadius: 999,
    height: 6,
    width: '100%',
  },
  stitchMarks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  stitchMark: {
    backgroundColor: tokens.color.primary,
    borderRadius: 999,
    height: 13,
    width: 13,
  },
  tenthMark: {
    backgroundColor: tokens.color.success,
  },
  emptyMarks: {
    color: tokens.color.muted,
    fontFamily: bodyFont,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  overflowText: {
    color: tokens.color.muted,
    fontFamily: bodyFont,
    fontSize: 12,
    lineHeight: 17,
    marginTop: tokens.spacing.sm,
    textAlign: 'center',
  },
  stepperRow: {
    flexDirection: 'row',
    gap: tokens.spacing.md,
  },
  stepperButton: {
    alignItems: 'center',
    borderRadius: 22,
    flex: 1,
    justifyContent: 'center',
    minHeight: 98,
  },
  minusButton: {
    backgroundColor: '#8f786d',
  },
  plusButton: {
    backgroundColor: tokens.color.primary,
  },
  stepperText: {
    color: '#fffdf8',
    fontFamily: displayFont,
    fontSize: 58,
    lineHeight: 64,
  },
  resetRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: tokens.spacing.md,
  },
  resetButton: {
    alignItems: 'center',
    backgroundColor: tokens.color.surfaceWarm,
    borderColor: tokens.color.border,
    borderRadius: 999,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 58,
  },
  resetText: {
    color: tokens.color.primary,
    fontFamily: bodyFont,
    fontSize: 16,
    fontWeight: '900',
  },
  micButton: {
    alignItems: 'center',
    backgroundColor: tokens.color.surfaceWarm,
    borderColor: tokens.color.border,
    borderRadius: 999,
    borderWidth: 1,
    height: 58,
    justifyContent: 'center',
    width: 58,
  },
  micButtonActive: {
    backgroundColor: tokens.color.danger,
    borderColor: tokens.color.danger,
  },
  statusText: {
    color: tokens.color.muted,
    fontFamily: bodyFont,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  commandPanel: {
    backgroundColor: 'rgba(255, 253, 250, 0.72)',
    borderColor: tokens.color.border,
    borderRadius: 20,
    borderWidth: 1,
    gap: tokens.spacing.md,
    padding: tokens.spacing.lg,
  },
  commandTitle: {
    color: tokens.color.primary,
    fontFamily: displayFont,
    fontSize: 22,
    lineHeight: 26,
  },
  commandGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  commandChip: {
    backgroundColor: tokens.color.surface,
    borderColor: tokens.color.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
  },
  commandText: {
    color: tokens.color.primary,
    fontFamily: bodyFont,
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'capitalize',
  },
  pressed: {
    opacity: 0.92,
    transform: [{ translateY: 1 }],
  },
});
