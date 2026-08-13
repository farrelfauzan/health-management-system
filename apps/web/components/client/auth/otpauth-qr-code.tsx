'use client';

import { useEffect, useState } from 'react';
import { toDataURL } from 'qrcode';

type OtpauthQrCodeProps = {
  otpauthUri: string;
  alt: string;
};

const QR_SIZE_PX = 176;

/**
 * Renders an `otpauth://` URI as a scannable QR code (SJ-8).
 *
 * Drawn in the browser rather than fetched as an image: the URI contains the
 * TOTP secret, and asking a QR service for a picture of it would hand the
 * second factor to a third party. The same reason rules out putting it in a
 * URL the browser might log or a referrer might carry.
 */
export function OtpauthQrCode({ otpauthUri, alt }: OtpauthQrCodeProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let isCurrent = true;
    void toDataURL(otpauthUri, { width: QR_SIZE_PX, margin: 1 })
      .then((encoded) => {
        if (isCurrent) {
          setDataUrl(encoded);
        }
      })
      .catch(() => {
        // Nothing to recover: the enrolment screen always shows the secret in
        // text beside this, so a failed render degrades to manual entry.
        if (isCurrent) {
          setDataUrl(null);
        }
      });
    return () => {
      isCurrent = false;
    };
  }, [otpauthUri]);

  if (!dataUrl) {
    return (
      <div
        className="size-44 animate-pulse rounded-lg bg-slate-100"
        style={{ width: QR_SIZE_PX, height: QR_SIZE_PX }}
      />
    );
  }

  return (
    // A plain <img> rather than next/image: the source is an in-memory data
    // URL, so there is nothing for the image optimiser to fetch, resize or
    // cache — and routing a QR of the user's TOTP secret through the optimiser
    // would put it in a server-side cache for no benefit at all.
    <img
      src={dataUrl}
      alt={alt}
      width={QR_SIZE_PX}
      height={QR_SIZE_PX}
      className="rounded-lg border border-slate-200"
    />
  );
}
