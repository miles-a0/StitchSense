export const DELETE_SYNCED_DATA_CONFIRMATION = 'DELETE';
export const DELETE_ACCOUNT_CONFIRMATION = 'DELETE_ACCOUNT';

export type DestructiveAccountAction = 'delete_synced_data' | 'delete_account';
export type DestructiveResourceAction =
  | 'delete_pattern'
  | 'delete_project'
  | 'delete_stash_item'
  | 'delete_project_counter'
  | 'delete_work_log_entry'
  | 'delete_project_photo'
  | 'delete_project_marker'
  | 'clear_reading_position';

export type DestructiveActionPrompt = {
  title: string;
  message: string;
  confirmLabel: string;
  confirmationToken?: string;
};

const prompts: Record<DestructiveAccountAction, DestructiveActionPrompt> = {
  delete_synced_data: {
    title: 'Delete synced mobile data?',
    message: 'This removes synced chats, rewrites, and saved platform settings for this account.',
    confirmLabel: 'Delete',
    confirmationToken: DELETE_SYNCED_DATA_CONFIRMATION,
  },
  delete_account: {
    title: 'Delete your StitchSense account?',
    message:
      'This permanently removes your StitchSense account and synced mobile data. App Store or Google Play subscriptions must still be managed in your store account.',
    confirmLabel: 'Delete account',
    confirmationToken: DELETE_ACCOUNT_CONFIRMATION,
  },
};

export function destructiveAccountActionPrompt(action: DestructiveAccountAction) {
  return prompts[action];
}

export function destructiveResourceActionPrompt(
  action: DestructiveResourceAction,
  resourceTitle: string,
): DestructiveActionPrompt {
  const title = resourceTitle.trim();

  switch (action) {
    case 'delete_pattern':
      return {
        title: 'Delete pattern?',
        message: `${title || 'this pattern'} and its saved pattern chats will be permanently removed. Projects made from it are kept.`,
        confirmLabel: 'Delete',
      };
    case 'delete_project':
      return {
        title: 'Delete project?',
        message: `${title || 'this project'} will be permanently removed. Its linked pattern stays in your Library.`,
        confirmLabel: 'Delete',
      };
    case 'delete_stash_item':
      return {
        title: 'Delete stash item?',
        message: `Remove ${title || 'this stash item'} from your stash?`,
        confirmLabel: 'Delete',
      };
    case 'delete_project_counter':
      return {
        title: 'Delete counter?',
        message: `Remove ${title || 'this counter'} from this project?`,
        confirmLabel: 'Delete',
      };
    case 'delete_work_log_entry':
      return {
        title: 'Delete work log entry?',
        message: `Remove ${title || 'this entry'} from this project history?`,
        confirmLabel: 'Delete',
      };
    case 'delete_project_photo':
      return {
        title: 'Delete photo?',
        message: 'Remove this progress photo from the project timeline?',
        confirmLabel: 'Delete',
      };
    case 'clear_reading_position':
      return {
        title: 'Clear reading position?',
        message: 'Remove the saved reading position from this project?',
        confirmLabel: 'Delete',
      };
    case 'delete_project_marker':
      return {
        title: 'Delete bookmark?',
        message: `Remove ${title || 'this bookmark'} from this project?`,
        confirmLabel: 'Delete',
      };
  }
}
