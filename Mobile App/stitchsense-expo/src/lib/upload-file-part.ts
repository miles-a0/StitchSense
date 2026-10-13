// Expo's fetch (the global fetch from SDK 52 onwards) rejects React Native's
// `{ uri, name, type }` form parts with "Unsupported FormDataPart implementation".
// It accepts any object with `bytes()`, and takes the part's filename and
// content type from `name` and `type`, so the picked filename is kept.

export type UploadFileSource = {
  uri: string;
  name: string;
  mimeType?: string | null;
};

export type UploadFilePart = {
  name: string;
  type: string;
  bytes: () => Promise<Uint8Array>;
};

export function uploadFilePart(
  file: UploadFileSource,
  fallbackMimeType: string,
  readBytes: (uri: string) => Promise<Uint8Array>,
): UploadFilePart {
  return {
    name: file.name,
    type: file.mimeType || fallbackMimeType,
    bytes: () => readBytes(file.uri),
  };
}
