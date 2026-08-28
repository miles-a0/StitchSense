import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';

import { loadOnboardingComplete, loadOnboardingPending } from '@/src/lib/onboarding-store';
import { useSession } from '@/src/providers/session-provider';

export default function IndexScreen() {
  const { isReady, accessToken } = useSession();
  const [isCheckingOnboarding, setIsCheckingOnboarding] = useState(true);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);
  const [hasPendingOnboarding, setHasPendingOnboarding] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function load() {
      const [completed, pending] = await Promise.all([
        loadOnboardingComplete(),
        loadOnboardingPending(),
      ]);
      if (!mounted) return;
      setHasCompletedOnboarding(completed);
      setHasPendingOnboarding(pending);
      setIsCheckingOnboarding(false);
    }

    void load();

    return () => {
      mounted = false;
    };
  }, []);

  if (!isReady || isCheckingOnboarding) {
    return null;
  }

  if (hasPendingOnboarding || !hasCompletedOnboarding) {
    return <Redirect href="/onboarding" />;
  }

  return <Redirect href={accessToken ? '/(tabs)/dashboard' : '/sign-in'} />;
}
