import { APIError } from './api-error';
import { getUserFacingErrorMessage } from './errors';
import type { Pattern } from './models';

export type PatternUploadFile = {
  uri: string;
  name: string;
  mimeType?: string | null;
};

type TokenSnapshot = {
  accessToken?: string | null;
};

export type PatternUploadApi = {
  createPattern: (
    token: string,
    body: {
      title: string;
      craftType?: string | null;
      originalFilename?: string | null;
      sourceUrl?: string | null;
      source?: string;
      metadata?: Record<string, unknown>;
    },
  ) => Promise<Pattern>;
  uploadPatternFile: (
    id: string,
    token: string,
    file: PatternUploadFile,
  ) => Promise<{
    fileKey?: string | null;
    fileSize?: number | null;
    storageProvider?: string | null;
    projectId?: string | null;
    fileId?: string | null;
    jobId?: string | null;
    indexed?: boolean;
    indexingError?: string | null;
  }>;
  deletePattern: (id: string, token: string) => Promise<unknown>;
};

export type PatternUploadFlowDependencies = {
  api: PatternUploadApi;
  loadTokens: () => Promise<TokenSnapshot>;
  refreshAccount: () => Promise<void>;
  refreshPatterns: () => Promise<void>;
  onStatus?: (message: string) => void;
};

export type PatternUploadFlowInput = {
  accessToken: string | null;
  selectedFile: PatternUploadFile;
  title: string;
  suggestedTitle: string;
  craftType: 'knitting' | 'crochet';
  sourceUrl: string;
};

export function stripPatternFileExtension(filename: string) {
  return filename.replace(/\.[^/.]+$/, '');
}

export function patternUploadErrorMessage(error: unknown) {
  if (error instanceof APIError) {
    return getUserFacingErrorMessage(error, {
      fallback: 'Could not upload that pattern right now.',
    });
  }
  if (error instanceof Error) {
    return getUserFacingErrorMessage(error, {
      fallback: 'Could not upload that pattern right now.',
    });
  }
  return 'Could not upload that pattern right now.';
}

export async function uploadPatternWithRollback(
  input: PatternUploadFlowInput,
  dependencies: PatternUploadFlowDependencies,
): Promise<Pattern> {
  const finalTitle = input.title.trim() || input.suggestedTitle || 'Uploaded pattern';

  dependencies.onStatus?.('Creating your pattern record\u2026');

  let createdPatternId: string | null = null;

  try {
    await dependencies.refreshAccount();
    const { accessToken: latestAccessToken } = await dependencies.loadTokens();
    const activeToken = latestAccessToken ?? input.accessToken;

    if (!activeToken) {
      throw new Error('Your session has expired. Please sign in again.');
    }

    const createdPattern = await dependencies.api.createPattern(activeToken, {
      title: finalTitle,
      craftType: input.craftType,
      originalFilename: input.selectedFile.name,
      sourceUrl: input.sourceUrl.trim() || null,
      source: 'upload',
      metadata: {
        uploadedFrom: 'expo-mobile',
        localFilename: input.selectedFile.name,
      },
    });
    createdPatternId = createdPattern.id;

    dependencies.onStatus?.('Uploading your file\u2026');
    await dependencies.api.uploadPatternFile(createdPattern.id, activeToken, {
      uri: input.selectedFile.uri,
      name: input.selectedFile.name,
      mimeType: input.selectedFile.mimeType,
    });

    await dependencies.refreshPatterns();
    return createdPattern;
  } catch (error) {
    if (createdPatternId) {
      try {
        const { accessToken: latestAccessToken } = await dependencies.loadTokens();
        await dependencies.api.deletePattern(createdPatternId, latestAccessToken ?? input.accessToken ?? '');
      } catch {
        // Best-effort cleanup if the file upload failed after record creation.
      }
    }
    throw error;
  }
}
