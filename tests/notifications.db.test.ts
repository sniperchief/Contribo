import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { asRole, createMigratedDb } from "./support/pg";

/**
 * Runs every Supabase migration in an in-memory Postgres (PGlite) and checks the
 * notification trigger, its idempotency, and the Row Level Security rules, as
 * the API roles Supabase uses (anon, authenticated, service_role).
 */

const FOUNDER = "00000000-0000-4000-8000-0000000000f1";
const CONTRIBUTOR = "00000000-0000-4000-8000-0000000000c1";
const STRANGER = "00000000-0000-4000-8000-0000000000e1";
const PROJECT = "00000000-0000-4000-8000-0000000000a1";
const REPO = "00000000-0000-4000-8000-0000000000b1";

let db: PGlite;

beforeAll(async () => {
  db = await createMigratedDb();
}, 120_000);

beforeEach(async () => {
  await db.exec(`
    truncate public.notifications, public.project_chain_snapshots, public.contributions,
      public.project_repositories, public.projects, public.github_identities, public.profiles cascade;
    delete from auth.users;
  `);
  for (const [id, login] of [
    [FOUNDER, "founder"],
    [CONTRIBUTOR, "contributor"],
    [STRANGER, "stranger"],
  ]) {
    await db.query(`insert into auth.users (id, raw_user_meta_data) values ($1, jsonb_build_object('user_name', $2::text))`, [id, login]);
  }
  await db.query(`insert into public.github_identities (user_id, github_user_id, github_login) values ($1, 2001, 'contributor')`, [CONTRIBUTOR]);
  await db.query(
    `insert into public.projects (id, owner_id, slug, name, status) values ($1, $2, 'demo-project', 'Demo Project', 'published')`,
    [PROJECT, FOUNDER],
  );
  await db.query(
    `insert into public.project_repositories (id, project_id, github_owner, github_name, github_repo_id, verified_at)
     values ($1, $2, 'founder', 'demo', 9001, now())`,
    [REPO, PROJECT],
  );
});

/** What the server's submitPullRequest does: insert a contribution already verified on GitHub. */
async function serverInsertVerified(prNumber = 7, contributorId: string = CONTRIBUTOR): Promise<string> {
  const { rows } = await asRole(db, "service_role", null, () =>
    db.query<{ id: string }>(
      `insert into public.contributions
         (project_id, repository_id, contributor_id, github_user_id, github_login, github_repo_id,
          pr_number, pr_url, pr_title, status, merged_at, verified_at)
       values ($1, $2, $3, 2001, 'contributor', 9001, $4, $5, 'Fix the docs', 'verified', now(), now())
       returning id`,
      [PROJECT, REPO, contributorId, prNumber, `https://github.com/founder/demo/pull/${prNumber}`],
    ),
  );
  return rows[0].id;
}

/** A server-side update of a contribution (service role bypasses RLS, as the admin client does). */
function serverUpdate(id: string, set: string) {
  return asRole(db, "service_role", null, () => db.query(`update public.contributions set ${set} where id = $1`, [id]));
}

async function notificationsFor(userId: string) {
  const { rows } = await db.query<{ type: string; contribution_id: string; project_id: string; message: string; read_at: string | null }>(
    `select type, contribution_id, project_id, message, read_at from public.notifications where recipient_id = $1 order by created_at, type`,
    [userId],
  );
  return rows;
}

const types = async (userId: string) => (await notificationsFor(userId)).map((n) => n.type).sort();

