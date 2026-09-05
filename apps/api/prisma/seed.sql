BEGIN;

-- Immutable v1.0 notice is inserted by migration. Seed only verifies it exists;
-- changing legal text requires a new version and migration, never an upsert.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "privacy_notice_versions"
    WHERE "id" = 'c2a3ecb0-a352-4d49-a47c-39d1b67904c9'::uuid
      AND "version" = '1.0'
      AND "content_hash_id" = '604bbdce1ce3c208b7c66ac3e0f7def249f632a24d61dcd184fa0eb9fb5e5636'
      AND "content_hash_en" = 'b5660f0e1901ca9f45767c86b1c8589156c82100e35b97c64bd5ecfd45072b52'
  ) THEN
    RAISE EXCEPTION 'immutable privacy notice v1.0 is missing or does not match approved placeholder documents';
  END IF;
END $$;

WITH seed_roles(code, name, description) AS (
  VALUES
    ('SUPER_ADMIN', 'Super Admin', 'System-level administrator with full access'),
    ('ADMIN', 'Admin', 'Operational administrator for HMS modules'),
    ('DOCTOR', 'Doctor', 'Clinical user with doctor-scoped access'),
    ('PHARMACIST', 'Pharmacist', 'Pharmacy workflow operator'),
    ('PATIENT', 'Patient', 'Patient self-service access role'),
    -- Not a human role. It exists so the inbound BPJS Antrean bridge (P14-T04)
    -- has an actor whose reach is written down in the same table as everyone
    -- else's, instead of a code path that skips the permission check. Its
    -- grants below are exactly the six inbound services and nothing more.
    ('BPJS_ANTREAN_SYSTEM', 'BPJS Antrean Bridge', 'Reserved service account for inbound Mobile JKN queue calls'),
    -- Also not a human role. The WhatsApp/Telegram customer-service channel
    -- (PCS-T07) writes appointments and draft patients on behalf of people who
    -- have no HMS account at all, and every one of those rows needs an actor.
    -- Its grants below are the shortest list in this file, deliberately: this
    -- is the reach an anonymous member of the public gets if the webhook's
    -- secret-token check is ever defeated.
    ('CUSTOMER_SERVICE_CHANNEL', 'Customer Service Channel', 'Reserved service account for WhatsApp/Telegram chat bookings')
)
INSERT INTO "roles" (
  "id",
  "code",
  "name",
  "description",
  "is_system",
  "created_at",
  "updated_at",
  "deleted_at"
)
SELECT
  md5('role:' || code)::uuid,
  code,
  name,
  description,
  true,
  NOW(),
  NOW(),
  NULL
FROM seed_roles
ON CONFLICT ("code") DO UPDATE
SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "is_system" = EXCLUDED."is_system",
  "updated_at" = NOW(),
  "deleted_at" = NULL;

