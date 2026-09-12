export const DELETE_SYNCED_DATA_CONFIRMATION = 'DELETE';
export const DELETE_ACCOUNT_CONFIRMATION = 'DELETE_ACCOUNT';

export type DestructiveAccountAction = 'delete_synced_data' | 'delete_account';
export type DestructiveResourceAction = 'delete_pattern' | 'delete_project';

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
  const title = resourceTitle.trim() || (action === 'delete_pattern' ? 'this pattern' : 'this project');

  if (action === 'delete_pattern') {
    return {
      title: 'Delete pattern?',
      message: `${title} and its saved pattern chats will be permanently removed. Projects made from it are kept.`,
      confirmLabel: 'Delete',
    };
  }

  return {
    title: 'Delete project?',
    message: `${title} will be permanently removed. Its linked pattern stays in your Library.`,
    confirmLabel: 'Delete',
  };
}
