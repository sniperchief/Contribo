-- =============================================================================
-- Contribo — initial schema (Phase 1)
--
-- Tables
--   profiles             one row per auth user (public contributor/founder profile)
--   github_identities    GitHub account linked through Supabase Auth (synced by trigger)
--   projects             founder-owned open-source projects
--   project_repositories GitHub repositories published under a project
--   reward_policies      versioned reward terms; immutable once published
--   contributions        pull-request contribution records
--
-- Access model
--   * Row Level Security is enabled on every table.
--   * Public (anon) reads are limited to published projects and their public data.
--   * Founders manage their own projects, repositories and reward policies.
--   * Contributors may submit contribution claims; verification, acceptance and
--     reward state are written only by trusted server code (service role).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type public.project_status as enum ('draft', 'published', 'archived');

create type public.reward_policy_status as enum ('draft', 'published', 'retired');

-- How contributors are rewarded under a policy:
--   bounty         fixed rewards for accepted work, paid from a funded pool
--   funding_share  a share of future project funding is reserved for contributors
--   hybrid         both of the above
create type public.reward_model as enum ('bounty', 'funding_share', 'hybrid');

create type public.contribution_status as enum ('submitted', 'verified', 'accepted', 'rejected');

-- -----------------------------------------------------------------------------
-- Shared helpers
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------
create table public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  username       text,
  display_name   text,
  avatar_url     text,
  bio            text,
  website_url    text,
  -- Self-declared payout address. Ownership is proven with a signature in a later phase.
  wallet_address text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint profiles_username_format
    check (username is null or username ~ '^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$'),
  constraint profiles_display_name_length check (char_length(display_name) <= 80),
  constraint profiles_bio_length check (char_length(bio) <= 500),
  constraint profiles_wallet_address_format
    check (wallet_address is null or wallet_address ~ '^0x[0-9a-fA-F]{40}$')
);

create unique index profiles_username_key on public.profiles (lower(username));
create unique index profiles_wallet_address_key on public.profiles (lower(wallet_address));

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- github_identities
-- -----------------------------------------------------------------------------
create table public.github_identities (
  user_id        uuid primary key references public.profiles (id) on delete cascade,
  github_user_id bigint not null unique,
  github_login   text not null,
  avatar_url     text,
  linked_at      timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index github_identities_login_idx on public.github_identities (lower(github_login));

create trigger github_identities_set_updated_at
  before update on public.github_identities
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- projects
-- -----------------------------------------------------------------------------
create table public.projects (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  slug         text not null,
  name         text not null,
  tagline      text,
  description  text,
  website_url  text,
  logo_url     text,
  status       public.project_status not null default 'draft',
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint projects_slug_format check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])$'),
  constraint projects_name_length check (char_length(name) between 2 and 80),
  constraint projects_tagline_length check (char_length(tagline) <= 160)
);

create unique index projects_slug_key on public.projects (slug);
create index projects_owner_id_idx on public.projects (owner_id);
create index projects_status_idx on public.projects (status);

create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

create or replace function public.stamp_project_published_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'published' and new.published_at is null then
    new.published_at = now();
  end if;
  return new;
end;
$$;

create trigger projects_stamp_published_at
  before insert or update of status on public.projects
  for each row execute function public.stamp_project_published_at();

-- Ownership check used by RLS policies on child tables. SECURITY DEFINER avoids
-- recursive RLS evaluation and keeps policies cheap.
create or replace function public.is_project_owner(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.projects
    where id = p_project_id and owner_id = (select auth.uid())
  );
$$;

create or replace function public.is_project_published(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.projects
    where id = p_project_id and status = 'published'
  );
$$;

-- -----------------------------------------------------------------------------
-- project_repositories
-- -----------------------------------------------------------------------------
create table public.project_repositories (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects (id) on delete cascade,
  github_owner   text not null,
  github_name    text not null,
  -- Filled in when the repository is verified against the GitHub API.
  github_repo_id bigint unique,
  default_branch text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint project_repositories_owner_format
    check (github_owner ~ '^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$'),
  constraint project_repositories_name_format
    check (github_name ~ '^[A-Za-z0-9._-]{1,100}$'),
  -- Lets child rows reference (repository, project) together.
  constraint project_repositories_id_project_key unique (id, project_id)
);