WITH seed_permissions(permission_key, resource, action, scope, description) AS (
  VALUES
    -- IMP-3: portal-shell access as a permission, so a custom role can reach
    -- a shell without impersonating a seeded role code. `proxy.ts` reads these
    -- from the JWT claim as a *navigation* gate only — the API's
    -- PermissionsGuard remains the authorisation boundary. The pharmacy
    -- workspace deliberately has no key yet: it is a slice of the admin shell,
    -- and stays role-gated until a custom role needs it.
    ('portal.admin-access:any', 'Portal', 'admin-access', 'ANY', 'Access the admin web shell'),
    ('portal.doctor-access:any', 'Portal', 'doctor-access', 'ANY', 'Access the doctor web shell'),
    ('portal.patient-access:own', 'Portal', 'patient-access', 'OWN', 'Access the patient portal'),
    ('role.assign:any', 'Role', 'assign', 'ANY', 'Assign roles to users'),
    ('role.read:any', 'Role', 'read', 'ANY', 'Read role catalog'),
    ('role.unassign:any', 'Role', 'unassign', 'ANY', 'Unassign roles from users'),
    -- IMP-1: role lifecycle. Deliberately not granted to ADMIN below — a
    -- role that can mint roles holding any permission is a super-admin
    -- capability, and SUPER_ADMIN inherits these through the catalog-wide
    -- grant. The permission catalog itself stays seed-only (no permission.*
    -- keys): roles are composed from it, never extended past it.
    ('role.create:any', 'Role', 'create', 'ANY', 'Create custom roles'),
    ('role.update:any', 'Role', 'update', 'ANY', 'Update roles and their permission sets'),
    ('role.delete:any', 'Role', 'delete', 'ANY', 'Delete custom roles'),
    ('auth.logout:own', 'Auth', 'logout', 'OWN', 'Logout own session'),
    ('user.read:any', 'User', 'read', 'ANY', 'Read all users'),
    ('user.create:any', 'User', 'create', 'ANY', 'Create users'),
    ('user.update:any', 'User', 'update', 'ANY', 'Update users'),
    -- P16-T41. A super-admin action and not deactivation (§7.3.10.2): it
    -- opens a 30-day vault-only window rather than locking the person out.
    -- Bound to no seeded role below; SUPER_ADMIN holds it through the
    -- catalog-wide grant, and `user-offboarding-rbac-seed.spec.ts` fails if
    -- any other role acquires it.
    ('user.offboard:any', 'User', 'offboard', 'ANY', 'Offboard a user into the 30-day export-only window, and re-onboard them'),
    ('patient.read:any', 'Patient', 'read', 'ANY', 'Read all patients'),
    ('patient.read:own', 'Patient', 'read', 'OWN', 'Read own patient profile'),
    ('patient.create:any', 'Patient', 'create', 'ANY', 'Create patients'),
    ('patient.update:any', 'Patient', 'update', 'ANY', 'Update all patients'),
    ('patient.update:own', 'Patient', 'update', 'OWN', 'Update own patient profile'),
    ('patient.read-identifier:any', 'Patient', 'read-identifier', 'ANY', 'Reveal any patient NIK and BPJS number'),
    ('patient.read-identifier:own', 'Patient', 'read-identifier', 'OWN', 'Reveal own NIK and BPJS number'),
    ('patient.import-identifier:any', 'Patient', 'import-identifier', 'ANY', 'Import patients with an existing medical record number'),
    ('doctor.read:any', 'Doctor', 'read', 'ANY', 'Read doctor profiles'),
    ('doctor.create:any', 'Doctor', 'create', 'ANY', 'Create doctor profiles'),
    ('doctor.update:any', 'Doctor', 'update', 'ANY', 'Update all doctor profiles'),
    ('doctor.update:own', 'Doctor', 'update', 'OWN', 'Update own doctor profile'),
    ('doctor.read-identifier:any', 'Doctor', 'read-identifier', 'ANY', 'Reveal any practitioner NIK'),
    ('doctor.read-identifier:own', 'Doctor', 'read-identifier', 'OWN', 'Reveal own practitioner NIK'),
    -- P16-T19. Its own key rather than reusing `doctor.read:any`, which is
    -- held by DOCTOR and PATIENT as well as ADMIN — a patient browsing the
    -- clinic's directory must not also be able to pull a roster of which
    -- practitioners are out of licence. The dashboard is a compliance surface
    -- for whoever administers credentials, so it gets a grant that names that
    -- and is seeded to ADMIN alone. `DoctorLicenseExpiry` is a subject rather
    -- than a `DoctorLicense` action because reading the expiry roster and
    -- reading a doctor's profile are different questions with different
    -- audiences.
    ('doctor.license-expiry.read:any', 'DoctorLicenseExpiry', 'read', 'ANY', 'Read the practitioner licence expiry dashboard'),
    ('doctor-patient.assign:any', 'DoctorPatient', 'assign', 'ANY', 'Assign doctors to patients'),
    ('doctor-patient.unassign:any', 'DoctorPatient', 'unassign', 'ANY', 'Unassign doctor-patient assignments'),
    ('doctor-patient.activity.read:any', 'DoctorPatientActivity', 'read', 'ANY', 'Read doctor-patient assignment activity log'),
    ('doctor.schedule.write:any', 'DoctorSchedule', 'write', 'ANY', 'Manage all doctor schedules'),
    ('doctor.schedule.write:own', 'DoctorSchedule', 'write', 'OWN', 'Manage own doctor schedule'),
    ('appointment.read:any', 'Appointment', 'read', 'ANY', 'Read all appointments'),
    ('appointment.read:own', 'Appointment', 'read', 'OWN', 'Read own appointments'),
    ('appointment.create:any', 'Appointment', 'create', 'ANY', 'Create appointments for any patient'),
    ('appointment.create:own', 'Appointment', 'create', 'OWN', 'Create own appointments'),
    ('appointment.update:any', 'Appointment', 'update', 'ANY', 'Update all appointments'),
    ('appointment.update:own', 'Appointment', 'update', 'OWN', 'Update own appointments'),
    ('appointment.cancel:any', 'Appointment', 'cancel', 'ANY', 'Cancel all appointments'),
    ('appointment.cancel:own', 'Appointment', 'cancel', 'OWN', 'Cancel own appointments'),
    ('appointment.approve:any', 'Appointment', 'approve', 'ANY', 'Approve or reject special appointment requests'),
    ('appointment.session.read:any', 'AppointmentSession', 'read', 'ANY', 'Read appointment sessions and queues'),
    ('appointment.session.read:own', 'AppointmentSession', 'read', 'OWN', 'Read own appointment sessions and queues'),
    ('appointment.session.update:any', 'AppointmentSession', 'update', 'ANY', 'Update appointment session capacity and status'),
    ('registration.read:any', 'Registration', 'read', 'ANY', 'Read all registrations'),
    ('registration.read:own', 'Registration', 'read', 'OWN', 'Read own registrations'),
    ('registration.create:any', 'Registration', 'create', 'ANY', 'Create registrations for any patient'),
    ('registration.create:own', 'Registration', 'create', 'OWN', 'Create own registrations'),
    ('registration.update:any', 'Registration', 'update', 'ANY', 'Update all registrations'),
    ('registration.update:own', 'Registration', 'update', 'OWN', 'Update own registrations'),
    ('encounter.read:any', 'Encounter', 'read', 'ANY', 'Read all clinical encounters'),
    ('encounter.read:own', 'Encounter', 'read', 'OWN', 'Read own clinical encounters'),
    ('encounter.write:any', 'Encounter', 'write', 'ANY', 'Open, record, and close any clinical encounter'),
    ('encounter.write:own', 'Encounter', 'write', 'OWN', 'Open, record, and close own clinical encounters'),
    ('icd10-code.read:any', 'Icd10Code', 'read', 'ANY', 'Search the ICD-10 diagnosis code catalog'),
    ('icd9cm-code.read:any', 'Icd9cmCode', 'read', 'ANY', 'Search the ICD-9-CM procedure code catalog'),
    ('medication.read:any', 'Medication', 'read', 'ANY', 'Read medications'),
    ('medication.create:any', 'Medication', 'create', 'ANY', 'Create medication catalog entries'),
    ('medication.update:any', 'Medication', 'update', 'ANY', 'Update medication catalog entries'),
    ('prescription.read:any', 'Prescription', 'read', 'ANY', 'Read all prescriptions'),
    ('prescription.read:own', 'Prescription', 'read', 'OWN', 'Read own prescriptions'),
    ('prescription.write:any', 'Prescription', 'write', 'ANY', 'Write prescriptions for any patient'),
    ('prescription.write:own', 'Prescription', 'write', 'OWN', 'Write prescriptions for owned patients'),
    ('dispense.write:any', 'DispenseRecord', 'write', 'ANY', 'Dispense medication records'),
    ('inventory.read:any', 'Inventory', 'read', 'ANY', 'Read stock receipts and inventory reports'),
    ('inventory.write:any', 'Inventory', 'write', 'ANY', 'Record medication stock receipts'),
    ('service-tariff.read:any', 'ServiceTariff', 'read', 'ANY', 'Read the service tariff price list'),
    ('service-tariff.write:any', 'ServiceTariff', 'write', 'ANY', 'Create and update service tariffs'),
    ('invoice.read:any', 'Invoice', 'read', 'ANY', 'Read all invoices'),
    ('invoice.write:any', 'Invoice', 'write', 'ANY', 'Generate, issue, and void invoices'),
    -- P16-T25. Separate from `invoice.write:any`: issuing a bill and
    -- transmitting a patient's charges outside the building are different
    -- acts, and a clinic that wants a junior cashier to do the first but not
    -- the second says so here, not in code (PRD §7.4.10).
    ('invoice.deliver:any', 'Invoice', 'deliver', 'ANY', 'Send invoices to patients over WhatsApp and email; retry and revoke deliveries'),
    ('payment.write:any', 'Payment', 'write', 'ANY', 'Record invoice payments'),
    -- P16-T02. Read is deliberately wider than write: the clinic's name,
    -- address and licence number are what every printed document is headed
    -- with, so any role that produces one has to be able to read them. Write
    -- is custody of the clinic's own identity — a changed name or licence
    -- number on a receipt is a document that misrepresents the facility — and
    -- sits with ADMIN alone, beside the other back-office grants.
    ('clinic-profile.read:any', 'ClinicProfile', 'read', 'ANY', 'Read the clinic identity printed on invoices and clinical documents'),
    ('clinic-profile.write:any', 'ClinicProfile', 'write', 'ANY', 'Edit the clinic identity and upload its logo'),
    -- P16-T04/T05. Both halves of the pair sit with ADMIN alone: a template
    -- decides what every printed invoice says, so editing one is custody of
    -- the clinic's paperwork, beside the clinic-profile grant above.
    ('document-template.read:any', 'DocumentTemplate', 'read', 'ANY', 'Read invoice and clinical document templates and the variables they may reference'),
    ('document-template.write:any', 'DocumentTemplate', 'write', 'ANY', 'Create, edit, publish, and archive document templates'),
    ('satusehat.link:any', 'Satusehat', 'link', 'ANY', 'Link patients and practitioners to SATUSEHAT IHS records'),
    ('satusehat.submission.read:any', 'SatusehatSubmission', 'read', 'ANY', 'Read SATUSEHAT submission outbox status'),
    ('satusehat.submission.retry:any', 'SatusehatSubmission', 'retry', 'ANY', 'Retry failed SATUSEHAT submissions'),
    ('bpjs.config.manage:any', 'BpjsConfig', 'manage', 'ANY', 'Manage BPJS bridging credentials and connection settings (PCare and Antrean Online)'),
    ('bpjs.reference.sync:any', 'BpjsReference', 'sync', 'ANY', 'Sync BPJS PCare reference catalogs and run keyword search-and-cache lookups'),
    ('bpjs.reference.read:any', 'BpjsReference', 'read', 'ANY', 'Read the synced BPJS PCare reference catalogs and their sync status'),
    ('bpjs.mapping.manage:any', 'BpjsMapping', 'manage', 'ANY', 'Map doctors, specialties, and medications to BPJS PCare codes'),
    ('bpjs.eligibility.check:any', 'BpjsEligibility', 'check', 'ANY', 'Check BPJS membership eligibility for a patient at registration check-in'),
    ('bpjs.submission.read:any', 'BpjsSubmission', 'read', 'ANY', 'Read BPJS PCare submission outbox status'),
    ('bpjs.submission.retry:any', 'BpjsSubmission', 'retry', 'ANY', 'Retry failed BPJS PCare submissions'),
    ('chat.session.create:own', 'ChatSession', 'create', 'OWN', 'Create own chat sessions'),
    ('chat.session.read:any', 'ChatSession', 'read', 'ANY', 'Read every chat session for the admin support view'),
    ('chat.session.read:own', 'ChatSession', 'read', 'OWN', 'Read own chat sessions'),
    ('chat.session.delete:own', 'ChatSession', 'delete', 'OWN', 'Soft-delete own chat sessions'),
    ('chat.message.create:own', 'ChatMessage', 'create', 'OWN', 'Create own chat messages'),
    ('chat.message.read:any', 'ChatMessage', 'read', 'ANY', 'Read all chat messages'),
    ('chat.message.read:own', 'ChatMessage', 'read', 'OWN', 'Read own chat messages'),
    ('ai-provider.read:any', 'AiProviderConfig', 'read', 'ANY', 'Read clinic AI provider configurations without their secrets'),
    ('ai-provider.write:any', 'AiProviderConfig', 'write', 'ANY', 'Create, rotate, activate, test, and retire AI provider configurations'),
    ('document.read:any', 'Document', 'read', 'ANY', 'Read every document in the shared document store'),
    ('document.write:any', 'Document', 'write', 'ANY', 'Upload, re-ingest, and delete clinic-corpus documents'),
    ('document.read:own', 'Document', 'read', 'OWN', 'Read documents in own personal knowledge base'),
    ('document.write:own', 'Document', 'write', 'OWN', 'Upload and delete documents in own personal knowledge base'),
    -- P16-T08: patient clinical files. OWN answers differently per verb, and
    -- the services enforce it: for read, a doctor reaches patients assigned
    -- to them or whose encounter they attended (the encounter.read:own
    -- definition), and a patient reaches their own released files; for
    -- write and release, only an active assignment counts — reading a past
    -- visit is clinical necessity, writing into a permanent record is not.
    -- Deletion exists only at ANY: it is an admin correction with a required
    -- reason, not a clinical act.
    ('patient-document.read:any', 'PatientDocument', 'read', 'ANY', 'Read every patient clinical document'),
    ('patient-document.read:own', 'PatientDocument', 'read', 'OWN', 'Read clinical documents of own patients, or own released documents'),
    ('patient-document.write:any', 'PatientDocument', 'write', 'ANY', 'Upload and edit clinical documents for any patient'),
    ('patient-document.write:own', 'PatientDocument', 'write', 'OWN', 'Upload and edit clinical documents for assigned patients'),
    ('patient-document.release:own', 'PatientDocument', 'release', 'OWN', 'Release clinical documents of assigned patients to the patient portal'),
    ('patient-document.delete:any', 'PatientDocument', 'delete', 'ANY', 'Soft-delete a clinical document, with a required reason'),
    -- P16-T17: a practitioner's own document vault. Only OWN exists, and that
    -- is the feature rather than an omission: FR-E3-03 requires that no
    -- read:any or write:any key exist for this surface for any role, ADMIN
    -- included, so there is no permission an administrator could be granted
    -- that would let them browse someone else's vault. The strongest
    -- guarantee available here is the one that is not configurable, and
    -- `vault-document-rbac-seed.spec.ts` asserts the ANY keys are absent from
    -- this catalog entirely — not merely unbound.
    ('vault-document.read:own', 'VaultDocument', 'read', 'OWN', 'Read documents in own personal vault'),
    ('vault-document.write:own', 'VaultDocument', 'write', 'OWN', 'Upload and edit documents in own personal vault'),
    -- P16-T41. Deletion split out of `write:own` so an offboarded person can
    -- be granted exactly "take a copy, then delete" without also being able
    -- to file anything new: the reduced ability branch names this key and
    -- `read:own`, and nothing else.
    ('vault-document.delete:own', 'VaultDocument', 'delete', 'OWN', 'Delete documents from own personal vault'),
    -- P16-T34. Separate from `write:own` for the same reason
    -- `invoice.deliver:any` is separate from `invoice.write:any`: handing a
    -- document to someone is a different act from editing it, and a
    -- deployment that wants the vault without the sharing engine can withhold
    -- this one key. Still OWN only — a share is created by the document's
    -- owner or by nobody, and there is no `:any` form for an administrator to
    -- be granted that would let them share a document they do not own.
    ('vault-document.share:own', 'VaultDocument', 'share', 'OWN', 'Share own vault documents with named users, and revoke those shares'),
    -- PCS-T08. Every conversation grant exists only in its ANY form, and that
    -- is structural rather than an oversight: a WhatsApp/Telegram conversation
    -- has no HMS user on either end, so there is no owner for an OWN scope to
    -- resolve against and no owned variant a guard could confuse this with.
    ('conversation.read:any', 'Conversation', 'read', 'ANY', 'Read every channel conversation and its transcript'),
    ('conversation.write:any', 'Conversation', 'write', 'ANY', 'Take over, release, and reply to channel conversations'),
    -- Split from write because the two are different acts. Replying and
    -- handing a conversation back and forth are the shift's ordinary work;
    -- silencing a member of the public is abuse control (§8.3), and the split
    -- is what lets a clinic hand out the first without the second.
    ('conversation.block:any', 'Conversation', 'block', 'ANY', 'Block and unblock an abusive channel chat'),
    -- Merging retires a patient record, which no other patient grant does —
    -- update edits a row, and this one ends it. It is `ANY` only: the merge is
    -- performed by whoever is at the counter when the person arrives, and that
    -- is never the record's owner.
    ('patient.merge:any', 'Patient', 'merge', 'ANY', 'Merge a chat-created draft patient into an existing record'),
    -- SJ-4. Reading the access history is the most privileged read in the
    -- system: one query answers who saw which patient, and the answer names
    -- every patient the clinic holds. It exists only in the ANY form because
    -- there is no owned slice of it worth handing out — a patient's own access
    -- history is a separate product decision, not a narrowing of this grant.
    ('audit.read:any', 'AuditLog', 'read', 'ANY', 'Query the patient-data access history'),
    -- IMP-6. Which optional features this client bought. The read grant is
    -- separate from the manage grant because the two answer to different
    -- people: support staff need to see why a screen is missing, and only the
    -- account that owns the contract may switch one back on. Neither is
    -- granted to ADMIN below — entitlements are the vendor's lever, not the
    -- clinic's, and SUPER_ADMIN picks both up from the catalog-wide union.
    ('feature.read:any', 'FeatureEntitlement', 'read', 'ANY', 'Read the per-client feature entitlement list'),
    ('feature.manage:any', 'FeatureEntitlement', 'manage', 'ANY', 'Switch an optional feature on or off for this client'),
    -- IMP-7. The shell needs the enabled key set to know which nav entries to
    -- draw, so every signed-in role holds this one. It is a separate *action*
    -- rather than a narrower scope of `feature.read` because `PermissionsGuard`
    -- matches on action and subject and never on scope — `feature.read:own`
    -- would have opened the admin list, notes and all, to every patient.
    -- `patient.read-identifier` splits an action the same way.
    ('feature.read-availability:own', 'FeatureEntitlement', 'read-availability', 'OWN', 'Read which features this client may use'),
    -- IMP-12. Room inventory: the RoomClass -> Ward -> Room -> Bed tree from
    -- IMP-11. Four resources rather than one `Inventory` because they are four
    -- CASL subjects and a clinic that lets a ward clerk rename beds must not
    -- thereby let them close a ward -- still less redefine what a class costs.
    -- Read is separate from write for the ordinary reason: the admissions
    -- screen needs the bed list to pick from, and picking a bed is not
    -- managing the floor plan.
    --
    -- `roomclass` has no dot in its resource name because `permissionToRule`
    -- on the web splits an `a.b.c` key into resource `a.b` and action `c` --
    -- `room.class.read:any` would resolve to the `Room` subject and silently
    -- widen a class grant into a room grant.
    ('roomclass.read:any', 'RoomClass', 'read', 'ANY', 'Read the room class catalog'),
    ('roomclass.create:any', 'RoomClass', 'create', 'ANY', 'Create room classes'),
    ('roomclass.update:any', 'RoomClass', 'update', 'ANY', 'Update room classes, including their quota'),
    ('roomclass.delete:any', 'RoomClass', 'delete', 'ANY', 'Retire room classes'),
    ('ward.read:any', 'Ward', 'read', 'ANY', 'Read the ward list'),
    ('ward.create:any', 'Ward', 'create', 'ANY', 'Create wards'),
    ('ward.update:any', 'Ward', 'update', 'ANY', 'Update wards'),
    ('ward.delete:any', 'Ward', 'delete', 'ANY', 'Retire wards'),
    ('room.read:any', 'Room', 'read', 'ANY', 'Read the room list'),
    ('room.create:any', 'Room', 'create', 'ANY', 'Create rooms'),
    ('room.update:any', 'Room', 'update', 'ANY', 'Update rooms and their class'),
    ('room.delete:any', 'Room', 'delete', 'ANY', 'Retire rooms'),
    ('bed.read:any', 'Bed', 'read', 'ANY', 'Read beds and their occupancy status'),
    ('bed.create:any', 'Bed', 'create', 'ANY', 'Create beds'),
    ('bed.update:any', 'Bed', 'update', 'ANY', 'Update beds, including taking one out for maintenance'),
    ('bed.delete:any', 'Bed', 'delete', 'ANY', 'Retire beds'),
    -- IMP-12. Admissions. The lifecycle verbs are separate permissions rather
    -- than one `admission.update`, because `PermissionsGuard` matches on
    -- action and never on the shape of the body: without them, anyone who
    -- could correct a typo in an admission note could also discharge the
    -- patient.
    --
    -- Two absences are deliberate. There is no `admission.create` -- admitting
    -- *is* creating, and a second key for the same act would be a grant that
    -- either duplicates `admission.admit` or contradicts it. And there is no
    -- `admission.delete`: an admission opened in error is CANCELLED, which is
    -- why `AdmissionStatus` has that value, so a delete grant would be the
    -- only way to make a stay disappear from the record PMK 24/2022 requires
    -- be kept.
    ('admission.read:any', 'Admission', 'read', 'ANY', 'Read every admission'),
    ('admission.read:own', 'Admission', 'read', 'OWN', 'Read admissions this doctor admitted or cares for'),
    ('admission.update:any', 'Admission', 'update', 'ANY', 'Correct admission details such as the reason for admission'),
    ('admission.admit:any', 'Admission', 'admit', 'ANY', 'Admit a patient to a bed'),
    ('admission.transfer:any', 'Admission', 'transfer', 'ANY', 'Transfer an admitted patient to another bed'),
    ('admission.discharge:any', 'Admission', 'discharge', 'ANY', 'Discharge an admitted patient'),
    ('admission.cancel:any', 'Admission', 'cancel', 'ANY', 'Cancel an admission opened in error'),
    -- OWN-scope only, by construction: a notification names its recipient, so
    -- an ANY grant would be a read on other people's inboxes with no surface
    -- that needs it. `manage` covers marking read; there is no delete -- the
    -- feed is append-only and rows age out of relevance, not existence.
    ('notification.read:own', 'Notification', 'read', 'OWN', 'Read own in-app notifications'),
    ('notification.manage:own', 'Notification', 'manage', 'OWN', 'Mark own in-app notifications as read'),
    -- SJ-1. The org chart. Read is split from write for the ordinary reason
    -- and one specific one: the structure screen shows a read-only tree to
    -- anyone who may look, so "may see the chart" has to be grantable without
    -- "may redraw it".
    --
    -- Structure and membership are two keys, not one, because they are two
    -- jobs: an office manager who maintains the boxes is not thereby the
    -- person who decides which box an employee sits in, and the platforms this
    -- was modelled on (Google Workspace, Entra ID) separate them for the same
    -- reason. `manage` covers create/update/move/archive/delete as one grant --
    -- unlike the room inventory above, where a separate `delete` exists,
    -- because deletion here is already refused while anything hangs off the
    -- unit, so it is not the sharper capability it is for a bed.
    --
    -- Three dot-segments is fine and deliberate: `permissionToRule` and
    -- `packPermissionHint` both split on the *last* dot, so these resolve to
    -- resource `organization.structure` / `organization.member` -- the same
    -- shape as the existing `doctor.schedule.write:any` and
    -- `appointment.session.read:any`. Both resources are registered in the
    -- web's `SUBJECT_BY_RESOURCE`.
    ('organization.structure.read:any', 'OrganizationUnit', 'read', 'ANY', 'Read the organization structure tree'),
    ('organization.structure.manage:any', 'OrganizationUnit', 'manage', 'ANY', 'Create, rename, move, archive and delete organization units'),
    ('organization.member.manage:any', 'OrganizationUnitMember', 'manage', 'ANY', 'Assign staff to organization units')
)
INSERT INTO "permissions" (
  "id",
  "permission_key",
  "resource",
  "action",
  "scope",
  "description",
  "created_at",
  "updated_at"
)
SELECT
  md5('permission:' || permission_key)::uuid,
  permission_key,
  resource,
  action,
  scope::"PermissionScope",
  description,
  NOW(),
  NOW()
