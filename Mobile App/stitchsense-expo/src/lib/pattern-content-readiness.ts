import type { Pattern } from './models';

type ReadinessPattern = Partial<Pick<
  Pattern,
  | 'fileUrl'
  | 'fileKey'
  | 'fileId'
  | 'jobId'
  | 'patternSummaryText'
  | 'patternSummaryHtml'
  | 'patternSummaryStructured'
  | 'metadata'
>> & {
  source?: string | null;
};

export function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function readBoolean(value: unknown): boolean {
  return value === true;
}

export function hasStructuredSummary(value: unknown): boolean {
  return Boolean(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.keys(value).length > 0,
  );
}

export function patternNeedsOwnedSource(pattern: ReadinessPattern | null | undefined): boolean {
  if (!pattern) return false;

  const source = readString(pattern.source).toLowerCase();
  if (source !== 'ravelry') {
    return false;
  }

  const metadata = pattern.metadata || {};
  const availability = readString(metadata.ravelry_availability).toLowerCase();
  const isFree = readBoolean(metadata.ravelry_is_free);
  const storedPdfUrl = readString(metadata.stored_pdf_url);
  const pdfUrl = readString(metadata.pdf_url);
  const fileUrl = readString(pattern.fileUrl);
  const fileKey = readString(pattern.fileKey);
  const fileId = readString(pattern.fileId);
  const jobId = readString(pattern.jobId);

  const hasStoredPatternFile = Boolean(storedPdfUrl || fileUrl || fileKey || fileId || jobId);
  const looksPaidOrMissing =
    availability === 'paid' ||
    availability === 'purchase_required' ||
    availability === 'unknown' ||
    (!isFree && Boolean(pdfUrl));

  return looksPaidOrMissing && !hasStoredPatternFile;
}

export function patternHasScopedContent(pattern: ReadinessPattern | null | undefined): boolean {
  if (!pattern) return false;

  const fileUrl = readString(pattern.fileUrl);
  const fileKey = readString(pattern.fileKey);
  const fileId = readString(pattern.fileId);
  const jobId = readString(pattern.jobId);
  const patternSummaryText = readString(pattern.patternSummaryText);
  const patternSummaryHtml = readString(pattern.patternSummaryHtml);
  const patternSummaryStructured = pattern.patternSummaryStructured;
  const metadata = pattern.metadata || {};
  const storedPdfUrl = readString(metadata.stored_pdf_url);
  const extractedText = readString(metadata.extracted_text);
  const summaryExcerpt = readString(metadata.summary_excerpt);

  return Boolean(
    fileUrl ||
      fileKey ||
      fileId ||
      jobId ||
      storedPdfUrl ||
      extractedText ||
      summaryExcerpt ||
      patternSummaryText ||
      patternSummaryHtml ||
      hasStructuredSummary(patternSummaryStructured),
  );
}
