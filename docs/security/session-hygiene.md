# Shared-workstation session hygiene

**SJ-9.** How a walked-away session dies, how a workstation is handed over, and
why none of it depends on the browser behaving.

> **Status: server side only.** The idle timeout, heartbeat, lock endpoint and
> `no-store` headers are implemented. The browser's warning modal, the lock
> button and cross-tab coordination are the second half of the ticket and are
> not built yet — see [Not yet built](#not-yet-built).

---

## The problem

A clinic terminal is shared. A nurse logs in, is called away, and never comes
back to that chair. Ten minutes later somebody else sits down holding the
nurse's session, with everything it can reach.

## The control is server-side, and that is the whole point

The tempting implementation is a JavaScript timer that shows a login screen
after fifteen minutes. That hides a session; it does not end one. The tokens
are still valid — open DevTools, or call the API with `curl`, and the data is
still there.

Instead, `refresh_tokens.last_used_at` records when the session was last known
to be in use, and `AuthService.refresh` refuses — and revokes the whole family
— when that is older than the threshold. The session is genuinely dead.

```
POST /auth/refresh
   └─ last_used_at older than the threshold?
         yes → revoke the family, audit SESSION_TIMEOUT, 401
         no  → rotate as normal, last_used_at = now
```

Access tokens are short, so an idle client's next request forces a refresh —
which is where it meets this check.

## Why there is a heartbeat

The ticket's model assumes refresh cadence tracks activity. It mostly does, but
not always: somebody *reading* a long patient record is present and
interacting while making no API calls at all. Under refresh-cadence alone they
look identical to someone who walked away, and get logged out mid-sentence.

`POST /auth/session/heartbeat` is the narrowest possible fix. It bumps
`last_used_at` without rotating, and its filters are what keep it honest:

| Condition | Why |
|---|---|
| not revoked | a heartbeat cannot resurrect a killed family |
| not expired | it extends idleness, never the token's own lifetime |
| **not already past the threshold** | a tab left open on a locked terminal cannot keep its own session alive forever |

Drop that third condition and the idle timeout becomes decorative. There is an
integration case pinning it.

The endpoint is authenticated by the refresh cookie alone, like `/auth/refresh`,
and is deliberately incapable of doing anything else.

## Configuration, and the trap in it

```bash
SESSION_IDLE_TIMEOUT_MINUTES="15"   # minimum 15 default, floor of 2
JWT_ACCESS_EXPIRES_IN="5m"          # must be well under the idle window
```

**These two interact.** An active session only contacts the server when its
access token expires, so the gap between refreshes *is* the access-token
lifetime. Set both to 15 minutes and every working session times out at the
boundary — the clinic sees random logouts and nobody connects it to this
setting.

A third of the window is a good ratio. `SessionPolicyService` warns at boot if
you get it wrong rather than letting it be discovered in production.

A threshold below two minutes is refused and falls back to the default: below
that, staff route around the control — a key propped on the keyboard, or a
request to switch it off entirely — and a disabled control protects nobody.

## Browser back after logout

Without `Cache-Control: no-store`, ending a session does nothing about the page
already on disk: the next person presses Back and the browser renders the
previous patient's record from its own cache, never asking the server.

`NoStoreInterceptor` keys off the existing `@Audited()` marker rather than a
second list of routes. That decorator already means "this route touches
patient-identifiable data" and is enforced on every patient-data controller by
the route-guard coverage spec, so a new route inherits both behaviours from one
annotation. A separate list would drift, silently.

Everything else stays cacheable — a blanket `no-store` would cost the clinic
every conditional request it gets for free, for no privacy gain.

## Lock versus logout

`POST /auth/session/lock` is mechanically identical to `/auth/logout`: the
family dies either way. It exists for the audit trail. "Are staff actually
locking terminals when they walk away" is a question a clinic will eventually
ask, and it is unanswerable if a deliberate hand-off looks the same as closing
a tab at the end of a shift.

## Audit events

| Verb | Means |
|---|---|
| `SESSION_TIMEOUT` | a terminal sat unattended with a session open |
| `SESSION_LOCK` | somebody handed the workstation over on purpose |
| `USER_LOGOUT` | an ordinary sign-out |

`SESSION_TIMEOUT` is deliberately not folded into a generic refusal, and
deliberately not `TOKEN_REUSE`. A timeout is nobody's fault and must not read
like theft; a rising count of them is a workflow finding, not a security
incident.

## Not yet built

The browser half of SJ-9:

- `IdleProvider` — activity listeners, countdown, auto-logout at the threshold
- The "still there?" modal at threshold − 60 s
- The one-click lock action that also clears the TanStack Query cache
- `BroadcastChannel` cross-tab coordination
- The storage audit confirming no tokens or patient data reach
  `localStorage` / `sessionStorage` / IndexedDB

Until that lands, an idle session still dies on the server — users simply get
no warning first. `GET`-ing the thresholds is already possible: the heartbeat
response carries `idleTimeoutSeconds` and `warningLeadSeconds` so the client
never hard-codes a countdown that disagrees with the server.