FROM seed_permissions
ON CONFLICT ("permission_key") DO UPDATE
SET
  "resource" = EXCLUDED."resource",
  "action" = EXCLUDED."action",
  "scope" = EXCLUDED."scope",
  "description" = EXCLUDED."description",
  "updated_at" = NOW();

WITH explicit_role_permissions(role_code, permission_key) AS (
  VALUES
    ('ADMIN', 'portal.admin-access:any'),
    ('ADMIN', 'role.assign:any'),
    ('ADMIN', 'role.read:any'),
    ('ADMIN', 'role.unassign:any'),
    ('ADMIN', 'auth.logout:own'),
    ('ADMIN', 'user.read:any'),
    ('ADMIN', 'user.create:any'),
    ('ADMIN', 'user.update:any'),
    ('ADMIN', 'patient.read:any'),
    ('ADMIN', 'patient.create:any'),
    ('ADMIN', 'patient.update:any'),
    -- Unmasking is deliberately narrow: front-desk admins verify a KTP against
    -- the record and migrate legacy folders; doctors and pharmacists work from
    -- the MRN and get neither grant.
    ('ADMIN', 'patient.read-identifier:any'),
    ('ADMIN', 'patient.import-identifier:any'),
    ('ADMIN', 'doctor.read-identifier:any'),
    -- ADMIN only. DOCTOR and PATIENT hold `doctor.read:any` and neither gets
    -- this one: the expiry roster is the clinic's compliance record, not part
    -- of the public directory.
    ('ADMIN', 'doctor.license-expiry.read:any'),
    ('ADMIN', 'doctor.read:any'),
    ('ADMIN', 'doctor.create:any'),
    ('ADMIN', 'doctor.update:any'),
    ('ADMIN', 'doctor-patient.assign:any'),
    ('ADMIN', 'doctor-patient.unassign:any'),
    ('ADMIN', 'doctor-patient.activity.read:any'),
    ('ADMIN', 'doctor.schedule.write:any'),
    ('ADMIN', 'appointment.read:any'),
    ('ADMIN', 'appointment.create:any'),
    ('ADMIN', 'appointment.update:any'),
    ('ADMIN', 'appointment.cancel:any'),
    ('ADMIN', 'appointment.approve:any'),
    ('ADMIN', 'appointment.session.read:any'),
    ('ADMIN', 'appointment.session.update:any'),
    ('ADMIN', 'registration.read:any'),
    ('ADMIN', 'registration.create:any'),
    ('ADMIN', 'registration.update:any'),
    -- Front-desk staff open the encounter and record the vitals they take at
    -- check-in, which is how an Indonesian clinic actually runs; the doctor
    -- signs the SOAP note and the codes. Authorship is recorded per row
    -- (`recorded_by_id`), so a shared write grant does not blur who wrote what.
    ('ADMIN', 'encounter.read:any'),
    ('ADMIN', 'encounter.write:any'),
    ('ADMIN', 'icd10-code.read:any'),
    ('ADMIN', 'icd9cm-code.read:any'),
    ('ADMIN', 'medication.read:any'),
    ('ADMIN', 'medication.create:any'),
    ('ADMIN', 'medication.update:any'),
    ('ADMIN', 'prescription.read:any'),
    ('ADMIN', 'prescription.write:any'),
    ('ADMIN', 'dispense.write:any'),
    ('ADMIN', 'inventory.read:any'),
    ('ADMIN', 'inventory.write:any'),
    -- The cashier is the front desk in an Indonesian pratama clinic, so the
    -- ADMIN role carries the whole kasir surface. Doctors and patients get no
    -- billing grant: the invoice reaches the patient as paper (or later via a
    -- patient-facing read in the frontend phase), and pricing is not a
    -- clinical decision.
    ('ADMIN', 'service-tariff.read:any'),
    ('ADMIN', 'service-tariff.write:any'),
    ('ADMIN', 'invoice.read:any'),
    ('ADMIN', 'invoice.write:any'),
    ('ADMIN', 'invoice.deliver:any'),
    ('ADMIN', 'payment.write:any'),
    ('ADMIN', 'clinic-profile.read:any'),
    ('ADMIN', 'clinic-profile.write:any'),
    -- Template authoring is back-office layout work, not a clinical act, and
    -- it decides what every printed document says about the clinic.
    ('ADMIN', 'document-template.read:any'),
    ('ADMIN', 'document-template.write:any'),
    -- SATUSEHAT linkage is a national-identifier operation performed at the
    -- front desk / back office, never by doctors or patients themselves.
    ('ADMIN', 'satusehat.link:any'),
    ('ADMIN', 'satusehat.submission.read:any'),
    ('ADMIN', 'satusehat.submission.retry:any'),
    -- BPJS credential custody is a back-office operation: the stored PCare
    -- login can create and delete claims, so only ADMIN manages it. Secrets
    -- are write-only in the API regardless of this grant.
    ('ADMIN', 'bpjs.config.manage:any'),
    -- Reference sync and code mapping are back-office setup for the same
    -- bridging: sync/search hit the live PCare API under the stored
    -- credentials, and a wrong mapping mis-codes every later claim, so all
    -- three stay ADMIN-only. Read is split from sync so the P11-T07
    -- integrations monitor can watch catalogs without the mutating grant.
    ('ADMIN', 'bpjs.reference.sync:any'),
    ('ADMIN', 'bpjs.reference.read:any'),
    ('ADMIN', 'bpjs.mapping.manage:any'),
    -- Eligibility checks are a front-desk operation at check-in; the front
    -- desk operates under ADMIN. The check reveals membership PII (member
    -- name, class, registered FKTP), so it stays off DOCTOR and PATIENT.
    ('ADMIN', 'bpjs.eligibility.check:any'),
    -- Submission read and retry are split for the same reason as the
    -- SATUSEHAT pair: watching the outbox is monitoring, retrying re-opens
    -- work, and the P11-T07 integrations monitor needs only the former.
    ('ADMIN', 'bpjs.submission.read:any'),
    ('ADMIN', 'bpjs.submission.retry:any'),
    -- The chatbot ships two channels, PATIENT and DOCTOR, so PHARMACIST is
    -- absent from every chat grant below. The design note reads "all
    -- authenticated" for the OWN-scoped session reads, but a role that cannot
    -- create a session has nothing to read or delete — the grant would never
    -- resolve a row, and deny-by-default is the cheaper default to widen later.
    --
    -- Session read splits ANY/OWN like the two submission-outbox pairs above:
    -- ANY is the admin support view over every transcript, OWN is the admin's
    -- own conversations. Deletion stays OWN even for ADMIN — a transcript
    -- records what a patient was told, which is why P13-T01 made the session
    -- owner `onDelete: Restrict`, so removing someone else's is a retention
    -- decision for a retention job, not a support action.
    ('ADMIN', 'chat.session.create:own'),
    ('ADMIN', 'chat.session.read:any'),
    ('ADMIN', 'chat.session.delete:own'),
    ('ADMIN', 'chat.message.create:own'),
    ('ADMIN', 'chat.message.read:any'),
    -- Provider credentials spend the clinic's money at an upstream vendor and
    -- decide which third party sees chat context, so custody sits with ADMIN
    -- alone — the same call as bpjs.config.manage. Read is split from write so
    -- an ops surface can show which provider is live without the grant that
    -- rotates the key; the stored key is write-only in the API regardless.
    ('ADMIN', 'ai-provider.read:any'),
    ('ADMIN', 'ai-provider.write:any'),
    -- The clinic corpus is admin-managed: SOPs, the FAQ, price lists, the
    -- BPJS process. `ANY` is custody of what the assistant is allowed to cite
    -- as clinic policy, which is why it does not follow the pattern of the
    -- catalogue grants around it and sits with ADMIN alone.
    ('ADMIN', 'document.read:any'),
    ('ADMIN', 'document.write:any'),
    -- The personal knowledge base is a different grant, not a subset of the
    -- one above: an admin curating their own operational playbooks is acting
    -- as an owner, and the P15-T20 routes resolve OWN scope against the
    -- document's `ownerId`. Holding both is normal here and means the two
    -- corpora stay distinguishable in the audit trail.
    ('ADMIN', 'document.read:own'),
    ('ADMIN', 'document.write:own'),
    -- Patient clinical files (P16-T08): the front desk files what the
    -- patient brought, and mis-filed documents are corrected here. Release
    -- is deliberately absent — deciding when a result reaches the patient is
    -- a clinical call, and ADMIN holds no release grant at any scope.
    ('ADMIN', 'patient-document.read:any'),
    ('ADMIN', 'patient-document.write:any'),
    ('ADMIN', 'patient-document.delete:any'),
    -- Their own vault, on exactly the same terms as a doctor's (P16-T17): an
    -- administrator is also a person with a contract and a KTP. It grants
    -- them nothing over anyone else's documents, and there is no ANY key
    -- above that could.
    ('ADMIN', 'vault-document.read:own'),
    ('ADMIN', 'vault-document.write:own'),
    ('ADMIN', 'vault-document.delete:own'),
    ('ADMIN', 'vault-document.share:own'),
    -- The human side of the WA/Telegram channel (PCS-T08). ADMIN only: these
    -- routes read what members of the public wrote to the clinic and speak
    -- back to them under the clinic's name, and neither is a clinical role's
    -- work. SUPER_ADMIN receives all three through the blanket grant below.
    ('ADMIN', 'conversation.read:any'),
    ('ADMIN', 'conversation.write:any'),
    ('ADMIN', 'conversation.block:any'),
    -- §5.2's arrival merge. Held by ADMIN alone even though the front desk
    -- performs it, for the same reason `patient.read-identifier` is: the
    -- action is irreversible from the desk's side, and the record it retires
    -- is one the clinic keeps for 25 years.
    ('ADMIN', 'patient.merge:any'),
    -- SJ-4's access history. Administrative, not clinical: a doctor answers
    -- "what is wrong with this patient", an administrator answers "who has
    -- been reading about them", and only the second question needs a view
    -- across every record in the clinic. SUPER_ADMIN holds it implicitly.
    ('ADMIN', 'audit.read:any'),
    ('DOCTOR', 'portal.doctor-access:any'),
    ('DOCTOR', 'auth.logout:own'),
    ('DOCTOR', 'patient.read:own'),
    ('DOCTOR', 'doctor.read:any'),
    ('DOCTOR', 'doctor.read-identifier:own'),
    ('DOCTOR', 'doctor.schedule.write:own'),
    -- Doctors consult their agenda; the front desk and patients own booking.
    -- No create grant: the schedule is read-and-manage-own only, and session
    -- visibility is OWN so one doctor never browses another doctor's calendar.
    ('DOCTOR', 'appointment.read:own'),
    ('DOCTOR', 'appointment.update:own'),
    ('DOCTOR', 'appointment.cancel:own'),
    ('DOCTOR', 'appointment.session.read:own'),
    ('DOCTOR', 'registration.read:any'),
    -- OWN for a doctor means the encounters they attended plus those of
    -- patients actively assigned to them: a clinician needs the previous
    -- visits to read the current one, and the assignment is what says the
    -- relationship exists.
    ('DOCTOR', 'encounter.read:own'),
    ('DOCTOR', 'encounter.write:own'),
    -- The doctor codes the diagnosis and the procedures, so both lookups are
    -- clinical tools, not admin ones. Pharmacists and patients get no grant.
    ('DOCTOR', 'icd10-code.read:any'),
    ('DOCTOR', 'icd9cm-code.read:any'),
    ('DOCTOR', 'medication.read:any'),
    ('DOCTOR', 'prescription.read:own'),
    ('DOCTOR', 'prescription.write:own'),
    ('DOCTOR', 'chat.session.create:own'),
    ('DOCTOR', 'chat.session.read:own'),
    ('DOCTOR', 'chat.session.delete:own'),
    ('DOCTOR', 'chat.message.create:own'),
    ('DOCTOR', 'chat.message.read:own'),
    -- A doctor's own reference corpus — guidelines, formularies, papers they
    -- work from. `OWN` only: a personal knowledge base is private to its
    -- owner and is filtered by `ownerId` in the repository query, so another
    -- doctor's documents are not in the candidate set rather than merely
    -- unlikely to rank (ai-chatbot-tools.md §5.5). No `ANY` grant for DOCTOR
    -- at any point — that would make every personal corpus readable by every
    -- clinician.
    ('DOCTOR', 'document.read:own'),
    ('DOCTOR', 'document.write:own'),
    -- Patient clinical files (P16-T08), OWN only. Read reaches assigned
    -- patients plus patients whose encounters this doctor attended; write is
    -- assignment-only, and there is no break-glass path. Release is the
    -- clinical decision that puts a result in front of the patient
    -- (FR-E2-13), which is why it exists here and nowhere else. No delete:
    -- removing a clinical file is an admin correction.
    ('DOCTOR', 'patient-document.read:own'),
    ('DOCTOR', 'patient-document.write:own'),
    ('DOCTOR', 'patient-document.release:own'),
    -- Their own paperwork (P16-T17): STR, ijazah, Serkom, contracts, KTP.
    -- The only person who ever sees these files is the person who uploaded
    -- them — no admin review, no verification workflow, no expiry queue that
    -- anyone but the owner reads.
    ('DOCTOR', 'vault-document.read:own'),
    ('DOCTOR', 'vault-document.write:own'),
    ('DOCTOR', 'vault-document.delete:own'),
    ('DOCTOR', 'vault-document.share:own'),
    -- Read only, for the same reason PHARMACIST has it (P16-T02): a
    -- prescription, a referral letter and a medical certificate are all
    -- headed with the clinic's identity, and a doctor who cannot read it
    -- cannot produce one. Editing it is not a clinical act.
    ('DOCTOR', 'clinic-profile.read:any'),
    ('PHARMACIST', 'auth.logout:own'),
    ('PHARMACIST', 'medication.read:any'),
    ('PHARMACIST', 'medication.create:any'),
    ('PHARMACIST', 'medication.update:any'),
    ('PHARMACIST', 'prescription.read:any'),
    ('PHARMACIST', 'dispense.write:any'),
    ('PHARMACIST', 'inventory.read:any'),
    ('PHARMACIST', 'inventory.write:any'),
    -- Read only, and only because a dispensing label and a pharmacy receipt
    -- carry the clinic's name (P16-T02). Nothing a pharmacist does edits it.
    ('PHARMACIST', 'clinic-profile.read:any'),
    ('PATIENT', 'portal.patient-access:own'),
    ('PATIENT', 'auth.logout:own'),
    ('PATIENT', 'patient.read:own'),
    ('PATIENT', 'patient.update:own'),
    ('PATIENT', 'patient.read-identifier:own'),
    ('PATIENT', 'doctor.read:any'),
    ('PATIENT', 'appointment.read:own'),
    ('PATIENT', 'appointment.create:own'),
    ('PATIENT', 'appointment.update:own'),
    ('PATIENT', 'appointment.cancel:own'),
    ('PATIENT', 'appointment.session.read:any'),
    -- Own clinical documents (P16-T08), read only, and only what a clinician
    -- has released (FR-E2-13): the services resolve OWN for a patient as
    -- their own record filtered to `released_to_patient`, so an unreleased
    -- result is not in the queried set rather than merely hidden.
    ('PATIENT', 'patient-document.read:own'),
    ('PATIENT', 'registration.read:own'),
    ('PATIENT', 'registration.create:own'),
    ('PATIENT', 'registration.update:own'),
    -- Read-only, and only their own: PMK 24/2022 gives the patient access to
    -- the content of their record while authorship stays with the clinic.
    ('PATIENT', 'encounter.read:own'),
    ('PATIENT', 'prescription.read:own'),
    ('PATIENT', 'chat.session.create:own'),
    ('PATIENT', 'chat.session.read:own'),
    ('PATIENT', 'chat.session.delete:own'),
    ('PATIENT', 'chat.message.create:own'),
    ('PATIENT', 'chat.message.read:own'),
    -- The inbound BPJS Antrean bridge (P14-T04). Enumerated one line at a time
    -- rather than borrowed from ADMIN, because this is the reach a caller from
    -- the public internet gets if the token check is ever defeated, and the
    -- list is the mitigation. Two grants are deliberately absent:
    -- `patient.read-identifier:any`, because the bridge matches members through
    -- the blind index and never decrypts a NIK; and every `registration.*`
    -- grant, because a Mobile JKN booking is an appointment — the patient is
    -- still checked in at the counter by a human.
    ('BPJS_ANTREAN_SYSTEM', 'patient.read:any'),
    ('BPJS_ANTREAN_SYSTEM', 'patient.create:any'),
    ('BPJS_ANTREAN_SYSTEM', 'appointment.read:any'),
    ('BPJS_ANTREAN_SYSTEM', 'appointment.create:any'),
    ('BPJS_ANTREAN_SYSTEM', 'appointment.cancel:any'),
    ('BPJS_ANTREAN_SYSTEM', 'appointment.session.read:any'),
    -- The WA/Telegram customer-service channel (PCS-T07). Five grants, and the
    -- absences are the design:
    --   * no `patient.update`, because the channel never edits a record it did
    --     not create — §5.2 has the front desk complete a draft, and a chat
    --     that could write to an existing patient would make the §5.1.1
    --     verification pointless;
    --   * no `patient.read-identifier`, because no tool returns an identifier
    --     and the phone match runs on a normalised digit comparison;
    --   * no `appointment.cancel`, because cancelling by chat is out of scope
    --     until a confirmation-code lookup exists (§1.3);
    --   * no `registration.*`, because a chat booking is an appointment — the
    --     patient is still checked in at the counter by a human.
    -- `patient.read:any` is the one worth pausing on. The channel needs it for
    -- exactly one question — does this typed number match a record, so §5.1.1
    -- knows whether to challenge — and the mitigation is that the tool
    -- catalogue has nowhere to spend it: none of the three tools returns a
    -- patient.
    ('CUSTOMER_SERVICE_CHANNEL', 'patient.read:any'),
    ('CUSTOMER_SERVICE_CHANNEL', 'patient.create:any'),
    ('CUSTOMER_SERVICE_CHANNEL', 'appointment.read:any'),
    ('CUSTOMER_SERVICE_CHANNEL', 'appointment.create:any'),
    ('CUSTOMER_SERVICE_CHANNEL', 'appointment.session.read:any'),
    -- Booking is the moment a doctor becomes one of this patient's doctors, and
    -- `AppointmentManagementService` writes that link for every booking rather
    -- than only the ones made from the admin screens. The channel needs the
    -- grant to complete its own bookings' side of it.
    -- The same mitigation as `patient.read:any` applies: the tool catalogue is
    -- an allowlist of three, none of them assigns anything, so this is spendable
    -- only on the doctor a customer just booked.
    ('CUSTOMER_SERVICE_CHANNEL', 'doctor-patient.assign:any'),
    -- IMP-7. Every role a human signs in as; the shell cannot draw its
    -- navigation without knowing which features exist here. Service accounts
    -- render no shell and are left out. A custom role picks this up the same
    -- way it picks up any other grant — from the permission matrix.
    ('ADMIN', 'feature.read-availability:own'),
    ('DOCTOR', 'feature.read-availability:own'),
    ('PHARMACIST', 'feature.read-availability:own'),
    ('PATIENT', 'feature.read-availability:own'),
    -- IMP-12. Inventory is the ward clerk's job, so ADMIN owns the whole
    -- RoomClass/Ward/Room/Bed tree.
    ('ADMIN', 'roomclass.read:any'),
    ('ADMIN', 'roomclass.create:any'),
    ('ADMIN', 'roomclass.update:any'),
    ('ADMIN', 'roomclass.delete:any'),
    ('ADMIN', 'ward.read:any'),
    ('ADMIN', 'ward.create:any'),
    ('ADMIN', 'ward.update:any'),
    ('ADMIN', 'ward.delete:any'),
    ('ADMIN', 'room.read:any'),
    ('ADMIN', 'room.create:any'),
    ('ADMIN', 'room.update:any'),
    ('ADMIN', 'room.delete:any'),
    ('ADMIN', 'bed.read:any'),
    ('ADMIN', 'bed.create:any'),
    ('ADMIN', 'bed.update:any'),
    ('ADMIN', 'bed.delete:any'),
    -- Doctors read the floor plan and never edit it: the bed picker on the
    -- admit form is a list of rooms and beds, and choosing one is not
    -- managing inventory. The class read comes with it because a bed is
    -- rendered with the class it sits in.
    ('DOCTOR', 'roomclass.read:any'),
    ('DOCTOR', 'ward.read:any'),
    ('DOCTOR', 'room.read:any'),
    ('DOCTOR', 'bed.read:any'),
    -- IMP-12. Who may move a patient through a stay.
    --
    -- Both ADMIN and DOCTOR hold the lifecycle verbs, and that is not a
    -- widening of the doctor's reach -- it is an admission of who actually
    -- types. Admitting and discharging are transacted at the ward desk by the
    -- clerk working from the admitting doctor's order; `admitting_doctor_id`
    -- records the clinician responsible as *data*, which is a different
    -- question from who operated the screen. IMP-16's acceptance criterion --
    -- an admin running a full admit -> discharge from the UI -- is that same
    -- fact stated from the other end.
    --
    -- The scopes differ, and that is where the two roles part company: ADMIN
    -- reads every admission because the occupancy board is a whole-clinic
    -- view, while DOCTOR reads only stays they admitted or are on the care
    -- team for, resolved per-service the same way `patient.read:own` is.
    ('ADMIN', 'admission.read:any'),
    ('ADMIN', 'admission.update:any'),
    ('ADMIN', 'admission.admit:any'),
    ('ADMIN', 'admission.transfer:any'),
    ('ADMIN', 'admission.discharge:any'),
    ('ADMIN', 'admission.cancel:any'),
    ('DOCTOR', 'admission.read:own'),
    ('DOCTOR', 'admission.admit:any'),
    ('DOCTOR', 'admission.transfer:any'),
    ('DOCTOR', 'admission.discharge:any'),
    -- Every human role gets its own bell, the same way `auth.logout:own` is
    -- universal. The two service accounts are deliberately absent: nothing
    -- reads a feed on their behalf.
    ('ADMIN', 'notification.read:own'),
    ('ADMIN', 'notification.manage:own'),
    ('DOCTOR', 'notification.read:own'),
    ('DOCTOR', 'notification.manage:own'),
    ('PHARMACIST', 'notification.read:own'),
    ('PHARMACIST', 'notification.manage:own'),
    ('PATIENT', 'notification.read:own'),
    ('PATIENT', 'notification.manage:own'),
    -- SJ-1. The clinic's own administrator owns its org chart, so ADMIN holds
    -- all three. No other seeded role gets any of them: the chart is back-office
    -- structure with nothing clinical hanging off it, and a role that needs
    -- read-only access is composed in the IAM screens from
    -- `organization.structure.read:any` alone -- which is exactly the case the
    -- read-only tree exists to serve.
    ('ADMIN', 'organization.structure.read:any'),
    ('ADMIN', 'organization.structure.manage:any'),
    ('ADMIN', 'organization.member.manage:any')
),
combined_role_permissions AS (
  SELECT 'SUPER_ADMIN'::text AS role_code, p."permission_key"
  FROM "permissions" p
  UNION
  SELECT role_code, permission_key
  FROM explicit_role_permissions
)
INSERT INTO "role_permissions" (
  "id",
  "role_id",
  "permission_id",
  "created_at"
)
SELECT
  md5('role_permission:' || crp.role_code || ':' || crp.permission_key)::uuid,
  r."id",
  p."id",
  NOW()
