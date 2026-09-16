import type { Entitlement } from '@/src/lib/models';

const DAY_MS = 1000 * 60 * 60 * 24;

export function hasActiveEntitlementAccess(entitlement?: Pick<Entitlement, 'status' | 'accessSource'> | null) {
  if (!entitlement) return false;
  if (entitlement.status === 'expired') return false;
  return entitlement.accessSource !== 'none';
}

export function formatAccessSource(source?: string | null) {
  switch (source) {
    case 'manual_lifetime':
      return 'Lifetime access';
    case 'manual_trial':
      return 'Extended trial';
    case 'courtesy_access':
      return 'Courtesy access';
    case 'stripe':
      return 'Legacy web subscription';
    case 'apple':
      return 'Apple subscription';
    case 'google':
      return 'Google subscription';
    case 'standard_trial':
      return 'Free trial';
    case 'none':
      return 'No active entitlement';
    default:
      return 'Pending';
  }
}

export function entitlementHeadline(source?: string | null) {
  switch (source) {
    case 'manual_lifetime':
      return 'Lifetime Pro';
    case 'manual_trial':
      return 'Extended Pro access';
    case 'courtesy_access':
      return 'Courtesy Pro access';
    case 'stripe':
    case 'apple':
    case 'google':
      return 'Paid Pro plan';
    case 'standard_trial':
      return 'Free trial active';
    case 'none':
      return 'Upgrade to keep full access';
    default:
      return 'Checking access';
  }
}

export function entitlementCopy(source?: string | null) {
  switch (source) {
    case 'manual_lifetime':
      return 'You have lifetime Pro access on this account.';
    case 'manual_trial':
      return 'You have extended complimentary access for testing, beta use, or support.';
    case 'courtesy_access':
      return 'This account currently has complimentary Pro access.';
    case 'stripe':
    case 'apple':
    case 'google':
      return 'Your paid StitchSense subscription is active.';
    case 'standard_trial':
      return 'Your free trial is active and all Pro features are currently unlocked.';
    case 'none':
      return 'This account is currently on the free tier and locked out of Pro-only features.';
    default:
      return 'Your subscription details will appear here once the account finishes loading.';
  }
}

export function paywallAccessHeadline(source?: string | null) {
  switch (source) {
    case 'manual_lifetime':
      return 'Lifetime Pro access';
    case 'manual_trial':
      return 'Extended complimentary access';
    case 'courtesy_access':
      return 'Courtesy Pro access';
    case 'stripe':
    case 'apple':
    case 'google':
      return 'Your Pro plan is active';
    case 'standard_trial':
      return 'Free trial active';
    case 'none':
      return 'Keep StitchSense unlocked';
    default:
      return 'Choose your StitchSense plan';
  }
}

export function paywallAccessCopy(source?: string | null) {
  switch (source) {
    case 'manual_lifetime':
      return 'This account has permanent Pro access. You do not need to subscribe unless you want to test checkout behaviour.';
    case 'manual_trial':
      return 'This account has extended free access for beta use, testing, or support.';
    case 'courtesy_access':
      return 'This account currently has complimentary Pro access managed from the StitchSense admin tools.';
    case 'stripe':
    case 'apple':
    case 'google':
      return 'Your account already has active Pro billing. You can refresh your account status or manage billing below.';
    case 'standard_trial':
      return 'You are inside the free trial window, with the same core Pro features available while you decide.';
    case 'none':
      return 'Choose a plan to keep AI chat, rewrites, Stitch Vision, Ravelry imports, and project guidance available.';
    default:
      return 'Pro keeps the full StitchSense toolset available across web and mobile.';
  }
}

export function trialCountdown(trialEndsAt?: string | null, now: number | Date = Date.now()) {
  if (!trialEndsAt) {
    return null;
  }
  const nowMs = now instanceof Date ? now.getTime() : now;
  const ms = new Date(trialEndsAt).getTime() - nowMs;
  const days = Math.ceil(ms / DAY_MS);
  if (days <= 0) {
    return 'Ends today';
  }
  if (days === 1) {
    return '1 day remaining';
  }
  return `${days} days remaining`;
}

export function paywallTrialLabel(trialEndsAt?: string | null, now: number | Date = Date.now()) {
  if (!trialEndsAt) return null;
  const end = new Date(trialEndsAt);
  const nowMs = now instanceof Date ? now.getTime() : now;
  const remaining = end.getTime() - nowMs;
  if (!Number.isFinite(remaining)) return null;
  if (remaining <= 0) return 'Trial ended';
  const days = Math.ceil(remaining / DAY_MS);
  return days === 1 ? '1 day left in trial' : `${days} days left in trial`;
}

export function purchaseStatusMessage(status: string, hasActiveEntitlement: boolean) {
  if (hasActiveEntitlement || status === 'active') {
    return 'Purchase complete. Syncing your StitchSense access...';
  }
  if (status === 'pending') {
    return 'Purchase is pending with the store. We’ll refresh your access as soon as Apple or Google confirms it.';
  }
  if (status === 'cancelled') {
    return 'Purchase cancelled. No payment was taken.';
  }
  return 'Purchase sent to the store. Syncing your StitchSense access...';
}
