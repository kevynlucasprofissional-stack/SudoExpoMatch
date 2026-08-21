DELETE FROM public.match_reasons;
DELETE FROM public.match_status_history;
DELETE FROM public.match_decisions;
DELETE FROM public.match_admin_reviews;
DELETE FROM public.connection_events;
DELETE FROM public.connection_notes;
DELETE FROM public.connection_status_history;
DELETE FROM public.connections;
DELETE FROM public.matches;
DELETE FROM public.profile_offers;
DELETE FROM public.profile_needs;
DELETE FROM public.profile_segments;
DELETE FROM public.consents;
DELETE FROM public.ai_runs;
DELETE FROM public.analytics_events;
DELETE FROM public.audit_logs;
DELETE FROM public.profiles;

DELETE FROM auth.users u
WHERE u.id NOT IN (SELECT user_id FROM public.event_staff)
  AND u.id NOT IN (SELECT user_id FROM public.staff_roles);
