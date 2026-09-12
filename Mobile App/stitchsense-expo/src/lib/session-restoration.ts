import type { Entitlement, User } from '@/src/lib/models';

export type StoredSessionTokens = {
  accessToken: string | null;
  refreshToken: string | null;
};

export type RestoredSession = {
  user: User;
  entitlement: Entitlement;
  accessToken: string;
  refreshToken: string | null;
};

export type SessionRestorationDependencies = {
  me: (accessToken: string) => Promise<{ user: User }>;
  entitlement: (accessToken: string) => Promise<{ entitlement: Entitlement }>;
  refresh: (refreshToken: string) => Promise<{
    user: User;
    accessToken: string;
    refreshToken: string;
  }>;
  saveTokens: (accessToken: string, refreshToken: string) => Promise<void>;
  clearTokens: () => Promise<void>;
};

function isUnauthorized(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    (error as { statusCode?: unknown }).statusCode === 401
  );
}

async function restoreWithRefreshToken(
  refreshToken: string,
  dependencies: SessionRestorationDependencies,
): Promise<RestoredSession | null> {
  let refreshResponse: Awaited<ReturnType<SessionRestorationDependencies['refresh']>>;

  try {
    refreshResponse = await dependencies.refresh(refreshToken);
  } catch {
    await dependencies.clearTokens();
    return null;
  }

  await dependencies.saveTokens(refreshResponse.accessToken, refreshResponse.refreshToken);
  const entitlementResponse = await dependencies.entitlement(refreshResponse.accessToken);

  return {
    user: refreshResponse.user,
    entitlement: entitlementResponse.entitlement,
    accessToken: refreshResponse.accessToken,
    refreshToken: refreshResponse.refreshToken,
  };
}

export async function restoreSessionFromTokens(
  tokens: StoredSessionTokens,
  dependencies: SessionRestorationDependencies,
): Promise<RestoredSession | null> {
  if (tokens.accessToken) {
    try {
      const [meResponse, entitlementResponse] = await Promise.all([
        dependencies.me(tokens.accessToken),
        dependencies.entitlement(tokens.accessToken),
      ]);

      return {
        user: meResponse.user,
        entitlement: entitlementResponse.entitlement,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      };
    } catch (error) {
      if (!isUnauthorized(error) || !tokens.refreshToken) {
        throw error;
      }
    }
  }

  if (tokens.refreshToken) {
    return restoreWithRefreshToken(tokens.refreshToken, dependencies);
  }

  return null;
}