FROM combined_role_permissions crp
JOIN "roles" r ON r."code" = crp.role_code
JOIN "permissions" p ON p."permission_key" = crp.permission_key
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

DELETE FROM "role_permissions" rp
USING "roles" r, "permissions" p
WHERE rp."role_id" = r."id"
  AND rp."permission_id" = p."id"
  AND r."code" = 'DOCTOR'
  AND p."permission_key" = 'patient.read:any';

-- Doctors consult their agenda; they do not book it and they do not browse
-- other doctors' calendars. Revokes the grants earlier seeds handed out so a
-- re-seeded database converges on the narrowed role.
DELETE FROM "role_permissions" rp
USING "roles" r, "permissions" p
WHERE rp."role_id" = r."id"
  AND rp."permission_id" = p."id"
  AND r."code" = 'DOCTOR'
  AND p."permission_key" IN ('appointment.create:own', 'appointment.session.read:any');

-- Reserved service account for the inbound BPJS Antrean bridge (P14-T04).
-- Baseline, not demo data: a production deployment needs this row, because a
-- Mobile JKN booking has to be attributable to something and `created_by_id`
-- is how every other write in HMS records who did it.
--
-- `password_hash` is deliberately not a hash. bcrypt rejects a malformed
-- digest, so no password can ever verify against it — and the login path
-- refuses `is_system` accounts before it gets that far. Two independent
-- reasons, because this is the one account whose credentials would hand
-- someone the patient table.
INSERT INTO "users" (
  "id",
  "email",
  "password_hash",
  "is_active",
  "is_system",
  "created_at",
  "updated_at",
  "deleted_at"
)
VALUES (
  md5('user:bpjs-antrean-bridge@system.hms.local')::uuid,
  'bpjs-antrean-bridge@system.hms.local',
  '!no-login:bpjs-antrean-bridge',
  true,
  true,
  NOW(),
  NOW(),
  NULL
)
ON CONFLICT ("email") DO UPDATE
SET
  "password_hash" = EXCLUDED."password_hash",
  "is_active" = true,
  "is_system" = true,
  "updated_at" = NOW(),
  "deleted_at" = NULL;

INSERT INTO "user_roles" (
  "id",
  "user_id",
  "role_id",
  "assigned_at",
  "created_at",
  "updated_at",
  "deleted_at"
)
SELECT
  md5('user_role:bpjs-antrean-bridge@system.hms.local:BPJS_ANTREAN_SYSTEM')::uuid,
  u."id",
  r."id",
  NOW(),
  NOW(),
  NOW(),
  NULL
FROM "users" u
JOIN "roles" r ON r."code" = 'BPJS_ANTREAN_SYSTEM'
WHERE u."email" = 'bpjs-antrean-bridge@system.hms.local'
ON CONFLICT ("user_id", "role_id") DO UPDATE
SET
  "unassigned_at" = NULL,
  "unassigned_by_id" = NULL,
  "updated_at" = NOW(),
  "deleted_at" = NULL;

-- Reserved service account for the WhatsApp/Telegram customer-service channel
-- (PCS-T07). Baseline, not demo data: a production deployment running the
-- channel needs this row, because a chat booking has to be attributable to
-- something and `created_by_id` is how every other write in HMS records who
-- did it.
--
-- `password_hash` is deliberately not a hash, for the same two independent
-- reasons as the BPJS account above: bcrypt rejects a malformed digest, so no
-- password can ever verify against it, and the login path refuses `is_system`
-- accounts before it gets that far.
INSERT INTO "users" (
  "id",
  "email",
  "password_hash",
  "is_active",
  "is_system",
  "created_at",
  "updated_at",
  "deleted_at"
)
VALUES (
  md5('user:customer-service-channel@system.hms.local')::uuid,
  'customer-service-channel@system.hms.local',
  '!no-login:customer-service-channel',
  true,
  true,
  NOW(),
  NOW(),
  NULL
)
ON CONFLICT ("email") DO UPDATE
SET
  "password_hash" = EXCLUDED."password_hash",
  "is_active" = true,
  "is_system" = true,
  "updated_at" = NOW(),
  "deleted_at" = NULL;

