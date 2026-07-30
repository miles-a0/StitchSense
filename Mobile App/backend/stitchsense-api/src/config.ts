export const config = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 8080),
  publicApiBaseUrl: process.env.PUBLIC_API_BASE_URL ?? process.env.API_PUBLIC_URL ?? '',
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://stitchsense:stitchsense@localhost:5433/stitchsense',
  jwtSecret: process.env.JWT_SECRET ?? 'development-only-change-me',
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
    accessKey: process.env.OBJECT_STORAGE_ACCESS_KEY ?? 'stitchsense',
    secretKey: process.env.OBJECT_STORAGE_SECRET_KEY ?? 'stitchsense-dev-password',
  },
};
