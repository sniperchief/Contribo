// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IContriboRewards} from "../src/interfaces/IContriboRewards.sol";
import {BaseTest} from "./BaseTest.sol";

contract ContriboRewardsFuzzTest is BaseTest {
    uint256 internal constant MAX = 1_000_000 ether;

    function testFuzz_DepositApproveClaimWithdraw(
        uint256 deposit,
        uint256 reward,
        uint256 refund,
        bool native
    ) public {
        deposit = bound(deposit, 1, MAX);
        reward = bound(reward, 1, deposit);
        refund = bound(refund, 0, deposit - reward);
        address asset = native ? NATIVE : address(token);

        uint256 id = _registerFunded(asset, deposit);
        vm.prank(founder);
        vault.approveContribution(id, REF_1, alice, reward);

        if (refund > 0) {
            vm.prank(founder);
            vault.withdraw(id, refund, bob);
        }

        vm.prank(alice);
        vault.claim(id, REF_1, alice);

        _assertBalances(id, deposit - reward - refund, 0, 0, deposit, reward, refund);
        uint256 aliceReceived = native ? alice.balance : token.balanceOf(alice);
        uint256 vaultHeld = native ? address(vault).balance : token.balanceOf(address(vault));
        assertEq(aliceReceived, reward);
        assertEq(vaultHeld, deposit - reward - refund);
    }

    function testFuzz_RevertWhen_ApprovalExceedsAvailable(uint256 deposit, uint256 reward) public {
        deposit = bound(deposit, 1, MAX);
        reward = bound(reward, deposit + 1, type(uint256).max);
        uint256 id = _registerFunded(address(token), deposit);

        vm.prank(founder);
        vm.expectRevert(
            abi.encodeWithSelector(IContriboRewards.InsufficientAvailable.selector, id, reward, deposit)
        );
        vault.approveContribution(id, REF_1, alice, reward);
    }

    /// Owner can never withdraw more than what is neither escrowed nor committed.
    function testFuzz_WithdrawNeverTouchesCommittedOrEscrowed(
        uint256 deposit,
        uint256 reward,
        uint256 bounty,
        uint256 withdrawAmount
    ) public {
        deposit = bound(deposit, 2, MAX);
        reward = bound(reward, 1, deposit - 1);
        bounty = bound(bounty, 1, deposit - reward);
        uint256 free = deposit - reward - bounty;
        withdrawAmount = bound(withdrawAmount, 1, MAX * 2);

        uint256 id = _registerFunded(address(token), deposit);
        vm.startPrank(founder);
        vault.approveContribution(id, REF_1, alice, reward);
        vault.createBounty(id, bounty, uint64(block.timestamp + 1 days));

        if (withdrawAmount > free) {
            vm.expectRevert(
                abi.encodeWithSelector(
                    IContriboRewards.InsufficientAvailable.selector, id, withdrawAmount, free
                )
            );
        }
        vault.withdraw(id, withdrawAmount, founder);
        vm.stopPrank();

        IContriboRewards.ProjectBalances memory b = vault.getBalances(id);
        assertEq(b.committed, reward);
        assertEq(b.escrowed, bounty);
        assertGe(token.balanceOf(address(vault)), b.committed + b.escrowed);
    }

    function testFuzz_OnlyContributorCanClaim(address caller) public {
        vm.assume(caller != alice);
        uint256 id = _registerFunded(address(token), 10 ether);
        vm.prank(founder);
        vault.approveContribution(id, REF_1, alice, 1 ether);

        vm.prank(caller);
        vm.expectRevert(abi.encodeWithSelector(IContriboRewards.NotContributor.selector, id, REF_1, caller));
        vault.claim(id, REF_1, bob);
    }

    function testFuzz_OnlyApproversCanApprove(address caller) public {
        vm.assume(caller != founder && caller != approver);
        uint256 id = _registerFunded(address(token), 10 ether);
        vm.prank(founder);
        vault.setApprover(id, approver, true);

        vm.prank(caller);
        vm.expectRevert(abi.encodeWithSelector(IContriboRewards.NotApprover.selector, id, caller));
        vault.approveContribution(id, REF_1, alice, 1 ether);
    }

    function testFuzz_ContributionRefIsSingleUse(bytes32 ref, uint256 a, uint256 b) public {
        vm.assume(ref != bytes32(0));
        a = bound(a, 1, 10 ether);
        b = bound(b, 1, 10 ether);
        uint256 id = _registerFunded(address(token), 20 ether);

        vm.startPrank(founder);
        vault.approveContribution(id, ref, alice, a);
        vm.expectRevert(abi.encodeWithSelector(IContriboRewards.ContributionExists.selector, id, ref));
        vault.approveContribution(id, ref, bob, b);
        vm.stopPrank();
    }

    function testFuzz_BountyCancellationRespectsDeadline(uint64 duration, uint64 elapsed) public {
        duration = uint64(bound(duration, 1, 365 days));
        elapsed = uint64(bound(elapsed, 0, 730 days));
        uint256 id = _registerFunded(address(token), 10 ether);
        uint64 start = uint64(vm.getBlockTimestamp());
        uint64 deadline = start + duration;

        vm.prank(founder);
        uint256 bountyId = vault.createBounty(id, 4 ether, deadline);
        vm.warp(start + elapsed);

        vm.prank(founder);
        if (start + elapsed <= deadline) {
            vm.expectRevert(
                abi.encodeWithSelector(IContriboRewards.BountyNotExpired.selector, bountyId, deadline)
            );
            vault.cancelBounty(bountyId);
            assertEq(vault.getBalances(id).escrowed, 4 ether);
        } else {
            vault.cancelBounty(bountyId);
            assertEq(vault.getBalances(id).available, 10 ether);
        }
    }
}
