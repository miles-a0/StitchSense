type PatternMetadata = Record<string, unknown>;

const MISSING_PATTERN_MESSAGE =
  'Please purchase the pattern and re-import it before I can answer questions or rewrite it.';
const ENGLISH_ONLY_INSTRUCTION =
  'Reply in English only. If the source pattern, notes, or extracted text are in another language, translate the relevant content into clear English before answering.';

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function readBoolean(value: unknown) {
  return value === true;
}

export function buildScopedWorkflowUserId(userId: string, patternId?: string | null, sessionId?: string | null) {
  if (!patternId) {
    return userId;
  }

  const scope = ['pattern', userId, patternId];
  if (sessionId) {
    scope.push(sessionId);
  }
  return scope.join(':');
}

export function patternNeedsOwnedSource(params: {
  source?: string | null;
  fileUrl?: string | null;
  fileKey?: string | null;
  fileId?: string | null;
  jobId?: string | null;
  metadata?: PatternMetadata | null;
}) {
  const source = readString(params.source).toLowerCase();
  if (source !== 'ravelry') {
    return false;
  }

  const metadata = params.metadata ?? {};
  const availability = readString(metadata.ravelry_availability).toLowerCase();
  const isFree = readBoolean(metadata.ravelry_is_free);
  const storedPdfUrl = readString(metadata.stored_pdf_url);
  const pdfUrl = readString(metadata.pdf_url);
  const fileUrl = readString(params.fileUrl);
  const fileKey = readString(params.fileKey);
  const fileId = readString(params.fileId);
  const jobId = readString(params.jobId);

  const hasStoredPatternFile = Boolean(storedPdfUrl || fileUrl || fileKey || fileId || jobId);
  const looksPaidOrMissing =
    availability === 'paid' ||
    availability === 'purchase_required' ||
    availability === 'unknown' ||
    (!isFree && Boolean(pdfUrl));

  return looksPaidOrMissing && !hasStoredPatternFile;
}

export function buildOwnedSourceRequiredResponse() {
  return {
    answer: MISSING_PATTERN_MESSAGE,
    success: true,
    source_required: true,
  };
}

export function ownedSourceRequiredMessage() {
  return MISSING_PATTERN_MESSAGE;
}

export function selectedPatternUnavailableMessage() {
  return 'The selected pattern content is not available yet. Please re-upload or re-import this exact pattern before chatting or rewriting it.';
}

export function patternHasScopedContent(params: {
  fileUrl?: string | null;
  fileKey?: string | null;
  fileId?: string | null;
  jobId?: string | null;
  patternSummaryText?: string | null;
  patternSummaryHtml?: string | null;
  patternSummaryStructured?: Record<string, unknown> | null;
  metadata?: PatternMetadata | null;
}) {
  const fileUrl = readString(params.fileUrl);
  const fileKey = readString(params.fileKey);
  const fileId = readString(params.fileId);
  const jobId = readString(params.jobId);
  const patternSummaryText = readString(params.patternSummaryText);
  const patternSummaryHtml = readString(params.patternSummaryHtml);
  const patternSummaryStructured = params.patternSummaryStructured ?? null;
  const metadata = params.metadata ?? {};
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
      (patternSummaryStructured && Object.keys(patternSummaryStructured).length > 0),
  );
}

export function englishOnlyInstruction() {
  return ENGLISH_ONLY_INSTRUCTION;
}

export function buildEnglishWorkflowPrompt(userText: string) {
  const trimmed = userText.trim();
  if (!trimmed) {
    return ENGLISH_ONLY_INSTRUCTION;
  }

  return `${ENGLISH_ONLY_INSTRUCTION}\n\nUser request: ${trimmed}`;
}
