# Contribo

**Build together, get recognized, and share in the success of what you help build.**

Contribo is a contributor rewards platform for the Monad developer ecosystem. Founders building open-source projects register them on Contribo, publish their GitHub repositories, and commit to a reward policy *before* anyone starts contributing. Developers find promising projects, contribute through ordinary pull requests, build a verified contribution history, and qualify for rewards when their work is accepted.

Planned capabilities:

- Project discovery and founder dashboards
- GitHub account linking and pull-request verification
- Contributor profiles, histories and badges
- Published reward policies and funded bounty pools
- Funding-triggered contributor reward pools
- Monad smart contracts for transparent commitments and reward distribution

> **Status: Phase 3 (backend and frontend workflows).** This repository has the application foundation (Phase 1), the onchain reward contract (Phase 2), and the GitHub verification and founder/contributor workflows that connect them (Phase 3). The contract is **not deployed yet**: until `NEXT_PUBLIC_CONTRIBO_REWARDS_ADDRESS` is set, onchain features show a "not configured" state and offer no transactions.

---

## Tech stack

| Area | Choice |
| --- | --- |
| Framework | [Next.js 16](https://nextjs.org) (App Router, Turbopack, Cache Components), React 19 |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v4 with design tokens from [design/style-reference.md](design/style-reference.md): warm, matte, light theme |
| Auth and database | [Supabase](https://supabase.com): Auth with GitHub OAuth, PostgreSQL with Row Level Security |
| Wallet | [RainbowKit](https://rainbowkit.com) 2 on [wagmi](https://wagmi.sh) v2 + [viem](https://viem.sh): connect modal with detected browser wallets and download links; Monad chain definitions from viem |
| Fonts | Manrope (400, 500, 700) for everything, via `next/font` |
| Smart contracts | Solidity 0.8.30, [Foundry](https://getfoundry.sh) ≥ 1.8 with Monad network rules, OpenZeppelin Contracts 5.7 |

Dependencies are deliberately few: `@supabase/ssr`, `@supabase/supabase-js`, `@rainbow-me/rainbowkit`, `wagmi`, `viem`, `@tanstack/react-query` (required by wagmi), `server-only` and `tailwind-merge` (resolves class overrides in UI components). Tests use [Vitest](https://vitest.dev) (dev only).

## Getting started

Requirements: Node.js 20.9 or later (developed on Node 24) and npm.

```bash
npm install
cp .env.example .env.local   # optional; the app runs without credentials
npm run dev
```

Open http://localhost:3000.

Without credentials the app still runs. The landing page renders, wallet connection works against the public Monad testnet RPC, and the sign-in page explains that authentication still needs to be configured.

### Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build (also type-checks) |
| `npm run start` | Serve the production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (Next.js core-web-vitals + TypeScript rules) |
| `npm test` | Vitest unit tests for verification, authorization, policy matching and transaction states |
| `npm run contracts:abi` | Regenerate `src/lib/contracts/abi.ts` from `contracts/out` (run `forge build` first) |

## Environment variables

All variables are listed in [.env.example](.env.example) with placeholder values only. Put real values in `.env.local`, which git ignores.

| Variable | Scope | Required | Description |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | public | no | Base URL for metadata. Defaults to `http://localhost:3000`. |
| `NEXT_PUBLIC_SUPABASE_URL` | public | for auth/data | Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | public | for auth/data | Supabase publishable key (`sb_publishable_…`) or legacy anon key. RLS protects all data. |
| `SUPABASE_SECRET_KEY` | **server only** | for verification workflows | Secret / service-role key. Bypasses RLS, so it is used only in server code, after that code has authorized the caller. Needed for repository and PR verification, policy publishing, wallet linking and onchain reconciliation. |
| `GITHUB_TOKEN` | **server only** | no (recommended) | GitHub token for reading public repositories and pull requests. Without it, GitHub allows 60 requests/hour per IP. A fine-grained token with no extra permissions is enough. |
| `SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID` | Supabase CLI | local Supabase only | GitHub OAuth App client ID. |
| `SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET` | Supabase CLI | local Supabase only | GitHub OAuth App client secret. |
| `NEXT_PUBLIC_MONAD_NETWORK` | public | no | `testnet` (default, chain 10143) or `mainnet` (chain 143). |
| `NEXT_PUBLIC_MONAD_RPC_URL` | public | no | Dedicated RPC endpoint. Defaults to the public Monad RPC. |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | public | no | WalletConnect / Reown project ID. Enables phone wallets via QR code in the connect modal. |
| `NEXT_PUBLIC_CONTRIBO_REWARDS_ADDRESS` | public | for onchain features | Deployed `ContriboRewards` address on the selected network. Leave empty until deployment. |

`NEXT_PUBLIC_*` values are inlined into the browser bundle at build time, so restart the dev server or rebuild after changing them.

## Database setup

Migrations live in [supabase/migrations/](supabase/migrations/). Apply them in order:

1. [20261010000000_initial_schema.sql](supabase/migrations/20261010000000_initial_schema.sql): the core schema and Row Level Security (Phase 1).
2. [20261011000000_github_and_onchain_integration.sql](supabase/migrations/20261011000000_github_and_onchain_integration.sql) (Phase 3), which adds:
   - wallet verification
   - repository verification
   - server-published policy hashes
   - onchain project, approver and reward state
3. [20261012000000_profile_socials_and_skills.sql](supabase/migrations/20261012000000_profile_socials_and_skills.sql): profile social links and skills.
4. [20261013000000_onboarding.sql](supabase/migrations/20261013000000_onboarding.sql): primary role and onboarding.
5. [20261014000000_guided_project_setup.sql](supabase/migrations/20261014000000_guided_project_setup.sql): guided project setup, which adds:
   - `projects.setup_plan` for resuming an unfinished setup
   - server-only project status changes (a project goes live only once it is registered and funded onchain)
   - `bounty_details` for bounty titles

### Hosted Supabase project

1. Create a project at [supabase.com](https://supabase.com/dashboard).
2. Apply the migrations in one of two ways:
   - **SQL editor:** paste each migration file in order and run it.
   - **Supabase CLI:** `npx supabase link --project-ref <ref>` then `npx supabase db push`.
3. Copy the project URL and publishable key into `.env.local`, and the secret key into `SUPABASE_SECRET_KEY`. The secret key is server-only.

### GitHub sign-in

1. Create a GitHub OAuth App (GitHub → Settings → Developer settings → OAuth Apps):
   - Homepage URL: `http://localhost:3000`
   - Authorization callback URL: `https://<project-ref>.supabase.co/auth/v1/callback`
2. In Supabase → Authentication → Sign In / Providers, enable **GitHub** and paste the client ID and secret.
3. In Supabase → Authentication → URL Configuration, set the Site URL and add `http://localhost:3000/auth/callback` (plus your production URL) to the redirect allow-list.

On first sign-in, database triggers create the user's `profiles` row and record the linked GitHub account in `github_identities`.

### Local Supabase (optional)

You need Docker for this.

```bash
npx supabase init     # creates supabase/config.toml; keeps the existing migrations folder
npx supabase start    # starts Postgres, Auth and Studio, then applies the migrations
```

To use GitHub sign-in locally, set `[auth.external.github] enabled = true` in `supabase/config.toml` and put the two `SUPABASE_AUTH_EXTERNAL_GITHUB_*` values in `supabase/.env`. The OAuth App callback is then `http://127.0.0.1:54321/auth/v1/callback`. Use the API URL and publishable key printed by `supabase start` in `.env.local`.

### Schema overview

| Table | Purpose |
| --- | --- |
| `profiles` | One row per auth user: username, display name, avatar, bio, and a payout wallet that is **verified by signature**. |
| `github_identities` | Linked GitHub account (numeric user ID and login), synced from `auth.identities` by trigger. |
| `projects` | Founder-owned projects with a `draft → published → archived` lifecycle and a unique slug. |
| `project_repositories` | GitHub repositories under a project. Verification is checked against the GitHub API. A repository can be *verified* by only one project. |
| `reward_policies` | Versioned reward terms: model (`bounty` or `funding_share`; `hybrid` is kept only for older projects), contributor pool in basis points, reward asset. |
| `contributions` | Pull-request evidence tied to a project, repository, GitHub author and the reward policy in force when the PR was merged. Also stores the accepted reward and the reconciled onchain approval and claim state. |
| `project_approvers` | Approver wallets, recorded only after `isApprover` is confirmed onchain. |

Integrity rules in the database:

- **Published reward policies are immutable.** A trigger allows only `draft → published → retired`. To change terms, retire the policy and publish a new version. Each project has at most one published policy at a time.
- **Contributions record the policy in force at merge time.** The server stores the policy that was published when the PR was merged. PRs merged before any policy was published are not eligible.
- **No duplicates.** A pull request is unique per repository and per GitHub repository ID. An onchain contribution reference is unique per project.
- Composite foreign keys ensure a contribution's repository and policy belong to the same project.

### Access control (Row Level Security)

RLS is enabled on every table. Column-level grants stop clients from writing system-managed fields.

| Table | Anyone (anon) | Signed-in user | Server (secret key) |
| --- | --- | --- | --- |
| `profiles` | read | update own profile fields; **not** `wallet_address` (server sets it after a signature check) | full |
| `github_identities` | read | read | full (written by auth trigger) |
| `projects` | read published | create; read, update and delete own (delete only while draft); cannot change owner | full |
| `project_repositories` | read for published projects | owner adds and removes; verification fields (`verified_at`, `github_repo_id`) are server-only | full (after GitHub API checks) |
| `reward_policies` | read published/retired policies of published projects | owner creates and edits drafts; publishing and retiring go through the server, which computes `policy_hash` | full |
| `contributions` | read verified/accepted on published projects | read own; owners read their project's contributions | full (verified inserts, acceptance, onchain reconciliation) |
| `project_approvers` | read for published projects | owners read | full (after onchain check) |

Both migrations were tested against PostgreSQL 14, with stand-ins for Supabase's `auth` schema and API roles. The tests covered:

- profile and identity sync, and ownership checks
- policy immutability, and that clients cannot publish policies or set hashes
- claim restrictions and anonymous visibility
- that clients cannot set wallet addresses, write verification fields, or write approver or onchain columns
- repository squatting
- duplicate PRs

### Regenerating types

[src/types/database.ts](src/types/database.ts) is hand-written to match the migrations. Its `Insert`/`Update` types describe what the server may write; grants and RLS enforce what clients may write. Once a project is linked, you can regenerate it with:

```bash
npx supabase gen types typescript --linked > src/types/database.ts
```

## Monad integration

- **Approach:** RainbowKit 2 on wagmi v2 + viem. RainbowKit does not support wagmi v3 yet, so wagmi stays on v2 (2.19). Viem ships maintained definitions for Monad Testnet (chain ID `10143`, RPC `https://testnet-rpc.monad.xyz`, native token MON) and Monad Mainnet (chain ID `143`, RPC `https://rpc.monad.xyz`). The app uses those definitions directly and lets you override the RPC URL.
- **Wallets.** "Connect wallet" opens the RainbowKit modal, themed to the design system. The wallet list is in [src/lib/wallet/config.ts](src/lib/wallet/config.ts).
  - Wallets installed in the browser are detected automatically (EIP-6963) and listed first.
  - Recommended wallets that are not installed link to their download page.
  - A wrong network shows a "switch to Monad" prompt.
- **Phone wallets (optional).** Set `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` (free at [cloud.reown.com](https://cloud.reown.com)) to enable phone wallets via QR code (WalletConnect), plus WalletConnect, Trust and OKX. Without it, only browser wallets are offered (MetaMask, Rabby, Phantom, Backpack, Brave, and others detected in the browser), and no listed wallet depends on WalletConnect.
- **Build note.** RainbowKit's Base Account connector pulls in `@coinbase/cdp-sdk`, whose optional `@x402/*` payment packages are not installed. [next.config.ts](next.config.ts) aliases them to a stub ([src/lib/stubs/x402-unavailable.ts](src/lib/stubs/x402-unavailable.ts)). Contribo never uses x402.
- **Default network:** testnet.
- The wallet button connects, switches to Monad and disconnects. Payout wallets are linked from the dashboard by signing a message (see below).

Monad references: [developer docs](https://docs.monad.xyz/) · [developer portal](https://developers.monad.xyz/) · [hackathon resources](https://hackathon.monad.xyz/resources)

## Application workflows

### Pages

| Route | Who | Purpose |
| --- | --- | --- |
| `/projects` | Everyone | Browse published projects and their reward terms |
| `/projects/[slug]` | Everyone | Published policy, verified repositories, live onchain balances and bounties. Signed-in contributors see their merged PRs detected on GitHub and can submit them. |
| `/dashboard` | Contributors | Linked GitHub identity, payout wallet linking, and every contribution by stage, with claims |
| `/founder` | Founders | Your projects, and creating a project |
| `/founder/[id]` | Project owner, or an onchain approver | The owner manages details, repositories, reward policies, onchain registration, funding, bounties and approvers. The owner and approvers review contributions. |

### Contribution stages

| Stage | Meaning | Source of truth |
| --- | --- | --- |
| Detected | Merged PR by you in a verified repository, found via GitHub search; not stored | GitHub |
| Verified | Server checked the PR on GitHub: base repository ID, author's numeric GitHub ID, merged | Supabase |
| Accepted | An owner or approver chose a reward (pool amount or an open bounty) for the contributor's verified wallet | Supabase |
| Approved onchain | `approveContribution` / `awardBounty` confirmed; funds reserved for the contributor | Contract |
| Claimable | Approved onchain, and the connected wallet is the contributor wallet | Contract + wallet |
| Paid | `claim` confirmed | Contract |
| Rejected | Not eligible for a reward | Supabase |

A verified PR is **evidence, not authorization**. Nothing is paid until a human approver accepts it and an approval transaction confirms onchain.

### GitHub integration

- **Identity.** Sign-in uses Supabase Auth's GitHub OAuth. The linked account comes from Supabase Auth, never from the client. It is stored by numeric ID in `github_identities` (by trigger, with a server-side re-sync for accounts created before the trigger existed). Every check matches on numeric IDs, so renamed users and repositories cannot be confused.
- **Repository ownership.** Checked server-side with `GET /repos/{owner}/{repo}`. A repository counts as verified when either:
  - it is owned by the founder's own linked GitHub user, or
  - its default branch contains `.github/contribo-verification.txt` with the project's token. This proves write access and covers organization repositories.

  Private repositories are not supported. User OAuth tokens are never stored.
- **Pull-request verification.** Checked server-side with `GET /repos/{owner}/{repo}/pulls/{n}`. The PR must:
  - target the verified repository (matched by repository ID)
  - be authored by the caller's own linked GitHub ID, so nobody can claim someone else's PR
  - be merged
  - have been merged while a reward policy was published
- **Not a proxy.** The server calls a fixed set of GitHub endpoints with validated parameters. `GITHUB_TOKEN` never leaves the server.

### Wallets

Contributors and founders link a payout wallet by signing a message. No transaction is sent. The message binds the wallet to one Contribo user ID and chain, and expires after 10 minutes. The server checks it with viem's `verifyMessage`, which supports both regular wallets and smart-contract wallets. `profiles.wallet_address` is no longer writable by clients.

### Contract integration

- The ABI in [src/lib/contracts/abi.ts](src/lib/contracts/abi.ts) is **generated** from the Foundry build of `ContriboRewards`, so the app calls the contract's actual functions and never re-implements its logic.
- The address comes from `NEXT_PUBLIC_CONTRIBO_REWARDS_ADDRESS` on the network chosen by `NEXT_PUBLIC_MONAD_NETWORK`. No deployment address is hard-coded. With no address configured, every onchain section shows a "not configured" notice instead of simulating anything.
- **Writes:**
  - Registration: `registerProject`, `setPolicyHash`, `setApprover`.
  - Funding and bounties: `deposit` (ERC-20 deposits run `approve` first) and `createBounty`.
  - Rewards: `approveContribution` / `awardBounty` and `claim`.
  - Every write is simulated first, so reverts are decoded into readable messages.
- **Reads:** `getProject`, `getBalances`, `getBounty`, `getContribution`, `isApprover`, `bountyCount`.
- **Transaction states.** Each transaction moves through *preparing → confirm in wallet → submitted/pending → confirmed* or *failed*. A transaction is shown as successful **only after a receipt with status `success`**. These cases are handled explicitly:
  - wallet rejection
  - wrong network (the app asks the wallet to switch)
  - insufficient balance (checked before depositing)
  - contract reverts (custom errors mapped to messages)
  - reverted receipts
- **Reconciliation.** After a confirmed transaction, the server re-reads the chain and only then updates Supabase:
  - The project registration is linked only if `ProjectRegistered` came from our contract, its `metadataURI` is `contribo:project:<id>`, and its owner is the founder's verified wallet.
  - Approvals and claims are synced from `getContribution`. A mismatch with the accepted wallet or amount is reported and not saved.
  - A client-supplied transaction hash is stored only if that transaction emitted the matching event.
- **Pre-approval checks** (server, in `prepareApproval`) before an approver signs:
  - the project is registered onchain
  - the onchain `policyHash` equals the published policy's hash
  - the policy's reward asset equals the onchain asset
  - the PR has a policy in force
  - the contribution is accepted and not yet approved onchain
  - the pool has enough available funds, or the bounty is open, belongs to the project and has the same amount

### Trust model and limitations

- **GitHub verification is not trustless.** The contract cannot see GitHub. Users rely on the Contribo backend to check evidence, and on the project's owner and approvers, who sign approvals from their own wallets. An approver wallet can approve any address directly onchain, bypassing the app. Onchain events (`ContributionApproved` carries the policy hash and approver) make that auditable but do not prevent it.
- **Approvals are signed by people, not by the backend.** There is no server-held approver key in this phase.
- **Repository verification is a point-in-time check.** Losing access to a repository later does not unverify it automatically.
- **Detection uses GitHub search**, which is rate-limited and may lag. You can always submit a PR URL directly.
- **Owners must keep the onchain policy hash in sync.** After publishing a new policy version, the owner updates it onchain; approvals are blocked until the hashes match.
- **Bounty listing is limited.** Bounties are found by scanning the 200 most recent bounty IDs. A Phase 4 indexer would replace this.
- **Owner withdrawals have no UI yet.** They are available in the contract (`withdraw`).
- **Nothing here has run against a live deployment.** Onchain flows are type-checked against the real ABI and unit-tested at the state level, but need a deployed contract to verify end to end.

### Tests

```bash
npm test             # Vitest (app)
npm run typecheck && npm run lint && npm run build
cd contracts && forge test   # contract suite (unchanged from Phase 2)
```

The app tests in [tests/](tests/) cover:

- GitHub identity ownership: only the author's numeric ID counts, and nobody can claim another user's PR
- repository ownership: owner match, the verification file, a token from another project, organization ID collisions, private repositories
- PR verification: wrong base repository, unmerged, deleted author
- choosing the reward policy in force at merge time
- policy hashing
- wallet-link message binding, expiry and tampering, with real signatures
- authorization of owners, approvers and outsiders
- approval planning: policy hash, asset and duplicates
- onchain reconciliation
- the transaction state machine and error mapping
- the GitHub client's URL restrictions

## Smart contracts

The onchain layer lives in [contracts/](contracts/), a self-contained Foundry project. It is a single contract, [ContriboRewards](contracts/src/ContriboRewards.sol), that combines the project registry, the reward vault and contribution rewards. One contract means one set of balance books and no cross-contract trust calls. Types, events and errors are defined in [IContriboRewards](contracts/src/interfaces/IContriboRewards.sol).

### How it works

1. **Register:** a founder calls `registerProject(asset, metadataURI, policyHash)`.
   - `asset` is `address(0)` for native MON or an ERC-20 token, and is fixed at registration.
   - `policyHash` anchors the Supabase reward policy that is in force.
2. **Fund:** `deposit` adds to the project's *available* pool. Anyone may fund a project, but deposited funds stay under the owner's control until they are allocated.
3. **Allocate.** Funds can be allocated in two ways:
   - **Pool rewards:** an approver calls `approveContribution(projectId, ref, contributor, amount)`. This moves `amount` from available to *committed*.
   - **Fixed bounties:** the owner calls `createBounty(projectId, amount, deadline)`, which moves funds from available to *escrowed*. An approver later calls `awardBounty(bountyId, ref, contributor)`, which moves the escrow to committed.
4. **Claim:** the contributor calls `claim(projectId, ref, to)` and receives the reward at any address they choose.
5. **Refund:** the owner calls `withdraw(projectId, amount, to)`, which can only draw on *available* funds. An unawarded bounty can be cancelled with `cancelBounty` only after its deadline. Cancelling returns its escrow to available.

Every project keeps exact accounting, checked by the invariant tests:

```
totalDeposited == available + escrowed + committed + totalPaid + totalWithdrawn
```

The contract cannot see offchain funding or revenue. It only distributes funds that were actually deposited onchain, under the rules above. Funding-triggered pools work by the founder depositing into the project's pool when funding arrives.

`ref` is a `bytes32` contribution reference that is unique within the project. The backend is expected to derive it from GitHub data, for example `keccak256("github:<repoId>:<prNumber>")`.

### Access control

| Action | Who |
| --- | --- |
| `registerProject` | Anyone (caller becomes owner) |
| `setMetadataURI`, `setPolicyHash`, `setApprover`, `transferProjectOwnership` | Project owner |
| `acceptProjectOwnership` | Pending owner (two-step). **Clears all approvers** set by the previous owner. |
| `deposit` | Anyone |
| `createBounty`, `cancelBounty` (after deadline), `withdraw` (available funds only) | Project owner |
| `approveContribution`, `awardBounty` | Project owner or an approver designated by the owner (e.g. the Contribo verification backend) |
| `claim` | The contributor recorded on the approval |
| `pause`, `unpause` | Platform admin (`Ownable2Step`) |

The platform admin **cannot move funds**. Pausing only blocks new registrations, deposits, bounties and approvals. Claims, withdrawals of available funds and bounty cancellations always work, so earned rewards can never be frozen.

### Security decisions

- **Committed funds are untouchable.** An approved reward is owed to the contributor. No role can withdraw, revoke or redirect it, and only the contributor can claim it.
- **No double approvals or payouts.**
  - Each `(projectId, ref)` can be recorded once, ever, including after it has been claimed.
  - A claim flips the status to `Claimed` before transferring.
  - Bounties can be awarded once, and cancelled bounties cannot be awarded.
- **No over-allocation.** Approvals, bounties and withdrawals are bounded by the project's own `available` balance. Projects that share a token cannot spend each other's funds.
- **Per-project references.** References are scoped per project, so another project cannot "squat" a reference to block legitimate approvals.
- **No self-awards.** The project owner cannot be recorded as a contributor, which blocks the obvious way around the bounty escrow rules.
- **Transfers.**
  - Checks-effects-interactions on every function that transfers funds, plus OpenZeppelin `ReentrancyGuardTransient` (EIP-1153 transient storage, supported on Monad).
  - ERC-20 transfers go through `SafeERC20`. Native MON is sent with `call`, and failures revert.
  - Contributors whose wallet rejects funds can claim to another address.
- **Asset handling.**
  - ERC-20 deposits are checked against the change in the vault's balance, so fee-on-transfer tokens are rejected.
  - Rebasing tokens are not supported.
  - The vault has no `receive` function, so stray native transfers revert instead of getting stuck.
- **Validation.** Zero addresses, zero amounts, unknown projects and bounties, deadlines in the past, and `msg.value` mismatches all revert with custom errors. Every state change emits an event.

### Known limitations and trust assumptions

- **Approvers are trusted for their project.** An approver, or a compromised approver key, can commit the project's *available* and escrowed funds to any address. Owners should keep approver sets minimal and fund projects incrementally. The backend approver key should live in a KMS or HSM.
- **Available funds are not a promise.** Until funds are escrowed in a bounty or approved, the owner can withdraw them. A sock-puppet approver could also award an open bounty to an alternate wallet. The contract guarantees approved rewards and bounty escrow against the owner's own withdrawal; it does not guarantee founder honesty, which stays visible onchain.
- **Approvals are final.** Rewards sent to a wrong wallet cannot be revoked. The app only accepts rewards to wallets verified by a signed message (Phase 3).
- **Asset choice is unrestricted.** Projects may use any ERC-20. Only the project that chose a malicious or non-standard token is affected, because accounting is per project.
- **Not audited.** Get an independent audit before mainnet use.

### Monad specifics

Verified against the [Monad docs](https://docs.monad.xyz/):

- **Tooling.** Foundry ≥ 1.8 with `network = "monad"` in `foundry.toml`. Tests and scripts then use Monad's gas pricing, hardforks, precompiles and the **128 KB** contract size limit (`ContriboRewards` is about 9.2 KB). All opcodes up to the Fusaka fork are supported.
- **Gas.** Monad charges the transaction **gas limit**, not the gas actually used, so frontends should set a tight gas limit.
- **Networks.**
  - Testnet: chain ID `10143`, RPC `https://testnet-rpc.monad.xyz`, faucet `https://faucet.monad.xyz`.
  - Mainnet: chain ID `143`, RPC `https://rpc.monad.xyz`.
  - Both are configured as `rpc_endpoints` in [contracts/foundry.toml](contracts/foundry.toml).

### Setup and commands

You need [Foundry](https://getfoundry.sh) ≥ 1.8.0: `curl -L https://foundry.paradigm.xyz | bash && foundryup`.

```bash
git submodule update --init --recursive   # forge-std v1.17.0, OpenZeppelin v5.7.0
cd contracts
forge build                 # compile
forge build --sizes         # check bytecode size against Monad's limit
forge test                  # unit + fuzz (1,000 runs) + invariant (256 x 100 calls) tests
forge test -vvv --match-test test_BountyAwardAndClaim   # run a single test with traces
FOUNDRY_PROFILE=ci forge test                           # heavier fuzzing: 10,000 runs; 1,000 x 200 invariant calls
forge fmt --check           # formatting
forge lint                  # static lint
```

| Test file | What it covers |
| --- | --- |
| [ContriboRewards.t.sol](contracts/test/ContriboRewards.t.sol) | Unit tests: normal flows (native and ERC-20), unauthorized access, duplicate references, double claims, insufficient funds, invalid allocations, refunds and cancellations, pause behavior, ownership transfer, reentrancy (native and token callbacks), rejecting recipients |
| [ContriboRewards.fuzz.t.sol](contracts/test/ContriboRewards.fuzz.t.sol) | Fuzz tests: end-to-end amounts, over-allocation, withdrawal bounds, caller authorization, reference uniqueness, bounty deadlines |
| [invariant/](contracts/test/invariant/) | Stateful invariants: per-project conservation, exact vault solvency, escrow and commitments match records, paid equals received, no unexpected success for attacks or double claims |

### Deployment (not yet performed)

[DeployContriboRewards.s.sol](contracts/script/DeployContriboRewards.s.sol) deploys the contract with `CONTRIBO_ADMIN` as the platform admin. Without `--broadcast` it only simulates locally. Broadcasting to Monad testnet is planned for a later phase. The script's header comment has the commands.

## Project structure

```
src/
  app/                    Routes (App Router)
    auth/callback/        OAuth code exchange
    auth/sign-out/        Sign-out (POST)
    login/                GitHub sign-in page
    layout.tsx            Root layout, fonts, providers, header/footer
    providers.tsx         wagmi, React Query and RainbowKit providers (themed)
    globals.css           Design tokens (light/dark) and base styles
  assets/brand/           Contribo logo (original PNG and transparent derivatives)
  components/
    ui/                   Button, Badge, Card, Container
    layout/               Site header and footer
    brand/                Logo
    auth/                 Session-aware header account area
    wallet/               Connect-wallet button
  lib/
    env.ts                Typed public environment configuration
    supabase/             Browser, server and proxy Supabase clients
    monad/chains.ts       Active Monad chain selection
    wallet/config.ts      wagmi + RainbowKit wallet list
  proxy.ts                Refreshes the Supabase session on each request (Next 16 "proxy", formerly middleware)
  types/database.ts       Database types for supabase-js
  app/projects/           Project discovery and detail (contributor submissions)
  app/dashboard/          Contributor dashboard (wallet link, rewards, claims)
  app/founder/            Founder console (projects, repos, policies, onchain, review)
  app/contributions/      Server actions: PR submission, wallet link, onchain sync
  lib/github/             Pure GitHub verification rules
  lib/server/             Server-only modules: GitHub client, chain reads, admin client, viewer/auth
  lib/contracts/          Generated ABI, contract config, transaction state machine
  lib/rules.ts            Pure authorization and approval rules
supabase/migrations/      SQL migrations
tests/                    Vitest unit tests (app)
scripts/                  ABI generator
contracts/                Foundry project (Solidity)
  src/                    ContriboRewards and its interface
  test/                   Unit, fuzz and invariant tests (+ mocks)
  script/                 Deployment script (not yet run)
  lib/                    forge-std and OpenZeppelin (git submodules)
```

### Notes for contributors

- `cacheComponents` is enabled. Any component that reads cookies or the session must render inside `<Suspense>`, as `AuthStatus` in the header does.
- Next.js 16 renamed `middleware.ts` to `proxy.ts`.
- `AGENTS.md` is maintained by `next dev` and points coding agents at the version-matched docs in `node_modules/next/dist/docs/`.
- **Design.** The approved mockups are in [design/screens/](design/screens/) and the design system is in [design/style-reference.md](design/style-reference.md). Tokens live in `src/app/globals.css`:
  - Palette utilities: `bg-sky`, `bg-terracotta`, `bg-lavender`, `bg-plum`, `bg-cream`, `bg-mist`, `bg-fog`, `text-deep-teal`, …
  - Type scale: `text-display`, `text-heading`, `text-heading-sm`, `text-eyebrow`, …
  - Radii: `rounded-control` 8px, `rounded-badge` 16px, `rounded-card` 24px, `rounded-feature` 56px.
  - **Color meaning:** Sky = projects and repositories, Terracotta = bounties, Lavender = pools, rewards and claims, Plum = onchain.
  - **No shadows or gradients.**