describe("contribution transitions", () => {
  it("a server-verified submission notifies the contributor (verified) and the founder (review)", async () => {
    const id = await serverInsertVerified();
    const contributor = await notificationsFor(CONTRIBUTOR);
    const founder = await notificationsFor(FOUNDER);
    expect(contributor.map((n) => n.type)).toEqual(["contribution_verified"]);
    expect(founder.map((n) => n.type)).toEqual(["contribution_submitted"]);
    expect(founder[0]).toMatchObject({ contribution_id: id, project_id: PROJECT, read_at: null });
    expect(founder[0].message).toContain("@contributor");
    expect(contributor[0].message).toContain("not a reward");
    expect(await types(STRANGER)).toEqual([]);
  });

  it("an unverified claim inserted by a client notifies nobody until the server verifies it", async () => {
    const { rows } = await asRole(db, "authenticated", CONTRIBUTOR, () =>
      db.query<{ id: string }>(
        `insert into public.contributions (project_id, repository_id, contributor_id, github_user_id, github_login, pr_number, pr_url)
         values ($1, $2, $3, 2001, 'contributor', 8, 'https://github.com/founder/demo/pull/8') returning id`,
        [PROJECT, REPO, CONTRIBUTOR],
      ),
    );
    expect(await types(FOUNDER)).toEqual([]);
    expect(await types(CONTRIBUTOR)).toEqual([]);

    await serverUpdate(rows[0].id, `status = 'verified', verified_at = now()`);
    expect(await types(FOUNDER)).toEqual(["contribution_submitted"]);
    expect(await types(CONTRIBUTOR)).toEqual(["contribution_verified"]);
  });

  it("acceptance is not onchain approval, and approval is not payment", async () => {
    const id = await serverInsertVerified();

    await serverUpdate(id, `status = 'accepted', reward_amount = 1000, contributor_wallet = '0x${"1".repeat(40)}', onchain_ref = '0x${"a".repeat(64)}'`);
    expect(await types(CONTRIBUTOR)).toEqual(["contribution_accepted", "contribution_verified"]);
    const accepted = (await notificationsFor(CONTRIBUTOR)).find((n) => n.type === "contribution_accepted")!;
    expect(accepted.message).toContain("not reserved for you until the approval is confirmed onchain");

    await serverUpdate(id, `approved_onchain_at = now()`);
    expect(await types(CONTRIBUTOR)).toEqual(["contribution_accepted", "contribution_verified", "reward_approved"]);

    await serverUpdate(id, `claimed_at = now()`);
    expect(await types(CONTRIBUTOR)).toEqual(["contribution_accepted", "contribution_verified", "reward_approved", "reward_claimed"]);
    // The founder only ever got the review request.
    expect(await types(FOUNDER)).toEqual(["contribution_submitted"]);
  });

  it("rejection notifies the contributor once", async () => {
    const id = await serverInsertVerified();
    await serverUpdate(id, `status = 'rejected'`);
    await serverUpdate(id, `status = 'rejected'`);
    expect(await types(CONTRIBUTOR)).toEqual(["contribution_rejected", "contribution_verified"]);
  });

  it("a claim that never confirmed (claimed_at unset) sends no payment notification", async () => {
    const id = await serverInsertVerified();
    await serverUpdate(id, `status = 'accepted', reward_amount = 5, contributor_wallet = '0x${"1".repeat(40)}', onchain_ref = '0x${"b".repeat(64)}'`);
    await serverUpdate(id, `approved_onchain_at = now()`);
    // A failed claim transaction leaves the row untouched; a later sync with no change is a no-op.
    await serverUpdate(id, `approved_onchain_at = approved_onchain_at`);
    expect(await types(CONTRIBUTOR)).not.toContain("reward_claimed");
  });

  it("a founder submitting to their own project gets no review request", async () => {
    await db.query(`insert into public.github_identities (user_id, github_user_id, github_login) values ($1, 3001, 'founder')`, [FOUNDER]);
    await serverInsertVerified(9, FOUNDER);
    expect(await types(FOUNDER)).toEqual(["contribution_verified"]);
  });

  it("contributions with no Contribo account only notify the founder", async () => {
    await asRole(db, "service_role", null, () =>
      db.query(
        `insert into public.contributions (project_id, repository_id, contributor_id, github_user_id, github_login, pr_number, pr_url, status)
         values ($1, $2, null, 4004, 'ghost', 11, 'https://github.com/founder/demo/pull/11', 'verified')`,
        [PROJECT, REPO],
      ),
    );
    const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from public.notifications`);
    expect(rows[0].n).toBe(1);
    expect(await types(FOUNDER)).toEqual(["contribution_submitted"]);
  });
});

describe("idempotency", () => {
  it("repeated syncs, revised acceptances and retried transitions never duplicate a notification", async () => {
    const id = await serverInsertVerified();
    // Revising an acceptance (accepted → accepted) is not a new event.
    await serverUpdate(id, `status = 'accepted', reward_amount = 1, contributor_wallet = '0x${"1".repeat(40)}', onchain_ref = '0x${"c".repeat(64)}'`);
    await serverUpdate(id, `status = 'accepted', reward_amount = 2`);
    // Reconciliation run on every page load: stored values unchanged.
    await serverUpdate(id, `approved_onchain_at = now()`);
    for (let i = 0; i < 3; i++) await serverUpdate(id, `approval_tx_hash = '0x${"d".repeat(64)}'`);
    // A retried transition that re-fires the trigger for the same event still yields one row.
    await serverUpdate(id, `approved_onchain_at = null`);
    await serverUpdate(id, `approved_onchain_at = now()`);
    await serverUpdate(id, `claimed_at = now()`);
    await serverUpdate(id, `claimed_at = now()`);

    const { rows } = await db.query<{ type: string; n: number }>(
      `select type, count(*)::int as n from public.notifications where recipient_id = $1 group by type`,
      [CONTRIBUTOR],
    );
    expect(rows.every((r) => r.n === 1)).toBe(true);
    expect(rows.map((r) => r.type).sort()).toEqual([
      "contribution_accepted",
      "contribution_verified",
      "reward_approved",
      "reward_claimed",
    ]);
  });

  it("the dedupe key is unique per recipient even when called directly", async () => {
    const id = await serverInsertVerified();
    for (let i = 0; i < 2; i++) {
      await db.query(`select public.create_notification($1, 'reward_claimed', $2, $3, 'Paid', $4)`, [
        CONTRIBUTOR,
        PROJECT,
        id,
        `reward_claimed:${id}`,
      ]);
    }
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from public.notifications where recipient_id = $1 and type = 'reward_claimed'`,
      [CONTRIBUTOR],
    );
    expect(rows[0].n).toBe(1);
  });
});

