# Notion Bug Board: onboarding, rotation, revocation

In-app bug reports (P23) are triaged by AI and published as tickets on the
Saling Jaga **Bug Board** in Notion. This runbook covers the Notion-side work:
the integrations, what they may reach, and the three operations that keep them
correct. It is the companion to `docs/security/secrets.md`, which owns the
secret inventory, and to `apps/api/.env.example`, which owns the variables.

**Nothing in this file names a real Notion id, token, or board URL. This
repository is public.** Ids live in each deployment's secret store and in the
Saling Jaga ops vault, never in git, never in a ticket, never in a commit
message.

---

## 1. The reach of one token

Every clinic runs its own HMS deployment, so the Notion token sits in every
clinic's secret store. That is the whole reason for the shape below: **one
internal integration per clinic deployment**, each with the smallest reach
Notion can express.

| | |
| --- | --- |
| Name | `HMS Bug Intake — <clinic>` |
| Type | Internal integration, Saling Jaga workspace |
| Capabilities | **Read content** and **Insert content** — nothing else |
| Not granted | Update content, Comment, Read user information |
| Shared with | The Bug Board **only** (production) or the sandbox board only (dev/staging) |

What this buys:

- Revoking one clinic touches no other clinic.
- A leaked token can file tickets on one board and read that board. It cannot
  reach any other page in the workspace, cannot edit a triaged ticket, and
  cannot enumerate users.
- Notion's **Created by** on each ticket shows which clinic filed it, without
  HMS having to be trusted about it.

The two guarantees worth re-testing after any change:

- A clinic token reading any page outside its board gets `404
  object_not_found` — Notion does not distinguish "not shared" from "does not
  exist", which is the behaviour we want.
- A clinic token updating an existing Bug Board page is refused.

## 2. Board schema

HMS writes these properties and no others. **Renaming or retyping any of them
breaks publishing and must be matched by the field check in P23-T04** — that
check exists precisely so a rename surfaces on `/admin/integrations` instead
of as a failed ticket nobody sees.

| Property | Type | Written by HMS |
| --- | --- | --- |
| Title | title | the AI-written one-line summary |
| Report ID | text | `BR-000123`; looked up before re-creating a page |
| Status | select | always `New` on publish |
| Severity | select | `P0 - Critical` … `P3 - Low`, AI-suggested |
| Type | select | `Bug` / `Feature Request` / `Question` / `Not a Bug` |
| Module | select | AI-chosen from the fixed option list |
| Clinic | text | which deployment filed it |
| Reporter Role | select | role of the reporter, never their name |
| Page | text | route, query string stripped, record ids replaced with `:id` |
| Request IDs | text | recent `X-Request-Id`s, for the API logs |
| Triaged By | select | `AI`, or `Fallback` when triage failed |
| App Version | text | the build that filed it |
| Reported At | date | when the report was filed |

`Assignee`, `Dev Ticket` and `Created` are for people and Notion; HMS never
writes them. A reporter's name, email, and the patient context they were
looking at are **not** on this list and never reach Notion — see the data
boundary decision record (P23-T06).

## 3. Boards

Two boards, never one:

- **Bug Board** — production. Only production deployments write here.
- **Bug Board (Sandbox)** — a duplicate of the same schema, for dev and
  staging. Every test ticket, every integration test against a live Notion,
  every "does publishing work" check goes here.

Duplicate the production board (⋯ → Duplicate, *with* its properties, without
its rows) whenever the schema changes, so the sandbox never drifts from what
the field check expects.

## 4. Add a clinic

1. **Notion → Settings → Connections → Develop or manage integrations → New
   integration.** Workspace: Saling Jaga. Name: `HMS Bug Intake — <clinic>`.
2. Capabilities: tick **Read content** and **Insert content**. Untick
   everything else, including user information.
3. Copy the **Internal Integration Secret**. This is the only time Notion
   shows it in full.
4. Open the board the deployment writes to — the Bug Board for production, the
   sandbox for dev and staging — then **⋯ → Connections → Connect to →** the
   new integration. Connect it to nothing else.
5. Copy the board's **data source id**. Not the database id: from API version
   `2025-09-03` a page is created under a data source, and the two ids are
   different. In the board's ⋯ menu, **Copy link to data source** (or take the
   `collection://` id a data-source-aware client reports); the id is the UUID,
   with or without dashes.
6. Put both into that deployment's secret store:

   ```
   NOTION_API_TOKEN=<internal integration secret>
   NOTION_BUG_BOARD_DATA_SOURCE_ID=<data source id>
   ```

   Both or neither — the API refuses to start with one and not the other, and
   an empty string counts as unset.
7. Restart the API. Confirm on `/admin/integrations` → Notion → **Test
   connection**: configured, the expected API version, the last four
   characters of the data source id, and a passing field check.
8. File a test report from that deployment and confirm the ticket lands on the
   **right** board, then delete it from the sandbox (a production test ticket
   should never have been created — step 3 of §3 exists to prevent it).

## 5. Rotate a token

Notion issues one secret per integration, so this is a swap, not an
issue-before-revoke. The gap costs nothing: reports queued while the token is
invalid stay queued and publish after the restart.

1. Integration → **Secrets** → *Rotate* (or *Show* → regenerate).
2. Update `NOTION_API_TOKEN` in that deployment's secret store.
3. Restart the API, then **Test connection**.
4. Watch the bug outbox drain. If it does not, the field check or the sharing
   is the problem, not the token — the status card names which.

Rotate on any suspicion of exposure, and whenever someone who had access to
the ops vault leaves.

## 6. Revoke a clinic

1. Delete that clinic's integration in Notion (or disconnect it from the
   board). Tickets it already filed stay on the board; Notion keeps them
   attributed to the deleted integration.
2. Clear `NOTION_API_TOKEN` and `NOTION_BUG_BOARD_DATA_SOURCE_ID` in that
   deployment, restart. The connector reports **not configured**, the API runs
   normally, and reports queue instead of failing.
3. If the clinic is going away entirely, decide what happens to its queued
   reports before the deployment is torn down — once it is gone, so are they.

## 7. Failure modes and what they mean

| What you see | What it is |
| --- | --- |
| Startup fails naming `NOTION_BUG_BOARD_DATA_SOURCE_ID` | only the token is set; set both or neither |
| `401 unauthorized` | token revoked, rotated elsewhere, or truncated in the secret store |
| `404 object_not_found` | the board was never connected to this integration, or the id is the *database* id rather than the data source id |
| `403 restricted_resource` | the integration is missing Insert content |
| Field check fails on `/admin/integrations` | someone renamed or retyped a board property — §2 |
| `429` in the logs, publishing slow but working | the per-process limiter is doing its job; only investigate if it persists |
| Connector reports "not configured" on a deployment that should publish | the secret store lost the values, or they expanded to `""` in CI |
