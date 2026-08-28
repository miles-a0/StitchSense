export type GaugeMode = 'simple' | 'advanced';
export type GaugeCraft = 'unsure' | 'knitting' | 'crochet';
export type GaugeProjectType =
  | 'unknown'
  | 'garment'
  | 'blanket_scarf'
  | 'toy_amigurumi'
  | 'motif';
export type GaugeUnit = '10cm' | '4in' | 'custom';

export type GaugeForm = {
  mode: GaugeMode;
  unit: GaugeUnit;
  customMeasureCm: number;
  targetStitches: number;
  targetRows: number;
  actualStitches: number;
  actualRows: number;
  craftType: GaugeCraft;
  projectType: GaugeProjectType;
  currentToolSize: string;
  patternToolSize: string;
  yarnWeight: string;
  patternStitchCount: number;
  patternRowCount: number;
  patternWidthCm: number;
  patternHeightCm: number;
  actualWidthCm: number;
  actualHeightCm: number;
  goodTolerance: number;
  noticeableTolerance: number;
  majorTolerance: number;
};

export type GaugeResult = {
  kind: 'stitch_row' | 'block_size';
  status: 'good_match' | 'noticeable_difference' | 'major_difference';
  summary: string;
  recommendation: string;
  warnings: string[];
  stats: { label: string; value: string }[];
};

function round(value: number, places = 1) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function statusFromDiff(diffPercent: number, form: GaugeForm) {
  const absolute = Math.abs(diffPercent);
  if (absolute <= form.goodTolerance) return 'good_match';
  if (absolute <= form.noticeableTolerance) return 'noticeable_difference';
  return 'major_difference';
}

function worstStatus(
  left: GaugeResult['status'],
  right: GaugeResult['status'],
): GaugeResult['status'] {
  const rank = {
    good_match: 0,
    noticeable_difference: 1,
    major_difference: 2,
  } as const;

  return rank[left] >= rank[right] ? left : right;
}

function measureCm(form: GaugeForm) {
  if (form.unit === '4in') return 10.16;
  if (form.unit === 'custom') return form.customMeasureCm;
  return 10;
}

