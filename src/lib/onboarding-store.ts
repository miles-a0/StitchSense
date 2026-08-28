import { deleteStoredItem, getStoredItem, setStoredItem } from './secure-storage';

const ONBOARDING_COMPLETE_KEY = 'stitchsense-onboarding-complete';
const ONBOARDING_PENDING_KEY = 'stitchsense-onboarding-pending';

export async function loadOnboardingComplete() {
  const value = await getStoredItem(ONBOARDING_COMPLETE_KEY);
  return value === 'true';
}

export async function saveOnboardingComplete(value: boolean) {
  if (value) {
    await setStoredItem(ONBOARDING_COMPLETE_KEY, 'true');
    return;
  }

  await deleteStoredItem(ONBOARDING_COMPLETE_KEY);
}

export async function loadOnboardingPending() {
  const value = await getStoredItem(ONBOARDING_PENDING_KEY);
  return value === 'true';
}

export async function saveOnboardingPending(value: boolean) {
  if (value) {
    await setStoredItem(ONBOARDING_PENDING_KEY, 'true');
    return;
  }

  await deleteStoredItem(ONBOARDING_PENDING_KEY);
}
