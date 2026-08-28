import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { getPatternFile } from './storage.js';

const execFileAsync = promisify(execFile);

async function streamToBuffer(body: unknown): Promise<Buffer> {
  if (Buffer.isBuffer(body)) {
    return body;
  }

  if (body && typeof body === 'object' && 'transformToByteArray' in body) {
    const bytes = await (body as { transformToByteArray(): Promise<Uint8Array> }).transformToByteArray();
    return Buffer.from(bytes);
  }

  if (body && typeof body === 'object' && 'arrayBuffer' in body) {
    const buffer = await (body as { arrayBuffer(): Promise<ArrayBuffer> }).arrayBuffer();
    return Buffer.from(buffer);
  }

  if (body && typeof body === 'object' && Symbol.asyncIterator in body) {
    const chunks: Buffer[] = [];
    for await (const chunk of body as AsyncIterable<Uint8Array | Buffer | string>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  throw new Error('Could not read the stored PDF file.');
}

async function pdfBufferFromSource(input: { fileKey?: string | null; fileUrl?: string | null }) {
  if (input.fileKey) {
    const file = await getPatternFile(input.fileKey);
    return streamToBuffer(file.body);
  }

  if (input.fileUrl) {
    const response = await fetch(input.fileUrl);
    if (!response.ok) {
      throw new Error(`Could not fetch PDF source (HTTP ${response.status}).`);
    }
    const buffer = await response.arrayBuffer();
    return Buffer.from(buffer);
  }

  throw new Error('No PDF source is linked to this pattern.');
}

export async function renderPatternThumbnail(input: {
  fileKey?: string | null;
  fileUrl?: string | null;
}): Promise<Buffer> {
  const pdfBuffer = await pdfBufferFromSource(input);
  const tempDir = await fs.mkdtemp(join(tmpdir(), 'stitchsense-thumb-'));
  const pdfPath = join(tempDir, 'pattern.pdf');
  const outputPrefix = join(tempDir, 'thumb');
  const outputPath = `${outputPrefix}.jpg`;

  try {
    await fs.writeFile(pdfPath, pdfBuffer);
    await execFileAsync('pdftoppm', ['-jpeg', '-jpegopt', 'quality=72', '-f', '1', '-singlefile', '-scale-to', '384', pdfPath, outputPrefix], {
      timeout: 30_000,
    });
    return await fs.readFile(outputPath);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

export async function renderPatternThumbnailDataUri(input: {
  fileKey?: string | null;
  fileUrl?: string | null;
}): Promise<string> {
  const thumbnail = await renderPatternThumbnail(input);
  return `data:image/jpeg;base64,${thumbnail.toString('base64')}`;
}
