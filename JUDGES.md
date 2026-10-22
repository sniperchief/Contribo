# Contribo: guide for judges

Thanks for reviewing Contribo. This page shows you how to:

1. [Check the evidence](#1-check-the-evidence-5-minutes) (5 minutes, nothing to install)
2. [Try the app yourself](#2-try-it-yourself-20-30-minutes) (20–30 minutes)
3. [Check our completed project from start to payout](#3-a-completed-project-from-start-to-payout)

**Live app:** https://trycontribo.vercel.app
**Source code:** https://github.com/sniperchief/Contribo
**Network:** Monad Testnet (chain ID `10143`)

---

## 1. Check the evidence (5 minutes)

No account or wallet needed.

### The deployed contract

| | |
| --- | --- |
| Contract (`ContriboRewards`) | [`0xf2080fC3CDBeFa5577b5c185794dBfAB348DD5D3`](https://testnet.monadvision.com/address/0xf2080fC3CDBeFa5577b5c185794dBfAB348DD5D3) |
| Deployment transaction | [`0x61d56882…e7f96e67`](https://testnet.monadvision.com/tx/0x61d568826e866fb47ea6b89cfe3d05e25acca9a35d00e49bd1173185e7f96e67) (block 69,808,471) |
| Source code verified | [Sourcify check](https://sourcify-api-monad.blockvision.org/check-by-addresses?addresses=0xf2080fC3CDBeFa5577b5c185794dBfAB348DD5D3&chainIds=10143). It should say `"status": "perfect"`, meaning the deployed code exactly matches [contracts/src/ContriboRewards.sol](contracts/src/ContriboRewards.sol) |
| Also on | [Monad Explorer](https://testnet.monadexplorer.com/address/0xf2080fC3CDBeFa5577b5c185794dBfAB348DD5D3) |

### Steps

1. Open [Explore](https://trycontribo.vercel.app/projects). Every project listed is **Live**: its reward funds were locked in the contract before it appeared.
2. Open [**Deycid**](https://trycontribo.vercel.app/projects/deycid), our fully completed demo project. Its page reads balances straight from the contract and shows **3 MON paid out**.
3. Click through the [five transactions below](#3-a-completed-project-from-start-to-payout), which trace the money from the founder's deposit to the contributor's wallet.

---

## 2. Try it yourself (20–30 minutes)

Contribo connects two people: a **founder** who funds rewards and a **contributor** who earns them. Founders can't reward themselves, so you'll play both roles with two separate identities.

### What you need

| | Founder | Contributor |
| --- | --- | --- |
| GitHub account | Account 1 | Account 2 (a free second account) |
| Wallet | Wallet A (e.g. MetaMask, Rabby, Phantom) | Wallet B |
| Browser | Browser profile 1 | Browser profile 2 (or another browser) |

- **Test funds:** get free testnet MON for both wallets from the [Monad faucet](https://faucet.monad.xyz). Wallet A needs a little more than your bounty amount; wallet B only needs enough for one transaction fee.
- **A test repository:** with GitHub account 1, create a small **public** repository with a README, e.g. `contribo-test`.

**Tip:** use two separate browser profiles, each with its own wallet extension, so the founder's and contributor's wallets never get mixed up.

### Part A: create and fund a project (founder, browser profile 1)

1. Go to https://trycontribo.vercel.app and click **Get started → Continue with GitHub**. Sign in with **GitHub account 1**.
2. On the welcome screen, choose **Founder** and link **wallet A** (you sign a free message; no transaction is sent).
3. Open **Manage → + Create a project**.
4. **Step 1, Repository:** start typing `contribo-test` and pick it. It shows **✓ Verified** because it's yours. Edit the name or tagline if you like, then click **Continue**.
5. **Step 2, Rewards:** choose **Bounties**, add one bounty (e.g. *"Improve the README"*, `1` MON, 7 days), then click **Continue**.
6. **Step 3, Launch:** review the summary and click **Launch project**. Approve the 3 wallet requests (register, deposit, create bounty) and watch the checklist tick off.
7. You'll see **"… is live"**. Open **Explore**: your project is listed as **Live**, with its open bounty.

### Part B: contribute (contributor, browser profile 2)

8. Sign in to Contribo with **GitHub account 2**, choose **Contributor** and link **wallet B**.
9. On GitHub (account 2), open the founder's repository and click **Fork**.
10. In your fork, edit the README and commit the change.
11. On your fork's page, click **Contribute → Open pull request**. Check that the top bar reads **base repository: `<account-1>/contribo-test`** ← **head repository: `<account-2>/contribo-test`**. Then click **Create pull request**.

### Part C: merge and approve (founder, browser profile 1)

12. On GitHub (account 1), open the pull request in `contribo-test` and click **Merge pull request**.

### Part D: submit (contributor, browser profile 2)

13. On Contribo, open the project's page. Your merged pull request appears automatically; click **Submit**. If it doesn't appear yet, paste its link. Find it at https://github.com/pulls → **Closed**; it starts with `github.com/<account-1>/…`.

### Part E: review and pay (founder, browser profile 1)

14. Open **Manage → your project → Review contributions**. Accept the pull request for the bounty.
15. Click **Approve onchain** and confirm in **wallet A**. The reward is now reserved for the contributor in the contract, and nobody can take it back.

### Part F: claim (contributor, browser profile 2)

16. Open **Contributions** and click **Claim**. Confirm in **wallet B**.
17. Wallet B's balance goes up by the bounty amount. Click the transaction link to see it on the explorer.

You've now done the full loop: **terms published → funds locked → work verified on GitHub → reward approved onchain → contributor paid**.

### If something goes wrong

| Message | Fix |
| --- | --- |
| *"This wallet is not an approver for the project."* | The wrong wallet is connected. Switch your wallet extension to **wallet A**, the one that launched the project. |
| *"That repository is not a verified repository of this project."* | The pull request was opened inside the fork. Open it **into the founder's repository** (step 11). |
| *"…merged before the project published a reward policy…"* | Only pull requests merged **after** the project went live count. Make a new one. |
| Sign-in returns to the home page signed out | Try again in a private window, and allow pop-ups for the site. |

---

## 3. A completed project from start to payout

Our demo project **Deycid** went through every stage on Monad Testnet: a founder funded a 3 MON bounty, and a separate contributor shipped a pull request and was paid 3 MON.

| | |
| --- | --- |
| Project page | https://trycontribo.vercel.app/projects/deycid |
| Onchain project ID | `4` |
| Verified repository | [sniperchief/Deycid](https://github.com/sniperchief/Deycid) |
| Reward type | Bounties, paid in MON |
| Contribution | [Pull request #1, "added dark mode"](https://github.com/sniperchief/Deycid/pull/1) by [@ikenga01](https://github.com/ikenga01) |
| Founder wallet (project owner) | [`0x3fc9c40B042Bc93D45348bfCa60f60D95D4155B3`](https://testnet.monadvision.com/address/0x3fc9c40B042Bc93D45348bfCa60f60D95D4155B3) |
| Contributor wallet | [`0xe95ba811ae6c6e16a9f1b16075966155b5ea088d`](https://testnet.monadvision.com/address/0xe95ba811ae6c6e16a9f1b16075966155b5ea088d) |

### The money trail

| # | Step | Signed by | What happened | Transaction |
| --- | --- | --- | --- | --- |
| 1 | **Register** | Founder | Project #4 created in the contract, with the fingerprint of its published reward terms | [`0x7ca36d90…658cbfc0`](https://testnet.monadvision.com/tx/0x7ca36d90509e5d43fbcd12ca144bdf71251a03e57f721fb651e6f7e6658cbfc0) |
| 2 | **Deposit** | Founder | 3 MON locked in the vault | [`0x458a1b59…8ba21c98`](https://testnet.monadvision.com/tx/0x458a1b59afff4d6f653968b9da1d5d63806c8a81af0c89124f31f4b38ba21c98) |
| 3 | **Create bounty** | Founder | Bounty #3 escrowed: 3 MON, set aside for the task | [`0x10528a53…5644f806`](https://testnet.monadvision.com/tx/0x10528a53fa884789d1d513441447956dc1f645273be29e7cd7cfaeb15644f806) |
| 4 | **Award** | Founder | After the pull request was merged and verified, bounty #3 was awarded to the contributor's wallet | [`0x8d68ea83…38e87a5a`](https://testnet.monadvision.com/tx/0x8d68ea83a35e74a24527f62b0eb6529fb70c9c053587c53a4780b64138e87a5a) |
| 5 | **Claim** | Contributor | 3 MON paid to the contributor | [`0x07f1fcb9…aaad27ce`](https://testnet.monadvision.com/tx/0x07f1fcb954efc3769b2e61370008ddae8a6e89ccc1e22c2b22aeca17aaad27ce) |

**Final balances of project #4, read from the contract:** 3 MON deposited, 3 MON paid, 0 MON left, 0 MON withdrawn. Every coin the founder locked reached the contributor.

To check these balances yourself (requires [Foundry](https://getfoundry.sh)):

```bash
cast call 0xf2080fC3CDBeFa5577b5c185794dBfAB348DD5D3 \
  "getBalances(uint256)((uint256,uint256,uint256,uint256,uint256,uint256))" 4 \
  --rpc-url https://testnet-rpc.monad.xyz
# (available, escrowed, committed, totalDeposited, totalPaid, totalWithdrawn)
# → (0, 0, 0, 3000000000000000000, 3000000000000000000, 0)   i.e. 3 MON deposited, 3 MON paid
```

---

## What to look for

- **Money first:** projects appear on Explore only after their funds are locked onchain, and the server checks this itself.
- **Proof, not promises:** only real, merged pull requests by the contributor's own GitHub account count. Renaming accounts can't fool it, and nobody can claim someone else's work.
- **Rewards can't be taken back:** once approved onchain, a reward belongs to the contributor. Not the founder, not the platform admin, nobody can redirect or withdraw it.
- **Everything is checkable:** the contract source is verified, balances are read live from the chain, and every step above has a public transaction.

More detail on the architecture, security model and smart contract is in the [README](README.md).