-- A GitHub repository can be published by only one Contribo project.
create unique index project_repositories_full_name_key
  on public.project_repositories (lower(github_owner), lower(github_name));
create index project_repositories_project_id_idx on public.project_repositories (project_id);

create trigger project_repositories_set_updated_at
  before update on public.project_repositories
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- reward_policies
-- -----------------------------------------------------------------------------
create table public.reward_policies (
  id                   uuid primary key default gen_random_uuid(),
  project_id           uuid not null references public.projects (id) on delete cascade,
  version              integer not null,
  status               public.reward_policy_status not null default 'draft',
  title                text not null,
  summary              text,
  -- Full human-readable terms (Markdown). Frozen once published.
  terms                text not null default '',
  reward_model         public.reward_model not null,
  -- Share of future project funding reserved for contributors, in basis points.
  contributor_pool_bps integer,
  -- Asset that rewards are denominated in (e.g. 'MON').
  reward_asset         text not null default 'MON',
  -- Structured eligibility rules (labels, review requirements, caps, ...).
  eligibility          jsonb not null default '{}'::jsonb,
  published_at         timestamptz,
  retired_at           timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint reward_policies_version_positive check (version > 0),
  constraint reward_policies_project_version_key unique (project_id, version),
  constraint reward_policies_id_project_key unique (id, project_id),
  constraint reward_policies_title_length check (char_length(title) between 3 and 120),
  constraint reward_policies_pool_bps_range
    check (contributor_pool_bps is null or contributor_pool_bps between 0 and 10000),
  constraint reward_policies_pool_required
    check (reward_model = 'bounty' or contributor_pool_bps is not null),
  constraint reward_policies_eligibility_object check (jsonb_typeof(eligibility) = 'object')
);

-- At most one published (active) policy per project.
create unique index reward_policies_one_published_per_project
  on public.reward_policies (project_id) where status = 'published';
create index reward_policies_project_id_idx on public.reward_policies (project_id);

create trigger reward_policies_set_updated_at
  before update on public.reward_policies
  for each row execute function public.set_updated_at();

-- Published policies are a commitment to contributors: their terms are frozen.
-- Allowed transitions: draft -> published -> retired. Drafts are freely editable.
create or replace function public.guard_reward_policy_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception 'Reward policies must be created as drafts';
    end if;
    new.published_at = null;
    new.retired_at = null;
    return new;
  end if;

  if new.project_id <> old.project_id or new.version <> old.version then
    raise exception 'Reward policy project and version cannot change';
  end if;

  if old.status = 'retired' then
    raise exception 'Retired reward policies cannot be modified';
  end if;

  if old.status = 'published' then
    if new.status <> 'retired'
       or (to_jsonb(new) - array['status', 'retired_at', 'updated_at'])
          is distinct from (to_jsonb(old) - array['status', 'retired_at', 'updated_at']) then
      raise exception 'Published reward policies are immutable; retire it and publish a new version';
    end if;
    new.retired_at = now();
    return new;
  end if;

  -- old.status = 'draft'
  if new.status = 'retired' then
    raise exception 'Only published reward policies can be retired';
  end if;
  if new.status = 'published' then
    new.published_at = now();
  end if;
  return new;
end;
$$;

create trigger reward_policies_guard_changes
  before insert or update on public.reward_policies
  for each row execute function public.guard_reward_policy_changes();