INSERT INTO "user_roles" (
  "id",
  "user_id",
  "role_id",
  "assigned_at",
  "created_at",
  "updated_at",
  "deleted_at"
)
SELECT
  md5('user_role:customer-service-channel@system.hms.local:CUSTOMER_SERVICE_CHANNEL')::uuid,
  u."id",
  r."id",
  NOW(),
  NOW(),
  NOW(),
  NULL
FROM "users" u
JOIN "roles" r ON r."code" = 'CUSTOMER_SERVICE_CHANNEL'
WHERE u."email" = 'customer-service-channel@system.hms.local'
ON CONFLICT ("user_id", "role_id") DO UPDATE
SET
  "unassigned_at" = NULL,
  "unassigned_by_id" = NULL,
  "updated_at" = NOW(),
  "deleted_at" = NULL;

-- Development demo patients. Replace or remove this block for production seeds.
-- These MRNs keep their legacy `MRN-000n` shape deliberately: row ids are
-- derived from the MRN (`md5('patient:' || mrn)`), so renaming them would add a
-- second set of demo patients to every existing dev database rather than
-- updating the current one. They stand in for the legacy-import case; numbers
-- the server allocates look like `00000006`.
WITH seed_patients(mrn, full_name, date_of_birth, sex, status, phone_number, address) AS (
  VALUES
    ('MRN-0001', 'Budi Santoso', '1985-03-12', 'MALE', 'OUT_PATIENT', '+62-812-1000-0001', 'Jl. Merdeka No. 12, Jakarta Pusat'),
    ('MRN-0002', 'Siti Rahayu', '1992-07-28', 'FEMALE', 'OUT_PATIENT', '+62-812-1000-0002', 'Jl. Sudirman No. 45, Jakarta Selatan'),
    ('MRN-0003', 'Agus Wijaya', '1978-11-05', 'MALE', 'IN_PATIENT', '+62-812-1000-0003', 'Jl. Gatot Subroto No. 8, Bandung'),
    ('MRN-0004', 'Dewi Lestari', '2001-01-19', 'FEMALE', 'OUT_PATIENT', '+62-812-1000-0004', 'Jl. Diponegoro No. 21, Surabaya'),
    ('MRN-0005', 'Rina Kusuma', '1965-09-30', 'FEMALE', 'DISCHARGED', '+62-812-1000-0005', 'Jl. Ahmad Yani No. 3, Yogyakarta')
)
INSERT INTO "patient_profiles" (
  "id",
  "mrn",
  "full_name",
  "date_of_birth",
  "sex",
  "status",
  "phone_number",
  "address",
  "owner_user_id",
  "is_active",
  "created_at",
  "updated_at",
  "deleted_at"
)
SELECT
  md5('patient:' || mrn)::uuid,
  mrn,
  full_name,
  date_of_birth::date,
  sex::"PatientSex",
  status::"PatientStatus",
  phone_number,
  address,
  NULL,
  true,
  NOW(),
  NOW(),
  NULL
FROM seed_patients
ON CONFLICT ("mrn") DO UPDATE
SET
  "full_name" = EXCLUDED."full_name",
  "date_of_birth" = EXCLUDED."date_of_birth",
  "sex" = EXCLUDED."sex",
  "status" = EXCLUDED."status",
  "phone_number" = EXCLUDED."phone_number",
  "address" = EXCLUDED."address",
  "is_active" = true,
  "updated_at" = NOW(),
  "deleted_at" = NULL;

-- Keep the MRN counter ahead of every seeded record. Without this the first
-- API-created patient would be handed a number the seed already used, and the
-- unique constraint would reject an otherwise valid registration. Idempotent
-- and monotonic: re-running the seed never moves the counter backwards.
INSERT INTO "mrn_counters" ("facility_id", "next_value", "updated_at")
VALUES ('00000000-0000-0000-0000-000000000000'::uuid, 1, NOW())
ON CONFLICT ("facility_id") DO NOTHING;

-- IMP-6. One entitlement row per FEATURE_CATALOG key, defaulting to enabled so
-- an existing deployment behaves exactly as it did before this table existed.
--
-- `DO NOTHING`, emphatically not `DO UPDATE`: `is_enabled` is the one column in
-- this file a customer owns. A clinic that switched BPJS off would find it back
-- on after the next deploy if the seed asserted the default, which is the whole
-- failure mode entitlements exist to prevent. What the seed does own is the key
-- *set* — a new catalog key appears here on the next run, and a key with no row
-- reads as enabled until it does, so a release that adds one is not an outage
-- of a feature the clinic is paying for.
--
-- Keys are duplicated from `FEATURE_CATALOG` in @hms/shared-types because SQL
-- cannot import TypeScript; `feature-catalog.spec.ts` fails the build if the
-- two lists ever disagree.
INSERT INTO "feature_entitlements" (
  "id",
  "feature_key",
  "is_enabled",
  "created_at",
  "updated_at"
)
SELECT
  md5('feature_entitlement:' || feature_key)::uuid,
  feature_key,
  TRUE,
  NOW(),
  NOW()
FROM (
  VALUES
    ('ai-chatbot'),
    ('room-management'),
    ('pharmacy'),
    ('billing'),
    ('bpjs-pcare'),
    ('bpjs-antrean'),
    ('satusehat'),
    ('document-management'),
    ('cs-channels')
) AS seed_feature_entitlements(feature_key)
ON CONFLICT ("feature_key") DO NOTHING;

UPDATE "mrn_counters"
SET
  "next_value" = GREATEST(
    "next_value",
    COALESCE(
      (
        SELECT MAX("digits"::bigint)
        FROM (
          SELECT regexp_replace("mrn", '\D', '', 'g') AS "digits"
          FROM "patient_profiles"
        ) AS "extracted"
        WHERE "digits" <> '' AND length("digits") <= 18
      ),
      0
    ) + 1
  ),
  "updated_at" = NOW()
WHERE "facility_id" = '00000000-0000-0000-0000-000000000000'::uuid;

-- IMP-12. Room class (kelas perawatan) baseline. The four classes BPJS and
-- private payers both recognise, so a fresh database can run a ward without
-- anyone opening the master-data screen first.
--
-- `DO NOTHING`, emphatically not `DO UPDATE`, and for the same reason as the
-- feature entitlements above: `name`, `description` and `quota` are the
-- columns a customer owns. A clinic that renamed "Kelas 1" or capped VIP at
-- four beds would find both undone by the next deploy, which is exactly the
-- failure mode master data exists to prevent. What the seed does own is the
-- baseline *set* -- a class the clinic added stays, and a class it retired
-- stays retired, because the conflict target is the partial unique index over
-- live rows.
--
-- `quota` is deliberately NULL here: a ceiling is a decision about a specific
-- building, and shipping a guess would put a limit on a clinic that never
-- asked for one.
WITH seed_room_classes(code, name, description) AS (
  VALUES
    ('VIP', 'VIP', 'Kamar VIP, umumnya satu tempat tidur dengan kamar mandi dalam'),
    ('KELAS_1', 'Kelas 1', 'Kelas perawatan 1'),
    ('KELAS_2', 'Kelas 2', 'Kelas perawatan 2'),
    ('KELAS_3', 'Kelas 3', 'Kelas perawatan 3')
)
INSERT INTO "room_classes" (
  "id",
  "code",
  "name",
  "description",
  "quota",
  "is_active",
  "created_at",
  "updated_at",
  "deleted_at"
)
SELECT
  md5('room_class:' || code)::uuid,
  code,
  name,
  description,
  NULL,
  true,
  NOW(),
  NOW(),
  NULL
FROM seed_room_classes
-- NOT EXISTS by the derived id, not just the ON CONFLICT below. A *retired*
-- class keeps its id but leaves the live-rows partial index, so without this
-- the insert would fire again with the same primary key and fail the entire
-- seed transaction -- turning "the clinic retired VIP" into "the clinic can
-- never seed again". The ON CONFLICT still covers the other collision: a
-- clinic that created the same code itself under a different id.
WHERE NOT EXISTS (
  SELECT 1 FROM "room_classes" existing
  WHERE existing."id" = md5('room_class:' || seed_room_classes.code)::uuid
)
ON CONFLICT ("code") WHERE "deleted_at" IS NULL DO NOTHING;

-- Specialty catalog baseline. Safe to re-run; keeps names unique and revives soft-deleted rows.
WITH seed_specialties(name) AS (
  VALUES
    ('General Practice'),
    ('Internal Medicine'),
    ('Pediatrics'),
    ('Cardiology'),
    ('Obstetrics & Gynecology'),
    ('General Surgery'),
    ('Orthopedics'),
    ('Neurology'),
    ('Psychiatry'),
    ('Dermatology & Venereology'),
    ('Ophthalmology'),
    ('Otorhinolaryngology (ENT)'),
    ('Pulmonology'),
    ('Urology'),
    ('Anesthesiology'),
    ('Radiology'),
    ('Dentistry')
)
INSERT INTO "specialties" (
  "id",
  "name",
  "is_active",
  "created_at",
  "updated_at",
  "deleted_at"
)
SELECT
  md5('specialty:' || lower(name))::uuid,
  name,
  true,
  NOW(),
  NOW(),
  NULL
FROM seed_specialties
ON CONFLICT ("name") DO UPDATE
SET
  "is_active" = true,
  "updated_at" = NOW(),
  "deleted_at" = NULL;

-- ICD-10 starter catalog.
--
-- NOT the official list. This is a small set of high-frequency FKTP primary-care
-- diagnoses so that development, demos, and the /icd10-codes lookup work out of
-- the box. Before go-live, load the official Kemenkes list with
-- `pnpm --filter @hms/api icd10:import <file.csv>` — it upserts by code and
-- deactivates anything absent from the file, so it converges this baseline onto
-- the official catalog without orphaning historic diagnoses.
--
-- The Indonesian titles below are working translations for search and display,
-- not official Kemenkes wording; the import overwrites them.
--
-- `category` is the three-character parent code and `chapter` is derived from
-- it. The importer applies the identical mapping in TypeScript
-- (deriveIcd10Chapter in @hms/shared-types) — keep the two in step.
WITH seed_icd10_codes(code, display, display_indonesian) AS (
  VALUES
    ('A01.0', 'Typhoid fever', 'Demam tifoid'),
    ('A09', 'Diarrhoea and gastroenteritis of presumed infectious origin', 'Diare dan gastroenteritis diduga infeksi'),
    ('A15.0', 'Tuberculosis of lung, confirmed by sputum microscopy with or without culture', 'Tuberkulosis paru, terkonfirmasi mikroskopis sputum'),
    ('A90', 'Dengue fever [classical dengue]', 'Demam dengue'),
    ('A91', 'Dengue haemorrhagic fever', 'Demam berdarah dengue'),
    ('B34.9', 'Viral infection, unspecified', 'Infeksi virus, tidak dijelaskan'),
    ('B35.4', 'Tinea corporis', 'Tinea korporis'),
    ('B86', 'Scabies', 'Skabies'),
    ('D50.9', 'Iron deficiency anaemia, unspecified', 'Anemia defisiensi besi, tidak dijelaskan'),
    ('E11.9', 'Type 2 diabetes mellitus without complications', 'Diabetes melitus tipe 2 tanpa komplikasi'),
    ('E66.9', 'Obesity, unspecified', 'Obesitas, tidak dijelaskan'),
    ('E78.5', 'Hyperlipidaemia, unspecified', 'Hiperlipidemia, tidak dijelaskan'),
    ('E86', 'Volume depletion', 'Deplesi volume (dehidrasi)'),
    ('G43.9', 'Migraine, unspecified', 'Migren, tidak dijelaskan'),
    ('G44.2', 'Tension-type headache', 'Nyeri kepala tipe tegang'),
    ('H10.9', 'Conjunctivitis, unspecified', 'Konjungtivitis, tidak dijelaskan'),
    ('H60.9', 'Otitis externa, unspecified', 'Otitis eksterna, tidak dijelaskan'),
    ('H66.9', 'Otitis media, unspecified', 'Otitis media, tidak dijelaskan'),
    ('I10', 'Essential (primary) hypertension', 'Hipertensi esensial (primer)'),
    ('I11.9', 'Hypertensive heart disease without (congestive) heart failure', 'Penyakit jantung hipertensi tanpa gagal jantung'),
    ('J00', 'Acute nasopharyngitis [common cold]', 'Nasofaringitis akut (selesma)'),
    ('J01.9', 'Acute sinusitis, unspecified', 'Sinusitis akut, tidak dijelaskan'),
    ('J02.9', 'Acute pharyngitis, unspecified', 'Faringitis akut, tidak dijelaskan'),
    ('J03.9', 'Acute tonsillitis, unspecified', 'Tonsilitis akut, tidak dijelaskan'),
    ('J06.9', 'Acute upper respiratory infection, unspecified', 'Infeksi saluran napas atas akut, tidak dijelaskan'),
    ('J18.9', 'Pneumonia, unspecified', 'Pneumonia, tidak dijelaskan'),
    ('J20.9', 'Acute bronchitis, unspecified', 'Bronkitis akut, tidak dijelaskan'),
    ('J30.4', 'Allergic rhinitis, unspecified', 'Rinitis alergi, tidak dijelaskan'),
    ('J31.0', 'Chronic rhinitis', 'Rinitis kronik'),
    ('J44.9', 'Chronic obstructive pulmonary disease, unspecified', 'Penyakit paru obstruktif kronik, tidak dijelaskan'),
    ('J45.9', 'Asthma, unspecified', 'Asma, tidak dijelaskan'),
    ('K02.9', 'Dental caries, unspecified', 'Karies gigi, tidak dijelaskan'),
    ('K21.9', 'Gastro-oesophageal reflux disease without oesophagitis', 'Penyakit refluks gastroesofageal tanpa esofagitis'),
    ('K29.7', 'Gastritis, unspecified', 'Gastritis, tidak dijelaskan'),
    ('K30', 'Dyspepsia', 'Dispepsia'),
    ('K59.0', 'Constipation', 'Konstipasi'),
    ('L02.9', 'Cutaneous abscess, furuncle and carbuncle, unspecified', 'Abses kulit, furunkel dan karbunkel, tidak dijelaskan'),
    ('L20.9', 'Atopic dermatitis, unspecified', 'Dermatitis atopik, tidak dijelaskan'),
    ('L23.9', 'Allergic contact dermatitis, unspecified cause', 'Dermatitis kontak alergi, penyebab tidak dijelaskan'),
    ('L30.9', 'Dermatitis, unspecified', 'Dermatitis, tidak dijelaskan'),
    ('L50.9', 'Urticaria, unspecified', 'Urtikaria, tidak dijelaskan'),
    ('M06.9', 'Rheumatoid arthritis, unspecified', 'Artritis reumatoid, tidak dijelaskan'),
    ('M10.9', 'Gout, unspecified', 'Gout, tidak dijelaskan'),
    ('M13.9', 'Arthritis, unspecified', 'Artritis, tidak dijelaskan'),
    ('M54.2', 'Cervicalgia', 'Servikalgia (nyeri leher)'),
    ('M54.5', 'Low back pain', 'Nyeri punggung bawah'),
    ('M79.1', 'Myalgia', 'Mialgia'),
    ('N30.0', 'Acute cystitis', 'Sistitis akut'),
    ('N39.0', 'Urinary tract infection, site not specified', 'Infeksi saluran kemih, lokasi tidak dijelaskan'),
    ('N76.0', 'Acute vaginitis', 'Vaginitis akut'),
    ('R05', 'Cough', 'Batuk'),
    ('R10.4', 'Other and unspecified abdominal pain', 'Nyeri perut lain dan tidak dijelaskan'),
    ('R11', 'Nausea and vomiting', 'Mual dan muntah'),
    ('R42', 'Dizziness and giddiness', 'Pusing berputar'),
    ('R50.9', 'Fever, unspecified', 'Demam, tidak dijelaskan'),
    ('R51', 'Headache', 'Nyeri kepala'),
    ('Z00.0', 'General medical examination', 'Pemeriksaan kesehatan umum'),
    ('Z34.9', 'Supervision of normal pregnancy, unspecified', 'Pengawasan kehamilan normal, tidak dijelaskan')
),
seed_icd10_codes_with_category AS (
  SELECT
    code,
    display,
    display_indonesian,
    split_part(code, '.', 1) AS category
  FROM seed_icd10_codes
)
INSERT INTO "icd10_codes" (
  "id",
  "code",
  "display",
  "display_indonesian",
  "category",
  "chapter",
  "is_active",
  "created_at",
  "updated_at",
  "deleted_at"
)
SELECT
  md5('icd10:' || code)::uuid,
  code,
  display,
  display_indonesian,
  category,
  CASE
    WHEN category BETWEEN 'A00' AND 'B99' THEN 'I'
    WHEN category BETWEEN 'C00' AND 'D48' THEN 'II'
    WHEN category BETWEEN 'D50' AND 'D89' THEN 'III'
    WHEN category BETWEEN 'E00' AND 'E90' THEN 'IV'
    WHEN category BETWEEN 'F00' AND 'F99' THEN 'V'
    WHEN category BETWEEN 'G00' AND 'G99' THEN 'VI'
    WHEN category BETWEEN 'H00' AND 'H59' THEN 'VII'
    WHEN category BETWEEN 'H60' AND 'H95' THEN 'VIII'
    WHEN category BETWEEN 'I00' AND 'I99' THEN 'IX'
    WHEN category BETWEEN 'J00' AND 'J99' THEN 'X'
    WHEN category BETWEEN 'K00' AND 'K93' THEN 'XI'
    WHEN category BETWEEN 'L00' AND 'L99' THEN 'XII'
    WHEN category BETWEEN 'M00' AND 'M99' THEN 'XIII'
    WHEN category BETWEEN 'N00' AND 'N99' THEN 'XIV'
    WHEN category BETWEEN 'O00' AND 'O99' THEN 'XV'
    WHEN category BETWEEN 'P00' AND 'P96' THEN 'XVI'
    WHEN category BETWEEN 'Q00' AND 'Q99' THEN 'XVII'
    WHEN category BETWEEN 'R00' AND 'R99' THEN 'XVIII'
    WHEN category BETWEEN 'S00' AND 'T98' THEN 'XIX'
    WHEN category BETWEEN 'V01' AND 'Y98' THEN 'XX'
    WHEN category BETWEEN 'Z00' AND 'Z99' THEN 'XXI'
    ELSE NULL
  END,
  true,
  NOW(),
  NOW(),
  NULL
