// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {ContriboRewards} from "../../src/ContriboRewards.sol";
import {IContriboRewards} from "../../src/interfaces/IContriboRewards.sol";
import {MockERC20} from "../mocks/Mocks.sol";
import {Handler} from "./Handler.sol";

contract ContriboRewardsInvariantTest is Test {
    ContriboRewards internal vault;
    MockERC20 internal token;
    Handler internal handler;

    function setUp() public {
        vault = new ContriboRewards(makeAddr("inv-admin"));
        token = new MockERC20();
        handler = new Handler(vault, token);
        targetContract(address(handler));
    }

    /// Every unit deposited is accounted for exactly once.
    function invariant_ConservationPerProject() public view {
        for (uint256 i; i < 2; i++) {
            uint256 id = handler.projectIds(i);
            IContriboRewards.ProjectBalances memory b = vault.getBalances(id);
            assertEq(
                b.totalDeposited,
                b.available + b.escrowed + b.committed + b.totalPaid + b.totalWithdrawn,
                "conservation"
            );
        }
    }

    /// The vault always holds exactly what it owes or controls: no shortfall, no stray funds.
    function invariant_VaultIsSolvent() public view {
        IContriboRewards.ProjectBalances memory n = vault.getBalances(handler.projectIds(0));
        IContriboRewards.ProjectBalances memory t = vault.getBalances(handler.projectIds(1));
        assertEq(address(vault).balance, n.available + n.escrowed + n.committed, "native solvency");
        assertEq(token.balanceOf(address(vault)), t.available + t.escrowed + t.committed, "token solvency");
    }

    /// Escrow equals the sum of open bounties; commitments equal the sum of unclaimed approvals.
    function invariant_EscrowAndCommitmentsMatchRecords() public view {
        uint256[2] memory escrow;
        uint256[2] memory committed;
        uint256 p0 = handler.projectIds(0);

        for (uint256 i; i < handler.bountyIdsLength(); i++) {
            IContriboRewards.Bounty memory b = vault.getBounty(handler.bountyIds(i));
            if (b.status == IContriboRewards.BountyStatus.Open) {
                escrow[b.projectId == p0 ? 0 : 1] += b.amount;
            }
        }
        for (uint256 i; i < handler.refsLength(); i++) {
            (uint256 projectId, bytes32 ref) = handler.refs(i);
            IContriboRewards.Contribution memory c = vault.getContribution(projectId, ref);
            if (c.status == IContriboRewards.ContributionStatus.Approved) {
                committed[projectId == p0 ? 0 : 1] += c.amount;
            }
        }

        for (uint256 i; i < 2; i++) {
            IContriboRewards.ProjectBalances memory b = vault.getBalances(handler.projectIds(i));
            assertEq(b.escrowed, escrow[i], "escrow");
            assertEq(b.committed, committed[i], "committed");
        }
    }

    /// Paid totals match what contributors actually received; nothing was paid twice.
    function invariant_PaidMatchesReceived() public view {
        uint256 p0 = handler.projectIds(0);
        uint256 p1 = handler.projectIds(1);
        assertEq(vault.getBalances(p0).totalPaid, handler.ghostPaid(p0), "native paid");
        assertEq(vault.getBalances(p1).totalPaid, handler.ghostPaid(p1), "token paid");

        uint256 nativeReceived;
        uint256 tokenReceived;
        for (uint256 i; i < 3; i++) {
            nativeReceived += handler.contributors(i).balance;
            tokenReceived += token.balanceOf(handler.contributors(i));
        }
        assertEq(nativeReceived, handler.ghostReceivedByContributors(address(0)), "native received");
        assertEq(tokenReceived, handler.ghostReceivedByContributors(address(token)), "token received");
        assertEq(nativeReceived, vault.getBalances(p0).totalPaid);
        assertEq(tokenReceived, vault.getBalances(p1).totalPaid);
    }

    /// No double claim, over-withdrawal, unauthorized approval, early cancellation or theft ever succeeded.
    function invariant_NoUnexpectedSuccess() public view {
        assertEq(handler.unexpectedSuccesses(), 0);
    }

    function afterInvariant() external view {
        assertGt(handler.calls(), 0);
    }
}
