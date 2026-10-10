-- =============================================================================
-- Contribo — Phase 3: GitHub verification and onchain integration
--
-- * Wallet addresses are linked only through a server-verified signature.
-- * Repositories are verified server-side against the GitHub API; unverified
--   repositories no longer block the real owner from connecting the same repo.
-- * Reward policies are published by the server, which records the policy hash
--   that is anchored onchain.
-- * Projects, approvers and contributions record their reconciled onchain state.
--
-- Columns written by trusted server code are not granted to API roles; the
-- server uses the service-role key after performing its own authorization.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- profiles: verified wallet
-- -----------------------------------------------------------------------------
alter table public.profiles add column wallet_verified_at timestamptz;

-- wallet_address was user-editable in Phase 1; it now requires a signed message.
revoke update (wallet_address) on public.profiles from authenticated;

-- -----------------------------------------------------------------------------
-- project_repositories: GitHub ownership verification
-- -----------------------------------------------------------------------------
alter table public.project_repositories
  add column verification_token text not null default replace(gen_random_uuid()::text, '-', ''),
  add column verified_at timestamptz,
  add column verification_method text,
  add constraint project_repositories_verification_method_check
    check (verification_method is null or verification_method in ('owner', 'file'));

-- Phase 1 reserved a repository for the first project that added it, which let
-- anyone squat a repo. Now a repo is unique per project, and globally unique
-- only once verified (github_repo_id is already globally unique).
drop index public.project_repositories_full_name_key;
create unique index project_repositories_project_full_name_key
  on public.project_repositories (project_id, lower(github_owner), lower(github_name));
create unique index project_repositories_verified_full_name_key
  on public.project_repositories (lower(github_owner), lower(github_name))
  where verified_at is not null;

drop policy "Owners can add repositories" on public.project_repositories;
create policy "Owners can add repositories"
  on public.project_repositories for insert
  to authenticated
  with check (
    public.is_project_owner(project_id)
    and github_repo_id is null
    and verified_at is null
    and verification_method is null
  );

-- Owner/name are fixed once added (remove and re-add instead).
revoke update (github_owner, github_name) on public.project_repositories from authenticated;

-- -----------------------------------------------------------------------------
-- projects: onchain registration
-- -----------------------------------------------------------------------------
alter table public.projects
  add column onchain_project_id numeric(78, 0),
  add column onchain_asset text,
  add column onchain_registration_tx text,
  add constraint projects_onchain_project_id_positive check (onchain_project_id is null or onchain_project_id > 0),
  add constraint projects_onchain_asset_format check (onchain_asset is null or onchain_asset ~ '^0x[0-9a-fA-F]{40}$'),
  add constraint projects_onchain_registration_tx_format
    check (onchain_registration_tx is null or onchain_registration_tx ~ '^0x[0-9a-fA-F]{64}$');

create unique index projects_onchain_project_id_key on public.projects (onchain_project_id);

-- -----------------------------------------------------------------------------
-- reward_policies: server-published, hash anchored onchain
-- -----------------------------------------------------------------------------
alter table public.reward_policies
  add column policy_hash text,
  add constraint reward_policies_policy_hash_format check (policy_hash is null or policy_hash ~ '^0x[0-9a-f]{64}$'),
  add constraint reward_policies_published_has_hash check (status = 'draft' or policy_hash is not null);

-- Owners edit drafts; publishing and retiring go through the server, which
-- computes the policy hash.
revoke update on public.reward_policies from authenticated;
grant update (title, summary, terms, reward_model, contributor_pool_bps, reward_asset, eligibility)
  on public.reward_policies to authenticated;

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
    new.policy_hash = null;
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
  else
    new.policy_hash = null;
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- project_approvers: onchain approvers, reconciled from the contract
-- -----------------------------------------------------------------------------
create table public.project_approvers (
  project_id uuid not null references public.projects (id) on delete cascade,
  address    text not null,
  tx_hash    text,
  created_at timestamptz not null default now(),

  primary key (project_id, address),
  constraint project_approvers_address_format check (address ~ '^0x[0-9a-f]{40}$'),
  constraint project_approvers_tx_hash_format check (tx_hash is null or tx_hash ~ '^0x[0-9a-fA-F]{64}$')
);

alter table public.project_approvers enable row level security;

create policy "Approvers of published projects are publicly readable"
  on public.project_approvers for select
  to anon, authenticated
  using (public.is_project_published(project_id));

create policy "Owners can read their project approvers"
  on public.project_approvers for select
  to authenticated
  using (public.is_project_owner(project_id));

revoke insert, update, delete on public.project_approvers from anon, authenticated;

-- -----------------------------------------------------------------------------
-- contributions: review and onchain reward state
-- -----------------------------------------------------------------------------
alter table public.contributions
  add column github_repo_id bigint,
  -- Set when the contribution is accepted for a reward.
  add column contributor_wallet text,
  add column reward_amount numeric(78, 0),
  add column bounty_id numeric(78, 0),
  -- bytes32 reference used onchain: keccak256("github:<repoId>:<prNumber>").
  add column onchain_ref text,
  add column approval_tx_hash text,
  add column approved_onchain_at timestamptz,
  add column claim_tx_hash text,
  add column claimed_at timestamptz,
  add constraint contributions_contributor_wallet_format
    check (contributor_wallet is null or contributor_wallet ~ '^0x[0-9a-f]{40}$'),
  add constraint contributions_reward_amount_positive check (reward_amount is null or reward_amount > 0),
  add constraint contributions_onchain_ref_format check (onchain_ref is null or onchain_ref ~ '^0x[0-9a-f]{64}$'),
  add constraint contributions_approval_tx_format
    check (approval_tx_hash is null or approval_tx_hash ~ '^0x[0-9a-fA-F]{64}$'),
  add constraint contributions_claim_tx_format check (claim_tx_hash is null or claim_tx_hash ~ '^0x[0-9a-fA-F]{64}$'),
  add constraint contributions_claim_requires_approval check (claimed_at is null or approved_onchain_at is not null);

create unique index contributions_project_onchain_ref_key
  on public.contributions (project_id, onchain_ref) where onchain_ref is not null;
create unique index contributions_github_pr_key
  on public.contributions (github_repo_id, pr_number) where github_repo_id is not null;

