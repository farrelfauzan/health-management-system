# SJ-1 — Caddy with the Cloudflare DNS module compiled in.
#
# The stock image cannot do DNS-01: Caddy's DNS providers are Go plugins, and
# plugins mean a rebuild. This is the whole reason the proxy has a Dockerfile
# rather than an `image:` line.
#
# Swapping providers is a one-word change. Route53, DigitalOcean, RFC2136 and
# the rest live under the same `caddy-dns` org; change the module here and the
# `dns` directive in the Caddyfile to match.
FROM caddy:2.10-builder AS builder

RUN xcaddy build \
    --with github.com/caddy-dns/cloudflare

FROM caddy:2.10

COPY --from=builder /usr/bin/caddy /usr/bin/caddy

# Certificates and ACME account keys live in /data, which the compose file
# mounts as a named volume. Losing it is not fatal — Caddy re-issues — but it
# burns Let's Encrypt rate limit for no reason, and a rate-limited clinic is a
# clinic serving a self-signed certificate to its own staff.
