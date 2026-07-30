import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { BrandButton } from '@/src/components/ui/brand-button';
import { InlineBackButton } from '@/src/components/ui/inline-back-button';
import {
  calculateGauge,
  type GaugeCraft,
  type GaugeForm,
  type GaugeMode,
  type GaugeProjectType,
  type GaugeUnit,
} from '@/src/lib/gauge';
import type { Pattern } from '@/src/lib/models';
import { useLibrary } from '@/src/providers/library-provider';
import { tokens } from '@/src/theme/tokens';

const needleHookReference = [
  {
    label: 'Sock / fingering',
    knitting: '2.25 to 3.25 mm',
    crochet: '2.5 to 3.5 mm',
  },
  {
    label: 'DK / light worsted',
    knitting: '3.75 to 4.5 mm',
    crochet: '4 to 5 mm',
  },
  {
    label: 'Aran / worsted',
    knitting: '4.5 to 5.5 mm',
    crochet: '5 to 6 mm',
  },
  {
    label: 'Chunky / bulky',
    knitting: '6 to 8 mm',
    crochet: '6.5 to 9 mm',
  },
] as const;

const quickGaugeExamples = [
  {
    label: 'Close match',
    targetStitches: '20',
    targetRows: '28',
    actualStitches: '20',
    actualRows: '28',
  },
  {
    label: 'Too many stitches',
    targetStitches: '20',
    targetRows: '28',
    actualStitches: '23',
    actualRows: '31',
  },
  {
    label: 'Too few stitches',
    targetStitches: '20',
    targetRows: '28',
    actualStitches: '17',
    actualRows: '24',
  },
] as const;

function parseNumber(value: string) {
  const next = Number.parseFloat(value);
  return Number.isFinite(next) ? next : 0;
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function inferCraft(pattern: Pattern): GaugeCraft {
  const text = `${pattern.craftType ?? ''} ${pattern.patternSummaryText ?? ''} ${JSON.stringify(pattern.metadata ?? {})}`.toLowerCase();
  if (text.includes('crochet') || text.includes('hook')) return 'crochet';
  if (text.includes('knit') || text.includes('needle')) return 'knitting';
  return 'unsure';
}

function extractGaugeFromText(raw: string) {
  const text = raw.replace(/\s+/g, ' ').trim();
  if (!text) return null;

  const stitchRowMatch = text.match(
    /(\d+(?:\.\d+)?)\s*(?:sts?|stitches?)\b(?:[^0-9]{1,30})(\d+(?:\.\d+)?)\s*(?:rows?|rounds?|rnds?)\b/i,
  );
  const stitchOnlyMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:sts?|stitches?)\b/i);
  const measureMatch = text.match(/(?:over|per|to|=|in)\s*(\d+(?:\.\d+)?)\s*(cm|in|inch|inches)\b/i);

  const stitches = stitchRowMatch?.[1] ?? stitchOnlyMatch?.[1] ?? '';
  const rows = stitchRowMatch?.[2] ?? '';
  const measure = measureMatch?.[1] ?? '';
  const measureUnit = measureMatch?.[2]?.toLowerCase() ?? '';

  if (!stitches) return null;

  return {
    stitches,
    rows,
    unit: measureUnit.startsWith('in') && Math.abs(Number(measure) - 4) < 0.5 ? '4in' as GaugeUnit : '10cm' as GaugeUnit,
    customMeasureCm:
      measure && measureUnit === 'cm' && Math.abs(Number(measure) - 10) >= 0.5 ? measure : '',
  };
}

function buildGaugeHint(pattern: Pattern) {
  const metadata = pattern.metadata ?? {};
  const gaugeText = firstText(
    metadata.gauge,
    metadata.tension,
    metadata.ravelry_gauge,
    pattern.patternSummaryText,
    pattern.patternSummaryHtml ? stripHtml(pattern.patternSummaryHtml) : '',
  );
  const parsed = extractGaugeFromText(gaugeText);
  if (!parsed) return null;

  return {
    pattern,
    gaugeText,
    parsed,
    craftType: inferCraft(pattern),
    yarnWeight: firstText(metadata.yarn_weight, metadata.weight, metadata.yarnWeight),
    toolSize: firstText(
      metadata.needle_size,
      metadata.needle_sizes,
      metadata.hook_size,
      metadata.hook_sizes,
      metadata.recommended_needle,
      metadata.recommended_hook,
    ),
  };
}

