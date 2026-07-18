-- Disable transaction block if running in some editors that complain:
COMMIT;

-- 0. Migrate any existing legacy statuses to prevent constraint violations
UPDATE tickets SET status = 'ASSIGNED' WHERE status IN ('ON_THE_WAY', 'IN_PROGRESS');
UPDATE ticket_assignment_history SET new_status = 'ASSIGNED' WHERE new_status IN ('ON_THE_WAY', 'IN_PROGRESS');
UPDATE ticket_assignment_history SET previous_status = 'ASSIGNED' WHERE previous_status IN ('ON_THE_WAY', 'IN_PROGRESS');

-- 1. Remove the existing CHECK constraints on tickets and ticket_assignment_history
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_status_check;
ALTER TABLE ticket_assignment_history DROP CONSTRAINT IF EXISTS ticket_assignment_history_new_status_check;
ALTER TABLE ticket_assignment_history DROP CONSTRAINT IF EXISTS ticket_assignment_history_previous_status_check;

-- 2. Add the updated CHECK constraints (ON_THE_WAY and IN_PROGRESS have been removed)
ALTER TABLE tickets
ADD CONSTRAINT tickets_status_check
CHECK (status IN ('PENDING', 'ASSIGNED', 'COMPLETED', 'INSTALLED', 'CANCELLED', 'SCHEDULED', 'RESCHED', 'FOR_APPROVAL', 'SURVEY', 'CONTINUATION', 'SYSTEM_REPROCESS', 'DONE_SYSTEM_REPROCESS'));

ALTER TABLE ticket_assignment_history
ADD CONSTRAINT ticket_assignment_history_new_status_check
CHECK (new_status IS NULL OR new_status IN ('PENDING', 'ASSIGNED', 'COMPLETED', 'INSTALLED', 'CANCELLED', 'SCHEDULED', 'RESCHED', 'FOR_APPROVAL', 'SURVEY', 'CONTINUATION', 'SYSTEM_REPROCESS', 'DONE_SYSTEM_REPROCESS'));

ALTER TABLE ticket_assignment_history
ADD CONSTRAINT ticket_assignment_history_previous_status_check
CHECK (previous_status IS NULL OR previous_status IN ('PENDING', 'ASSIGNED', 'COMPLETED', 'INSTALLED', 'CANCELLED', 'SCHEDULED', 'RESCHED', 'FOR_APPROVAL', 'SURVEY', 'CONTINUATION', 'SYSTEM_REPROCESS', 'DONE_SYSTEM_REPROCESS'));
