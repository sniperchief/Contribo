-- =============================================================================
-- Contribo — in-app notifications and verified chain snapshots
--
-- notifications
--   * Created only by a trigger on public.contributions. Contributions are
--     written exclusively by trusted server code after it has checked GitHub or
--     the chain, so every notification reflects a genuine state transition, and
--     it commits (or rolls back) in the same transaction as that transition.
--   * Each event has a dedupe key, unique per recipient: retries, page reloads
--     and repeated reconciliation can never create a second notification.
--   * Recipients read their own notifications and may only set read_at.
--
-- project_chain_snapshots
--   * The last successful read of a project's ContriboRewards balances, written
--     by the server from its own RPC reads (never from client input). Pages show
--     it only as an explicitly labelled fallback when a live read fails.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- notifications
-- -----------------------------------------------------------------------------
create table public.notifications (
  id              uuid primary key default gen_random_uuid(),
  recipient_id    uuid not null references public.profiles (id) on delete cascade,
  type            text not null,
  project_id      uuid references public.projects (id) on delete cascade,
  contribution_id uuid references public.contributions (id) on delete cascade,
  message         text not null,
  -- One notification per event and recipient, e.g. 'reward_claimed:<contribution id>'.
  dedupe_key      text not null,
  read_at         timestamptz,
  created_at      timestamptz not null default now(),

  constraint notifications_type_check check (type in (
    -- contributor
    'contribution_verified',
    'contribution_accepted',
    'contribution_rejected',
    'reward_approved',
    'reward_claimed',
    -- founder
    'contribution_submitted'
  )),
  constraint notifications_message_length check (char_length(message) between 1 and 500),
  constraint notifications_recipient_dedupe_key unique (recipient_id, dedupe_key)
);

-- The notification list (newest first) and the unread badge count.
create index notifications_recipient_created_idx on public.notifications (recipient_id, created_at desc);
create index notifications_recipient_unread_idx on public.notifications (recipient_id) where read_at is null;
-- Foreign keys (cascading deletes).
create index notifications_project_id_idx on public.notifications (project_id);
create index notifications_contribution_id_idx on public.notifications (contribution_id);

alter table public.notifications enable row level security;

create policy "Recipients can read their notifications"
  on public.notifications for select
  to authenticated
  using (recipient_id = (select auth.uid()));

create policy "Recipients can mark their notifications read"
  on public.notifications for update
  to authenticated
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));