FROM seed_icd10_codes_with_category
ON CONFLICT ("code") DO UPDATE
SET
  "display" = EXCLUDED."display",
  "display_indonesian" = EXCLUDED."display_indonesian",
  "category" = EXCLUDED."category",
  "chapter" = EXCLUDED."chapter",
  "is_active" = true,
  "updated_at" = NOW(),
  "deleted_at" = NULL;

-- ICD-9-CM procedure starter catalog.
--
-- NOT the official list, and deliberately smaller than the ICD-10 starter set:
-- it covers only procedures routinely performed in an Indonesian FKTP, so that
-- the /icd9cm-codes lookup is usable in development and demos. Load the official
-- list with `pnpm --filter @hms/api icd9cm:import <file.csv>` before go-live —
-- BPJS prices a claim from these codes, so an approximate catalog is a billing
-- problem, not just a display one.
--
-- Indonesian titles are working translations, overwritten by the import.
-- `category` is the two-digit parent code. There is no chapter column: ICD-9-CM
-- procedure chapters do not map to a clean lexicographic range the way ICD-10
-- chapters do.
WITH seed_icd9cm_codes(code, display, display_indonesian) AS (
  VALUES
    ('57.94', 'Insertion of indwelling urinary catheter', 'Pemasangan kateter urin menetap'),
    ('86.04', 'Other incision with drainage of skin and subcutaneous tissue', 'Insisi dan drainase abses kulit'),
    ('86.22', 'Excisional debridement of wound, infection or burn', 'Debridemen eksisional luka, infeksi atau luka bakar'),
    ('86.28', 'Nonexcisional debridement of wound, infection or burn', 'Debridemen non-eksisional luka, infeksi atau luka bakar'),
    ('86.59', 'Closure of skin and subcutaneous tissue of other sites', 'Penjahitan luka kulit dan jaringan bawah kulit'),
    ('87.44', 'Routine chest x-ray', 'Rontgen dada rutin'),
    ('89.52', 'Electrocardiogram', 'Elektrokardiogram (EKG)'),
    ('89.7', 'General physical examination', 'Pemeriksaan fisik umum'),
    ('90.59', 'Other microscopic examination of blood', 'Pemeriksaan mikroskopis darah lainnya'),
    ('93.57', 'Application of other wound dressing', 'Perawatan dan penggantian balutan luka'),
    ('93.94', 'Respiratory medication administered by nebulizer', 'Pemberian obat pernapasan melalui nebulizer'),
    ('96.54', 'Dental scaling, polishing and debridement', 'Pembersihan karang gigi dan pemolesan'),
    ('96.59', 'Other irrigation of wound', 'Irigasi luka lainnya'),
    ('99.21', 'Injection of antibiotic', 'Injeksi antibiotik'),
    ('99.23', 'Injection of steroid', 'Injeksi steroid'),
    ('99.29', 'Injection or infusion of other therapeutic or prophylactic substance', 'Injeksi atau infus zat terapeutik atau profilaksis lainnya'),
    ('99.59', 'Other vaccination and inoculation', 'Vaksinasi dan inokulasi lainnya')
)
INSERT INTO "icd9cm_codes" (
  "id",
  "code",
  "display",
  "display_indonesian",
  "category",
  "is_active",
  "created_at",
  "updated_at",
  "deleted_at"
)
SELECT
  md5('icd9cm:' || code)::uuid,
  code,
  display,
  display_indonesian,
  split_part(code, '.', 1),
  true,
  NOW(),
  NOW(),
  NULL
FROM seed_icd9cm_codes
ON CONFLICT ("code") DO UPDATE
SET
  "display" = EXCLUDED."display",
  "display_indonesian" = EXCLUDED."display_indonesian",
  "category" = EXCLUDED."category",
  "is_active" = true,
  "updated_at" = NOW(),
  "deleted_at" = NULL;

-- Development demo doctors. Replace or remove this block for production seeds.
-- Practitioner NIK is deliberately absent: it is encrypted at rest
-- (nik_ciphertext / nik_index / nik_last4 / nik_key_version) by
-- NationalIdentifierCryptoService, so plain SQL cannot produce valid columns.
-- Set doctor NIKs through the API, or via `pnpm --filter @hms/api backfill:doctor-nik`.
WITH seed_doctors(
  license_number,
  full_name,
  specialty_name,
  phone_number,
  title,
  degrees
) AS (
  VALUES
    ('SIP-2026-0001', 'dr. Andi Prasetyo, Sp.PD', 'Internal Medicine', '+62-811-2000-0001', 'dr.', 'Sp.PD'),
    ('SIP-2026-0002', 'dr. Maya Sari, Sp.A', 'Pediatrics', '+62-811-2000-0002', 'dr.', 'Sp.A'),
    ('SIP-2026-0003', 'dr. Hendra Gunawan, Sp.JP', 'Cardiology', '+62-811-2000-0003', 'dr.', 'Sp.JP'),
    ('SIP-2026-0004', 'dr. Fitri Handayani, Sp.OG', 'Obstetrics & Gynecology', '+62-811-2000-0004', 'dr.', 'Sp.OG'),
    ('SIP-2026-0005', 'dr. Yusuf Hidayat', 'General Practice', '+62-811-2000-0005', 'dr.', NULL)
)
INSERT INTO "doctor_profiles" (
  "id",
  "license_number",
  "full_name",
  "specialty_id",
  "phone_number",
  "title",
  "degrees",
  "satusehat_practitioner_id",
  "owner_user_id",
  "is_active",
  "created_at",
  "updated_at",
  "deleted_at"
)
SELECT
  md5('doctor:' || license_number)::uuid,
  license_number,
  full_name,
  specialties."id",
  phone_number,
  title,
  degrees,
  NULL,
  NULL,
  true,
  NOW(),
  NOW(),
  NULL
FROM seed_doctors
JOIN "specialties" AS specialties ON lower(specialties."name") = lower(specialty_name)
ON CONFLICT ("license_number") DO UPDATE
SET
  "full_name" = EXCLUDED."full_name",
  "specialty_id" = EXCLUDED."specialty_id",
  "phone_number" = EXCLUDED."phone_number",
  "title" = EXCLUDED."title",
  "degrees" = EXCLUDED."degrees",
  "is_active" = true,
  "updated_at" = NOW(),
  "deleted_at" = NULL;

-- Development demo practitioner licenses (synthetic STR/SIP numbers).
-- STR entries have no expiry (lifetime under UU Kesehatan No. 17/2023);
-- SIP entries are time-limited per practice location.
WITH seed_doctor_licenses(doctor_license_number, type, license_number, issued_at, expires_at) AS (
  VALUES
    ('SIP-2026-0001', 'STR', 'STR-31-2019-000101', DATE '2019-03-01', NULL::date),
    ('SIP-2026-0001', 'SIP', 'SIP-2026-0001', DATE '2026-01-02', DATE '2031-01-01'),
    ('SIP-2026-0002', 'STR', 'STR-31-2020-000202', DATE '2020-07-15', NULL::date),
    ('SIP-2026-0002', 'SIP', 'SIP-2026-0002', DATE '2026-01-02', DATE '2031-01-01'),
    ('SIP-2026-0003', 'STR', 'STR-31-2017-000303', DATE '2017-11-20', NULL::date),
    ('SIP-2026-0003', 'SIP', 'SIP-2026-0003', DATE '2026-01-02', DATE '2031-01-01'),
    ('SIP-2026-0004', 'STR', 'STR-31-2021-000404', DATE '2021-05-10', NULL::date),
    ('SIP-2026-0004', 'SIP', 'SIP-2026-0004', DATE '2026-01-02', DATE '2031-01-01'),
    ('SIP-2026-0005', 'STR', 'STR-31-2022-000505', DATE '2022-09-05', NULL::date),
    ('SIP-2026-0005', 'SIP', 'SIP-2026-0005', DATE '2026-01-02', DATE '2031-01-01')
)
INSERT INTO "doctor_licenses" (
  "id",
  "doctor_id",
  "type",
  "license_number",
  "issued_at",
  "expires_at",
  "created_at",
  "updated_at",
  "deleted_at"
)
SELECT
  md5('doctor-license:' || type || ':' || license_number)::uuid,
  md5('doctor:' || doctor_license_number)::uuid,
  type::"DoctorLicenseType",
  license_number,
  issued_at,
  expires_at,
  NOW(),
  NOW(),
  NULL
FROM seed_doctor_licenses
ON CONFLICT ("id") DO UPDATE
SET
  "license_number" = EXCLUDED."license_number",
  "issued_at" = EXCLUDED."issued_at",
  "expires_at" = EXCLUDED."expires_at",
  "updated_at" = NOW(),
  "deleted_at" = NULL;

-- Development demo doctor education rows (synthetic institutions/years).
WITH seed_doctor_educations(
  doctor_license_number,
  institution,
  degree,
  field_of_study,
  graduation_year
) AS (
  VALUES
    ('SIP-2026-0001', 'Universitas Indonesia', 'dr.', 'Kedokteran', 2004),
    ('SIP-2026-0001', 'Universitas Indonesia', 'Sp.PD', 'Penyakit Dalam', 2010),
    ('SIP-2026-0002', 'Universitas Gadjah Mada', 'dr.', 'Kedokteran', 2008),
    ('SIP-2026-0002', 'Universitas Gadjah Mada', 'Sp.A', 'Ilmu Kesehatan Anak', 2014),
    ('SIP-2026-0003', 'Universitas Airlangga', 'dr.', 'Kedokteran', 2002),
    ('SIP-2026-0003', 'Universitas Airlangga', 'Sp.JP', 'Jantung dan Pembuluh Darah', 2009),
    ('SIP-2026-0004', 'Universitas Padjadjaran', 'dr.', 'Kedokteran', 2006),
    ('SIP-2026-0004', 'Universitas Padjadjaran', 'Sp.OG', 'Obstetri dan Ginekologi', 2012),
    ('SIP-2026-0005', 'Universitas Sumatera Utara', 'dr.', 'Kedokteran', 2015)
)
INSERT INTO "doctor_educations" (
  "id",
  "doctor_id",
  "institution",
  "degree",
  "field_of_study",
  "graduation_year",
  "created_at",
  "updated_at",
  "deleted_at"
)
SELECT
  md5('doctor-education:' || doctor_license_number || ':' || degree || ':' || COALESCE(field_of_study, '') || ':' || COALESCE(graduation_year::text, ''))::uuid,
  md5('doctor:' || doctor_license_number)::uuid,
  institution,
  degree,
  field_of_study,
  graduation_year,
  NOW(),
  NOW(),
  NULL
