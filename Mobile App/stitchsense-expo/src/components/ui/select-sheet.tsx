import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { tokens } from '@/src/theme/tokens';

type Option = {
  label: string;
  value: string;
};

type SelectSheetProps = {
  visible: boolean;
  title: string;
  options: Option[];
  selectedValue?: string | null;
  onClose: () => void;
  onSelect: (value: string) => void;
};

export function SelectSheet({
  visible,
  title,
  options,
  selectedValue,
  onClose,
  onSelect,
}: SelectSheetProps) {
  return (
    <Modal
      animationType="slide"
      transparent
      visible={visible}
      onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Text onPress={onClose} style={styles.closeLink}>
              Done
            </Text>
          </View>
          <ScrollView contentContainerStyle={styles.options}>
            {options.map((option) => {
              const active = selectedValue === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => {
                    onSelect(option.value);
                    onClose();
                  }}
                  style={[styles.option, active ? styles.optionActive : null]}>
                  <Text style={[styles.optionText, active ? styles.optionTextActive : null]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(43, 31, 26, 0.28)',
  },
  backdrop: {
    flex: 1,
  },
  sheet: {
    backgroundColor: tokens.color.surface,
    borderTopLeftRadius: tokens.radius.sheet,
    borderTopRightRadius: tokens.radius.sheet,
    padding: tokens.spacing.lg,
    gap: tokens.spacing.md,
    maxHeight: '72%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: tokens.spacing.md,
  },
  title: {
    color: tokens.color.text,
    fontSize: 22,
    fontWeight: '700',
  },
  closeLink: {
    color: tokens.color.primary,
    fontSize: 15,
    fontWeight: '700',
  },
  options: {
    gap: tokens.spacing.sm,
    paddingBottom: tokens.spacing.md,
  },
  option: {
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surfaceWarm,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: 14,
  },
  optionActive: {
    backgroundColor: tokens.color.primary,
    borderColor: tokens.color.primary,
  },
  optionText: {
    color: tokens.color.text,
    fontSize: 16,
    fontWeight: '600',
  },
  optionTextActive: {
    color: '#fff',
  },
});