-- Notifications are created only by the trigger below; recipients may change read_at alone.
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- Inserts one notification unless the recipient already has one for this event.
create or replace function public.create_notification(
  p_recipient_id    uuid,
  p_type            text,
  p_project_id      uuid,
  p_contribution_id uuid,
  p_message         text,
  p_dedupe_key      text
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (recipient_id, type, project_id, contribution_id, message, dedupe_key)
  values (p_recipient_id, p_type, p_project_id, p_contribution_id, left(p_message, 500), p_dedupe_key)
  on conflict (recipient_id, dedupe_key) do nothing;
$$;

/*
 * Turns contribution state transitions into notifications. Each stage is kept
 * distinct, matching the lifecycle:
 *   verified  GitHub evidence checked by the server (not a reward)
 *   accepted  a reviewer chose a reward (not yet onchain)
 *   approved  approved_onchain_at: the server read the approval from the contract
 *   paid      claimed_at: the server read the claim from the contract
 * A GitHub merge alone never notifies, and raw 'submitted' claims (which a
 * client may insert itself) do not notify the founder until verified.
 */
create or replace function public.notify_contribution_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_name text;
  v_owner_id     uuid;
  v_pr           text;
  v_key          text := new.id::text;
begin
  select name, owner_id into v_project_name, v_owner_id from public.projects where id = new.project_id;
  v_pr := '"' || left(coalesce(nullif(btrim(new.pr_title), ''), 'Pull request #' || new.pr_number), 120) || '"';

  -- Became verified (inserted verified by the server, or verified later).
  if new.status = 'verified' and (tg_op = 'INSERT' or old.status is distinct from 'verified') then
    if new.contributor_id is not null then
      perform public.create_notification(
        new.contributor_id, 'contribution_verified', new.project_id, new.id,
        'Your pull request ' || v_pr || ' was verified on GitHub for ' || v_project_name
          || '. It now waits for the project to review it. Verification is not a reward.',
        'contribution_verified:' || v_key);
    end if;
    -- The owner gets the review request, unless they submitted their own pull request.
    if v_owner_id is distinct from new.contributor_id then
      perform public.create_notification(
        v_owner_id, 'contribution_submitted', new.project_id, new.id,
        '@' || new.github_login || ' submitted ' || v_pr || ' to ' || v_project_name || '. It is waiting for your review.',
        'contribution_submitted:' || v_key);
    end if;
  end if;

  if tg_op = 'INSERT' or new.contributor_id is null then
    return new;
  end if;

  if new.status = 'accepted' and old.status is distinct from 'accepted' then
    perform public.create_notification(
      new.contributor_id, 'contribution_accepted', new.project_id, new.id,
      v_project_name || ' accepted ' || v_pr || ' for a reward. It is not reserved for you until the approval is confirmed onchain.',
      'contribution_accepted:' || v_key);
  end if;

  if new.status = 'rejected' and old.status is distinct from 'rejected' then
    perform public.create_notification(
      new.contributor_id, 'contribution_rejected', new.project_id, new.id,
      v_project_name || ' marked ' || v_pr || ' as not eligible for a reward.',
      'contribution_rejected:' || v_key);
  end if;

  -- Approval onchain makes the reward claimable at once: the contract has no
  -- separate "ready to claim" state, so this single notification covers both.
  if new.approved_onchain_at is not null and old.approved_onchain_at is null then
    perform public.create_notification(
      new.contributor_id, 'reward_approved', new.project_id, new.id,
      'Your reward for ' || v_pr || ' (' || v_project_name || ') is approved onchain and reserved for your wallet. You can claim it now.',
      'reward_approved:' || v_key);
  end if;

  if new.claimed_at is not null and old.claimed_at is null then
    perform public.create_notification(
      new.contributor_id, 'reward_claimed', new.project_id, new.id,
      'Your reward for ' || v_pr || ' (' || v_project_name || ') was claimed onchain and paid out.',
      'reward_claimed:' || v_key);
  end if;

  return new;
end;
$$;

create trigger contributions_notify
  after insert or update on public.contributions
  for each row execute function public.notify_contribution_change();

revoke execute on function public.create_notification(uuid, text, uuid, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.notify_contribution_change() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- project_chain_snapshots
-- -----------------------------------------------------------------------------
create table public.project_chain_snapshots (
  project_id         uuid primary key references public.projects (id) on delete cascade,
  chain_id           integer not null,
  contract_address   text not null,
  onchain_project_id numeric(78, 0) not null,
  asset              text not null,
  asset_symbol       text not null,
  asset_decimals     smallint not null,
  -- ContriboRewards.getBalances(projectId) at block_number.
  available          numeric(78, 0) not null,
  escrowed           numeric(78, 0) not null,
  committed          numeric(78, 0) not null,
  total_deposited    numeric(78, 0) not null,
  total_paid         numeric(78, 0) not null,
  total_withdrawn    numeric(78, 0) not null,
  block_number       numeric(78, 0) not null,
  block_timestamp    timestamptz not null,
  read_at            timestamptz not null default now(),

  constraint project_chain_snapshots_contract_format check (contract_address ~ '^0x[0-9a-f]{40}$'),
  constraint project_chain_snapshots_asset_format check (asset ~ '^0x[0-9a-f]{40}$'),
  constraint project_chain_snapshots_decimals_range check (asset_decimals between 0 and 255),
  constraint project_chain_snapshots_amounts_nonnegative check (
    available >= 0 and escrowed >= 0 and committed >= 0
    and total_deposited >= 0 and total_paid >= 0 and total_withdrawn >= 0
  ),
  -- The contract's own invariant; a read that violates it is not stored.
  constraint project_chain_snapshots_books_balance check (
    total_deposited = available + escrowed + committed + total_paid + total_withdrawn
  )
);

-- Never replace a snapshot with one read at an older block (e.g. a lagging RPC node).
create or replace function public.guard_chain_snapshot_order()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.block_number < old.block_number then
    return null;
  end if;
  return new;
end;
$$;

create trigger project_chain_snapshots_guard_order
  before update on public.project_chain_snapshots
  for each row execute function public.guard_chain_snapshot_order();

alter table public.project_chain_snapshots enable row level security;

create policy "Chain snapshots of published projects are publicly readable"
  on public.project_chain_snapshots for select
  to anon, authenticated
  using (public.is_project_published(project_id));

create policy "Owners can read their chain snapshots"
  on public.project_chain_snapshots for select
  to authenticated
  using (public.is_project_owner(project_id));

revoke insert, update, delete on public.project_chain_snapshots from anon, authenticated;
