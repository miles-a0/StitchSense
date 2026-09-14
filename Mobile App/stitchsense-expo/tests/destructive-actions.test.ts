import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DELETE_ACCOUNT_CONFIRMATION,
  DELETE_SYNCED_DATA_CONFIRMATION,
  destructiveAccountActionPrompt,
  destructiveResourceActionPrompt,
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

test('pattern deletion prompt warns that chats are removed while projects are kept', () => {
  const prompt = destructiveResourceActionPrompt('delete_pattern', 'Cardigan notes');

  assert.equal(prompt.confirmationToken, undefined);
  assert.equal(prompt.title, 'Delete pattern?');
  assert.equal(prompt.confirmLabel, 'Delete');
  assert.match(prompt.message, /Cardigan notes/);
  assert.match(prompt.message, /saved pattern chats will be permanently removed/i);
  assert.match(prompt.message, /Projects made from it are kept/i);
});

test('project deletion prompt warns that only the project is removed', () => {
  const prompt = destructiveResourceActionPrompt('delete_project', 'Winter jumper');

  assert.equal(prompt.confirmationToken, undefined);
  assert.equal(prompt.title, 'Delete project?');
  assert.equal(prompt.confirmLabel, 'Delete');
  assert.match(prompt.message, /Winter jumper/);
  assert.match(prompt.message, /permanently removed/i);
  assert.match(prompt.message, /linked pattern stays in your Library/i);
});

test('resource deletion prompts keep safe fallback names for blank titles', () => {
  assert.match(
    destructiveResourceActionPrompt('delete_pattern', '  ').message,
    /^this pattern and its saved pattern chats/i,
  );
  assert.match(
    destructiveResourceActionPrompt('delete_project', '').message,
    /^this project will be permanently removed/i,
  );
});

test('stash and project sub-item deletion prompts preserve item-specific warnings', () => {
  assert.deepEqual(
    destructiveResourceActionPrompt('delete_stash_item', 'Merino DK'),
    {
      title: 'Delete stash item?',
      message: 'Remove Merino DK from your stash?',
      confirmLabel: 'Delete',
    },
  );

  assert.deepEqual(
    destructiveResourceActionPrompt('delete_project_counter', 'Sleeve rows'),
    {
      title: 'Delete counter?',
      message: 'Remove Sleeve rows from this project?',
      confirmLabel: 'Delete',
    },
  );

  assert.deepEqual(
    destructiveResourceActionPrompt('delete_work_log_entry', 'First fitting'),
    {
      title: 'Delete work log entry?',
      message: 'Remove First fitting from this project history?',
      confirmLabel: 'Delete',
    },
  );
});

test('project photo and marker deletion prompts distinguish timeline, bookmark, and resume state', () => {
  assert.deepEqual(
    destructiveResourceActionPrompt('delete_project_photo', ''),
    {
      title: 'Delete photo?',
      message: 'Remove this progress photo from the project timeline?',
      confirmLabel: 'Delete',
    },
  );

  assert.deepEqual(
    destructiveResourceActionPrompt('delete_project_marker', 'Page 12'),
    {
      title: 'Delete bookmark?',
      message: 'Remove Page 12 from this project?',
      confirmLabel: 'Delete',
    },
  );

  assert.deepEqual(
    destructiveResourceActionPrompt('clear_reading_position', 'ignored'),
    {
      title: 'Clear reading position?',
      message: 'Remove the saved reading position from this project?',
      confirmLabel: 'Delete',
    },
  );
});

test('lower-level deletion prompts keep safe fallback names for blank labels', () => {
  assert.match(
    destructiveResourceActionPrompt('delete_stash_item', '').message,
    /this stash item/,
  );
  assert.match(
    destructiveResourceActionPrompt('delete_project_counter', '  ').message,
    /this counter/,
  );
  assert.match(
    destructiveResourceActionPrompt('delete_work_log_entry', '').message,
    /this entry/,
  );
  assert.match(
    destructiveResourceActionPrompt('delete_project_marker', '').message,
    /this bookmark/,
  );
});
