/**
 * PUTs a file to a provider-signed URL, reporting upload progress.
 *
 * **This is the one place in the web app that talks HTTP directly, and it
 * has to be.** Every HMS call goes through the generated Orval client and its
 * axios mutator — but that mutator sets `baseURL` to the HMS API and attaches
 * `Authorization: Bearer <access token>`. This request goes to S3, not to HMS.
 * Sending it through the mutator would point it at the wrong host and hand a
 * live HMS session token to a third-party storage provider.
 *
 * So the rule the mutator exists to enforce is the same rule that keeps this
 * function outside it: HMS credentials go to HMS and nowhere else. The URL
 * already carries its own authorization in `X-Amz-Signature`, scoped to one
 * object, one method, and a few minutes.
 *
 * `XMLHttpRequest` rather than `fetch` on purpose: upload progress is the
 * one capability `fetch` still lacks (request-body streams cannot observe
 * bytes-sent), and a Google-Drive-style progress bar needs
 * `upload.onprogress`. Nothing else about the request changes.
 *
 * `requiredHeaders` are sent verbatim. They are part of the signature — the
 * API validated the content type and length before signing and then bound both
 * into the URL — so changing or dropping one produces a rejection from the
 * provider rather than a differently-stored object.
 */
export function putFileToSignedUrl(
  url: string,
  file: File,
  requiredHeaders: Record<string, string>,
  onUploadPercent?: (percent: number) => void,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PUT', url);
    for (const [headerName, headerValue] of Object.entries(requiredHeaders)) {
      trySetRequestHeader(request, headerName, headerValue);
    }
    request.upload.onprogress = (event: ProgressEvent) => {
      if (event.lengthComputable && onUploadPercent) {
        onUploadPercent(Math.min(100, Math.round((event.loaded / event.total) * 100)));
      }
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        onUploadPercent?.(100);
        resolve();
        return;
      }
      reject(new Error(`Storage rejected the upload (${request.status})`));
    };
    request.onerror = () => reject(new Error('Storage rejected the upload (network error)'));
    request.onabort = () => reject(new Error('The upload was cancelled'));
    request.send(file);
  });
}

/**
 * `Content-Length` is a forbidden request header the browser sets itself
 * from the body; XHR throws on any attempt to set it, where `fetch` silently
 * dropped it. Skipping it is safe for the signature for the same reason the
 * browser forbids it: the provider verifies the *actual* body length, which
 * is exactly what was signed.
 */
function trySetRequestHeader(request: XMLHttpRequest, name: string, value: string): void {
  if (name.trim().toLowerCase() === 'content-length') {
    return;
  }
  request.setRequestHeader(name, value);
}
