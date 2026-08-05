/**
 * PUTs a file to a provider-signed URL.
 *
 * **This is the one place in the web app that calls `fetch` directly, and it
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
 * `requiredHeaders` are sent verbatim. They are part of the signature — the
 * API validated the content type and length before signing and then bound both
 * into the URL — so changing or dropping one produces a rejection from the
 * provider rather than a differently-stored object.
 */
export async function putFileToSignedUrl(
  url: string,
  file: File,
  requiredHeaders: Record<string, string>,
): Promise<void> {
  const response = await fetch(url, {
    method: 'PUT',
    headers: requiredHeaders,
    body: file,
  });
  if (!response.ok) {
    throw new Error(`Storage rejected the upload (${response.status})`);
  }
}
