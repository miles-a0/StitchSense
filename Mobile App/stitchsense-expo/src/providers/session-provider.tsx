import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { APIError, stitchSenseAPI } from '@/src/lib/api';
import { getUserFacingErrorMessage } from '@/src/lib/errors';
import { saveOnboardingPending } from '@/src/lib/onboarding-store';
import { configureRevenueCat, hasRevenueCatApiKey, revenueCatLogOut, usesRevenueCatStoreBilling } from '@/src/lib/revenuecat';
import { clearTokens, loadTokens, saveTokens } from '@/src/lib/token-store';
import type { Entitlement, User } from '@/src/lib/models';

type SessionContextValue = {
  user: User | null;
  entitlement: Entitlement | null;
  accessToken: string | null;
  isReady: boolean;
  isLoading: boolean;
  errorMessage: string | null;
  signIn: (identifier: string, password: string) => Promise<void>;
  signUp: (body: {
    email: string;
    username: string;
    password: string;
    displayName?: string;
  }) => Promise<void>;
  signOut: () => Promise<void>;
  refreshAccount: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: React.PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isFallbackAuthError = useCallback((error: unknown) => {
    return error instanceof APIError && [400, 401, 404, 500, 502, 503].includes(error.statusCode);
  }, []);

  const isBridgeUnavailableError = useCallback((error: unknown) => {
    return error instanceof APIError && [500, 502, 503].includes(error.statusCode);
  }, []);

  const applyAuth = useCallback(async (response: {
    user: User;
    accessToken: string;
    refreshToken: string;
  }) => {
    setUser(response.user);
    setAccessToken(response.accessToken);
    setRefreshToken(response.refreshToken);
    await saveTokens(response.accessToken, response.refreshToken);
    if (usesRevenueCatStoreBilling() && hasRevenueCatApiKey()) {
      await configureRevenueCat(response.user.id);
    }
    const entitlementResponse = await stitchSenseAPI.entitlement(response.accessToken);
    setEntitlement(entitlementResponse.entitlement);
  }, []);

  const signOut = useCallback(async () => {
    setUser(null);
    setEntitlement(null);
    setAccessToken(null);
    setRefreshToken(null);
    setErrorMessage(null);
    await revenueCatLogOut();
    await clearTokens();
  }, []);

  const refreshAccount = useCallback(async () => {
    let activeToken = accessToken;

    if (!activeToken && refreshToken) {
      try {
        const refreshResponse = await stitchSenseAPI.refresh(refreshToken);
        activeToken = refreshResponse.accessToken;
        setAccessToken(refreshResponse.accessToken);
        setRefreshToken(refreshResponse.refreshToken);
        setUser(refreshResponse.user);
        await saveTokens(refreshResponse.accessToken, refreshResponse.refreshToken);
      } catch {
        await signOut();
        return;
      }
    }

    if (!activeToken) {
      return;
    }

    try {
      const [meResponse, entitlementResponse] = await Promise.all([
        stitchSenseAPI.me(activeToken),
        stitchSenseAPI.entitlement(activeToken),
      ]);
      setUser(meResponse.user);
      setEntitlement(entitlementResponse.entitlement);
    } catch (error) {
      if (error instanceof APIError && error.statusCode === 401 && refreshToken) {
        try {
          const refreshResponse = await stitchSenseAPI.refresh(refreshToken);
          await applyAuth(refreshResponse);
          return;
        } catch {
          await signOut();
          return;
        }
      }
      throw error;
    }
  }, [accessToken, applyAuth, refreshToken, signOut]);

  useEffect(() => {
    let isMounted = true;

    async function restore() {
      try {
        const saved = await loadTokens();
        if (!isMounted) {
          return;
        }
        setAccessToken(saved.accessToken);
        setRefreshToken(saved.refreshToken);
        if (saved.accessToken || saved.refreshToken) {
          await refreshAccount();
        }
      } finally {
        if (isMounted) {
          setIsReady(true);
        }
      }
    }

    void restore();

    return () => {
      isMounted = false;
    };
  }, [refreshAccount]);

  const signIn = useCallback(
    async (identifier: string, password: string) => {
      setIsLoading(true);
      setErrorMessage(null);
      const trimmed = identifier.trim();
      const isEmailIdentifier = trimmed.includes('@');

      try {
        if (isEmailIdentifier) {
          try {
            const response = await stitchSenseAPI.signIn(trimmed, password);
            await applyAuth(response);
            return;
          } catch (error) {
            if (!isFallbackAuthError(error)) {
              throw error;
            }
          }
        }

        try {
          const wordpressResponse = await stitchSenseAPI.signInWithWordPress(trimmed, password);
          await applyAuth(wordpressResponse);
          return;
        } catch (error) {
          if (!isFallbackAuthError(error)) {
            throw error;
          }

          if (!isEmailIdentifier) {
            const platformResponse = await stitchSenseAPI.signIn(trimmed, password);
            await applyAuth(platformResponse);
            return;
          }

          throw error;
        }
      } catch (error) {
        setErrorMessage(
          getUserFacingErrorMessage(error, { fallback: 'Could not sign in right now.' }),
        );
      } finally {
        setIsLoading(false);
      }
    },
    [applyAuth, isFallbackAuthError],
  );

  const signUp = useCallback(
    async (body: { email: string; username: string; password: string; displayName?: string }) => {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const email = body.email.trim().toLowerCase();
        const displayName = body.displayName?.trim() || body.username.trim() || undefined;
        let response;
        try {
          response = await stitchSenseAPI.signUpWithWordPress({
            email,
            username: body.username.trim(),
            password: body.password,
            displayName,
          });
        } catch (error) {
          if (!isBridgeUnavailableError(error)) {
            throw error;
          }

          response = await stitchSenseAPI.signUp({
            email,
            password: body.password,
            displayName,
          });
        }
        await saveOnboardingPending(true);
        await applyAuth(response);
      } catch (error) {
        setErrorMessage(
          getUserFacingErrorMessage(error, { fallback: 'Could not create the account right now.' }),
        );
      } finally {
        setIsLoading(false);
      }
    },
    [applyAuth, isBridgeUnavailableError],
  );

  const value = useMemo<SessionContextValue>(
    () => ({
      user,
      entitlement,
      accessToken,
      isReady,
      isLoading,
      errorMessage,
      signIn,
      signUp,
      signOut,
      refreshAccount,
    }),
    [
      accessToken,
      entitlement,
      errorMessage,
      isLoading,
      isReady,
      refreshAccount,
      signIn,
      signOut,
      signUp,
      user,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used inside SessionProvider');
  }
  return context;
}
