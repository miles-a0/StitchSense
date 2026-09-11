import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DELETE_ACCOUNT_CONFIRMATION,
  DELETE_SYNCED_DATA_CONFIRMATION,
  destructiveAccountActionPrompt,
} from '../src/lib/destructive-actions';

test('synced-data deletion prompt uses the backend confirmation token and explicit warning copy', () => {
  const prompt = destructiveAccountActionPrompt('delete_synced_data');

  assert.equal(prompt.confirmationToken, DELETE_SYNCED_DATA_CONFIRMATION);
  assert.equal(prompt.confirmationToken, 'DELETE');
  assert.equal(prompt.title, 'Delete synced mobile data?');
  assert.equal(prompt.confirmLabel, 'Delete');
  assert.match(prompt.message, /removes synced chats, rewrites, and saved platform settings/i);
});

test('account deletion prompt uses the irreversible account confirmation token and store billing warning', () => {
  const prompt = destructiveAccountActionPrompt('delete_account');

  assert.equal(prompt.confirmationToken, DELETE_ACCOUNT_CONFIRMATION);
  assert.equal(prompt.confirmationToken, 'DELETE_ACCOUNT');
  assert.equal(prompt.title, 'Delete your StitchSense account?');
  assert.equal(prompt.confirmLabel, 'Delete account');
  assert.match(prompt.message, /permanently removes your StitchSense account/i);
  assert.match(prompt.message, /App Store or Google Play subscriptions/i);
});
