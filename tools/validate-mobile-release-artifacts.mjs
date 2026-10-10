import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';

const scriptPath = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(scriptPath), '..');
const appRoot = path.join(root, 'Mobile App/stitchsense-expo');
const appJsonPath = path.join(appRoot, 'app.json');
const packageJsonPath = path.join(appRoot, 'package.json');

const errors = [];

const readJson = (filePath) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    errors.push(`${path.relative(root, filePath)} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
};

const resolveAssetFromAppRoot = (relativePath, label) => {
  if (typeof relativePath !== 'string' || relativePath.trim().length === 0) {
    errors.push(`${label} is missing`);
    return undefined;
  }

  const absolutePath = path.resolve(appRoot, relativePath);
  if (!absolutePath.startsWith(appRoot) || !fs.existsSync(absolutePath)) {
    errors.push(`${label} does not point to an existing app asset: ${relativePath}`);
    return undefined;
  }

  return absolutePath;
};

const fileExistsFromAppRoot = (relativePath, label) => {
  resolveAssetFromAppRoot(relativePath, label);
};

const readPngMetadata = (filePath, label) => {
  const buffer = fs.readFileSync(filePath);
  const pngSignature = '89504e470d0a1a0a';
  if (buffer.subarray(0, 8).toString('hex') !== pngSignature) {
    errors.push(`${label} must be a PNG file`);
    return null;
  }

  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  const colorType = buffer.readUInt8(25);
  let hasTransparencyChunk = false;
  let offset = 8;

  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    if (type === 'tRNS') {
      hasTransparencyChunk = true;
      break;
    }
    offset += 12 + length;
  }

  return {
    hasAlpha: colorType === 4 || colorType === 6 || hasTransparencyChunk,
    height,
    width,
  };
};

const requirePngDimensions = (relativePath, label, expectedWidth, expectedHeight, options = {}) => {
  const absolutePath = resolveAssetFromAppRoot(relativePath, label);
  if (!absolutePath) {
    return;
  }

  const metadata = readPngMetadata(absolutePath, label);
  if (!metadata) {
    return;
  }

  if (metadata.width !== expectedWidth || metadata.height !== expectedHeight) {
    errors.push(`${label} must be ${expectedWidth} x ${expectedHeight}, found ${metadata.width} x ${metadata.height}`);
  }

  if (options.allowAlpha === false && metadata.hasAlpha) {
    errors.push(`${label} must not include an alpha channel`);
  }
};

const requireNonEmptyString = (value, label) => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    errors.push(`${label} must be a non-empty string`);
  }
};

const requireScript = (scripts, scriptName) => {
  if (typeof scripts?.[scriptName] !== 'string' || scripts[scriptName].trim().length === 0) {
    errors.push(`Mobile App/stitchsense-expo/package.json is missing script: ${scriptName}`);
  }
};

const appConfig = readJson(appJsonPath)?.expo;
const packageConfig = readJson(packageJsonPath);

if (appConfig) {
  requireNonEmptyString(appConfig.name, 'expo.name');
  requireNonEmptyString(appConfig.slug, 'expo.slug');
  requireNonEmptyString(appConfig.version, 'expo.version');
  requireNonEmptyString(appConfig.scheme, 'expo.scheme');
  requireNonEmptyString(appConfig.ios?.bundleIdentifier, 'expo.ios.bundleIdentifier');
  requireNonEmptyString(appConfig.android?.package, 'expo.android.package');

  if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/i.test(appConfig.ios?.bundleIdentifier ?? '')) {
    errors.push('expo.ios.bundleIdentifier must look like a store bundle identifier');
  }

  if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/i.test(appConfig.android?.package ?? '')) {
    errors.push('expo.android.package must look like a Play package name');
  }

  requirePngDimensions(appConfig.icon, 'expo.icon', 1024, 1024, { allowAlpha: false });
  fileExistsFromAppRoot(appConfig.web?.favicon, 'expo.web.favicon');
  fileExistsFromAppRoot(appConfig.android?.adaptiveIcon?.foregroundImage, 'expo.android.adaptiveIcon.foregroundImage');
  fileExistsFromAppRoot(appConfig.android?.adaptiveIcon?.monochromeImage, 'expo.android.adaptiveIcon.monochromeImage');

  const splashPlugin = appConfig.plugins?.find((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-splash-screen');
  fileExistsFromAppRoot(splashPlugin?.[1]?.image, 'expo-splash-screen.image');

  const infoPlist = appConfig.ios?.infoPlist ?? {};
  requireNonEmptyString(infoPlist.NSCameraUsageDescription, 'ios.infoPlist.NSCameraUsageDescription');
  requireNonEmptyString(infoPlist.NSPhotoLibraryUsageDescription, 'ios.infoPlist.NSPhotoLibraryUsageDescription');
  requireNonEmptyString(infoPlist.NSPhotoLibraryAddUsageDescription, 'ios.infoPlist.NSPhotoLibraryAddUsageDescription');

  const privacyTypes = appConfig.ios?.privacyManifests?.NSPrivacyAccessedAPITypes;
  if (!Array.isArray(privacyTypes) || privacyTypes.length === 0) {
    errors.push('expo.ios.privacyManifests.NSPrivacyAccessedAPITypes must include accessed API declarations');
  }

  const androidPermissions = appConfig.android?.permissions;
  if (!Array.isArray(androidPermissions) || !androidPermissions.includes('android.permission.CAMERA')) {
    errors.push('expo.android.permissions must include CAMERA for Stitch Vision');
  }

  if (appConfig.ios?.supportsTablet === true && !fs.existsSync(path.join(root, 'docs/TABLET_SUPPORT_DECISION.md'))) {
    errors.push('Tablet support is enabled, but docs/TABLET_SUPPORT_DECISION.md is missing');
  }
}

if (packageConfig) {
  if (!String(packageConfig.dependencies?.expo ?? '').includes('57.')) {
    errors.push('Mobile App/stitchsense-expo/package.json must stay on Expo SDK 57 for this release track');
  }

  requireScript(packageConfig.scripts, 'check:release-config');
  requireScript(packageConfig.scripts, 'check:capture-script');
  requireScript(packageConfig.scripts, 'lint');
  requireScript(packageConfig.scripts, 'typecheck');
  requireScript(packageConfig.scripts, 'test');
}

if (errors.length > 0) {
  console.error('Mobile release artifact validation failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Mobile release artifact validation passed');
