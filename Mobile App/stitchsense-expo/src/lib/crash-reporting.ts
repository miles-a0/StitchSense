import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

import { config } from '@/src/lib/config';
import { scrubBreadcrumb, scrubEvent, type ScrubBreadcrumb, type ScrubEvent } from '@/src/lib/crash-report-scrub';

// Reports only from store and preview builds: development and Expo Go stay silent.
const enabled = !__DEV__ && Boolean(config.sentryDsn);

export function initCrashReporting() {
  if (!config.sentryDsn) return;

  Sentry.init({
    dsn: config.sentryDsn,
    enabled,
    environment: __DEV__ ? 'development' : 'production',
    release: Constants.expoConfig?.version ? `stitchsense@${Constants.expoConfig.version}` : undefined,
    sendDefaultPii: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    tracesSampleRate: 0,
    enableAutoSessionTracking: true,
    beforeBreadcrumb: (breadcrumb) =>
      scrubBreadcrumb(breadcrumb as unknown as ScrubBreadcrumb) as unknown as typeof breadcrumb | null,
    beforeSend: (event) => scrubEvent(event as unknown as ScrubEvent) as unknown as typeof event,
  });
}

// Internal user ID only, so a support report can be matched to a crash.
export function setCrashReportingUser(userId: string | null) {
  if (!config.sentryDsn) return;
  Sentry.setUser(userId ? { id: userId } : null);
}

export const wrapWithCrashReporting = Sentry.wrap;
