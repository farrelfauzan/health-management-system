# File-upload hardening (SJ-21)

**Status: implemented for the document store and the clinic logo; standing
standard for every future upload surface.**

An uploaded file must not be able to execute in the app's origin, lie about
its type, exhaust storage, or carry malware to the next staff member who
downloads it. This document is both the record of what the shipped surface
does and the checklist any new upload surface must meet before it merges.

## The architecture every control hangs off

Uploads are **browser-direct presigned PUTs** (`docs/MVP/` object-storage
decision; `apps/api/src/common/storage/s3-storage.service.ts`). The API signs
a short-lived URL binding the declared `Content-Type` and `Content-Length`
into the signature, the browser PUTs the bytes straight to the bucket, and the
client then *confirms* the upload so a row is written. Bytes never transit the
API on ingress, which moves every content control to one of two places:

- **before signing** — anything expressible as a constraint the provider can
  enforce (type, size, key);
- **at confirm time** — anything that needs the bytes themselves.

Downloads are presigned GETs minted per request; the bucket is private and the
API never streams file bytes in either direction.

## Controls in force (document store: `/admin/documents`, `/me/documents`)

| SJ-21 requirement | Where it lives |
|---|---|
| Server-minted UUID object keys, no client input in any path | `S3StorageService.generateObjectKey`, `GENERATED_OBJECT_KEY_PATTERN` refuses foreign keys at presign; confirm refuses keys outside the surface's own prefix |
| Per-surface MIME allowlist, never a denylist | `DOCUMENT_UPLOAD_MIME_TYPES` (`@hms/shared-types`): pdf/markdown/plain plus jpeg/png/webp since `P16-T03` — scans get photographed. Re-checked against the bucket allowlist before signing. **SVG is deliberately absent**, here as on every surface |
| Size cap enforced where the bytes flow | `DOCUMENT_MAX_UPLOAD_SIZE_BYTES` (20 MiB — a scanned multi-page radiology report does not fit in 5 MiB) in the surface's own schema, under the `S3_MAX_UPLOAD_SIZE_BYTES` bucket ceiling. Validated before signing, **signed into the URL** so the provider aborts an oversize PUT, re-checked against the stored object at confirm, and checked in the browser before a URL is even requested (`DocumentFilePicker`) so the person who chose the file is told the limit |
| Magic-byte validation: bytes must agree with the declared type | `validate-document-content.ts`, run by `UploadedDocumentGuardService` at confirm: PDF signature at offset zero (mid-file `%PDF-` polyglots refused), encrypted PDFs refused, text must be NUL-free valid UTF-8 with no known binary signature. Images delegate to `common/image/validate-image-content.ts` — the same check the clinic logo runs, so the two surfaces cannot drift on what a PNG looks like |
| **Images are re-encoded, never stored verbatim** (`P16-T03`) | `UploadedDocumentGuardService` decodes the uploaded image and **overwrites the stored object** with `common/image/reencode-image.ts`'s output before any row is written. Same format in, same format out (unlike the logo's PNG normalisation — re-encoding a 15 MiB scan as PNG would multiply its size) and **no resize**, because the point of a 300 dpi scan is that the small print is readable. The row records the re-encoded length, since that is what is in the bucket |
| Images are never ingested | HMS runs no OCR, so an image carries no text for retrieval to find. `ingestStatus` rests at `NOT_APPLICABLE` whatever the purpose, and a re-ingest request is refused — `PENDING` would queue it for a worker that could only mark it `FAILED` |
| Rejected uploads leave nothing behind | The guard deletes the object **before** failing the confirm, then audit-logs `DOCUMENT_UPLOAD_REJECTED` with actor, key, declared type, and reason |
| Inert serving | Download URLs are signed with `ResponseContentDisposition: attachment; filename=…` (RFC 6266/5987-encoded from the title, injection-safe) and `ResponseContentType` pinned to the validated stored type — the storage origin never renders a stored file inline |
| Upload ties to a record | Confirm-or-nothing: a signed URL nobody confirms leaves no row; a duplicate confirm is a 409 via the unique `storage_key` |
| Deletion follows retention rules | Document delete is soft (SJ-12); chunks are hard-deleted in the same write |

The bucket-wide allowlist is the **union** across shipped surfaces, and every
surface narrows it in its own schema. The same holds for size: the bucket
ceiling (`S3_MAX_UPLOAD_SIZE_BYTES`, 20 MiB) sits at or above the largest
surface cap, and a surface can only narrow it — raising the ceiling alone
widens nothing, because a request is refused by its surface's own `.max()`
before it reaches the signing call.

Image types were held out of that allowlist under SJ-21 with one condition:
they return *in the same change as the re-encode*. That condition has now been
met twice — `P16-T02` for the clinic logo, `P16-T03` for the document store —
and it still binds the next image-bearing surface.

## Controls in force (clinic logo: `/api/v1/clinic-profile`, P16-T02)

The same architecture with one extra move, and the extra move is the point:
**the stored object is never the uploaded object.**