describe("authorization", () => {
  it("recipients see only their own notifications; anonymous users see none", async () => {
    await serverInsertVerified();
    const own = await asRole(db, "authenticated", CONTRIBUTOR, () => db.query(`select type from public.notifications`));
    const stranger = await asRole(db, "authenticated", STRANGER, () => db.query(`select type from public.notifications`));
    expect(own.rows).toEqual([{ type: "contribution_verified" }]);
    expect(stranger.rows).toEqual([]);
    await expect(asRole(db, "anon", null, () => db.query(`select * from public.notifications`))).rejects.toThrow(/permission denied/);
  });

  it("recipients can mark their own notifications read and nothing else", async () => {
    await serverInsertVerified();
    const marked = await asRole(db, "authenticated", CONTRIBUTOR, () =>
      db.query(`update public.notifications set read_at = now() where read_at is null`),
    );
    expect(marked.affectedRows).toBe(1);

    await expect(
      asRole(db, "authenticated", CONTRIBUTOR, () => db.query(`update public.notifications set message = 'forged'`)),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asRole(db, "authenticated", CONTRIBUTOR, () => db.query(`update public.notifications set recipient_id = $1`, [STRANGER])),
    ).rejects.toThrow(/permission denied/);
  });

  it("users cannot mark someone else's notifications read", async () => {
    await serverInsertVerified();
    const result = await asRole(db, "authenticated", STRANGER, () =>
      db.query(`update public.notifications set read_at = now()`),
    );
    expect(result.affectedRows).toBe(0);
    const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from public.notifications where read_at is not null`);
    expect(rows[0].n).toBe(0);
  });

  it("clients cannot create, delete or forge notifications", async () => {
    const id = await serverInsertVerified();
    await expect(
      asRole(db, "authenticated", CONTRIBUTOR, () =>
        db.query(
          `insert into public.notifications (recipient_id, type, project_id, contribution_id, message, dedupe_key)
           values ($1, 'reward_claimed', $2, $3, 'You were paid', 'x')`,
          [CONTRIBUTOR, PROJECT, id],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asRole(db, "authenticated", CONTRIBUTOR, () =>
        db.query(`select public.create_notification($1, 'reward_claimed', $2, $3, 'Paid', 'y')`, [CONTRIBUTOR, PROJECT, id]),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asRole(db, "authenticated", CONTRIBUTOR, () => db.query(`delete from public.notifications`)),
    ).rejects.toThrow(/permission denied/);
    // Nor can they move a contribution forward to trigger one.
    await expect(
      asRole(db, "authenticated", CONTRIBUTOR, () => db.query(`update public.contributions set claimed_at = now() where id = $1`, [id])),
    ).rejects.toThrow(/permission denied/);
    expect(await types(CONTRIBUTOR)).toEqual(["contribution_verified"]);
  });
});

describe("chain snapshots", () => {
  const snapshot = (block: number, available: number) => `
    insert into public.project_chain_snapshots
      (project_id, chain_id, contract_address, onchain_project_id, asset, asset_symbol, asset_decimals,
       available, escrowed, committed, total_deposited, total_paid, total_withdrawn, block_number, block_timestamp)
    values ('${PROJECT}', 10143, '0x${"f".repeat(40)}', 1, '0x${"0".repeat(40)}', 'MON', 18,
       ${available}, 20, 30, ${available + 20 + 30 + 40 + 0}, 40, 0, ${block}, now())
    on conflict (project_id) do update set
      available = excluded.available, total_deposited = excluded.total_deposited, block_number = excluded.block_number`;

  it("are readable for published projects and writable only by the server", async () => {
    await asRole(db, "service_role", null, () => db.query(snapshot(100, 10)));
    const anon = await asRole(db, "anon", null, () => db.query(`select available from public.project_chain_snapshots`));
    expect(anon.rows).toEqual([{ available: "10" }]);
    await expect(asRole(db, "anon", null, () => db.query(snapshot(101, 99)))).rejects.toThrow(/permission denied/);
    await expect(asRole(db, "authenticated", FOUNDER, () => db.query(snapshot(101, 99)))).rejects.toThrow(/permission denied/);
  });

  it("never go back to an older block", async () => {
    await asRole(db, "service_role", null, () => db.query(snapshot(100, 10)));
    await asRole(db, "service_role", null, () => db.query(snapshot(90, 999)));
    await asRole(db, "service_role", null, () => db.query(snapshot(120, 15)));
    const { rows } = await db.query<{ available: string; block_number: string }>(
      `select available, block_number from public.project_chain_snapshots`,
    );
    expect(rows).toEqual([{ available: "15", block_number: "120" }]);
  });

  it("reject figures that break the contract's accounting identity", async () => {
    await expect(
      asRole(db, "service_role", null, () =>
        db.query(`
          insert into public.project_chain_snapshots
            (project_id, chain_id, contract_address, onchain_project_id, asset, asset_symbol, asset_decimals,
             available, escrowed, committed, total_deposited, total_paid, total_withdrawn, block_number, block_timestamp)
          values ('${PROJECT}', 10143, '0x${"f".repeat(40)}', 1, '0x${"0".repeat(40)}', 'MON', 18, 10, 20, 30, 999, 40, 0, 1, now())`),
      ),
    ).rejects.toThrow(/books_balance/);
  });

  it("of draft projects are hidden from the public", async () => {
    await asRole(db, "service_role", null, () => db.query(snapshot(100, 10)));
    await db.query(`update public.projects set status = 'draft' where id = $1`, [PROJECT]);
    const anon = await asRole(db, "anon", null, () => db.query(`select * from public.project_chain_snapshots`));
    const owner = await asRole(db, "authenticated", FOUNDER, () => db.query(`select * from public.project_chain_snapshots`));
    expect(anon.rows).toHaveLength(0);
    expect(owner.rows).toHaveLength(1);
  });
});
