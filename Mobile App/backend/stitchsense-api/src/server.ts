import { buildApp } from './app.js';
import { config, validateProductionConfig } from './config.js';

validateProductionConfig();

const app = await buildApp();

await app.listen({ port: config.port, host: '0.0.0.0' });
