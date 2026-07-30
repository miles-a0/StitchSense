export type UserRole = 'user' | 'admin';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

export interface EntitlementDecision {
  plan: string;
  status: 'active' | 'trialing' | 'expired';
  accessSource: 'manual_lifetime' | 'manual_trial' | 'courtesy_access' | 'stripe' | 'apple' | 'google' | 'standard_trial' | 'none';
  trialEndsAt: string | null;
  features: {
    patternUploads: boolean;
    aiChat: boolean;
    rewrite: boolean;
    stitchVision: boolean;
    ravelryImport: boolean;
  };
}

declare module 'fastify' {
  interface FastifyRequest {
    authUser: AuthUser;
  }
}