function TogglePill({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <View style={[styles.togglePill, active ? styles.togglePillActive : null]}>
      <Text onPress={onPress} style={[styles.togglePillLabel, active ? styles.togglePillLabelActive : null]}>
        {label}
      </Text>
    </View>
  );
}

function LabeledInput({
  label,
  value,
  onChangeText,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        keyboardType="decimal-pad"
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9b867d"
        style={styles.input}
        value={value}
      />
    </View>
  );
}

export default function GaugeCalculatorScreen() {
  const router = useRouter();
  const { patternId } = useLocalSearchParams<{ patternId?: string }>();
  const { patterns } = useLibrary();
  const [mode, setMode] = useState<GaugeMode>('simple');
  const [unit, setUnit] = useState<GaugeUnit>('10cm');
  const [targetStitches, setTargetStitches] = useState('');
  const [targetRows, setTargetRows] = useState('');
  const [actualStitches, setActualStitches] = useState('');
  const [actualRows, setActualRows] = useState('');
  const [customMeasureCm, setCustomMeasureCm] = useState('10');
  const [craftType, setCraftType] = useState<GaugeCraft>('unsure');
  const [projectType, setProjectType] = useState<GaugeProjectType>('unknown');
  const [currentToolSize, setCurrentToolSize] = useState('');
  const [patternToolSize, setPatternToolSize] = useState('');
  const [patternStitchCount, setPatternStitchCount] = useState('');
  const [patternRowCount, setPatternRowCount] = useState('');
  const [patternWidthCm, setPatternWidthCm] = useState('');
  const [patternHeightCm, setPatternHeightCm] = useState('');
  const [actualWidthCm, setActualWidthCm] = useState('');
  const [actualHeightCm, setActualHeightCm] = useState('');
  const [yarnWeight, setYarnWeight] = useState('');
  const [goodTolerance, setGoodTolerance] = useState('3');
  const [noticeableTolerance, setNoticeableTolerance] = useState('8');
  const [majorTolerance, setMajorTolerance] = useState('15');
  const [selectedPatternId, setSelectedPatternId] = useState(patternId ?? '');
  const [autofillMessage, setAutofillMessage] = useState<string | null>(null);

  const gaugeHints = useMemo(
    () =>
      patterns
        .filter((pattern) => !pattern.isArchived)
        .map(buildGaugeHint)
        .filter((hint): hint is NonNullable<ReturnType<typeof buildGaugeHint>> => Boolean(hint)),
    [patterns],
  );

  const selectedGaugeHint = useMemo(
    () =>
      gaugeHints.find((hint) => hint.pattern.id === selectedPatternId) ??
      gaugeHints.find((hint) => hint.pattern.id === patternId) ??
      null,
    [gaugeHints, patternId, selectedPatternId],
  );

  const form = useMemo<GaugeForm>(
    () => ({
      mode,
      unit,
      customMeasureCm: parseNumber(customMeasureCm) || 10,
      targetStitches: parseNumber(targetStitches),
      targetRows: parseNumber(targetRows),
      actualStitches: parseNumber(actualStitches),
      actualRows: parseNumber(actualRows),
      craftType,
      projectType,
      currentToolSize,
      patternToolSize,
      yarnWeight,
      patternStitchCount: parseNumber(patternStitchCount),
      patternRowCount: parseNumber(patternRowCount),
      patternWidthCm: parseNumber(patternWidthCm),
      patternHeightCm: parseNumber(patternHeightCm),
      actualWidthCm: parseNumber(actualWidthCm),
      actualHeightCm: parseNumber(actualHeightCm),
      goodTolerance: parseNumber(goodTolerance) || 3,
      noticeableTolerance: parseNumber(noticeableTolerance) || 8,
      majorTolerance: parseNumber(majorTolerance) || 15,
    }),
    [
      actualHeightCm,
      actualRows,
      actualStitches,
      actualWidthCm,
      craftType,
      currentToolSize,
      customMeasureCm,
      goodTolerance,
      majorTolerance,
      mode,
      noticeableTolerance,
      patternHeightCm,
      patternRowCount,
      patternStitchCount,
      patternToolSize,
      patternWidthCm,
      projectType,
      targetRows,
      targetStitches,
      unit,
      yarnWeight,
    ],
  );

  const result = useMemo(() => calculateGauge(form), [form]);

  function applyGaugeHint(hint: NonNullable<ReturnType<typeof buildGaugeHint>>) {
    setTargetStitches(hint.parsed.stitches);
    setTargetRows(hint.parsed.rows);
    setUnit(hint.parsed.customMeasureCm ? 'custom' : hint.parsed.unit);
    if (hint.parsed.customMeasureCm) {
      setCustomMeasureCm(hint.parsed.customMeasureCm);
    }
    setCraftType(hint.craftType);
    setPatternToolSize(hint.toolSize);
    setYarnWeight(hint.yarnWeight);
    setSelectedPatternId(hint.pattern.id);
    setAutofillMessage(`Autofilled gauge from ${hint.pattern.title}.`);
  }

  useEffect(() => {
    if (patternId && selectedGaugeHint && !autofillMessage) {
      applyGaugeHint(selectedGaugeHint);
    }
  }, [autofillMessage, patternId, selectedGaugeHint]);

  const helperPrompt = useMemo(() => {
    if (!result) {
      return 'Please help me understand what to measure in my swatch and how to fill in the gauge calculator correctly.';
    }

    const stats = result.stats
      .slice(0, 4)
      .map((item) => `${item.label}: ${item.value}`)
      .join('; ');

    return `Please explain this gauge result in plain English and tell me what to do next.\n\nSummary: ${result.summary}\nRecommendation: ${result.recommendation}\nStats: ${stats}`;
  }, [result]);

  function resetForm() {
    setMode('simple');
    setUnit('10cm');
    setTargetStitches('');
    setTargetRows('');
    setActualStitches('');
    setActualRows('');
    setCustomMeasureCm('10');
    setCraftType('unsure');
    setProjectType('unknown');
    setCurrentToolSize('');
    setPatternToolSize('');
    setPatternStitchCount('');
    setPatternRowCount('');
    setPatternWidthCm('');
    setPatternHeightCm('');
    setActualWidthCm('');
    setActualHeightCm('');
    setYarnWeight('');
    setGoodTolerance('3');
    setNoticeableTolerance('8');
    setMajorTolerance('15');
  }

  function applyQuickExample(example: (typeof quickGaugeExamples)[number]) {
    setTargetStitches(example.targetStitches);
    setTargetRows(example.targetRows);
    setActualStitches(example.actualStitches);
    setActualRows(example.actualRows);
    setUnit('10cm');
    setAutofillMessage(`${example.label} example loaded. Replace the numbers with your swatch.`);
  }

  function openGaugeHelper(prompt: string, title = 'Gauge help') {
    router.push({
      pathname: '/(tabs)/chat',
      params: {
        title,
        prompt,
        context: result
          ? `${result.summary} ${result.recommendation}`
          : 'The user is working in the StitchSense gauge calculator and wants help understanding their gauge choices.',
        toolMode: 'gauge_helper',
      },
    });
  }

  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.screen}>
      <InlineBackButton label="Close tool" onPress={() => router.replace('/(tabs)/tools')} />

      <View style={styles.hero}>
        <Text style={styles.eyebrow}>Gauge calculator</Text>
        <Text style={styles.title}>Check your swatch without the migraine</Text>
        <Text style={styles.copy}>
          Use stitch and row gauge when the pattern gives stitches per 10 cm or 4 inches. If it gives a finished block or motif size instead, switch on the advanced fields below.
        </Text>
        <View style={styles.workflowRow}>
          {['Target', 'Swatch', 'Result'].map((step, index) => {
            const complete =
              index === 0
                ? Boolean(targetStitches)
                : index === 1
                  ? Boolean(actualStitches)
                  : Boolean(result);
            return (
              <View key={step} style={[styles.workflowPill, complete ? styles.workflowPillDone : null]}>
                <Text style={[styles.workflowText, complete ? styles.workflowTextDone : null]}>{step}</Text>
              </View>
            );
          })}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Quick examples</Text>
        <Text style={styles.referenceCopy}>
          Load an example to see how the calculator responds, then replace the values with your own swatch.
        </Text>
        <View style={styles.exampleRow}>
          {quickGaugeExamples.map((example) => (
            <Pressable
              key={example.label}
              onPress={() => applyQuickExample(example)}
              style={styles.exampleChip}>
              <Text style={styles.exampleChipText}>{example.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {gaugeHints.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Autofill from a pattern</Text>
          <Text style={styles.referenceCopy}>
            Pull target gauge, craft, yarn, and needle or hook clues from imported pattern metadata when they are available.
          </Text>
          <View style={styles.patternChipList}>
            {gaugeHints.slice(0, 6).map((hint) => {
              const active = selectedPatternId === hint.pattern.id;
              return (
                <View
                  key={hint.pattern.id}
                  style={[styles.patternChip, active ? styles.patternChipActive : null]}>
                  <Text
                    onPress={() => {
                      setSelectedPatternId(hint.pattern.id);
                      applyGaugeHint(hint);
                    }}
                    style={[styles.patternChipTitle, active ? styles.patternChipTitleActive : null]}>
                    {hint.pattern.title}
                  </Text>
                  <Text style={[styles.patternChipMeta, active ? styles.patternChipMetaActive : null]} numberOfLines={2}>
                    {hint.gaugeText}
                  </Text>
                </View>
              );
            })}
          </View>
          {selectedGaugeHint ? (
            <View style={styles.patternSourceCard}>
              <Text style={styles.patternSourceTitle}>Selected pattern source</Text>
              <Text style={styles.patternSourceCopy}>{selectedGaugeHint.gaugeText}</Text>
              {selectedGaugeHint.toolSize ? (
                <Text style={styles.patternSourceCopy}>Tool: {selectedGaugeHint.toolSize}</Text>
              ) : null}
            </View>
          ) : null}
          {selectedGaugeHint ? (
            <BrandButton
              label="Apply selected gauge"
              onPress={() => applyGaugeHint(selectedGaugeHint)}
              style={styles.actionButton}
              variant="ghost"
            />
          ) : null}
          {autofillMessage ? <Text style={styles.autofillMessage}>{autofillMessage}</Text> : null}
        </View>
      ) : null}

      <View style={styles.toggleRow}>
        <TogglePill active={mode === 'simple'} label="Simple mode" onPress={() => setMode('simple')} />
        <TogglePill active={mode === 'advanced'} label="Advanced mode" onPress={() => setMode('advanced')} />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Pattern gauge</Text>
        <LabeledInput
          label="Target stitches"
          onChangeText={setTargetStitches}
          placeholder="e.g. 20"
          value={targetStitches}
        />
        <LabeledInput
          label="Target rows / rounds"
          onChangeText={setTargetRows}
          placeholder="e.g. 28"
          value={targetRows}
        />
        <Text style={styles.fieldLabel}>Measured over</Text>
        <View style={styles.choiceRow}>
          {(['10cm', '4in', 'custom'] as GaugeUnit[]).map((item) => (
            <TogglePill
              key={item}
              active={unit === item}
              label={item === '10cm' ? '10 cm' : item === '4in' ? '4 inches' : 'Custom cm'}
              onPress={() => setUnit(item)}
            />
          ))}
        </View>
        {unit === 'custom' ? (
          <LabeledInput
            label="Custom cm"
            onChangeText={setCustomMeasureCm}
            placeholder="e.g. 12"
            value={customMeasureCm}
          />
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Your swatch</Text>
        <LabeledInput
          label="Your stitches"
          onChangeText={setActualStitches}
          placeholder="e.g. 22"
          value={actualStitches}
        />
        <LabeledInput
          label="Your rows / rounds"
          onChangeText={setActualRows}
          placeholder="e.g. 30"
          value={actualRows}
        />
        <LabeledInput
          label="Current needle / hook"
          onChangeText={setCurrentToolSize}
          placeholder="e.g. 4 mm"
          value={currentToolSize}
        />
        <Text style={styles.fieldLabel}>Craft type</Text>
        <View style={styles.choiceRow}>
          {(['unsure', 'knitting', 'crochet'] as GaugeCraft[]).map((item) => (
            <TogglePill
              key={item}
              active={craftType === item}
              label={item === 'unsure' ? 'Unsure' : item}
              onPress={() => setCraftType(item)}
            />
          ))}
        </View>
      </View>

      {mode === 'advanced' ? (
        <>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Optional size check</Text>
            <LabeledInput
              label="Pattern needle / hook"
              onChangeText={setPatternToolSize}
              placeholder="e.g. 4 mm"
              value={patternToolSize}
            />
            <LabeledInput
              label="Yarn weight"
              onChangeText={setYarnWeight}
              placeholder="e.g. DK"
              value={yarnWeight}
            />
            <LabeledInput
              label="Pattern stitch count"
              onChangeText={setPatternStitchCount}
              value={patternStitchCount}
            />
            <LabeledInput
              label="Pattern row count"
              onChangeText={setPatternRowCount}
              value={patternRowCount}
            />
            <LabeledInput
              label="Pattern block width cm"
              onChangeText={setPatternWidthCm}
              value={patternWidthCm}
            />
            <LabeledInput
              label="Pattern block height cm"
              onChangeText={setPatternHeightCm}
              value={patternHeightCm}
            />
            <LabeledInput
              label="Your block width cm"
              onChangeText={setActualWidthCm}
              value={actualWidthCm}
            />
            <LabeledInput
              label="Your block height cm"
              onChangeText={setActualHeightCm}
              value={actualHeightCm}
            />
            <Text style={styles.fieldLabel}>Project type</Text>
            <View style={styles.choiceWrap}>
              {(
                [
                  ['unknown', 'Unknown'],
                  ['garment', 'Garment'],
                  ['blanket_scarf', 'Scarf / blanket'],
                  ['toy_amigurumi', 'Toy / amigurumi'],
                  ['motif', 'Motif / block'],
                ] as [GaugeProjectType, string][]
              ).map(([value, label]) => (
                <TogglePill
                  key={value}
                  active={projectType === value}
                  label={label}
                  onPress={() => setProjectType(value)}
                />
              ))}
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Tolerance controls</Text>
            <LabeledInput
              label="Good tolerance %"
              onChangeText={setGoodTolerance}
              value={goodTolerance}
            />
            <LabeledInput
              label="Noticeable tolerance %"
              onChangeText={setNoticeableTolerance}
              value={noticeableTolerance}
            />
            <LabeledInput
              label="Major tolerance %"
              onChangeText={setMajorTolerance}
              value={majorTolerance}
            />
          </View>
        </>
      ) : null}

      <View style={styles.actionRow}>
        <BrandButton label="Check my gauge" style={styles.actionButton} />
        <BrandButton label="Reset" onPress={resetForm} style={styles.actionButton} variant="ghost" />
      </View>

      <View style={styles.resultCard}>
        <Text style={styles.sectionTitle}>Result</Text>
        {result ? (
          <>
            <View
              style={[
                styles.statusPill,
                result.status === 'good_match'
                  ? styles.goodPill
                  : result.status === 'noticeable_difference'
                    ? styles.noticePill
                    : styles.majorPill,
              ]}>
              <Text style={styles.statusPillLabel}>
                {result.status === 'good_match'
                  ? 'Good match'
                  : result.status === 'noticeable_difference'
                    ? 'Noticeable difference'
                    : 'Major difference'}
              </Text>
            </View>
            <Text style={styles.resultSummary}>{result.summary}</Text>
            <Text style={styles.resultRecommendation}>{result.recommendation}</Text>
            <View style={styles.statsList}>
              {result.stats.map((item) => (
                <View key={item.label} style={styles.statRow}>
                  <Text style={styles.statLabel}>{item.label}</Text>
                  <Text style={styles.statValue}>{item.value}</Text>
                </View>
              ))}
            </View>
            {result.warnings.length > 0 ? (
              <View style={styles.warningBox}>
                {result.warnings.map((warning) => (
                  <Text key={warning} style={styles.warningText}>
                    • {warning}
                  </Text>
                ))}
              </View>
            ) : null}

            <View style={styles.helperActionStack}>
              <BrandButton
                label="Ask StitchSense to explain this"
                onPress={() => openGaugeHelper(helperPrompt)}
                style={styles.actionButton}
              />
              <BrandButton
                label="Open needle / hook guide"
                onPress={() =>
	                  router.push({
	                    pathname: '/(tabs)/chat',
	                    params: {
	                      title: 'Needle and hook direction',
	                      prompt:
	                        'Based on this gauge result, what size change should I try next and why?',
	                      context: helperPrompt,
	                      toolMode: 'needle_hook_helper',
                    },
                  })
                }
                style={styles.actionButton}
                variant="ghost"
              />
              <BrandButton
                label="Ask about yarn substitution"
                onPress={() =>
	                  router.push({
	                    pathname: '/(tabs)/chat',
	                    params: {
	                      title: 'Yarn substitution helper',
	                      prompt:
	                        'Can you suggest a safer yarn substitution strategy that keeps this gauge closer to target?',
	                      context: helperPrompt,
	                      toolMode: 'yarn_substitution_helper',
                    },
                  })
                }
                style={styles.actionButton}
                variant="secondary"
              />
              <BrandButton
                label="Open stitch dictionary"
                onPress={() =>
                  router.push({
                    pathname: '/stitch-dictionary',
                    params: { query: craftType === 'crochet' ? 'gauge' : 'tension' },
                  })
                }
                style={styles.actionButton}
                variant="ghost"
              />
            </View>
          </>
        ) : (
          <Text style={styles.emptyResult}>
            Start with the target stitches and your swatch stitches. I’ll do the maths without the migraine.
          </Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Needle / hook reference</Text>
        <Text style={styles.referenceCopy}>
          These are sensible starting ranges, not hard rules. Fabric feel and drape still matter.
        </Text>
        <View style={styles.referenceList}>
          {needleHookReference.map((entry) => (
            <View key={entry.label} style={styles.referenceRow}>
              <Text style={styles.referenceLabel}>{entry.label}</Text>
              <Text style={styles.referenceValue}>Knitting: {entry.knitting}</Text>
              <Text style={styles.referenceValue}>Crochet: {entry.crochet}</Text>
            </View>
          ))}
        </View>
        <BrandButton
          label="Need help picking the next size?"
          onPress={() =>
	            router.push({
	              pathname: '/(tabs)/chat',
	              params: {
	                title: 'Needle and hook direction',
	                prompt:
	                  'I need help deciding whether to size my needle or hook up or down for this project.',
	                context:
	                  'The user is working in the StitchSense gauge calculator and wants practical tool-size advice.',
                toolMode: 'needle_hook_helper',
              },
            })
          }
          style={styles.actionButton}
          variant="ghost"
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: tokens.color.background,
  },
  content: {
    padding: tokens.spacing.lg,
    gap: tokens.spacing.lg,
  },
  hero: {
    backgroundColor: tokens.color.surfaceWarm,
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: tokens.color.border,
    padding: tokens.spacing.xl,
    gap: tokens.spacing.sm,
  },
  eyebrow: {
    color: tokens.color.accent,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  title: {
    color: tokens.color.text,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
  },
  copy: {
    color: tokens.color.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  workflowRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  workflowPill: {
    flexGrow: 1,
    minWidth: 88,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: 8,
    alignItems: 'center',
  },
  workflowPillDone: {
    backgroundColor: '#e7f4eb',
    borderColor: 'rgba(63, 143, 85, 0.22)',
  },
  workflowText: {
    color: tokens.color.muted,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  workflowTextDone: {
    color: tokens.color.success,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  togglePill: {
    flex: 1,
    borderRadius: tokens.radius.medium,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    paddingVertical: 12,
    paddingHorizontal: tokens.spacing.md,
    alignItems: 'center',
  },
  togglePillActive: {
    backgroundColor: tokens.color.primary,
    borderColor: tokens.color.primary,
  },
  togglePillLabel: {
    color: tokens.color.primary,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  togglePillLabelActive: {
    color: '#fff',
  },
  card: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: tokens.color.border,
    padding: tokens.spacing.xl,
    gap: tokens.spacing.md,
  },
  patternChipList: {
    gap: tokens.spacing.sm,
  },
  patternChip: {
    borderRadius: tokens.radius.medium,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.background,
    padding: tokens.spacing.md,
    gap: 4,
  },
  patternChipActive: {
    backgroundColor: tokens.color.primary,
    borderColor: tokens.color.primary,
  },
  patternChipTitle: {
    color: tokens.color.text,
    fontSize: 15,
    fontWeight: '800',
  },
  patternChipTitleActive: {
    color: '#fff',
  },
  patternChipMeta: {
    color: tokens.color.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  patternChipMetaActive: {
    color: '#fff6ee',
  },
  exampleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  exampleChip: {
    flexGrow: 1,
    minWidth: 128,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: '#fffaf4',
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: 10,
    alignItems: 'center',
  },
  exampleChipText: {
    color: tokens.color.primary,
    fontSize: 13,
    fontWeight: '900',
  },
  patternSourceCard: {
    borderRadius: tokens.radius.medium,
    borderWidth: 1,
    borderColor: 'rgba(104, 64, 42, 0.1)',
    backgroundColor: '#fffaf4',
    padding: tokens.spacing.md,
    gap: 4,
  },
  patternSourceTitle: {
    color: tokens.color.text,
    fontSize: 14,
    fontWeight: '900',
  },
  patternSourceCopy: {
    color: tokens.color.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  autofillMessage: {
    color: tokens.color.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  sectionTitle: {
    color: tokens.color.text,
    fontSize: 21,
    fontWeight: '700',
  },
  field: {
    gap: tokens.spacing.xs,
  },
  fieldLabel: {
    color: tokens.color.text,
    fontSize: 14,
    fontWeight: '700',
  },
  input: {
    minHeight: tokens.component.controlHeight,
    borderRadius: tokens.radius.medium,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.background,
    color: tokens.color.text,
    paddingHorizontal: tokens.spacing.md,
    fontSize: 16,
  },
  choiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  choiceWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  actionRow: {
    gap: tokens.spacing.sm,
  },
  actionButton: {
    width: '100%',
  },
  resultCard: {
    backgroundColor: '#eef8f8',
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: 'rgba(45, 116, 120, 0.16)',
    padding: tokens.spacing.xl,
    gap: tokens.spacing.md,
  },
  statusPill: {
    alignSelf: 'flex-start',
    borderRadius: tokens.radius.pill,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: 8,
  },
  goodPill: {
    backgroundColor: '#ddefe3',
  },
  noticePill: {
    backgroundColor: '#fff0d5',
  },
  majorPill: {
    backgroundColor: '#fde2de',
  },
  statusPillLabel: {
    color: tokens.color.text,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  resultSummary: {
    color: tokens.color.text,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '700',
  },
  resultRecommendation: {
    color: tokens.color.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  statsList: {
    gap: tokens.spacing.sm,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: tokens.spacing.md,
  },
  statLabel: {
    flex: 1,
    color: tokens.color.muted,
    fontSize: 14,
  },
  statValue: {
    color: tokens.color.text,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'right',
  },
  warningBox: {
    backgroundColor: '#fff7ef',
    borderRadius: tokens.radius.medium,
    padding: tokens.spacing.md,
    gap: tokens.spacing.xs,
  },
  warningText: {
    color: tokens.color.warning,
    fontSize: 14,
    lineHeight: 20,
  },
  helperActionStack: {
    gap: tokens.spacing.sm,
    marginTop: tokens.spacing.xs,
  },
  emptyResult: {
    color: tokens.color.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  referenceCopy: {
    color: tokens.color.muted,
    fontSize: 14,
    lineHeight: 21,
  },
  referenceList: {
    gap: tokens.spacing.sm,
  },
  referenceRow: {
    borderRadius: tokens.radius.medium,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.background,
    padding: tokens.spacing.md,
    gap: 4,
  },
  referenceLabel: {
    color: tokens.color.text,
    fontSize: 15,
    fontWeight: '700',
  },
  referenceValue: {
    color: tokens.color.muted,
    fontSize: 14,
    lineHeight: 20,
  },
});
