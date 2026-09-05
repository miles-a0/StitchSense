import { buildApp } from './app.js';
import { config, validateProductionConfig } from './config.js';

validateProductionConfig();

const app = await buildApp();

let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  app.log.info({ signal }, 'Shutting down StitchSense API');
  try {
    await app.close();
    app.log.info({ signal }, 'StitchSense API shutdown complete');
    process.exit(0);
  } catch (error) {
    app.log.error({ err: error, signal }, 'StitchSense API shutdown failed');
    process.exit(1);
  }
}

process.once('SIGTERM', () => {
  void shutdown('SIGTERM');
});
process.once('SIGINT', () => {
  void shutdown('SIGINT');
});

await app.listen({ port: config.port, host: '0.0.0.0' });
