import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { stitchSenseAPI } from '@/src/lib/api';
import type { UserSettings } from '@/src/lib/models';
import { useSession } from '@/src/providers/session-provider';

const defaultSettings: UserSettings = {
  defaultSkill: 'beginner',
  measurementUnit: 'metric',
  language: 'uk',
  preferences: {},
};

type PreferencesContextValue = {
  settings: UserSettings;
  isLoading: boolean;
  saveSettings: (settings: UserSettings) => Promise<void>;
  refreshSettings: () => Promise<void>;
};

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

function normalizeSettings(response: Awaited<ReturnType<typeof stitchSenseAPI.userSettings>>): UserSettings {
  return {
    defaultSkill: response.settings.default_skill ?? defaultSettings.defaultSkill,
    measurementUnit: response.settings.measurement_unit ?? defaultSettings.measurementUnit,
    language: response.settings.language ?? defaultSettings.language,
    preferences: response.settings.preferences ?? {},
  };
}

export function PreferencesProvider({ children }: React.PropsWithChildren) {
  const { accessToken } = useSession();
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(false);

  const refreshSettings = useCallback(async () => {
    if (!accessToken) {
      setSettings(defaultSettings);
      return;
    }

    setIsLoading(true);
    try {
      const response = await stitchSenseAPI.userSettings(accessToken);
      setSettings(normalizeSettings(response));
    } catch {
      setSettings((current) => current ?? defaultSettings);
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  const saveSettings = useCallback(
    async (nextSettings: UserSettings) => {
      setSettings(nextSettings);
      if (!accessToken) {
        return;
      }

      const response = await stitchSenseAPI.saveUserSettings(accessToken, nextSettings);
      setSettings(normalizeSettings(response));
    },
    [accessToken],
  );

  useEffect(() => {
    void refreshSettings();
  }, [refreshSettings]);

  const value = useMemo(
    () => ({
      settings,
      isLoading,
      saveSettings,
      refreshSettings,
    }),
    [isLoading, refreshSettings, saveSettings, settings],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  const context = useContext(PreferencesContext);
  if (!context) {
    throw new Error('usePreferences must be used inside PreferencesProvider');
  }
  return context;
}
