-- Repairs notification `href` values that point at a shell the recipient does
-- not hold, or at a route that never existed.
--
-- Clicking such a row is not a 404: `apps/web/proxy.ts` gates `/admin/*` and
-- `/doctor/*` and answers a foreign shell with `redirectToHome()`, while a path
-- outside the matcher entirely (`/vault`) falls through to the root page, which
-- also redirects by role. Either way the reader silently lands on their own
-- dashboard, which is what was reported for a released lab result.
--
-- The producers are fixed in the same change; this backfills rows already
-- written. Shell precedence mirrors `proxy.ts` exactly: admin wins when an
-- account holds both, since the admin shell is a superset.

-- One reusable view of who can open which shell, by the same dual test the
-- proxy applies: the portal permission, or the role code as the fallback for
-- accounts minted before those grants were seeded.
CREATE TEMPORARY VIEW notification_recipient_shell AS
SELECT
    u.id AS user_id,
    CASE
        WHEN bool_or(p.permission_key = 'portal.admin-access:any')
          OR bool_or(r.code IN ('SUPER_ADMIN', 'ADMIN')) THEN 'admin'
        WHEN bool_or(p.permission_key = 'portal.doctor-access:any')
          OR bool_or(r.code = 'DOCTOR') THEN 'doctor'
        ELSE NULL
    END AS shell
FROM users u
LEFT JOIN user_roles ur
       ON ur.user_id = u.id
      AND ur.deleted_at IS NULL
      AND ur.unassigned_at IS NULL
LEFT JOIN roles r ON r.id = ur.role_id
LEFT JOIN role_permissions rp ON rp.role_id = r.id
LEFT JOIN permissions p ON p.id = rp.permission_id
GROUP BY u.id;

-- 1. Vault rows. `/vault` and `/vault/shared-with-me` are not routes at all;
--    the real pages are `/admin/vault` and `/doctor/vault`, and "shared with
--    me" is a panel inside them. Unresolvable recipients fall back to the
--    admin vault, matching the producers' best-effort behaviour.
UPDATE notifications n
SET href = CASE WHEN s.shell = 'doctor' THEN '/doctor/vault' ELSE '/admin/vault' END
FROM notification_recipient_shell s
WHERE s.user_id = n.user_id
  AND n.href IN ('/vault', '/vault/shared-with-me');

-- 2. Lab rows deep-linking into an encounter whose recipient has no doctor
--    shell. The order id is recovered through `params->>'orderNumber'`, which
--    every lab producer writes and which is unique on `lab_orders`.
UPDATE notifications n
SET href = '/admin/laboratory/' || lo.id
FROM notification_recipient_shell s, lab_orders lo
WHERE s.user_id = n.user_id
  AND n.type IN ('LAB_RESULT_RELEASED', 'LAB_RESULT_CRITICAL')
  AND n.href LIKE '/doctor/encounters/%'
  AND s.shell IS DISTINCT FROM 'doctor'
  AND lo.order_number = n.params->>'orderNumber';

-- 3. The same rows where the order can no longer be resolved (purged order, or
--    a row written before `orderNumber` was in `params`). A dead click beats
--    another silent bounce, and the copy still says what happened.
UPDATE notifications n
SET href = NULL
FROM notification_recipient_shell s
WHERE s.user_id = n.user_id
  AND n.type IN ('LAB_RESULT_RELEASED', 'LAB_RESULT_CRITICAL')
  AND n.href LIKE '/doctor/encounters/%'
  AND s.shell IS DISTINCT FROM 'doctor';

-- PATIENT_DOCUMENT_RELEASED is deliberately untouched: it is addressed to the
-- attending doctor of the encounter it links to, so its doctor-shell target is
-- correct and rewriting it would break a working link.

DROP VIEW notification_recipient_shell;
