-- =============================================================================
-- Contribo — onboarding: primary role and completion
--
-- primary_role is a preference ("what brings you here"), used to tailor where a
-- user lands and which next steps they see. It never restricts access: every
-- user can both contribute and run projects.
-- =============================================================================

alter table public.profiles
  add column primary_role text,
  add column onboarded_at timestamptz,
  add constraint profiles_primary_role_check check (primary_role is null or primary_role in ('contributor', 'founder'));

grant update (primary_role, onboarded_at) on public.profiles to authenticated;
