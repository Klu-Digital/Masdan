// Leaf module by design: importing the server router here would pull drizzle,
// the AWS SDK and @masdan/env/server into the browser bundle.
import { isAllowedContentType } from "@masdan/storage/content-types";

import { client } from "@/utils/client";
import type { RouterOutputs } from "@/utils/orpc";

export type UploadState =
  | "idle"
  | "uploading"
  | "processing"
  | "error"
  | "done";

export interface UploadFileOptions {
  /** Fractional progress in [0, 1]. Only fires while `state` is `uploading`. */
  onProgress?: (progress: number) => void;
  onStateChange?: (state: UploadState) => void;
  signal?: AbortSignal;
}

export type UploadedFile = RouterOutputs["files"]["confirmUpload"];

/** XMLHttpRequest is the only browser API that reports upload progress. */
const putWithProgress = (
  url: string,
  file: File,
  { onProgress, signal }: Pick<UploadFileOptions, "onProgress" | "signal">
): Promise<void> =>
  // oxlint-disable-next-line promise/avoid-new
  new Promise((resolve, reject) => {
    // An already-aborted signal fires no `abort` event, so the listener below
    // never runs and the bytes would go out anyway.
    if (signal?.aborted) {
      reject(new Error("Upload aborted"));
      return;
    }

    const request = new XMLHttpRequest();

    request.open("PUT", url, true);
    request.setRequestHeader("Content-Type", file.type);

    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        onProgress?.(event.loaded / event.total);
      }
    });

    request.addEventListener("load", () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress?.(1);
        resolve();
        return;
      }
      reject(new Error(`Upload failed with status ${request.status}`));
    });

    request.addEventListener("error", () => reject(new Error("Upload failed")));
    request.addEventListener("abort", () =>
      reject(new Error("Upload aborted"))
    );

    signal?.addEventListener("abort", () => request.abort(), { once: true });

    request.send(file);
  });

export const uploadFile = async (
  file: File,
  options: UploadFileOptions = {}
): Promise<UploadedFile> => {
  const { onProgress, onStateChange, signal } = options;

  try {
    onStateChange?.("uploading");

    // Browsers leave `type` empty for unrecognised extensions.
    if (!isAllowedContentType(file.type)) {
      throw new Error(`Unsupported file type: ${file.type || "unknown"}`);
    }

    const { fileId, uploadUrl } = await client.files.createUpload(
      { contentType: file.type, name: file.name, size: file.size },
      { signal }
    );

    await putWithProgress(uploadUrl, file, { onProgress, signal });

    onStateChange?.("processing");

    const confirmed = await client.files.confirmUpload({ fileId }, { signal });

    onStateChange?.("done");
    return confirmed;
  } catch (error) {
    onStateChange?.("error");
    throw error;
  }
};
