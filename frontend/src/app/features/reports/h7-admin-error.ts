import { HttpErrorResponse } from '@angular/common/http';

export async function isPasswordChangeRequired(error: unknown): Promise<boolean> {
  if (!(error instanceof HttpErrorResponse) || error.status !== 403) return false;
  let body: unknown = error.error;
  if (isBlobLike(body)) {
    try { body = JSON.parse(await readBlobText(body) as string) as unknown; } catch { return false; }
  }
  try {
    return typeof body === 'object' && body !== null &&
      Object.prototype.hasOwnProperty.call(body, 'code') && 'code' in body && body.code === 'PASSWORD_CHANGE_REQUIRED';
  } catch { return false; }
}

function isBlobLike(value: unknown): value is Blob {
  return typeof value === 'object' && value !== null &&
    typeof (value as { size?: unknown }).size === 'number' &&
    typeof (value as { type?: unknown }).type === 'string';
}

function readBlobText(blob: Blob): Promise<string> {
  if (typeof blob.text === 'function') return blob.text();
  if (typeof FileReader === 'undefined') return Promise.reject(new Error('Blob text is unavailable.'));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Invalid Blob text.'));
    reader.onerror = () => reject(new Error('Blob text is unavailable.'));
    reader.readAsText(blob);
  });
}
