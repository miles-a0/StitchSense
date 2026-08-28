const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');

const baseUrl = process.env.STITCH_CAPTURE_BASE_URL || 'http://127.0.0.1:8082';
const username = process.env.STITCH_CAPTURE_USERNAME;
const password = process.env.STITCH_CAPTURE_PASSWORD;
const outputDir = process.env.STITCH_CAPTURE_OUTPUT;

if (!username || !password || !outputDir) {
  throw new Error('Capture username, password, and output directory are required.');
}

const routes = [
  ['01-home', '/(tabs)/dashboard', 'Welcome'],
  ['02-library', '/(tabs)/library', 'Your pattern collection'],
  ['03-projects', '/(tabs)/workspace', 'Your making table'],
  ['04-chat', '/(tabs)/chat', 'AI Chat'],
  ['05-stash', '/(tabs)/stash', 'Your making supplies'],
  ['06-tools', '/(tabs)/tools', 'Focused help'],
  ['07-account', '/(tabs)/account', 'Account'],
  ['08-camera', '/(tabs)/camera', 'Photo help'],
  ['09-upload-pattern', '/pattern-upload', 'Add a pattern'],
  ['10-new-project', '/project/new', 'project'],
  ['11-gauge-calculator', '/gauge-calculator', 'Gauge'],
  ['12-quick-counter', '/quick-counter', 'Counter'],
  ['13-stitch-dictionary', '/stitch-dictionary', 'Stitch'],
  ['14-ravelry', '/ravelry', 'Ravelry'],
];

async function waitForSettledPage(page, expectedText) {
  await page.waitForLoadState('domcontentloaded');
  await page.getByText(expectedText, { exact: false }).first().waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.evaluate(() => document.fonts?.ready);
}

async function capture(page, name, route, expectedText) {
  await page.setViewportSize({ width: 430, height: 932 });
  await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded' });
  await waitForSettledPage(page, expectedText);
  const contentHeight = await page.evaluate(() =>
    Math.max(
      document.documentElement.scrollHeight,
      document.body.scrollHeight,
      ...[...document.querySelectorAll('*')].map((element) => element.scrollHeight),
    ),
  );
  await page.setViewportSize({
    width: 430,
    height: Math.max(932, Math.min(16000, contentHeight + 120)),
  });
  await page.getByText(expectedText, { exact: false }).first().waitFor({ state: 'visible' });
  await page.screenshot({
    animations: 'disabled',
    fullPage: false,
    path: path.join(outputDir, `${name}.png`),
  });
}

(async () => {
  await fs.mkdir(outputDir, { recursive: true });
  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
  const context = await browser.newContext({
    colorScheme: 'light',
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
    viewport: { width: 430, height: 932 },
  });
  const page = await context.newPage();
  await page.addStyleTag({
    content: '#error-overlay { display: none !important; pointer-events: none !important; }',
  }).catch(() => {});

  await page.goto(`${baseUrl}/sign-in`, { waitUntil: 'domcontentloaded' });
  await page.addStyleTag({
    content: '#error-overlay { display: none !important; pointer-events: none !important; }',
  });
  await page.getByPlaceholder('Email or username').fill(username);
  await page.getByPlaceholder('Your password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).last().click({ force: true });
  await page.getByText('StitchSense', { exact: true }).first().waitFor({ state: 'visible', timeout: 30000 });

  for (const [name, route, expectedText] of routes) {
    await capture(page, name, route, expectedText);
  }

  await page.goto(`${baseUrl}/(tabs)/library`, { waitUntil: 'domcontentloaded' });
  await waitForSettledPage(page, 'Your pattern collection');
  const ids = await page.evaluate(async () => {
    const token = localStorage.getItem('stitchsense-access-token');
    if (!token) return {};
    const headers = { authorization: `Bearer ${token}` };
    const [patternsResponse, projectsResponse] = await Promise.all([
      fetch('https://stitchsense.zu-auto.co.uk/patterns', { headers }),
      fetch('https://stitchsense.zu-auto.co.uk/projects', { headers }),
    ]);
    const patternsPayload = await patternsResponse.json();
    const projectsPayload = await projectsResponse.json();
    return {
      patternId: (patternsPayload.patterns ?? patternsPayload)[0]?.id,
      projectId: (projectsPayload.projects ?? projectsPayload)[0]?.id,
    };
  });
  if (ids.patternId) {
    await capture(page, '15-pattern-detail', `/pattern/${ids.patternId}`, 'Pattern');
    await capture(
      page,
      '16-pattern-chat',
      `/pattern-chat?patternId=${encodeURIComponent(ids.patternId)}`,
      'Pattern chat',
    );
  }
  if (ids.projectId) {
    await capture(page, '17-project-detail', `/project/${ids.projectId}`, 'Project');
  }

  await browser.close();
})();
