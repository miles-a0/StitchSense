import type { Pattern } from './models';

export type ChatUploadOverlayPhase = 'selecting' | 'uploading' | 'processing' | 'error';

export type ChatUploadFile = {
  uri: string;
  name: string;
  mimeType?: string | null;
};

export type ChatUploadedDocumentContext = {
  name: string;
  kind: 'document';
  mimeType?: string | null;
  analysis: string;
  patternId: string;
  introMessage: string;
};

export type ChatUploadApi = {
  createPattern: (
    token: string,
    body: {
      title: string;
      craftType?: string | null;
      originalFilename?: string | null;
      source?: string;
      metadata?: Record<string, unknown>;
    },
  ) => Promise<Pattern>;
  uploadPatternFile: (
    id: string,
    token: string,
    file: ChatUploadFile,
  ) => Promise<{
    indexed?: boolean;
    indexingError?: string | null;
  }>;
  refreshPatternSummary: (
    id: string,
    token: string,
    skillLevel: string,
  ) => Promise<{ pattern: Pattern }>;
  pattern: (id: string, token: string) => Promise<Pattern>;
  deletePattern: (id: string, token: string) => Promise<unknown>;
};

export type ChatDocumentUploadFlowInput = {
  accessToken: string | null;
  asset: ChatUploadFile;
  skillLevel: string;
};

export type ChatDocumentUploadFlowDependencies = {
  api: ChatUploadApi;
  onOverlayPhase?: (phase: ChatUploadOverlayPhase) => void;
  onOverlayMessage?: (message: string) => void;
  onStatus?: (message: string) => void;
};

export function stripChatUploadFileExtension(filename: string) {
  return filename.replace(/\.[^/.]+$/, '');
}

function firstUsefulSentences(text: string, maxLength = 280) {
  const normalized = cleanChatPatternSummaryText(text).replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  const sentences = normalized.match(/[^.!?]+[.!?]+/g) ?? [normalized];
  const picked = sentences.slice(0, 2).join(' ').trim();
  return picked.length > maxLength ? `${picked.slice(0, maxLength - 1).trimEnd()}...` : picked;
}

function looksLikeEncodedJunk(value: string) {
  const compact = value.replace(/\s+/g, '');
  if (compact.length < 24) return false;
  const alphaNumericRatio = (compact.match(/[a-zA-Z0-9+/=]/g)?.length ?? 0) / compact.length;
  const vowelRatio = (compact.match(/[aeiouAEIOU]/g)?.length ?? 0) / compact.length;
  const wordCount = value.match(/\b(?:yarn|needle|hook|gauge|size|row|round|stitch|knit|purl|chain|double|crochet|mm|grams?|metres?)\b/gi)?.length ?? 0;
  return alphaNumericRatio > 0.94 && vowelRatio < 0.22 && wordCount < 2;
}

export function cleanChatPatternSummaryText(value: string) {
  return value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line && !looksLikeEncodedJunk(line))
    .join('\n')
    .trim();
}

function cleanFact(value: string) {
  const cleaned = cleanChatPatternSummaryText(value)
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[•*-]\s*$/, '');
  if (!cleaned || looksLikeEncodedJunk(cleaned)) return '';
  return cleaned.length > 140 ? `${cleaned.slice(0, 139).trimEnd()}...` : cleaned;
}

function matchFact(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = cleanFact(String(match?.[1] ?? match?.[2] ?? ''));
    if (value) return value;
  }
  return '';
}

