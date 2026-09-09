-- P19-T16 (SJ-173): check-in is refused outside the doctor's practice window,
-- and a caller holding `registration.checkin-override:any` may force it
-- anyway. The override writes an audit row naming the actor and the hours that
-- were bypassed, which needs its own verb: a generic UPDATE cannot be
-- distinguished from the hundreds of ordinary status changes the desk makes.

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'REGISTRATION_CHECKIN_OVERRIDDEN';
