# TLS everywhere

**SJ-1.** How traffic gets encrypted between a clinic workstation and this
system, and what still has to happen before it can be.

> **Status: proxy layer built, certificates not obtained.** Everything in this
> repository is in place. The parts that need a registered domain and DNS
> control are unbuilt and unverified — see [Blocked on](#blocked-on).

---

## The shape

```
clinic workstation
        │  https
        ▼
   Caddy  :80 → 301 → :443, terminates TLS
        │  http, Docker network only
        ├──────────────► api   :3001   (/api/*)
        └──────────────► web   :3000   (everything else)
```

The apps keep serving plain HTTP. Only Caddy binds host ports, so plaintext
exists nowhere except inside the Docker network.

That also makes the API **same-origin** with the web app —
`https://hms.<domain>/api/…` — which removes the CORS preflight and the
third-party cookie question entirely. Set `NEXT_PUBLIC_API_BASE_URL=""` in that
topology; empty means relative, and relative means same-origin.

## Why DNS-01 and not HTTP-01

HTTP-01 needs Let's Encrypt to reach port 80 from the public internet. A clinic
server behind a LAN firewall cannot offer that, and opening it just for
renewals undoes the reason the box is not exposed.

DNS-01 proves domain control by writing a TXT record, so the server needs
outbound access and nothing more.

**Scope the token to `_acme-challenge` TXT records on the one zone.** A
full-access DNS token sitting on the clinic's server is a domain takeover
waiting for one container escape.

## Blocked on

These are procurement and infrastructure decisions, not code:

| Needed | Why | Who |
|---|---|---|
| A registered domain | Certificates are issued to names, not IP addresses | Customer |
| DNS at an ACME-capable provider | DNS-01 writes a TXT record via API | Customer |
| A scoped API token | Caddy needs it to answer the challenge | Customer |
| Split-horizon DNS decision | Internal zone resolves `hms.<domain>` to the LAN IP; the public zone omits it or points at a VPN gateway | Ops + customer |

Until those exist, the following SJ-1 acceptance criteria **cannot be checked**,
and are not claimed:

- `curl -I http://hms.<domain>` returns 301
- `curl -I https://hms.<domain>` shows HSTS
- Certificate chain validates on a clinic workstation
- Automatic renewal / force-renewal test
- SSL Labs or `testssl.sh` grade A

## What you can exercise today

```bash
docker compose -f infra/docker/docker-compose.dev.yml --profile tls up
```

`Caddyfile.dev` issues from Caddy's own CA — no domain, no token, no outbound
network. The first visit warns until you trust the root:

```bash
docker compose -f infra/docker/docker-compose.dev.yml cp caddy:/data/caddy/pki/authorities/local/root.crt /tmp/hms-local-ca.crt
```

This is worth doing before the cutover rather than after, because the things
that actually break when a proxy appears all break here too: cookies gaining
`Secure`, `request.ip` arriving through `X-Forwarded-For`, and any absolute URL
built from a host header.

## Going live

1. Point internal DNS at the server: `hms.<domain>` → LAN IP.
2. Set `HMS_DOMAIN`, `ACME_EMAIL`, `CLOUDFLARE_API_TOKEN` in the deployment
   environment. Using a different DNS provider means changing the module in
   `infra/docker/caddy/Dockerfile` and the `dns` directive in the Caddyfile —
   they live under the same `caddy-dns` org.
3. Mount the production `Caddyfile` instead of `Caddyfile.dev`.
4. **Set `TRUSTED_PROXY_HOPS=1`.** Until you do, every audit row records the
   proxy's address instead of the client's. Add one per additional trusted hop;
   a cloud load balancer in front of Caddy makes it 2. Never round up — each
   extra hop is one more entry of a header the client supplied.
5. Set `NEXT_PUBLIC_API_BASE_URL=""` for same-origin, or an explicit
   `CORS_ALLOWED_ORIGINS` if you split the hosts.
6. Verify with `testssl.sh https://hms.<domain>` from a LAN host, then a real
   login through the proxy, then confirm `request.ip` is the workstation and
   not the proxy.

## Decisions taken here

**301, not Caddy's default 308.** Caddy would redirect on its own with a 308,
which is the more modern permanent redirect. SJ-1 asks for a 301, so the HTTP
site block states it rather than inheriting.

**No HSTS `preload`.** Submitting to the browser preload list is close to
irreversible — removal takes months to propagate — and commits every current
and future subdomain to HTTPS forever. That belongs to the customer, not to a
default in a config file.

**`max-age=300` in development.** Pinning `localhost` to HTTPS for a year would
break every other project on the machine that serves plain HTTP.

**Caddy is built, not pulled.** DNS providers are Go plugins, so DNS-01 needs a
custom binary. That is the only reason the proxy has a Dockerfile.

## Related

CORS moved to an env allowlist as part of this ticket
(`resolve-cors-options.ts`) — that is most of **SJ-20**, which may want
rescoping. `TRUSTED_PROXY_HOPS` was added by SJ-4 and is what SJ-18's rate
limiting will key on.