export function buildChatPatternLoadedSummary(pattern: Pattern, fallbackName: string) {
  const title = pattern.title || fallbackName;
  const summary = cleanChatPatternSummaryText(pattern.patternSummaryText ?? '');
  const metadataText = pattern.metadata ? JSON.stringify(pattern.metadata) : '';
  const searchable = `${summary}\n${metadataText}`;
  const nutshell = firstUsefulSentences(summary) || 'I have loaded this pattern and will use it as the context for this chat.';
  const difficulty =
    matchFact(searchable, [
      /difficulty(?:\s+level)?[:\s-]+([^.\n,;]+)/i,
      /\b(beginner|easy|intermediate|advanced|experienced)\b/i,
    ]) || 'I will keep the guidance clear and beginner-friendly unless you ask for more detail.';
  const trickyBits =
    matchFact(searchable, [
      /(?:tricky|watch out|challenge|special techniques?)[:\s-]+([^.\n]+)/i,
      /\b((?:cables?|lace|short rows?|colourwork|shaping|seaming|grafting|picking up stitches)[^.\n]*)/i,
    ]) || 'If any part feels fiddly, StitchSense can talk you through it slowly, one step at a time.';
  const yarn =
    matchFact(searchable, [
      /(?:yarn|recommended yarn|yarn type|yarn weight)[:\s-]+([^.\n]+)/i,
      /\b(4 ply|sock|dk|double knit|aran|worsted|chunky|bulky|lace weight|fingering)[^.\n]*/i,
    ]) || 'Check the yarn details in the pattern before starting.';
  const amount =
    matchFact(searchable, [
      /(?:yardage|meterage|metres|grams|quantity|amount)[:\s-]+([^.\n]+)/i,
      /(\d+(?:\.\d+)?\s?(?:g|grams|m|metres|yds|yards|skeins?|balls?)[^.\n]*)/i,
    ]) || 'I can help calculate quantities once you choose a size.';
  const tools =
    matchFact(searchable, [
      /(?:needles?|hooks?|needle size|hook size)[:\s-]+([^.\n]+)/i,
      /(\d+(?:\.\d+)?\s?mm(?:\s+(?:needles?|hooks?))?[^.\n]*)/i,
    ]) || 'Check the needle or hook size against your gauge.';
  const sizes = matchFact(searchable, [
    /(?:sizes?|size options?|to fit|finished measurements?)[:\s-]+([^.\n]+)/i,
  ]);
  const oneSizeDetected = /\b(one size|one-size|one size fits|osfa)\b/i.test(searchable);

  return [
    `Pattern loaded: ${title}`,
    '',
    `In a nutshell: ${nutshell}`,
    '',
    `Difficulty: ${difficulty}.`,
    `Tricky bits: ${trickyBits} I’ll help you through those bits calmly when you get there.`,
    '',
    'Important bits:',
    `- Yarn: ${yarn}`,
    `- Amount: ${amount}`,
    `- Needles/hooks: ${tools}`,
    oneSizeDetected
      ? '- Size options: One size. I will answer using the pattern as written unless you tell me otherwise.'
      : sizes
      ? `- Size options: ${sizes}\n\nWhich size would you like to make? Once I know that, I can answer using the right stitch counts, measurements, and sections.`
      : '- Size options: No clear size options found. I will treat this as one-size unless the pattern text says otherwise.',
  ].join('\n');
}

export async function uploadChatDocumentContext(
  input: ChatDocumentUploadFlowInput,
  dependencies: ChatDocumentUploadFlowDependencies,
): Promise<ChatUploadedDocumentContext> {
  const { accessToken, asset, skillLevel } = input;
  if (!accessToken) {
    throw new Error('Your session has expired. Please sign in again.');
  }

  let createdPatternId: string | null = null;
  try {
    const title = stripChatUploadFileExtension(asset.name) || 'Uploaded chat pattern';
    dependencies.onOverlayPhase?.('uploading');
    dependencies.onOverlayMessage?.('Creating a private chat context for this pattern...');
    dependencies.onStatus?.('Reading pattern into chat context...');
    const createdPattern = await dependencies.api.createPattern(accessToken, {
      title,
      craftType: null,
      originalFilename: asset.name,
      source: 'chat_upload',
      metadata: {
        uploadedFrom: 'expo-mobile-chat',
        localFilename: asset.name,
      },
    });
    createdPatternId = createdPattern.id;

    dependencies.onOverlayPhase?.('uploading');
    dependencies.onOverlayMessage?.('Uploading the full pattern file...');
    dependencies.onStatus?.('Uploading pattern for chat...');
    const uploadResult = await dependencies.api.uploadPatternFile(createdPattern.id, accessToken, {
      uri: asset.uri,
      name: asset.name,
      mimeType: asset.mimeType,
    });
    if (!uploadResult.indexed) {
      throw new Error(
        uploadResult.indexingError?.trim() ||
          'The pattern file uploaded, but StitchSense could not finish indexing the full instructions for chat. Please try the upload again.',
      );
    }

    dependencies.onOverlayPhase?.('processing');
    dependencies.onOverlayMessage?.('Processing and indexing the pattern. Larger PDFs can take a little while...');
    dependencies.onStatus?.('Analysing pattern for chat...');
    let analysedPattern = createdPattern;
    try {
      const refreshed = await dependencies.api.refreshPatternSummary(
        createdPattern.id,
        accessToken,
        skillLevel,
      );
      analysedPattern = refreshed.pattern;
    } catch {
      analysedPattern = await dependencies.api.pattern(createdPattern.id, accessToken);
    }

    return {
      name: analysedPattern.title || asset.name,
      kind: 'document',
      mimeType: asset.mimeType,
      patternId: analysedPattern.id,
      introMessage: buildChatPatternLoadedSummary(analysedPattern, asset.name),
      analysis:
        analysedPattern.patternSummaryText?.trim() ||
        'The uploaded pattern is attached to this chat. Use the pattern file and any extracted summary as the only document context.',
    };
  } catch (error) {
    if (createdPatternId) {
      try {
        await dependencies.api.deletePattern(createdPatternId, accessToken);
      } catch {
        // Best-effort cleanup if the chat-context upload failed after creating the private pattern.
      }
    }
    throw error;
  }
}
