-- Production Supabase: allow new schedule statuses
-- SYSTEM_REPROCESS, DONE_SYSTEM_REPROCESS, DISMANTLE, DONE_DISMANTLE

ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_status_check;
ALTER TABLE ticket_assignment_history DROP CONSTRAINT IF EXISTS ticket_assignment_history_new_status_check;
ALTER TABLE ticket_assignment_history DROP CONSTRAINT IF EXISTS ticket_assignment_history_previous_status_check;

ALTER TABLE tickets
ADD CONSTRAINT tickets_status_check
CHECK (status IN (
  'PENDING', 'ASSIGNED', 'ON_THE_WAY', 'IN_PROGRESS', 'COMPLETED', 'INSTALLED', 'CANCELLED',
  'SCHEDULED', 'RESCHED', 'FOR_APPROVAL', 'SURVEY', 'CONTINUATION',
  'SYSTEM_REPROCESS', 'DONE_SYSTEM_REPROCESS',
  'DISMANTLE', 'DONE_DISMANTLE'
));

ALTER TABLE ticket_assignment_history
ADD CONSTRAINT ticket_assignment_history_new_status_check
CHECK (new_status IS NULL OR new_status IN (
  'PENDING', 'ASSIGNED', 'ON_THE_WAY', 'IN_PROGRESS', 'COMPLETED', 'INSTALLED', 'CANCELLED',
  'SCHEDULED', 'RESCHED', 'FOR_APPROVAL', 'SURVEY', 'CONTINUATION',
  'SYSTEM_REPROCESS', 'DONE_SYSTEM_REPROCESS',
  'DISMANTLE', 'DONE_DISMANTLE'
));

ALTER TABLE ticket_assignment_history
ADD CONSTRAINT ticket_assignment_history_previous_status_check
CHECK (previous_status IS NULL OR previous_status IN (
  'PENDING', 'ASSIGNED', 'ON_THE_WAY', 'IN_PROGRESS', 'COMPLETED', 'INSTALLED', 'CANCELLED',
  'SCHEDULED', 'RESCHED', 'FOR_APPROVAL', 'SURVEY', 'CONTINUATION',
  'SYSTEM_REPROCESS', 'DONE_SYSTEM_REPROCESS',
  'DISMANTLE', 'DONE_DISMANTLE'
));
