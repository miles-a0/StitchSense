export function signInInputError(identifier: string, password: string) {
  if (!identifier.trim()) return 'Enter your email or username.';
  if (!password) return 'Enter your password.';
  return null;
}

export type SignInFlowDependencies<T> = {
  signInWithEmail: (email: string, password: string) => Promise<T>;
  signInWithWordPress: (identifier: string, password: string) => Promise<T>;
  isFallbackError: (error: unknown) => boolean;
};

// Email accounts may exist only on the platform, so they try it first. Usernames exist only in
// WordPress; the email-only platform route would always reject them and hide the real error.
export async function runSignInFlow<T>(identifier: string, password: string, deps: SignInFlowDependencies<T>) {
  const trimmed = identifier.trim();
  if (trimmed.includes('@')) {
    try {
      return await deps.signInWithEmail(trimmed, password);
    } catch (error) {
      if (!deps.isFallbackError(error)) throw error;
    }
  }
  return deps.signInWithWordPress(trimmed, password);
}
