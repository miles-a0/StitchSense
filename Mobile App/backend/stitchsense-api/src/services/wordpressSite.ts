import { config } from '../config.js';

function normalisePathname(pathname: string) {
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed === '/' ? '' : trimmed;
}

export function normaliseWordPressSiteUrl(value: string, requireHttps = true) {
  const input = value.trim();
  if (!input) {
    throw new Error('WordPress site URL is not configured');
  }

  const url = new URL(input);
  if (requireHttps && url.protocol !== 'https:') {
    throw new Error('WordPress site URL must use HTTPS');
  }
  if (!requireHttps && url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('WordPress site URL must use HTTP or HTTPS');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('WordPress site URL must not contain credentials, a query, or a fragment');
  }

  return `${url.origin}${normalisePathname(url.pathname)}`;
}

export function resolveWordPressSiteUrl(
  configuredSiteUrl: string,
  requestedSiteUrl?: string,
  requireHttps = true,
) {
  const configured = normaliseWordPressSiteUrl(configuredSiteUrl, requireHttps);

  if (requestedSiteUrl) {
    const requested = normaliseWordPressSiteUrl(requestedSiteUrl, requireHttps);
    if (requested !== configured) {
      throw new Error('WordPress site URL does not match the configured bridge site');
    }
  }

  return configured;
}

export function configuredWordPressSiteUrl(requestedSiteUrl?: string) {
  return resolveWordPressSiteUrl(
    config.wordpress.siteUrl,
    requestedSiteUrl,
    config.nodeEnv === 'production',
  );
}