-- -----------------------------------------------------------------------------
-- contributions
-- -----------------------------------------------------------------------------
create table public.contributions (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.projects (id) on delete restrict,
  repository_id     uuid not null,
  -- Null when the PR author has not joined Contribo yet (records ingested from GitHub).
  contributor_id    uuid references public.profiles (id) on delete set null,
  github_user_id    bigint not null,
  github_login      text not null,
  pr_number         integer not null,
  pr_url            text not null,
  pr_title          text,
  status            public.contribution_status not null default 'submitted',
  -- Reward terms in force when the contribution was recorded.
  reward_policy_id  uuid,
  merged_at         timestamptz,
  verified_at       timestamptz,
  status_changed_at timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint contributions_pr_number_positive check (pr_number > 0),
  constraint contributions_pr_url_format check (pr_url ~ '^https://github\.com/[^/]+/[^/]+/pull/[0-9]+$'),
  constraint contributions_repository_pr_key unique (repository_id, pr_number),
  constraint contributions_repository_fk
    foreign key (repository_id, project_id)
    references public.project_repositories (id, project_id) on delete restrict,
  constraint contributions_reward_policy_fk
    foreign key (reward_policy_id, project_id)
    references public.reward_policies (id, project_id) on delete restrict
);

create index contributions_project_id_idx on public.contributions (project_id);
create index contributions_contributor_id_idx on public.contributions (contributor_id);
create index contributions_github_user_id_idx on public.contributions (github_user_id);
create index contributions_reward_policy_id_idx on public.contributions (reward_policy_id);

create trigger contributions_set_updated_at
  before update on public.contributions
  for each row execute function public.set_updated_at();

-- Snapshot the project's active reward policy at submission time and track status changes.
create or replace function public.prepare_contribution()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.reward_policy_id is null then
    select id into new.reward_policy_id
    from public.reward_policies
    where project_id = new.project_id and status = 'published';
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    new.status_changed_at = now();
  end if;

  return new;
end;
$$;

create trigger contributions_prepare
  before insert or update on public.contributions
  for each row execute function public.prepare_contribution();

-- -----------------------------------------------------------------------------
-- Auth sync: profiles and GitHub identities
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  candidate text := meta ->> 'user_name';
begin
  -- Claim the GitHub login as username when it is valid and still free.
  if candidate is null
     or candidate !~ '^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$'
     or exists (select 1 from public.profiles where lower(username) = lower(candidate)) then
    candidate := null;
  end if;

  begin
    insert into public.profiles (id, username, display_name, avatar_url)
    values (
      new.id,
      candidate,
      left(coalesce(meta ->> 'full_name', meta ->> 'name', meta ->> 'user_name'), 80),
      meta ->> 'avatar_url'
    )
    on conflict (id) do nothing;
  exception when unique_violation then
    -- Username claimed concurrently: create the profile without one.
    insert into public.profiles (id, display_name, avatar_url)
    values (
      new.id,
      left(coalesce(meta ->> 'full_name', meta ->> 'name', meta ->> 'user_name'), 80),
      meta ->> 'avatar_url'
    )
    on conflict (id) do nothing;
  end;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.sync_github_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.provider = 'github' then
      delete from public.github_identities where user_id = old.user_id;
    end if;
    return old;
  end if;

  if new.provider <> 'github' or new.provider_id !~ '^[0-9]+$' then
    return new;
  end if;

  insert into public.github_identities (user_id, github_user_id, github_login, avatar_url)
  values (
    new.user_id,
    new.provider_id::bigint,
    coalesce(new.identity_data ->> 'user_name', new.identity_data ->> 'preferred_username', ''),
    new.identity_data ->> 'avatar_url'
  )
  on conflict (user_id) do update
    set github_user_id = excluded.github_user_id,
        github_login   = excluded.github_login,
        avatar_url     = excluded.avatar_url;

  return new;
end;
$$;

create trigger on_auth_identity_changed
  after insert or update or delete on auth.identities
  for each row execute function public.sync_github_identity();

-- Trigger functions are not meant to be called through the API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.sync_github_identity() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.profiles             enable row level security;
alter table public.github_identities    enable row level security;
alter table public.projects             enable row level security;
alter table public.project_repositories enable row level security;
alter table public.reward_policies      enable row level security;
alter table public.contributions        enable row level security;

-- profiles: public read; users edit their own profile (selected columns only).
create policy "Profiles are publicly readable"
  on public.profiles for select
  to anon, authenticated
  using (true);

create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (username, display_name, avatar_url, bio, website_url, wallet_address)
  on public.profiles to authenticated;

