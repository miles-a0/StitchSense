import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const root = process.cwd();
const config = readFileSync(join(root, '.gitleaks.toml'), 'utf8');
const ruleStart = config.indexOf('id = "stitchsense-hardcoded-shared-secret"');

if (ruleStart === -1) {
  throw new Error('Missing stitchsense-hardcoded-shared-secret rule in .gitleaks.toml');
}

const ruleBody = config.slice(ruleStart);
const regexMatch = ruleBody.match(/regex\s*=\s*'''([\s\S]*?)'''/);

if (!regexMatch) {
  throw new Error('Missing regex for stitchsense-hardcoded-shared-secret rule');
}

const rawRegex = regexMatch[1];
let flags = '';
let pattern = rawRegex;
if (pattern.startsWith('(?i)')) {
  flags += 'i';
  pattern = pattern.slice(4);
}

const secretAssignmentPattern = new RegExp(pattern, flags);
const positiveFixture = 'const expectedSecret = "abcdefghijklmnopqrstuvwxyzABCDEF123456";';
const envFixture = 'const expectedSecret = $env.N8N_SHARED_SECRET || "";';

if (!secretAssignmentPattern.test(positiveFixture)) {
  throw new Error('Gitleaks custom secret rule did not match a hardcoded n8n secret fixture');
}

const escapedJsonFixture = 'const expectedSecret = \\"abcdefghijklmnopqrstuvwxyzABCDEF123456\\";';
if (!secretAssignmentPattern.test(escapedJsonFixture)) {
  throw new Error('Gitleaks custom secret rule did not match a JSON-escaped hardcoded n8n secret fixture');
}

if (secretAssignmentPattern.test(envFixture)) {
  throw new Error('Gitleaks custom secret rule incorrectly matched an environment-variable lookup');
}

const workflowFiles = [
  'StitchSense Chat API - Qdrant RAG + Client History - UK Metric.json',
  'Pattern Helper AI - RAG Chat API - v7.6.0 - Google Drive Storage.json',
];

for (const file of workflowFiles) {
  const contents = readFileSync(join(root, file), 'utf8');
  if (secretAssignmentPattern.test(contents)) {
    throw new Error(`${basename(file)} contains a hardcoded shared-secret assignment`);
  }
}

console.log('Secret scan config validates and workflow exports contain no hardcoded shared-secret assignments.');
