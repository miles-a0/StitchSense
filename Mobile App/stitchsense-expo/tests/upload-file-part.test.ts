import assert from 'node:assert/strict';
import test from 'node:test';

import { uploadFilePart } from '../src/lib/upload-file-part';

test('upload part keeps the picked filename and type and reads bytes only when sent', async () => {
  const reads: string[] = [];
  const part = uploadFilePart(
    { uri: 'file:///cache/DocumentPicker/abc.pdf', name: 'Callisto Hat.pdf', mimeType: 'application/pdf' },
    'application/octet-stream',
    async (uri) => {
      reads.push(uri);
      return new Uint8Array([37, 80, 68, 70]);
    },
  );

  assert.equal(part.name, 'Callisto Hat.pdf');
  assert.equal(part.type, 'application/pdf');
  assert.deepEqual(reads, []);
  assert.deepEqual(await part.bytes(), new Uint8Array([37, 80, 68, 70]));
  assert.deepEqual(reads, ['file:///cache/DocumentPicker/abc.pdf']);
});

test('upload part falls back to the given type when the picker reports none', () => {
  const readBytes = async () => new Uint8Array();
  assert.equal(uploadFilePart({ uri: 'file:///a.jpg', name: 'a.jpg', mimeType: null }, 'image/jpeg', readBytes).type, 'image/jpeg');
  assert.equal(uploadFilePart({ uri: 'file:///a.jpg', name: 'a.jpg', mimeType: '' }, 'image/jpeg', readBytes).type, 'image/jpeg');
});

test('upload part is accepted by the Expo fetch multipart encoder', async () => {
  // Same checks Expo's convertFormDataAsync makes before reading a part.
  const part = uploadFilePart({ uri: 'file:///a.pdf', name: 'a.pdf' }, 'application/pdf', async () => new Uint8Array([1]));
  assert.equal(typeof part, 'object');
  assert.ok('bytes' in part);
  assert.equal(typeof part.name, 'string');
  assert.equal(typeof part.type, 'string');
});
