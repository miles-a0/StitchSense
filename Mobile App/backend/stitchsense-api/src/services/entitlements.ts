import { query } from '../db/pool.js';
import type { EntitlementDecision } from '../types.js';

const fullFeatures = {
  patternUploads: true,
  aiChat: true,
  rewrite: true,
  stitchVision: true,
  ravelryImport: true,
};

const noFeatures = {
  patternUploads: false,
  aiChat: false,
  rewrite: false,
  stitchVision: false,
  ravelryImport: false,
};

export async function resolveEntitlement(userId: string): Promise<EntitlementDecision> {
  const manual = await query<{
    type: string;
    expires_at: Date | null;
  }>(
    `SELECT type, expires_at
     FROM manual_entitlements
     WHERE user_id = $1
       AND revoked_at IS NULL
       AND starts_at <= NOW()
       AND (expires_at IS NULL OR expires_at > NOW())
     ORDER BY expires_at NULLS FIRST, created_at DESC
     LIMIT 1`,
    [userId],
  );

  if (manual.rowCount) {
    const row = manual.rows[0];
    return {
      plan: 'pro',
      status: 'active',
      accessSource: row.type === 'lifetime_pro' ? 'manual_lifetime' : row.type === 'extended_trial' ? 'manual_trial' : 'courtesy_access',
      trialEndsAt: row.expires_at ? row.expires_at.toISOString() : null,
      features: fullFeatures,
    };
  }

  const paid = await query<{
    provider: 'stripe' | 'apple' | 'google';
    plan: string;
    current_period_end: Date | null;
  }>(
    `SELECT provider, plan, current_period_end
     FROM subscriptions
     WHERE user_id = $1
       AND status IN ('active', 'trialing')
       AND (current_period_end IS NULL OR current_period_end > NOW())
     ORDER BY current_period_end DESC NULLS FIRST
     LIMIT 1`,
    [userId],
  );

  if (paid.rowCount) {
    const row = paid.rows[0];
    return {
      plan: row.plan,
      status: 'active',
      accessSource: row.provider,
      trialEndsAt: row.current_period_end ? row.current_period_end.toISOString() : null,
      features: fullFeatures,
    };
  }

  const trial = await query<{ standard_trial_ends_at: Date | null }>(
    'SELECT standard_trial_ends_at FROM users WHERE id = $1',
    [userId],
  );
  const trialEndsAt = trial.rows[0]?.standard_trial_ends_at ?? null;

  if (trialEndsAt && trialEndsAt.getTime() > Date.now()) {
    return {
      plan: 'trial',
      status: 'trialing',
      accessSource: 'standard_trial',
      trialEndsAt: trialEndsAt.toISOString(),
      features: fullFeatures,
    };
  }

  return {
    plan: 'none',
    status: 'expired',
    accessSource: 'none',
    trialEndsAt: trialEndsAt ? trialEndsAt.toISOString() : null,
    features: noFeatures,
  };
}

export function hasFeature(entitlement: EntitlementDecision, feature: keyof EntitlementDecision['features']) {
  return entitlement.status !== 'expired' && entitlement.features[feature] === true;
}
