-- =============================================================================
-- Contribo — guided project setup
--
-- * projects.setup_plan keeps a founder's unfinished setup (reward type, funding
--   and bounties) so they can leave and resume before launch.
-- * Only the server changes a project's status: it publishes a project after
--   confirming onchain that it is registered and funded.
-- * bounty_details stores the human title of each onchain bounty; the server
--   writes it after reading the BountyCreated event.
-- =============================================================================

alter table public.projects add column setup_plan jsonb;

grant update (setup_plan) on public.projects to authenticated;

-- Going live requires onchain funding, which only the server can check.
revoke update (status) on public.projects from authenticated;

-- -----------------------------------------------------------------------------
-- bounty_details
-- -----------------------------------------------------------------------------
create table public.bounty_details (
  bounty_id  numeric(78, 0) primary key,
  project_id uuid not null references public.projects (id) on delete cascade,
  title      text not null,
  tx_hash    text,
  created_at timestamptz not null default now(),

  constraint bounty_details_title_length check (char_length(title) between 1 and 120),
  constraint bounty_details_tx_hash_format check (tx_hash is null or tx_hash ~ '^0x[0-9a-fA-F]{64}$')
);

create index bounty_details_project_id_idx on public.bounty_details (project_id);

alter table public.bounty_details enable row level security;

create policy "Bounty details of published projects are publicly readable"
  on public.bounty_details for select
  to anon, authenticated
  using (public.is_project_published(project_id));

create policy "Owners can read their bounty details"
  on public.bounty_details for select
  to authenticated
  using (public.is_project_owner(project_id));

revoke insert, update, delete on public.bounty_details from anon, authenticated;
