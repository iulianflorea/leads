-- Why a bulk job paused itself (e.g. authExpired, interrupted) so the UI can explain it.
ALTER TABLE send_jobs ADD COLUMN paused_reason TEXT;