FROM seed_doctor_educations
ON CONFLICT ("id") DO UPDATE
SET
  "institution" = EXCLUDED."institution",
  "degree" = EXCLUDED."degree",
  "field_of_study" = EXCLUDED."field_of_study",
  "graduation_year" = EXCLUDED."graduation_year",
  "updated_at" = NOW(),
  "deleted_at" = NULL;

-- Development accounts. Credentials:
--   admin@salingjaga.com   / Admin123!
--   pharmacy@salingjaga.com / Pharmacy123!
--   <doctor>@clinic.local  / Doctor123!   (one per seeded practitioner)
--
-- The doctor logins are the practitioners from the directory above, not a
-- separate identity: every seeded doctor gets an account whose email is the
-- address that used to sit on `doctor_profiles`, which is now the only copy.
-- The hashes are bcryptjs (cost 10). Replace or remove this block for
-- production seeds.
WITH seed_users(email, password_hash) AS (
  VALUES
    ('admin@salingjaga.com', '$2b$10$8Xw5CHvVbJa465ypeir1ZeRyastav5gmh/cU3ztImenBGuftYUQ1O'),
    ('pharmacy@salingjaga.com', '$2b$10$pHZGH0PxmBaMPfH5pdd/XelfS0y43Sn49G3gHrRS5VZfRXy7T9jcW'),
    ('andi.prasetyo@clinic.local', '$2b$10$8syYNeSA3HKA.1IICxLbPeRffmT2dNY6zIf5LgU5gonMyzp61wB1O'),
    ('maya.sari@clinic.local', '$2b$10$8syYNeSA3HKA.1IICxLbPeRffmT2dNY6zIf5LgU5gonMyzp61wB1O'),
    ('hendra.gunawan@clinic.local', '$2b$10$8syYNeSA3HKA.1IICxLbPeRffmT2dNY6zIf5LgU5gonMyzp61wB1O'),
    ('fitri.handayani@clinic.local', '$2b$10$8syYNeSA3HKA.1IICxLbPeRffmT2dNY6zIf5LgU5gonMyzp61wB1O'),
    ('yusuf.hidayat@clinic.local', '$2b$10$8syYNeSA3HKA.1IICxLbPeRffmT2dNY6zIf5LgU5gonMyzp61wB1O')
)
INSERT INTO "users" (
  "id",
  "email",
  "password_hash",
  "is_active",
  "created_at",
  "updated_at",
  "deleted_at"
)
SELECT
  md5('user:' || email)::uuid,
  email,
  password_hash,
  true,
  NOW(),
  NOW(),
  NULL
FROM seed_users
ON CONFLICT ("email") DO UPDATE
SET
  "password_hash" = EXCLUDED."password_hash",
  "is_active" = true,
  "updated_at" = NOW(),
  "deleted_at" = NULL;

WITH seed_user_roles(email, role_code) AS (
  VALUES
    ('admin@salingjaga.com', 'SUPER_ADMIN'),
    ('pharmacy@salingjaga.com', 'PHARMACIST'),
    ('andi.prasetyo@clinic.local', 'DOCTOR'),
    ('maya.sari@clinic.local', 'DOCTOR'),
    ('hendra.gunawan@clinic.local', 'DOCTOR'),
    ('fitri.handayani@clinic.local', 'DOCTOR'),
    ('yusuf.hidayat@clinic.local', 'DOCTOR')
)
INSERT INTO "user_roles" (
  "id",
  "user_id",
  "role_id",
  "assigned_at",
  "created_at",
  "updated_at",
  "deleted_at"
)
SELECT
  md5('user_role:' || sur.email || ':' || sur.role_code)::uuid,
  u."id",
  r."id",
  NOW(),
  NOW(),
  NOW(),
  NULL
FROM seed_user_roles sur
JOIN "users" u ON u."email" = sur.email
JOIN "roles" r ON r."code" = sur.role_code
ON CONFLICT ("user_id", "role_id") DO UPDATE
SET
  "unassigned_at" = NULL,
  "unassigned_by_id" = NULL,
  "updated_at" = NOW(),
  "deleted_at" = NULL;

-- Own each seeded practitioner with their own account. Without this link the
-- OWN-scoped grants have nothing to resolve against: opening an encounter as a
-- doctor looks the attending practitioner up by owner_user_id and fails with
-- "You do not have an active doctor profile" when it is null. It is also what
-- gives the profile an email now that the column is gone — the address is read
-- through this relation.
WITH seed_doctor_accounts(license_number, email) AS (
  VALUES
    ('SIP-2026-0001', 'andi.prasetyo@clinic.local'),
    ('SIP-2026-0002', 'maya.sari@clinic.local'),
    ('SIP-2026-0003', 'hendra.gunawan@clinic.local'),
    ('SIP-2026-0004', 'fitri.handayani@clinic.local'),
    ('SIP-2026-0005', 'yusuf.hidayat@clinic.local')
)
UPDATE "doctor_profiles" AS d
SET
  "owner_user_id" = u."id",
  "updated_at" = NOW()
FROM seed_doctor_accounts AS a
JOIN "users" AS u ON u."email" = a.email
WHERE d."license_number" = a.license_number
  AND d."owner_user_id" IS DISTINCT FROM u."id";

-- Synthetic development medication catalog. ON CONFLICT DO NOTHING preserves
-- clinic edits, national-code mappings, and prices on every later reseed.
WITH seed_medications(code, kfa_code, name, form, strength, unit, category, reorder_level, unit_price) AS (
  VALUES
    ('MED-PARA-500', '9900000000001', 'Paracetamol', 'Tablet', '500 mg', 'TABLET', 'OBAT_BEBAS', 50, 1000.00),
    ('MED-AMOX-500', '9900000000002', 'Amoxicillin', 'Kapsul', '500 mg', 'KAPSUL', 'OBAT_KERAS', 40, 2500.00),
    ('MED-CET-10', '9900000000003', 'Cetirizine', 'Tablet', '10 mg', 'TABLET', 'OBAT_BEBAS_TERBATAS', 30, 1500.00),
    ('MED-ORS', '9900000000004', 'Oralit', 'Serbuk', NULL, 'SACHET', 'OBAT_BEBAS', 20, 2000.00),
    ('MED-OMEP-20', '9900000000005', 'Omeprazole', 'Kapsul', '20 mg', 'KAPSUL', 'OBAT_KERAS', 25, 3000.00),
    ('MED-SALB-2', '9900000000006', 'Salbutamol', 'Tablet', '2 mg', 'TABLET', 'OBAT_KERAS', 15, 1800.00),
    ('MED-POVI-10', '9900000000007', 'Povidone Iodine', 'Larutan', '10%', 'BOTOL', 'OBAT_BEBAS', 10, 18000.00),
    ('MED-VITC-500', '9900000000008', 'Vitamin C', 'Tablet', '500 mg', 'TABLET', 'SUPLEMEN', 25, 1200.00)
)
INSERT INTO "medications" (
  "id",
  "code",
  "kfa_code",
  "name",
  "form",
  "strength",
  "unit",
  "category",
  "reorder_level",
  "unit_price",
  "created_at",
  "updated_at",
  "deleted_at"
)
SELECT
  md5('medication:' || code)::uuid,
  code,
  kfa_code,
  name,
  form,
  strength,
  unit::"MedicationUnit",
  category::"MedicationCategory",
  reorder_level,
  unit_price,
  NOW(),
  NOW(),
  NULL
FROM seed_medications
ON CONFLICT ("code") DO NOTHING;

-- Receipt IDs are deterministic and never updated on conflict. This is
-- load-bearing: reseeding must not restore stock already consumed by a dispense.
-- Relative expiry dates make a fresh development database immediately useful
-- for the expiry report without inventing values for production records.
WITH seed_receipts(
  medication_code,
  batch_number,
  expiry_date,
  quantity,
  received_days_ago,
  notes
) AS (
  VALUES
    ('MED-PARA-500', 'PARA-DEV-001', CURRENT_DATE + 365, 200, 14, 'Synthetic healthy-stock receipt'),
    ('MED-AMOX-500', 'AMOX-DEV-001', CURRENT_DATE + 120, 35, 10, 'Synthetic reorder-alert receipt'),
    ('MED-AMOX-500', 'AMOX-DEV-OLD', CURRENT_DATE - 15, 8, 90, 'Synthetic expired lot for report coverage'),
    ('MED-CET-10', 'CET-DEV-001', CURRENT_DATE + 20, 80, 7, 'Synthetic expiring-soon receipt'),
    ('MED-ORS', 'ORS-DEV-001', CURRENT_DATE + 60, 12, 5, 'Synthetic reorder-alert receipt'),
    ('MED-SALB-2', 'SALB-DEV-001', CURRENT_DATE + 180, 25, 21, 'Synthetic available-stock receipt'),
    ('MED-POVI-10', 'POVI-DEV-001', CURRENT_DATE + 240, 40, 30, 'Synthetic available-stock receipt'),
    ('MED-VITC-500', 'VITC-DEV-001', CURRENT_DATE + 15, 10, 4, 'Synthetic expiring reorder-alert receipt')
)
INSERT INTO "medication_stock_receipts" (
  "id",
  "medication_id",
  "batch_number",
  "expiry_date",
  "quantity",
  "remaining_quantity",
  "received_at",
  "received_by_id",
  "notes",
  "created_at",
  "updated_at"
)
SELECT
  md5('stock-receipt:' || sr.medication_code || ':' || sr.batch_number)::uuid,
  m."id",
  sr.batch_number,
  sr.expiry_date,
  sr.quantity,
  sr.quantity,
  NOW() - make_interval(days => sr.received_days_ago),
  pharmacy_user."id",
  sr.notes,
  NOW(),
  NOW()
FROM seed_receipts sr
JOIN "medications" m ON m."code" = sr.medication_code
JOIN "users" pharmacy_user ON pharmacy_user."email" = 'pharmacy@salingjaga.com'
ON CONFLICT ("id") DO NOTHING;

-- Starter service tariffs so invoice generation works out of the box in
-- development and demos: one consultation fee plus two common tindakan mapped
-- to codes from the ICD-9-CM starter set. Prices are placeholders — every
-- clinic sets its own. ON CONFLICT DO NOTHING on purpose, unlike the
-- reference catalogs: a reseed must never revert a price the clinic edited.
WITH seed_service_tariffs(code, name, category, icd9cm_code, price) AS (
  VALUES
    ('KONSULTASI-UMUM', 'Konsultasi Dokter Umum', 'CONSULTATION', NULL, 50000.00),
    ('TIND-INJEKSI-AB', 'Injeksi Antibiotik', 'PROCEDURE', '99.21', 35000.00),
    ('TIND-RAWAT-LUKA', 'Perawatan Luka dan Penggantian Balutan', 'PROCEDURE', '93.57', 45000.00)
)
INSERT INTO "service_tariffs" (
  "id",
  "code",
  "name",
  "category",
  "icd9cm_code",
  "price",
  "is_active",
  "created_at",
  "updated_at"
)
SELECT
  md5('service_tariff:' || code)::uuid,
  code,
  name,
  category::"ServiceTariffCategory",
  icd9cm_code,
  price,
  TRUE,
  NOW(),
  NOW()
FROM seed_service_tariffs
ON CONFLICT ("code") DO NOTHING;

-- =========================================================================
-- Development demo scheduling and clinical data. Replace or remove for
-- production seeds. Exercises the doctor shell end to end:
--   * weekly practice windows so each doctor's calendar shows own sessions,
--   * doctor-patient assignments so `patient.read:own` and
--     `prescription.write:own` resolve to someone,
--   * booked session appointments and one pending special request,
--   * a checked-in registration with an IN_PROGRESS encounter so a doctor can
--     write a prescription immediately after logging in.
-- Dates are CURRENT_DATE-relative so the demo stays in the visible week; a
-- reseed on a later date adds that week's rows (ids embed the date) and never
-- rewrites what a clinic user has since touched. Timestamps subtract 7 hours
-- because `scheduled_at` is stored naive-UTC and the demo clinic runs
-- Asia/Jakarta (UTC+7, no DST).
-- =========================================================================

WITH seed_schedules(license_number, day_of_week, start_time, end_time, max_patients) AS (
  VALUES
    ('SIP-2026-0001', 1, '08:00', '12:00', 10),
    ('SIP-2026-0001', 2, '08:00', '12:00', 10),
    ('SIP-2026-0001', 3, '08:00', '12:00', 10),
    ('SIP-2026-0001', 4, '08:00', '12:00', 10),
    ('SIP-2026-0001', 5, '08:00', '12:00', 10),
    ('SIP-2026-0001', 1, '13:00', '16:00', 8),
    ('SIP-2026-0001', 3, '13:00', '16:00', 8),
    ('SIP-2026-0002', 1, '09:00', '13:00', 12),
    ('SIP-2026-0002', 2, '09:00', '13:00', 12),
    ('SIP-2026-0002', 3, '09:00', '13:00', 12),
    ('SIP-2026-0002', 4, '09:00', '13:00', 12),
    ('SIP-2026-0002', 5, '09:00', '13:00', 12),
    ('SIP-2026-0002', 6, '09:00', '12:00', 8),
    ('SIP-2026-0003', 2, '10:00', '14:00', 8),
    ('SIP-2026-0003', 4, '10:00', '14:00', 8)
)
INSERT INTO "doctor_schedules" (
  "id",
  "doctor_id",
  "day_of_week",
  "start_time",
  "end_time",
  "is_available",
  "max_patients",
  "created_at",
  "updated_at"
)
SELECT
  md5('demo-schedule:' || license_number || ':' || day_of_week || ':' || start_time)::uuid,
  md5('doctor:' || license_number)::uuid,
  day_of_week,
  start_time,
  end_time,
  true,
  max_patients,
  NOW(),
  NOW()
