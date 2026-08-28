import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { tokens } from '@/src/theme/tokens';

type DeadlineSheetProps = {
  visible: boolean;
  value?: string | null;
  onClose: () => void;
  onConfirm: (isoString: string | null) => void;
};

export function formatDeadlineLabel(value?: string | null) {
  if (!value) return 'No deadline';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'No deadline';
  return parsed.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function monthLabel(monthIndex: number) {
  return new Date(2026, monthIndex, 1).toLocaleDateString(undefined, { month: 'short' });
}

function daysInMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function buildDate(year: number, month: number, day: number) {
  return new Date(year, month, day, 0, 0, 0, 0);
}

export function DeadlineSheet({ visible, value, onClose, onConfirm }: DeadlineSheetProps) {
  const baseDate = useMemo(() => {
    const parsed = value ? new Date(value) : new Date();
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }, [value]);

  const [year, setYear] = useState(baseDate.getFullYear());
  const [month, setMonth] = useState(baseDate.getMonth());
  const [day, setDay] = useState(baseDate.getDate());

  useEffect(() => {
    if (!visible) return;
    setYear(baseDate.getFullYear());
    setMonth(baseDate.getMonth());
    setDay(baseDate.getDate());
  }, [baseDate, visible]);

  const years = useMemo(() => {
    const current = new Date().getFullYear();
    return Array.from({ length: 6 }, (_, index) => current + index);
  }, []);

  const days = useMemo(
    () => Array.from({ length: daysInMonth(year, month) }, (_, index) => index + 1),
    [month, year],
  );

  useEffect(() => {
    const maxDay = daysInMonth(year, month);
    if (day > maxDay) {
      setDay(maxDay);
    }
  }, [day, month, year]);

  const preview = useMemo(() => buildDate(year, month, day), [day, month, year]);

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Set deadline</Text>
            <Text style={styles.selectedValue}>{formatDeadlineLabel(preview.toISOString())}</Text>
          </View>

          <View style={styles.pickerFrame}>
            <View style={styles.headingRow}>
              <Text style={styles.headingCell}>Month</Text>
              <Text style={styles.headingCell}>Day</Text>
              <Text style={styles.headingCell}>Year</Text>
            </View>

            <View style={styles.columnsRow}>
              <PickerColumn
                values={Array.from({ length: 12 }, (_, index) => index)}
                activeValue={month}
                renderLabel={(value) => monthLabel(value)}
                onSelect={setMonth}
              />
              <PickerColumn
                values={days}
                activeValue={day}
                renderLabel={(value) => String(value)}
                onSelect={setDay}
              />
              <PickerColumn
                values={years}
                activeValue={year}
                renderLabel={(value) => String(value)}
                onSelect={setYear}
              />
            </View>
          </View>

          <View style={styles.footer}>
            <FooterAction label="Cancel" onPress={onClose} />
            <FooterAction
              label="Reset"
              onPress={() => onConfirm(null)}
            />
            <FooterAction
              label="Today"
              onPress={() => {
                const now = new Date();
                setYear(now.getFullYear());
                setMonth(now.getMonth());
                setDay(now.getDate());
              }}
            />
            <FooterAction
              label="OK"
              primary
              onPress={() => onConfirm(preview.toISOString())}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

type PickerColumnProps = {
  values: number[];
  activeValue: number;
  renderLabel: (value: number) => string;
  onSelect: (value: number) => void;
};

function PickerColumn({ values, activeValue, renderLabel, onSelect }: PickerColumnProps) {
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      style={styles.column}
      contentContainerStyle={styles.columnContent}>
      {values.map((value) => {
        const active = value === activeValue;
        return (
          <Pressable
            key={String(value)}
            onPress={() => onSelect(value)}
            style={[styles.option, active ? styles.optionActive : null]}>
            <Text style={[styles.optionText, active ? styles.optionTextActive : null]}>
              {renderLabel(value)}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

type FooterActionProps = {
  label: string;
  onPress: () => void;
  primary?: boolean;
};

function FooterAction({ label, onPress, primary }: FooterActionProps) {
  return (
    <Pressable onPress={onPress} style={[styles.footerButton, primary ? styles.footerButtonPrimary : null]}>
      <Text style={[styles.footerButtonText, primary ? styles.footerButtonTextPrimary : null]}>
        {label}
      </Text>
    </Pressable>
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
    maxHeight: '82%',
  },
  header: {
    gap: 4,
    alignItems: 'center',
  },
  title: {
    color: tokens.color.text,
    fontSize: 22,
    fontWeight: '700',
  },
  selectedValue: {
    color: tokens.color.primary,
    fontSize: 15,
    fontWeight: '700',
  },
  pickerFrame: {
    borderRadius: tokens.radius.medium,
    borderWidth: 1,
    borderColor: tokens.color.border,
    overflow: 'hidden',
    backgroundColor: '#fffaf6',
  },
  headingRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.border,
    backgroundColor: '#fff',
  },
  headingCell: {
    flex: 1,
    textAlign: 'center',
    color: tokens.color.text,
    fontSize: 12,
    fontWeight: '700',
    paddingVertical: 10,
  },
  columnsRow: {
    flexDirection: 'row',
    gap: 0,
    paddingHorizontal: 6,
    paddingVertical: 8,
  },
  column: {
    flex: 1,
    maxHeight: 240,
  },
  columnContent: {
    gap: 6,
    paddingHorizontal: 4,
    paddingBottom: 6,
  },
  option: {
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: tokens.radius.medium,
    backgroundColor: 'transparent',
  },
  optionActive: {
    backgroundColor: '#efe1d3',
  },
  optionText: {
    color: tokens.color.muted,
    fontSize: 16,
    fontWeight: '500',
  },
  optionTextActive: {
    color: tokens.color.primary,
    fontSize: 18,
    fontWeight: '700',
  },
  footer: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  footerButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: tokens.radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surfaceWarm,
  },
  footerButtonPrimary: {
    backgroundColor: tokens.color.primary,
    borderColor: tokens.color.primary,
  },
  footerButtonText: {
    color: tokens.color.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  footerButtonTextPrimary: {
    color: '#fff',
  },
});
