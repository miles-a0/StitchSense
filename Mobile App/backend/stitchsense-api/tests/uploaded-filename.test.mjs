import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NODE_ENV = 'test';

const { uploadedFilename } = await import('../dist/services/storage.js');

test('percent-encoded upload filenames from the Expo app are decoded', () => {
  assert.equal(uploadedFilename('Catlow%20Yarns%20DK%20Tank.pdf', 'pattern.pdf'), 'Catlow Yarns DK Tank.pdf');
  assert.equal(uploadedFilename('Caf%C3%A9%20Hat.pdf', 'pattern.pdf'), 'Café Hat.pdf');
});

test('plain and missing filenames are left alone or fall back', () => {
  assert.equal(uploadedFilename('Plain Hat.pdf', 'pattern.pdf'), 'Plain Hat.pdf');
  assert.equal(uploadedFilename('100% wool.pdf', 'pattern.pdf'), '100% wool.pdf');
  assert.equal(uploadedFilename(undefined, 'pattern.pdf'), 'pattern.pdf');
  assert.equal(uploadedFilename('', 'stash-photo.jpg'), 'stash-photo.jpg');
});

test('decoded filenames cannot introduce path separators or control characters', () => {
  assert.equal(uploadedFilename('..%2F..%2Fsecret.pdf', 'pattern.pdf'), '.._.._secret.pdf');
  assert.equal(uploadedFilename('a%0Ab.pdf', 'pattern.pdf'), 'a_b.pdf');
  assert.equal(uploadedFilename('bad%E0%A4%A.pdf', 'pattern.pdf'), 'bad%E0%A4%A.pdf');
});