-- github_identities: public read; written only by the auth sync trigger / service role.
create policy "GitHub identities are publicly readable"
  on public.github_identities for select
  to anon, authenticated
  using (true);

revoke insert, update, delete on public.github_identities from anon, authenticated;

-- projects
create policy "Published projects are publicly readable"
  on public.projects for select
  to anon, authenticated
  using (status = 'published');

create policy "Owners can read their own projects"
  on public.projects for select
  to authenticated
  using (owner_id = (select auth.uid()));

create policy "Users can create projects they own"
  on public.projects for insert
  to authenticated
  with check (owner_id = (select auth.uid()));

create policy "Owners can update their projects"
  on public.projects for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "Owners can delete draft projects"
  on public.projects for delete
  to authenticated
  using (owner_id = (select auth.uid()) and status = 'draft');

-- owner_id and published_at are not editable through the API.
revoke update on public.projects from anon, authenticated;
grant update (slug, name, tagline, description, website_url, logo_url, status)
  on public.projects to authenticated;

-- project_repositories
create policy "Repositories of published projects are publicly readable"
  on public.project_repositories for select
  to anon, authenticated
  using (public.is_project_published(project_id));

create policy "Owners can read their project repositories"
  on public.project_repositories for select
  to authenticated
  using (public.is_project_owner(project_id));

create policy "Owners can add repositories"
  on public.project_repositories for insert
  to authenticated
  with check (public.is_project_owner(project_id) and github_repo_id is null);

create policy "Owners can update repositories"
  on public.project_repositories for update
  to authenticated
  using (public.is_project_owner(project_id))
  with check (public.is_project_owner(project_id));

create policy "Owners can remove repositories"
  on public.project_repositories for delete
  to authenticated
  using (public.is_project_owner(project_id));

-- github_repo_id is set by server-side verification only.
revoke update on public.project_repositories from anon, authenticated;
grant update (github_owner, github_name, default_branch)
  on public.project_repositories to authenticated;

-- reward_policies
create policy "Public policies of published projects are readable"
  on public.reward_policies for select
  to anon, authenticated
  using (status in ('published', 'retired') and public.is_project_published(project_id));

create policy "Owners can read their reward policies"
  on public.reward_policies for select
  to authenticated
  using (public.is_project_owner(project_id));

create policy "Owners can create reward policies"
  on public.reward_policies for insert
  to authenticated
  with check (public.is_project_owner(project_id));

create policy "Owners can update reward policies"
  on public.reward_policies for update
  to authenticated
  using (public.is_project_owner(project_id))
  with check (public.is_project_owner(project_id));

create policy "Owners can delete draft reward policies"
  on public.reward_policies for delete
  to authenticated
  using (public.is_project_owner(project_id) and status = 'draft');

-- contributions
create policy "Verified contributions of published projects are readable"
  on public.contributions for select
  to anon, authenticated
  using (status in ('verified', 'accepted') and public.is_project_published(project_id));

create policy "Contributors can read their own contributions"
  on public.contributions for select
  to authenticated
  using (contributor_id = (select auth.uid()));

create policy "Owners can read contributions to their projects"
  on public.contributions for select
  to authenticated
  using (public.is_project_owner(project_id));

-- A contributor may claim a PR authored by their linked GitHub account on a published
-- project. The claim starts unverified; verification is performed server-side.
create policy "Contributors can submit claims for their own pull requests"
  on public.contributions for insert
  to authenticated
  with check (
    contributor_id = (select auth.uid())
    and status = 'submitted'
    and merged_at is null
    and verified_at is null
    and public.is_project_published(project_id)
    and exists (
      select 1 from public.github_identities gi
      where gi.user_id = (select auth.uid())
        and gi.github_user_id = contributions.github_user_id
    )
  );

create policy "Contributors can withdraw unverified claims"
  on public.contributions for delete
  to authenticated
  using (contributor_id = (select auth.uid()) and status = 'submitted');

-- Status, verification and reward linkage are written by the service role only.
revoke insert, update on public.contributions from anon, authenticated;
grant insert (project_id, repository_id, contributor_id, github_user_id, github_login, pr_number, pr_url, pr_title)
  on public.contributions to authenticated;
