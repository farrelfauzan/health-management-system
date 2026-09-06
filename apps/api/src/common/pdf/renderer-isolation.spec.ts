import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The D-026 renderer posture, asserted against the artefact that deploys it
 * (`P16-T21` §2, NFR-SEC-03).
 *
 * D-026 proved outbound denial by measurement during the P16-T01 spike. That
 * proof is about a container that was running at the time; this spec is about
 * the file that brings one up tomorrow. Both halves of the posture — the
 * network with no gateway, and Chromium's own outbound filtering — are single
 * lines in a compose file, and a single line is exactly what gets lost in a
 * merge.
 *
 * A structural read of the manifest rather than a live probe, deliberately:
 * CI has no renderer container, and a check that silently skipped when the
 * sidecar was absent would pass hardest in the environment where nobody
 * looked. The live A/B against a tracking server is recorded in D-026 and
 * repeated per environment from
 * `docs/security/renderer-isolation.md`.
 */
describe('Renderer isolation posture (D-026)', () => {
  const composeYaml = readFileSync(
    resolve(__dirname, '../../../../../infra/docker/docker-compose.dev.yml'),
    'utf8',
  );

  /** The renderer service block, up to the next top-level service. */
  const rendererService = (() => {
    const start = composeYaml.indexOf('\n  gotenberg:');
    expect(start).toBeGreaterThan(-1);
    const rest = composeYaml.slice(start + 1);
    const nextService = rest.search(/\n {2}[a-z][a-z0-9-]*:\n/);
    return nextService === -1 ? rest : rest.slice(0, nextService);
  })();

  describe('half one — no route off the network', () => {
    /**
     * `internal: true` is what makes NFR-SEC-03 true rather than
     * aspirational: Docker attaches no gateway, so a container on this
     * network alone cannot reach the host, the LAN or the internet at all.
     * Chromium's own filtering is defence in depth on top of it, not instead
     * of it.
     */
    it('puts the renderer network behind `internal: true`', () => {
      expect(composeYaml).toMatch(/\n {2}renderer:\n(?: {4}#.*\n)* {4}internal: true\n/);
    });

    it('attaches the renderer to that network and to no other', () => {
      expect(rendererService).toMatch(/networks:\n\s+- renderer\n/);
      expect(rendererService).not.toMatch(/- default\n/);
    });

    it('publishes no port, so nothing outside the compose project can reach it', () => {
      expect(rendererService).not.toMatch(/^\s+ports:/m);
    });
  });

  describe('half two — Chromium refuses to fetch', () => {
    it.each([
      '--chromium-deny-private-ips',
      '--chromium-deny-public-ips',
      '--chromium-clear-cache',
      '--chromium-clear-cookies',
      '--chromium-clear-storage',
    ])('keeps %s on the renderer command', (flag) => {
      expect(rendererService).toContain(flag);
    });

    /**
     * The conversion routes this product does not use are the ones with the
     * largest parsers behind them. LibreOffice in particular is a full office
     * suite reached over HTTP; nothing here posts a `.docx` to the renderer,
     * so the route is closed rather than merely unused.
     */
    it.each(['--libreoffice-disable-routes', '--pdfengines-disable-routes'])(
      'keeps %s, closing a parser nothing here needs',
      (flag) => {
        expect(rendererService).toContain(flag);
      },
    );
  });

  describe('nothing to steal if it is compromised', () => {
    /**
     * The renderer holds no secrets because it is handed none. A Chromium
     * bug in this container reaches a container with no database URL, no
     * bucket credentials and no application keys — which is the whole reason
     * the rendering is in a sidecar rather than in the API process
     * (D-026).
     */
    it('gives the renderer no environment block at all', () => {
      expect(rendererService).not.toMatch(/^\s+environment:/m);
    });

    it.each([
      'DATABASE_URL',
      'S3_ACCESS_KEY_ID',
      'S3_SECRET_ACCESS_KEY',
      'JWT_ACCESS_SECRET',
      'JWT_REFRESH_SECRET',
      'PATIENT_PII_ENCRYPTION_KEY',
      'AI_PROVIDER_ENCRYPTION_KEY',
    ])('never names %s in the renderer service', (secretName) => {
      expect(rendererService).not.toContain(secretName);
    });
  });

  describe('pinned, not floating', () => {
    /**
     * A floating tag would mean the browser engine on the untrusted-input
     * path could change under a restart nobody reviewed. The version is part
     * of the decision record.
     */
    it('pins the renderer image to an exact version', () => {
      expect(rendererService).toMatch(/image: gotenberg\/gotenberg:\d+\.\d+\.\d+\n/);
    });
  });
});