FROM seed_schedules
ON CONFLICT ("id") DO UPDATE
SET
  "end_time" = EXCLUDED."end_time",
  "is_available" = true,
  "max_patients" = EXCLUDED."max_patients",
  "updated_at" = NOW();

-- Active assignments: Budi and Siti belong to dr. Andi, Agus to dr. Maya.
-- These are what the doctor's Patients tab and the prescription OWN-scope
-- check resolve against. A partial unique index allows one *active* row per
-- pair, so the insert is guarded by NOT EXISTS rather than ON CONFLICT: a
-- pair the clinic already assigned through the UI (different id) must be left
-- alone, not collided with.
WITH seed_assignments(license_number, mrn) AS (
  VALUES
    ('SIP-2026-0001', 'MRN-0001'),
    ('SIP-2026-0001', 'MRN-0002'),
    ('SIP-2026-0002', 'MRN-0003')
)
INSERT INTO "doctor_patients" (
  "id",
  "doctor_id",
  "patient_id",
  "assigned_by_id",
  "assigned_at",
  "created_at",
  "updated_at"
)
SELECT
  md5('demo-assignment:' || license_number || ':' || mrn)::uuid,
  md5('doctor:' || license_number)::uuid,
  md5('patient:' || mrn)::uuid,
  md5('user:admin@salingjaga.com')::uuid,
  NOW(),
  NOW(),
  NOW()
FROM seed_assignments sa
WHERE NOT EXISTS (
  SELECT 1 FROM "doctor_patients" dp
  WHERE dp."doctor_id" = md5('doctor:' || sa.license_number)::uuid
    AND dp."patient_id" = md5('patient:' || sa.mrn)::uuid
    AND dp."unassigned_at" IS NULL
)
ON CONFLICT ("id") DO NOTHING;

-- Reactivate a previously unassigned demo pair, but only when the pair has no
-- other active assignment (the partial unique index would reject a second).
WITH seed_assignments(license_number, mrn) AS (
  VALUES
    ('SIP-2026-0001', 'MRN-0001'),
    ('SIP-2026-0001', 'MRN-0002'),
    ('SIP-2026-0002', 'MRN-0003')
)
UPDATE "doctor_patients" AS dp
SET
  "unassigned_at" = NULL,
  "unassigned_by_id" = NULL,
  "updated_at" = NOW()
FROM seed_assignments sa
WHERE dp."id" = md5('demo-assignment:' || sa.license_number || ':' || sa.mrn)::uuid
  AND dp."unassigned_at" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "doctor_patients" active
    WHERE active."doctor_id" = dp."doctor_id"
      AND active."patient_id" = dp."patient_id"
      AND active."unassigned_at" IS NULL
  );

-- Materialize each booked window's next strictly-future occurrence:
-- k = ((target_dow - today_dow - 1) mod 7) + 1 days ahead, so a Monday clinic
-- seeded on Monday lands next Monday, never today (today's queue is the
-- encounter demo below, not a future booking).
WITH seed_bookings(license_number, day_of_week, start_time, end_time, max_patients) AS (
  VALUES
    ('SIP-2026-0001', 1, '08:00', '12:00', 10),
    ('SIP-2026-0002', 1, '09:00', '13:00', 12)
),
dated AS (
  SELECT
    *,
    (CURRENT_DATE
      + (((day_of_week - EXTRACT(DOW FROM CURRENT_DATE)::int - 1) % 7 + 7) % 7 + 1)
    )::date AS session_date
  FROM seed_bookings
)
INSERT INTO "appointment_sessions" (
  "id",
  "doctor_id",
  "schedule_id",
  "session_date",
  "start_time",
  "end_time",
  "max_patients",
  "status",
  "created_at",
  "updated_at"
)
SELECT
  md5('demo-session:' || license_number || ':' || session_date || ':' || start_time)::uuid,
  md5('doctor:' || license_number)::uuid,
  md5('demo-schedule:' || license_number || ':' || day_of_week || ':' || start_time)::uuid,
  session_date,
  start_time,
  end_time,
  max_patients,
  'OPEN'::"AppointmentSessionStatus",
  NOW(),
  NOW()
FROM dated
ON CONFLICT ("doctor_id", "session_date", "start_time") DO NOTHING;

-- Queue entries into those sessions. Joined on the session's natural key
-- rather than the derived id so a session the clinic already materialized for
-- the same slot is reused instead of violating the appointment FK.
WITH seed_session_appointments(license_number, day_of_week, start_time, mrn, queue_number, reason) AS (
  VALUES
    ('SIP-2026-0001', 1, '08:00', 'MRN-0001', 1, 'Kontrol tekanan darah'),
    ('SIP-2026-0001', 1, '08:00', 'MRN-0002', 2, 'Nyeri ulu hati berulang'),
    ('SIP-2026-0002', 1, '09:00', 'MRN-0003', 1, 'Batuk pilek anak')
),
dated AS (
  SELECT
    *,
    (CURRENT_DATE
      + (((day_of_week - EXTRACT(DOW FROM CURRENT_DATE)::int - 1) % 7 + 7) % 7 + 1)
    )::date AS session_date
  FROM seed_session_appointments
)
INSERT INTO "appointments" (
  "id",
  "patient_id",
  "doctor_id",
  "type",
  "session_id",
  "queue_number",
  "scheduled_at",
  "status",
  "reason",
  "created_by_id",
  "created_at",
  "updated_at",
  "deleted_at"
)
SELECT
  md5('demo-appointment:' || d.mrn || ':' || d.license_number || ':' || d.session_date || ':' || d.start_time)::uuid,
  md5('patient:' || d.mrn)::uuid,
  md5('doctor:' || d.license_number)::uuid,
  'SESSION'::"AppointmentType",
  s."id",
  d.queue_number,
  ((d.session_date::text || ' ' || d.start_time)::timestamp - interval '7 hours'),
  'SCHEDULED'::"AppointmentStatus",
  d.reason,
  md5('user:admin@salingjaga.com')::uuid,
  NOW(),
  NOW(),
  NULL
FROM dated d
JOIN "appointment_sessions" s
  ON s."doctor_id" = md5('doctor:' || d.license_number)::uuid
  AND s."session_date" = d.session_date
  AND s."start_time" = d.start_time
ON CONFLICT ("id") DO NOTHING;

-- One pending special request for the admin approval queue: Dewi asks
-- dr. Andi for an exact slot next week. Doctors see it read-only in their own
-- agenda; only ADMIN holds `appointment.approve:any`.
INSERT INTO "appointments" (
  "id",
  "patient_id",
  "doctor_id",
  "type",
  "session_id",
  "queue_number",
  "scheduled_at",
  "status",
  "reason",
  "created_by_id",
  "created_at",
  "updated_at",
  "deleted_at"
)
SELECT
  md5('demo-appointment:special:MRN-0004:' || request_date)::uuid,
  md5('patient:MRN-0004')::uuid,
  md5('doctor:SIP-2026-0001')::uuid,
  'SPECIAL_REQUEST'::"AppointmentType",
  NULL,
  NULL,
  ((request_date::text || ' 10:00')::timestamp - interval '7 hours'),
  'REQUESTED'::"AppointmentStatus",
  'Konsultasi hasil laboratorium',
  md5('user:admin@salingjaga.com')::uuid,
  NOW(),
  NOW(),
  NULL
FROM (SELECT (CURRENT_DATE + 8)::date AS request_date) AS r
ON CONFLICT ("id") DO NOTHING;

-- A checked-in walk-in for Budi with an IN_PROGRESS encounter under dr. Andi,
-- so the prescription form is reachable the moment the doctor logs in.
-- DO NOTHING on both: once the clinic finishes or edits this visit, a reseed
-- must not reopen it.
INSERT INTO "registrations" (
  "id",
  "patient_id",
  "appointment_id",
  "status",
  "registered_at",
  "checked_in_at",
  "created_by_id",
  "created_at",
  "updated_at",
  "deleted_at"
)
VALUES (
  md5('demo-registration:MRN-0001:walk-in')::uuid,
  md5('patient:MRN-0001')::uuid,
  NULL,
  'CHECKED_IN'::"RegistrationStatus",
  NOW(),
  NOW(),
  md5('user:admin@salingjaga.com')::uuid,
  NOW(),
  NOW(),
  NULL
)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "encounters" (
  "id",
  "registration_id",
  "patient_id",
  "doctor_id",
  "status",
  "started_at",
  "created_by_id",
  "created_at",
  "updated_at",
  "deleted_at",
  "subjective"
)
VALUES (
  md5('demo-encounter:MRN-0001:walk-in')::uuid,
  md5('demo-registration:MRN-0001:walk-in')::uuid,
  md5('patient:MRN-0001')::uuid,
  md5('doctor:SIP-2026-0001')::uuid,
  'IN_PROGRESS'::"EncounterStatus",
  NOW(),
  md5('user:andi.prasetyo@clinic.local')::uuid,
  NOW(),
  NOW(),
  NULL,
  'Demam dan batuk sejak dua hari terakhir.'
)
ON CONFLICT ("registration_id") DO NOTHING;

-- Placed at the end of the file deliberately: the rooms below JOIN the
-- room_class baseline rows and the beds JOIN the rooms, and the whole seed is
-- one transaction executed top to bottom — earlier than this, the parents do
-- not exist yet and the joins would skip every row without a word.
-- Development demo room inventory. Replace or remove this block for
-- production seeds — a real clinic's floor plan comes from the admin screens
-- (IMP-13), never from here. Three wards, three rooms, three beds: enough for
-- the occupancy board, the bed picker and an admit -> discharge walkthrough to
-- have something to show on a fresh database.
--
-- Every insert is `DO NOTHING` against the live-rows partial unique index, so
-- a renamed ward or a bed flipped to MAINTENANCE survives a re-seed. Rooms and
-- beds resolve their parents by JOINing live rows on code rather than by a
-- derived id: if a class or ward was retired and recreated from the UI, the
-- demo rows attach to the row that is actually live — and if a referenced
-- class is gone entirely, the row is skipped instead of failing the seed.
WITH seed_wards(code, name, description) AS (
  VALUES
    ('MELATI', 'Bangsal Melati', 'Bangsal perawatan dewasa, lantai 2'),
    ('ANGGREK', 'Bangsal Anggrek', 'Bangsal perawatan anak, lantai 3'),
    ('MAWAR', 'Bangsal Mawar', 'Bangsal bersalin, lantai 1')
)
INSERT INTO "wards" ("id", "code", "name", "description", "is_active", "created_at", "updated_at", "deleted_at")
SELECT
  md5('ward:' || code)::uuid,
  code,
  name,
  description,
  true,
  NOW(),
  NOW(),
  NULL
FROM seed_wards
-- Same retired-row guard as the room_classes baseline: a retired ward keeps
-- its derived id but leaves the partial index, and a bare insert would fail
-- the seed on the primary key.
WHERE NOT EXISTS (
  SELECT 1 FROM "wards" existing WHERE existing."id" = md5('ward:' || seed_wards.code)::uuid
)
ON CONFLICT ("code") WHERE "deleted_at" IS NULL DO NOTHING;

WITH seed_rooms(ward_code, room_class_code, code, name, description) AS (
  VALUES
    ('MELATI', 'KELAS_1', '201', 'Kamar 201', 'Dua tempat tidur, kamar mandi dalam'),
    ('ANGGREK', 'KELAS_3', '301', 'Kamar 301', 'Enam tempat tidur'),
    ('MAWAR', 'VIP', 'VIP-1', 'Kamar VIP 1', 'Satu tempat tidur, ruang keluarga')
)
INSERT INTO "rooms" ("id", "ward_id", "room_class_id", "code", "name", "description", "is_active", "created_at", "updated_at", "deleted_at")
SELECT
  md5('room:' || sr.ward_code || ':' || sr.code)::uuid,
  w."id",
  rc."id",
  sr.code,
  sr.name,
  sr.description,
  true,
  NOW(),
  NOW(),
  NULL
FROM seed_rooms sr
JOIN "wards" w ON w."code" = sr.ward_code AND w."deleted_at" IS NULL
JOIN "room_classes" rc ON rc."code" = sr.room_class_code AND rc."deleted_at" IS NULL
WHERE NOT EXISTS (
  SELECT 1 FROM "rooms" existing
  WHERE existing."id" = md5('room:' || sr.ward_code || ':' || sr.code)::uuid
)
ON CONFLICT ("ward_id", "code") WHERE "deleted_at" IS NULL DO NOTHING;

WITH seed_beds(ward_code, room_code, code) AS (
  VALUES
    ('MELATI', '201', 'A'),
    ('ANGGREK', '301', 'A'),
    ('MAWAR', 'VIP-1', 'A')
)
INSERT INTO "beds" ("id", "room_id", "code", "status", "created_at", "updated_at", "deleted_at")
SELECT
  md5('bed:' || sb.ward_code || ':' || sb.room_code || ':' || sb.code)::uuid,
  r."id",
  sb.code,
  'AVAILABLE',
  NOW(),
  NOW(),
  NULL
FROM seed_beds sb
JOIN "wards" w ON w."code" = sb.ward_code AND w."deleted_at" IS NULL
JOIN "rooms" r ON r."ward_id" = w."id" AND r."code" = sb.room_code AND r."deleted_at" IS NULL
WHERE NOT EXISTS (
  SELECT 1 FROM "beds" existing
  WHERE existing."id" = md5('bed:' || sb.ward_code || ':' || sb.room_code || ':' || sb.code)::uuid
)
ON CONFLICT ("room_id", "code") WHERE "deleted_at" IS NULL DO NOTHING;

COMMIT;