| SJ-21 requirement | Where it lives |
|---|---|
| Server-minted keys | `ObjectStorageService.generateObjectKey` under two prefixes. The browser PUTs to `clinic-profile/logo/staged/<uuid>`; the server writes its re-encode to `clinic-profile/logo/stored/<uuid>.png`. Only a `stored/` key is ever recorded on the row, so a client-supplied key cannot become the letterhead |
| Per-surface MIME allowlist | `CLINIC_LOGO_UPLOAD_MIME_TYPES` (`@hms/shared-types`): `image/jpeg`, `image/png`, `image/webp`. **SVG is deliberately excluded** — it is a document format with script and external-reference semantics wearing an `image/` prefix |
| Size cap | `CLINIC_LOGO_MAX_UPLOAD_SIZE_BYTES` (2 MiB), validated before signing, signed into the URL, and **re-read from the stored object at claim time** — the signed length bounds the PUT, the stored length bounds what the decoder is handed |
| Magic-byte validation | `common/image/validate-image-content.ts` at claim time: the signature must sit at offset zero, so a polyglot with a prologue is refused. WebP is checked as a RIFF container *plus* its `WEBP` form type, or a WAV would pass |
| **Re-encode, not store-verbatim** | `common/image/reencode-image.ts`: decode → apply EXIF orientation → bound to 1024 px on the longest edge → re-serialise as PNG. Strips EXIF/GPS (PHI-adjacent on a phone photo), destroys polyglots (only the pixels make the trip), and bounds the `data:` URI an invoice will embed. `limitInputPixels` caps the decode at 50 MP, because a size cap does not bound a decompression bomb |
| Rejected uploads leave nothing behind | The staged object is deleted **before** the request fails, then audit-logged as `DOCUMENT_UPLOAD_REJECTED` — the same verb the document store writes, so "which account keeps uploading forged files" is one count rather than one per surface |
| Inert serving | The signed GET pins `attachment; filename="clinic-logo.png"` and `image/png`. Browsers ignore `Content-Disposition` on a subresource load, so `<img src>` still renders the admin preview — what the header changes is that *navigating* to the URL downloads instead of rendering |
| Upload ties to a record | Claim-or-nothing: a signed URL nobody claims leaves a staged object and no row. Replacing a logo deletes the previous object **after** the write commits, so a failed write never leaves the profile pointing at bytes that are gone |

## The standard for any new upload surface

A PR adding an upload surface must answer every row above for its own surface,
plus:

1. **Images are re-encoded, never stored verbatim.** Pass every accepted image
   through `sharp` (decode → re-encode). This strips EXIF/GPS metadata — PHI-
   adjacent on a phone photo — and destroys polyglot payloads in one step. The
   re-encoded bytes are what gets stored.
2. **Its own allowlist, at most a handful of types**, declared in
   `@hms/shared-types` next to the surface's schemas. Widening the bucket
   allowlist without a surface-level list is not acceptable.
3. **Content validation for every accepted type** at the first point the
   server holds the bytes (confirm time under the presigned flow). If a type
   cannot be validated (e.g. encrypted archives), it is not an accepted type.
4. **Rate limiting** on URL-minting and download-minting routes once SJ-18's
   buckets exist — minting is cheap for us but grants storage writes.
5. **Serving stays inert**: attachment disposition + validated content type
   signed into every download URL. If a future feature genuinely needs inline
   rendering (e.g. an image preview), it must come from a dedicated
   user-content origin (post-SJ-1), never the app or API origin.

## Accepted risks — decisions, not defaults

- **No antivirus scanning.** The ticket's ClamAV sidecar assumes bytes flow
  through infrastructure we run at upload time; under browser-direct PUTs a
  scanner needs either an async quarantine pipeline (bucket events + a worker
  and a `QUARANTINED` document state) or proxying uploads through the API.
  Both are real projects, not fixture code. Until one is scheduled, the gate
  is type-forgery validation only: an EICAR file named `notes.txt` **is valid
  UTF-8 text and will be stored**. What contains that risk today: only
  authenticated staff (`write:Document`) can upload at all, every accepted
  type is inert when served (attachment disposition, never executed
  server-side except the PDF parser below), and every download is an
  authenticated, per-request signed URL. Revisit when clinic staff start
  exchanging files *with patients* — that is the point where malware relay
  becomes the primary threat, and the async quarantine pipeline should be
  ticketed before that feature ships.
- **`pdf-parse` runs in the API process** at ingestion. A hostile PDF is a
  parser-DoS/CVE surface. Bounded today by the 20 MiB size cap — raised from
  5 MiB in `P16-T03`, which loosens this bound and is the reason the cap is a
  per-surface number rather than one global one — the magic-byte
  gate, staff-only upload, and ingestion running in a background worker whose
  failure marks the document `FAILED` rather than crashing a request. Moving
  extraction to an isolated worker process is the upgrade path if this ever
  hosts patient-supplied files.
- **Orphaned objects are possible**: a PUT that is never confirmed leaves an
  unreferenced object (now also any object whose confirm was interrupted
  between rejection-delete and response). Bounded by the size cap and
  staff-only signing; a lifecycle sweep (bucket rule expiring unconfirmed
  prefixes after 24 h, or a retention job diffing keys against rows) is filed
  as follow-up work rather than assumed.

## Verification

Unit suites pin every control:
`validate-document-content.spec.ts` (renamed executable, buried-header
polyglot, encrypted PDF, ZIP/NUL/invalid-UTF-8 as text),
`uploaded-document-guard.service.spec.ts` (delete-before-reject ordering,
audit row), `build-document-download-disposition.spec.ts` (header-injection
titles, RFC 5987 encoding), `document.service.spec.ts` and
`s3-storage.service.spec.ts` (gate wiring, signed response overrides, image
types refused by default). The MinIO-backed integration suites exercise the
presign/confirm flow end to end (`pnpm integration:test` with
`pnpm docker:dev:up`).