export function calculateGauge(form: GaugeForm): GaugeResult | null {
  const hasStitchGauge = form.targetStitches > 0 && form.actualStitches > 0;
  const hasBlockGauge = form.patternWidthCm > 0 && form.actualWidthCm > 0;

  if (!hasStitchGauge && !hasBlockGauge) {
    return null;
  }

  if (!hasStitchGauge && hasBlockGauge) {
    const widthDiff = ((form.actualWidthCm - form.patternWidthCm) / form.patternWidthCm) * 100;
    const hasHeight = form.patternHeightCm > 0 && form.actualHeightCm > 0;
    const heightDiff = hasHeight
      ? ((form.actualHeightCm - form.patternHeightCm) / form.patternHeightCm) * 100
      : 0;
    const status = worstStatus(
      statusFromDiff(widthDiff, form),
      hasHeight ? statusFromDiff(heightDiff, form) : 'good_match',
    );
    const summary =
      widthDiff > form.goodTolerance
        ? 'Your finished block is coming out larger than the pattern measurement, so your tension is looser overall.'
        : widthDiff < -form.goodTolerance
          ? 'Your finished block is coming out smaller than the pattern measurement, so your tension is tighter overall.'
          : 'Your finished block is close to the pattern measurement.';
    const recommendation =
      widthDiff > form.goodTolerance
        ? 'Try a smaller needle or hook, or work a little tighter, then measure another block.'
        : widthDiff < -form.goodTolerance
          ? 'Try a larger needle or hook, or relax your tension slightly, then measure another block.'
          : 'Keep this needle or hook size unless the fabric itself feels wrong.';

    return {
      kind: 'block_size',
      status,
      summary,
      recommendation,
      warnings: hasHeight
        ? []
        : ['Height was not checked because one of the height measurements is missing.'],
      stats: [
        { label: 'Pattern width', value: `${round(form.patternWidthCm)} cm` },
        { label: 'Your width', value: `${round(form.actualWidthCm)} cm` },
        { label: 'Width difference', value: `${round(widthDiff)}%` },
        ...(hasHeight
          ? [
              { label: 'Pattern height', value: `${round(form.patternHeightCm)} cm` },
              { label: 'Your height', value: `${round(form.actualHeightCm)} cm` },
              { label: 'Height difference', value: `${round(heightDiff)}%` },
            ]
          : []),
      ],
    };
  }

  const cm = measureCm(form);
  const targetStitchGauge = (form.targetStitches / cm) * 10;
  const actualStitchGauge = (form.actualStitches / cm) * 10;
  const stitchDiff = ((actualStitchGauge - targetStitchGauge) / targetStitchGauge) * 100;

  const hasRows = form.targetRows > 0 && form.actualRows > 0;
  const targetRowGauge = hasRows ? (form.targetRows / cm) * 10 : 0;
  const actualRowGauge = hasRows ? (form.actualRows / cm) * 10 : 0;
  const rowDiff = hasRows ? ((actualRowGauge - targetRowGauge) / targetRowGauge) * 100 : 0;

  const status = worstStatus(
    statusFromDiff(stitchDiff, form),
    hasRows ? statusFromDiff(rowDiff, form) : 'good_match',
  );

  const summary =
    stitchDiff > form.goodTolerance
      ? 'Your stitches are smaller and tighter than the pattern target, so the finished item may come out smaller.'
      : stitchDiff < -form.goodTolerance
        ? 'Your stitches are larger and looser than the pattern target, so the finished item may come out bigger.'
        : 'Your stitch gauge is within a sensible tolerance.';

  const recommendation =
    stitchDiff > form.goodTolerance
      ? 'Try a larger needle or hook and swatch again.'
      : stitchDiff < -form.goodTolerance
        ? 'Try a smaller needle or hook and swatch again.'
        : 'Your stitch gauge is close. Keep this needle or hook size unless the fabric feels wrong.';

  const warnings: string[] = [];
  if (Math.abs(stitchDiff) > form.majorTolerance) {
    warnings.push('Major stitch-gauge mismatch. Do not start the full project until you swatch again.');
  }
  if (hasRows && Math.abs(rowDiff) > form.noticeableTolerance) {
    warnings.push('Row or round gauge is noticeably different. Length shaping may need closer checking.');
  }
  if (!hasRows) {
    warnings.push('Row or round gauge was not calculated because row values are missing.');
  }

  const stats: GaugeResult['stats'] = [
    { label: 'Target stitch gauge', value: `${round(targetStitchGauge, 2)} sts / 10 cm` },
    { label: 'Your stitch gauge', value: `${round(actualStitchGauge, 2)} sts / 10 cm` },
    { label: 'Stitch difference', value: `${round(stitchDiff)}%` },
  ];

  if (hasRows) {
    stats.push(
      { label: 'Target row gauge', value: `${round(targetRowGauge, 2)} rows / 10 cm` },
      { label: 'Your row gauge', value: `${round(actualRowGauge, 2)} rows / 10 cm` },
      { label: 'Row difference', value: `${round(rowDiff)}%` },
    );
  }

  if (form.patternStitchCount > 0) {
    const targetWidth = (form.patternStitchCount / targetStitchGauge) * 10;
    const actualWidth = (form.patternStitchCount / actualStitchGauge) * 10;
    stats.push({
      label: 'Estimated width change',
      value: `${round(actualWidth - targetWidth)} cm`,
    });
  }

  if (hasRows && form.patternRowCount > 0) {
    const targetLength = (form.patternRowCount / targetRowGauge) * 10;
    const actualLength = (form.patternRowCount / actualRowGauge) * 10;
    stats.push({
      label: 'Estimated length change',
      value: `${round(actualLength - targetLength)} cm`,
    });
  }

  return {
    kind: 'stitch_row',
    status,
    summary,
    recommendation,
    warnings,
    stats,
  };
}
