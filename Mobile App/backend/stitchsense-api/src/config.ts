const DEVELOPMENT_JWT_SECRET = 'development-only-change-me';
const DEVELOPMENT_STORAGE_ACCESS_KEY = 'stitchsense';
const DEVELOPMENT_STORAGE_SECRET_KEY = 'stitchsense-dev-password';

function commaSeparated(value: string | undefined) {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value ?? fallback);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function logLevel(value: string | undefined) {
  const candidate = value ?? 'info';
  return ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'].includes(candidate) ? candidate : 'info';
}

export const config = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: positiveInteger(process.env.PORT, 8080),
  logLevel: logLevel(process.env.LOG_LEVEL),
  slowRequestMs: positiveInteger(process.env.SLOW_REQUEST_MS, 3000),
  metricsSharedSecret: process.env.METRICS_SHARED_SECRET ?? '',
  readinessCheckTimeoutMs: positiveInteger(process.env.READINESS_CHECK_TIMEOUT_MS, 2000),
  publicApiBaseUrl: process.env.PUBLIC_API_BASE_URL ?? process.env.API_PUBLIC_URL ?? '',
  corsOrigins: commaSeparated(process.env.CORS_ORIGINS),
  trustProxy: commaSeparated(process.env.TRUST_PROXY),
  maxPatternUploadBytes: positiveInteger(process.env.MAX_PATTERN_UPLOAD_BYTES, 110 * 1024 * 1024),
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://stitchsense:stitchsense@localhost:5433/stitchsense',
  jwtSecret: process.env.JWT_SECRET ?? DEVELOPMENT_JWT_SECRET,
  n8n: {
    chatUrl: process.env.N8N_CHAT_URL ?? '',
    uploadUrl: process.env.N8N_UPLOAD_URL ?? '',
    libraryProxyUrl: process.env.N8N_LIBRARY_PROXY_URL ?? '',
    imageUrl: process.env.N8N_IMAGE_URL ?? '',
    sharedSecret: process.env.N8N_SHARED_SECRET ?? '',
    chatSharedSecret: process.env.N8N_CHAT_SHARED_SECRET ?? process.env.N8N_SHARED_SECRET ?? '',
    uploadSharedSecret: process.env.N8N_UPLOAD_SHARED_SECRET ?? process.env.N8N_SHARED_SECRET ?? '',
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY ?? '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
    monthlyPriceId: process.env.STRIPE_MONTHLY_PRICE_ID ?? '',
    annualPriceId: process.env.STRIPE_ANNUAL_PRICE_ID ?? '',
  },
  revenueCat: {
    webhookAuthorization: process.env.REVENUECAT_WEBHOOK_AUTHORIZATION ?? '',
    entitlementId: process.env.REVENUECAT_ENTITLEMENT_ID ?? 'pro',
  },
  wordpress: {
    sharedSecret: process.env.WORDPRESS_BRIDGE_SHARED_SECRET ?? '',
    siteUrl: process.env.WORDPRESS_SITE_URL ?? '',
  },
  storage: {
    provider: process.env.OBJECT_STORAGE_PROVIDER ?? 'minio',
    bucket: process.env.OBJECT_STORAGE_BUCKET ?? 'stitchsense-patterns',
    region: process.env.OBJECT_STORAGE_REGION ?? 'us-east-1',
    endpoint: process.env.OBJECT_STORAGE_ENDPOINT ?? 'http://localhost:9000',
    accessKey: process.env.OBJECT_STORAGE_ACCESS_KEY ?? DEVELOPMENT_STORAGE_ACCESS_KEY,
    secretKey: process.env.OBJECT_STORAGE_SECRET_KEY ?? DEVELOPMENT_STORAGE_SECRET_KEY,
  },
};

function isValidUrl(value: string, requireHttps = false) {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && (!requireHttps || url.protocol === 'https:');
  } catch {
    return false;
  }
}

export function validateProductionConfig() {
  if (config.nodeEnv !== 'production') return;

  const errors: string[] = [];
  if (!process.env.DATABASE_URL) errors.push('DATABASE_URL is required');
  if (config.jwtSecret === DEVELOPMENT_JWT_SECRET || config.jwtSecret.length < 32) {
    errors.push('JWT_SECRET must be a non-default value of at least 32 characters');
  }
  if (!isValidUrl(config.publicApiBaseUrl, true)) {
    errors.push('PUBLIC_API_BASE_URL must be a valid HTTPS URL');
  }
  if (config.corsOrigins.length === 0 || config.corsOrigins.some((origin) => !isValidUrl(origin, true))) {
    errors.push('CORS_ORIGINS must contain one or more comma-separated HTTPS origins');
  }
  if (config.trustProxy.length === 0) {
    errors.push('TRUST_PROXY must contain the trusted reverse-proxy IP or CIDR range');
  }
  if (config.metricsSharedSecret && config.metricsSharedSecret.length < 32) {
    errors.push('METRICS_SHARED_SECRET must be at least 32 characters when configured');
  }
  if (config.wordpress.siteUrl && !isValidUrl(config.wordpress.siteUrl, true)) {
    errors.push('WORDPRESS_SITE_URL must be a valid HTTPS URL');
  }
  if (Boolean(config.wordpress.siteUrl) !== Boolean(config.wordpress.sharedSecret)) {
    errors.push('WORDPRESS_SITE_URL and WORDPRESS_BRIDGE_SHARED_SECRET must be configured together');
  }
  if (config.wordpress.sharedSecret && config.wordpress.sharedSecret.length < 32) {
    errors.push('WORDPRESS_BRIDGE_SHARED_SECRET must be at least 32 characters');
  }
  if (!process.env.OBJECT_STORAGE_ENDPOINT || !process.env.OBJECT_STORAGE_BUCKET) {
    errors.push('OBJECT_STORAGE_ENDPOINT and OBJECT_STORAGE_BUCKET are required');
  }
  if (
    config.storage.accessKey === DEVELOPMENT_STORAGE_ACCESS_KEY ||
    config.storage.secretKey === DEVELOPMENT_STORAGE_SECRET_KEY
  ) {
    errors.push('Object-storage credentials must not use development defaults');
  }

  if (errors.length > 0) {
    throw new Error(`Invalid production configuration:\n- ${errors.join('\n- ')}`);
  }
}
