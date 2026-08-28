import { PDFParse } from 'pdf-parse';
import { Readable } from 'node:stream';
import { getPatternFile } from './storage.js';

const MAX_DIRECT_PATTERN_TEXT_CHARS = 90000;

type ExtractionSource = 'pdf' | 'text' | 'unsupported';

export type PatternTextExtraction = {
  text: string;
  source: ExtractionSource;
  chars: number;
  truncated: boolean;
};

function isReadableStream(value: unknown): value is Readable {
  return value instanceof Readable || Boolean(value && typeof (value as Readable).pipe === 'function');
}

async function bodyToBuffer(body: unknown): Promise<Buffer> {
  if (!body) return Buffer.alloc(0);

  const transformBody = body as { transformToByteArray?: () => Promise<Uint8Array> };
  if (typeof transformBody.transformToByteArray === 'function') {
    return Buffer.from(await transformBody.transformToByteArray());
  }

  if (Buffer.isBuffer(body)) {
    return body;
  }

  if (body instanceof Uint8Array) {
    return Buffer.from(body);
  }

  if (typeof body === 'string') {
    return Buffer.from(body);
  }

  if (isReadableStream(body)) {
    const chunks: Buffer[] = [];
    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  return Buffer.alloc(0);
}

function looksLikeEncodedJunk(line: string) {
  const compact = line.replace(/\s+/g, '');
  if (compact.length < 48) return false;
  const base64ish = compact.replace(/[A-Za-z0-9+/=_-]/g, '').length === 0;
  const lowVowels = (compact.match(/[aeiou]/gi) ?? []).length / compact.length < 0.12;
  const hasWords = /\b(row|round|cast|knit|purl|stitch|needle|hook|yarn|thumb|finger|cuff|size|gauge)\b/i.test(line);
  return base64ish && lowVowels && !hasWords;
}

function cleanExtractedText(raw: string) {
  const normalized = raw
    .replace(/\r/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]+\n/g, '\n');

  const lines = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !looksLikeEncodedJunk(line));

  return lines
    .join('\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

function isPdf(mimeType?: string | null, filename?: string | null) {
  return mimeType?.toLowerCase().includes('pdf') || filename?.toLowerCase().endsWith('.pdf');
}

function isTextFile(mimeType?: string | null, filename?: string | null) {
  const lowerMime = mimeType?.toLowerCase() ?? '';
  const lowerName = filename?.toLowerCase() ?? '';
  return (
    lowerMime.startsWith('text/') ||
    lowerMime.includes('markdown') ||
    ['.txt', '.md', '.markdown', '.csv'].some((extension) => lowerName.endsWith(extension))
  );
}

export async function extractPatternInstructionText(input: {
  fileKey: string;
  mimeType?: string | null;
  filename?: string | null;
}): Promise<PatternTextExtraction> {
  const file = await getPatternFile(input.fileKey);
  const buffer = await bodyToBuffer(file.body);
  const mimeType = input.mimeType ?? file.contentType;

  let source: ExtractionSource = 'unsupported';
  let rawText = '';

  if (isPdf(mimeType, input.filename)) {
    const parser = new PDFParse({ data: buffer });
    try {
      const parsed = await parser.getText();
      rawText = parsed.text ?? '';
    } finally {
      await parser.destroy();
    }
    source = 'pdf';
  } else if (isTextFile(mimeType, input.filename)) {
    rawText = buffer.toString('utf8');
    source = 'text';
  }

  const cleaned = cleanExtractedText(rawText);
  const truncated = cleaned.length > MAX_DIRECT_PATTERN_TEXT_CHARS;
  const text = truncated ? cleaned.slice(0, MAX_DIRECT_PATTERN_TEXT_CHARS).trimEnd() : cleaned;

  return {
    text,
    source,
    chars: cleaned.length,
    truncated,
  };
}
