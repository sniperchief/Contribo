// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IContriboRewards} from "../src/interfaces/IContriboRewards.sol";
import {BaseTest} from "./BaseTest.sol";
import {CallbackERC20, FeeOnTransferERC20, Reenterer, RejectingReceiver} from "./mocks/Mocks.sol";

contract ContriboRewardsTest is BaseTest {
    // =====================================================================
    // Project registry
    // =====================================================================

    function test_RegisterProject() public {
        vm.expectEmit(address(vault));
        emit IContriboRewards.ProjectRegistered(1, founder, address(token), "uri", POLICY_V1);
        vm.prank(founder);
        uint256 id = vault.registerProject(address(token), "uri", POLICY_V1);

        assertEq(id, 1);
        assertEq(vault.projectCount(), 1);
        IContriboRewards.Project memory p = vault.getProject(id);
        assertEq(p.owner, founder);
        assertEq(p.asset, address(token));
        assertEq(p.policyHash, POLICY_V1);
        assertEq(p.metadataURI, "uri");
        assertTrue(vault.isApprover(id, founder));
    }

    function test_RegisterProject_Native() public {
        uint256 id = _register(NATIVE);
        assertEq(vault.getProject(id).asset, NATIVE);
    }

    function test_RevertWhen_RegisterWithNonContractAsset() public {
        vm.prank(founder);
        vm.expectRevert(abi.encodeWithSelector(IContriboRewards.InvalidAsset.selector, alice));
        vault.registerProject(alice, "", bytes32(0));
    }

    function test_OwnerManagesSettings() public {
        uint256 id = _register(address(token));
        bytes32 v2 = keccak256("v2");

        vm.startPrank(founder);
        vault.setMetadataURI(id, "new-uri");
        vault.setPolicyHash(id, v2);
        vault.setApprover(id, approver, true);
        vm.stopPrank();

        assertEq(vault.getProject(id).metadataURI, "new-uri");
        assertEq(vault.getProject(id).policyHash, v2);
        assertTrue(vault.isApprover(id, approver));

        vm.prank(founder);
        vault.setApprover(id, approver, false);
        assertFalse(vault.isApprover(id, approver));
    }

    function test_RevertWhen_NonOwnerManagesProject() public {
        uint256 id = _register(address(token));
        bytes memory err = abi.encodeWithSelector(IContriboRewards.NotProjectOwner.selector, id, mallory);

        vm.startPrank(mallory);
        vm.expectRevert(err);
        vault.setMetadataURI(id, "x");
        vm.expectRevert(err);
        vault.setPolicyHash(id, bytes32(uint256(1)));
        vm.expectRevert(err);
        vault.setApprover(id, mallory, true);
        vm.expectRevert(err);
        vault.transferProjectOwnership(id, mallory);
        vm.stopPrank();
    }

    function test_RevertWhen_ApproverManagesProject() public {
        uint256 id = _register(address(token));
        vm.prank(founder);
        vault.setApprover(id, approver, true);

        vm.prank(approver);
        vm.expectRevert(abi.encodeWithSelector(IContriboRewards.NotProjectOwner.selector, id, approver));
        vault.setApprover(id, mallory, true);
    }

    function test_RevertWhen_ManagingUnknownProject() public {
        vm.prank(founder);
        vm.expectRevert(abi.encodeWithSelector(IContriboRewards.ProjectNotFound.selector, 42));
        vault.setMetadataURI(42, "x");
    }

    function test_RevertWhen_SetZeroApprover() public {
        uint256 id = _register(address(token));
        vm.prank(founder);
        vm.expectRevert(IContriboRewards.ZeroAddress.selector);
        vault.setApprover(id, address(0), true);
    }

    function test_TwoStepOwnershipTransfer() public {
        uint256 id = _register(address(token));

        vm.prank(founder);
        vault.transferProjectOwnership(id, bob);
        assertEq(vault.getProject(id).owner, founder, "unchanged until accepted");

        vm.prank(mallory);
        vm.expectRevert(abi.encodeWithSelector(IContriboRewards.NotPendingOwner.selector, id, mallory));
        vault.acceptProjectOwnership(id);

        vm.prank(bob);
        vault.acceptProjectOwnership(id);
        assertEq(vault.getProject(id).owner, bob);
        assertEq(vault.getProject(id).pendingOwner, address(0));

        vm.prank(founder);
        vm.expectRevert(abi.encodeWithSelector(IContriboRewards.NotProjectOwner.selector, id, founder));
        vault.setMetadataURI(id, "x");
    }

    function test_OwnershipTransferClearsApprovers() public {
        uint256 id = _registerFunded(address(token), 10 ether);
        vm.startPrank(founder);
        vault.setApprover(id, approver, true);
        vault.transferProjectOwnership(id, bob);
        vm.stopPrank();
        assertTrue(vault.isApprover(id, approver), "still valid until accepted");

        vm.expectEmit(address(vault));
        emit IContriboRewards.ApproversCleared(id);
        vm.prank(bob);
        vault.acceptProjectOwnership(id);

        assertFalse(vault.isApprover(id, approver));
        assertFalse(vault.isApprover(id, founder));
        assertTrue(vault.isApprover(id, bob));
        vm.prank(approver);
        vm.expectRevert(abi.encodeWithSelector(IContriboRewards.NotApprover.selector, id, approver));
        vault.approveContribution(id, REF_1, alice, 1 ether);

        vm.prank(bob);
        vault.setApprover(id, approver, true);
        assertTrue(vault.isApprover(id, approver), "new owner can re-authorize");
    }

    function test_CancelPendingOwnershipTransfer() public {
        uint256 id = _register(address(token));
        vm.startPrank(founder);
        vault.transferProjectOwnership(id, bob);
        vault.transferProjectOwnership(id, address(0));
        vm.stopPrank();

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(IContriboRewards.NotPendingOwner.selector, id, bob));
        vault.acceptProjectOwnership(id);
    }

    // =====================================================================
    // Deposits
    // =====================================================================

    function test_DepositERC20() public {
        uint256 id = _register(address(token));
        vm.expectEmit(address(vault));
        emit IContriboRewards.Deposited(id, founder, 100 ether);
        _deposit(id, address(token), 100 ether);

        _assertBalances(id, 100 ether, 0, 0, 100 ether, 0, 0);
        assertEq(token.balanceOf(address(vault)), 100 ether);
    }

    function test_DepositNative() public {
        uint256 id = _register(NATIVE);
        _deposit(id, NATIVE, 5 ether);
        _assertBalances(id, 5 ether, 0, 0, 5 ether, 0, 0);
        assertEq(address(vault).balance, 5 ether);
    }

    function test_AnyoneCanFundProject() public {
        uint256 id = _register(NATIVE);
        vm.prank(mallory);
        vault.deposit{value: 1 ether}(id, 1 ether);
        assertEq(vault.getBalances(id).available, 1 ether);
    }

    function test_RevertWhen_NativeValueMismatch() public {
        uint256 id = _register(NATIVE);
        vm.prank(founder);
        vm.expectRevert(
            abi.encodeWithSelector(IContriboRewards.IncorrectNativeValue.selector, 2 ether, 1 ether)
        );
        vault.deposit{value: 1 ether}(id, 2 ether);
    }

    function test_RevertWhen_NativeValueSentToERC20Project() public {
        uint256 id = _register(address(token));
        vm.prank(founder);
        vm.expectRevert(abi.encodeWithSelector(IContriboRewards.IncorrectNativeValue.selector, 0, 1 ether));
        vault.deposit{value: 1 ether}(id, 1 ether);
    }

    function test_RevertWhen_DepositZero() public {
        uint256 id = _register(address(token));
        vm.prank(founder);
        vm.expectRevert(IContriboRewards.ZeroAmount.selector);
        vault.deposit(id, 0);
    }

    function test_RevertWhen_DepositToUnknownProject() public {
        vm.prank(founder);
        vm.expectRevert(abi.encodeWithSelector(IContriboRewards.ProjectNotFound.selector, 7));
        vault.deposit(7, 1 ether);
    }

    function test_RevertWhen_FeeOnTransferToken() public {
        FeeOnTransferERC20 fee = new FeeOnTransferERC20();
        fee.mint(founder, 100 ether);
        uint256 id = _register(address(fee));

        vm.startPrank(founder);
        fee.approve(address(vault), type(uint256).max);
        vm.expectRevert(
            abi.encodeWithSelector(IContriboRewards.UnsupportedToken.selector, 100 ether, 99 ether)
        );
        vault.deposit(id, 100 ether);
        vm.stopPrank();
    }

    function test_RevertWhen_DirectNativeTransfer() public {
        vm.prank(founder);
        (bool ok,) = address(vault).call{value: 1 ether}("");
        assertFalse(ok, "vault must not accept untracked native transfers");
    }

    // =====================================================================
    // Pool rewards: approve and claim
    // =====================================================================

    function test_ApproveAndClaim_ERC20() public {
        uint256 id = _registerFunded(address(token), 100 ether);
        vm.prank(founder);
        vault.setApprover(id, approver, true);

        vm.expectEmit(address(vault));
        emit IContriboRewards.ContributionApproved(id, REF_1, alice, 30 ether, 0, POLICY_V1, approver);
        vm.prank(approver);
        vault.approveContribution(id, REF_1, alice, 30 ether);

        _assertBalances(id, 70 ether, 0, 30 ether, 100 ether, 0, 0);
        IContriboRewards.Contribution memory c = vault.getContribution(id, REF_1);
        assertEq(c.contributor, alice);
        assertEq(c.amount, 30 ether);
        assertEq(c.bountyId, 0);
        assertEq(uint8(c.status), uint8(IContriboRewards.ContributionStatus.Approved));

        vm.expectEmit(address(vault));
        emit IContriboRewards.RewardClaimed(id, REF_1, alice, alice, 30 ether);
        vm.prank(alice);
        vault.claim(id, REF_1, alice);

        assertEq(token.balanceOf(alice), 30 ether);
        _assertBalances(id, 70 ether, 0, 0, 100 ether, 30 ether, 0);
        assertEq(
            uint8(vault.getContribution(id, REF_1).status), uint8(IContriboRewards.ContributionStatus.Claimed)
        );
    }

    function test_ApproveAndClaim_Native() public {
        uint256 id = _registerFunded(NATIVE, 10 ether);
        vm.prank(founder);
        vault.approveContribution(id, REF_1, alice, 4 ether);

        vm.prank(alice);
        vault.claim(id, REF_1, alice);
        assertEq(alice.balance, 4 ether);
        assertEq(address(vault).balance, 6 ether);
        _assertBalances(id, 6 ether, 0, 0, 10 ether, 4 ether, 0);
    }

    function test_ClaimToDifferentRecipient() public {
        uint256 id = _registerFunded(address(token), 10 ether);
        vm.prank(founder);
        vault.approveContribution(id, REF_1, alice, 1 ether);

        vm.prank(alice);
        vault.claim(id, REF_1, bob);
        assertEq(token.balanceOf(bob), 1 ether);
        assertEq(token.balanceOf(alice), 0);
    }

    function test_RevertWhen_UnauthorizedApprover() public {
        uint256 id = _registerFunded(address(token), 10 ether);
        vm.prank(mallory);
        vm.expectRevert(abi.encodeWithSelector(IContriboRewards.NotApprover.selector, id, mallory));
        vault.approveContribution(id, REF_1, mallory, 1 ether);
    }

    function test_RevertWhen_ApproverOfOtherProject() public {
        uint256 a = _registerFunded(address(token), 10 ether);
        uint256 b = _registerFunded(address(token), 10 ether);
        vm.prank(founder);
        vault.setApprover(a, approver, true);

        vm.prank(approver);
        vm.expectRevert(abi.encodeWithSelector(IContriboRewards.NotApprover.selector, b, approver));
        vault.approveContribution(b, REF_1, alice, 1 ether);
    }

    function test_RevertWhen_RevokedApproverApproves() public {
        uint256 id = _registerFunded(address(token), 10 ether);
        vm.startPrank(founder);
        vault.setApprover(id, approver, true);
        vault.setApprover(id, approver, false);
        vm.stopPrank();

        vm.prank(approver);
        vm.expectRevert(abi.encodeWithSelector(IContriboRewards.NotApprover.selector, id, approver));
        vault.approveContribution(id, REF_1, alice, 1 ether);
    }

    function test_RevertWhen_DuplicateContributionRef() public {
        uint256 id = _registerFunded(address(token), 10 ether);
        vm.startPrank(founder);
        vault.approveContribution(id, REF_1, alice, 1 ether);
        vm.expectRevert(abi.encodeWithSelector(IContriboRewards.ContributionExists.selector, id, REF_1));
        vault.approveContribution(id, REF_1, bob, 1 ether);
        vm.stopPrank();
    }

    /// References are scoped per project, so another project cannot squat a reference to block approvals.
    function test_RefSquattingByOtherProjectHasNoEffect() public {
        uint256 victim = _registerFunded(address(token), 10 ether);
        vm.startPrank(mallory);
        uint256 squatter = vault.registerProject(NATIVE, "", bytes32(0));
        vault.deposit{value: 1}(squatter, 1);
        vault.approveContribution(squatter, REF_1, bob, 1);
        vm.stopPrank();

        vm.prank(founder);
        vault.approveContribution(victim, REF_1, alice, 5 ether);
        assertEq(vault.getContribution(victim, REF_1).contributor, alice);
        assertEq(vault.getContribution(squatter, REF_1).contributor, bob);

        vm.prank(alice);
        vault.claim(victim, REF_1, alice);
        assertEq(token.balanceOf(alice), 5 ether);
    }

    function test_RevertWhen_DuplicateRefAfterClaim() public {
        uint256 id = _registerFunded(address(token), 10 ether);
        vm.prank(founder);
        vault.approveContribution(id, REF_1, alice, 1 ether);
        vm.prank(alice);
        vault.claim(id, REF_1, alice);

        vm.prank(founder);
        vm.expectRevert(abi.encodeWithSelector(IContriboRewards.ContributionExists.selector, id, REF_1));
        vault.approveContribution(id, REF_1, alice, 1 ether);
    }

    function test_RevertWhen_DoubleClaim() public {
        uint256 id = _registerFunded(address(token), 10 ether);
        vm.prank(founder);
        vault.approveContribution(id, REF_1, alice, 1 ether);

        vm.startPrank(alice);
        vault.claim(id, REF_1, alice);
        vm.expectRevert(abi.encodeWithSelector(IContriboRewards.NotClaimable.selector, id, REF_1));
        vault.claim(id, REF_1, alice);
        vm.stopPrank();
        assertEq(token.balanceOf(alice), 1 ether);
    }

    function test_RevertWhen_ClaimByNonContributor() public {
        uint256 id = _registerFunded(address(token), 10 ether);
        vm.prank(founder);
        vault.approveContribution(id, REF_1, alice, 1 ether);

        vm.prank(mallory);
        vm.expectRevert(abi.encodeWithSelector(IContriboRewards.NotContributor.selector, id, REF_1, mallory));
        vault.claim(id, REF_1, mallory);

        vm.prank(founder);
        vm.expectRevert(abi.encodeWithSelector(IContriboRewards.NotContributor.selector, id, REF_1, founder));
        vault.claim(id, REF_1, founder);
    }

    function test_RevertWhen_ClaimUnknownRef() public {
        uint256 id = _registerFunded(address(token), 10 ether);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IContriboRewards.NotClaimable.selector, id, REF_1));
        vault.claim(id, REF_1, alice);
    }

    function test_RevertWhen_ClaimUnderWrongProject() public {
        uint256 a = _registerFunded(address(token), 10 ether);
        uint256 b = _registerFunded(address(token), 10 ether);
        vm.prank(founder);
        vault.approveContribution(a, REF_1, alice, 1 ether);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IContriboRewards.NotClaimable.selector, b, REF_1));
        vault.claim(b, REF_1, alice);
        assertEq(vault.getBalances(b).available, 10 ether);
    }

    function test_RevertWhen_ClaimToZeroAddress() public {
        uint256 id = _registerFunded(address(token), 10 ether);
        vm.prank(founder);
        vault.approveContribution(id, REF_1, alice, 1 ether);
        vm.prank(alice);
        vm.expectRevert(IContriboRewards.ZeroAddress.selector);
        vault.claim(id, REF_1, address(0));
    }

    function test_RevertWhen_ApprovalExceedsAvailable() public {
        uint256 id = _registerFunded(address(token), 10 ether);
        vm.prank(founder);
        vm.expectRevert(
            abi.encodeWithSelector(IContriboRewards.InsufficientAvailable.selector, id, 11 ether, 10 ether)
        );
        vault.approveContribution(id, REF_1, alice, 11 ether);
    }

    function test_RevertWhen_ApprovalsTogetherExceedAvailable() public {
        uint256 id = _registerFunded(address(token), 10 ether);
        vm.startPrank(founder);
        vault.approveContribution(id, REF_1, alice, 6 ether);
        vm.expectRevert(
            abi.encodeWithSelector(IContriboRewards.InsufficientAvailable.selector, id, 6 ether, 4 ether)
        );
        vault.approveContribution(id, REF_2, bob, 6 ether);
        vm.stopPrank();
    }

    function test_RevertWhen_ApprovalUsesOtherProjectsFunds() public {
        uint256 funded = _registerFunded(address(token), 100 ether);
        uint256 empty = _register(address(token));
        assertEq(token.balanceOf(address(vault)), 100 ether);

        vm.prank(founder);
        vm.expectRevert(
            abi.encodeWithSelector(IContriboRewards.InsufficientAvailable.selector, empty, 1 ether, 0)
        );
        vault.approveContribution(empty, REF_1, alice, 1 ether);
        assertEq(vault.getBalances(funded).available, 100 ether);
    }

    function test_RevertWhen_InvalidAllocation() public {
        uint256 id = _registerFunded(address(token), 10 ether);
        vm.startPrank(founder);

        vm.expectRevert(IContriboRewards.ZeroAmount.selector);
        vault.approveContribution(id, REF_1, alice, 0);

        vm.expectRevert(IContriboRewards.InvalidContributionRef.selector);
        vault.approveContribution(id, bytes32(0), alice, 1 ether);

        vm.expectRevert(abi.encodeWithSelector(IContriboRewards.InvalidContributor.selector, address(0)));
        vault.approveContribution(id, REF_1, address(0), 1 ether);

        vm.expectRevert(abi.encodeWithSelector(IContriboRewards.InvalidContributor.selector, address(vault)));
        vault.approveContribution(id, REF_1, address(vault), 1 ether);

        vm.expectRevert(abi.encodeWithSelector(IContriboRewards.InvalidContributor.selector, founder));
        vault.approveContribution(id, REF_1, founder, 1 ether);

        vm.stopPrank();
        _assertBalances(id, 10 ether, 0, 0, 10 ether, 0, 0);
    }

    // =====================================================================
    // Bounties
    // =====================================================================

    function _createBounty(uint256 projectId, uint256 amount) internal returns (uint256 bountyId) {
        vm.prank(founder);
        bountyId = vault.createBounty(projectId, amount, uint64(block.timestamp + 7 days));
    }

    function test_BountyAwardAndClaim() public {
        uint256 id = _registerFunded(address(token), 100 ether);
        uint256 bountyId = _createBounty(id, 40 ether);
        _assertBalances(id, 60 ether, 40 ether, 0, 100 ether, 0, 0);

        vm.prank(founder);
        vault.setApprover(id, approver, true);
        vm.prank(approver);
        vault.awardBounty(bountyId, REF_1, alice);

        IContriboRewards.Bounty memory b = vault.getBounty(bountyId);
        assertEq(uint8(b.status), uint8(IContriboRewards.BountyStatus.Awarded));
        assertEq(b.contributionRef, REF_1);
        assertEq(vault.getContribution(id, REF_1).bountyId, bountyId);
        _assertBalances(id, 60 ether, 0, 40 ether, 100 ether, 0, 0);

        vm.prank(alice);
        vault.claim(id, REF_1, alice);
        assertEq(token.balanceOf(alice), 40 ether);
        _assertBalances(id, 60 ether, 0, 0, 100 ether, 40 ether, 0);
    }

    function test_BountyCanBeAwardedAfterDeadline() public {
        uint256 id = _registerFunded(address(token), 10 ether);
        uint256 bountyId = _createBounty(id, 10 ether);
        vm.warp(block.timestamp + 30 days);
        vm.prank(founder);
        vault.awardBounty(bountyId, REF_1, alice);
        assertEq(vault.getContribution(id, REF_1).amount, 10 ether);
    }

    function test_RevertWhen_BountyExceedsAvailable() public {
        uint256 id = _registerFunded(address(token), 10 ether);
        vm.prank(founder);
        vm.expectRevert(
            abi.encodeWithSelector(IContriboRewards.InsufficientAvailable.selector, id, 11 ether, 10 ether)
        );
        vault.createBounty(id, 11 ether, uint64(block.timestamp + 1 days));
    }

    function test_RevertWhen_BountyInvalidParams() public {
        uint256 id = _registerFunded(address(token), 10 ether);
        vm.startPrank(founder);
        vm.expectRevert(IContriboRewards.ZeroAmount.selector);
        vault.createBounty(id, 0, uint64(block.timestamp + 1 days));
        vm.expectRevert(
            abi.encodeWithSelector(IContriboRewards.InvalidDeadline.selector, uint64(block.timestamp))
        );
        vault.createBounty(id, 1 ether, uint64(block.timestamp));
        vm.stopPrank();
    }

    function test_RevertWhen_NonOwnerCreatesBounty() public {
        uint256 id = _registerFunded(address(token), 10 ether);
        vm.prank(founder);
        vault.setApprover(id, approver, true);
        vm.prank(approver);
        vm.expectRevert(abi.encodeWithSelector(IContriboRewards.NotProjectOwner.selector, id, approver));
        vault.createBounty(id, 1 ether, uint64(block.timestamp + 1 days));
    }

    function test_RevertWhen_UnauthorizedBountyAward() public {
        uint256 id = _registerFunded(address(token), 10 ether);
        uint256 bountyId = _createBounty(id, 5 ether);
        vm.prank(mallory);
        vm.expectRevert(abi.encodeWithSelector(IContriboRewards.NotApprover.selector, id, mallory));
        vault.awardBounty(bountyId, REF_1, mallory);
    }

    function test_RevertWhen_BountyAwardedTwice() public {
        uint256 id = _registerFunded(address(token), 10 ether);
        uint256 bountyId = _createBounty(id, 5 ether);
        vm.startPrank(founder);
        vault.awardBounty(bountyId, REF_1, alice);
        vm.expectRevert(abi.encodeWithSelector(IContriboRewards.BountyNotOpen.selector, bountyId));
        vault.awardBounty(bountyId, REF_2, bob);
        vm.stopPrank();
        _assertBalances(id, 5 ether, 0, 5 ether, 10 ether, 0, 0);
    }

    function test_RevertWhen_BountyAwardReusesRef() public {
        uint256 id = _registerFunded(address(token), 10 ether);
        uint256 bountyId = _createBounty(id, 5 ether);
        vm.startPrank(founder);
        vault.approveContribution(id, REF_1, alice, 1 ether);
        vm.expectRevert(abi.encodeWithSelector(IContriboRewards.ContributionExists.selector, id, REF_1));
        vault.awardBounty(bountyId, REF_1, alice);
        vm.stopPrank();
        assertEq(uint8(vault.getBounty(bountyId).status), uint8(IContriboRewards.BountyStatus.Open));
    }

    function test_RevertWhen_BountyAwardedToOwner() public {
        uint256 id = _registerFunded(address(token), 10 ether);
        uint256 bountyId = _createBounty(id, 5 ether);
        vm.prank(founder);
        vault.setApprover(id, approver, true);
        vm.prank(approver);
        vm.expectRevert(abi.encodeWithSelector(IContriboRewards.InvalidContributor.selector, founder));
        vault.awardBounty(bountyId, REF_1, founder);
    }

    function test_RevertWhen_UnknownBounty() public {
        vm.prank(founder);
        vm.expectRevert(abi.encodeWithSelector(IContriboRewards.BountyNotFound.selector, 99));
        vault.awardBounty(99, REF_1, alice);
        vm.prank(founder);
        vm.expectRevert(abi.encodeWithSelector(IContriboRewards.BountyNotFound.selector, 99));
        vault.cancelBounty(99);
    }

    // =====================================================================
    // Refunds and cancellation
    // =====================================================================

    function test_WithdrawAvailable() public {
        uint256 id = _registerFunded(address(token), 100 ether);
        vm.expectEmit(address(vault));
        emit IContriboRewards.Withdrawn(id, bob, 25 ether);
        vm.prank(founder);
        vault.withdraw(id, 25 ether, bob);
        assertEq(token.balanceOf(bob), 25 ether);
        _assertBalances(id, 75 ether, 0, 0, 100 ether, 0, 25 ether);
    }

    function test_WithdrawNative() public {
        uint256 id = _registerFunded(NATIVE, 3 ether);
        vm.prank(founder);
        vault.withdraw(id, 3 ether, bob);
        assertEq(bob.balance, 3 ether);
        assertEq(address(vault).balance, 0);
    }

    function test_RevertWhen_WithdrawCommittedFunds() public {
        uint256 id = _registerFunded(address(token), 10 ether);
        vm.startPrank(founder);
        vault.approveContribution(id, REF_1, alice, 7 ether);
        vm.expectRevert(
            abi.encodeWithSelector(IContriboRewards.InsufficientAvailable.selector, id, 4 ether, 3 ether)
        );
        vault.withdraw(id, 4 ether, founder);
        vault.withdraw(id, 3 ether, founder);
        vm.stopPrank();

        _assertBalances(id, 0, 0, 7 ether, 10 ether, 0, 3 ether);
        vm.prank(alice);
        vault.claim(id, REF_1, alice);
        assertEq(token.balanceOf(alice), 7 ether, "earned reward still fully claimable");
    }

    function test_RevertWhen_WithdrawEscrowedBounty() public {
        uint256 id = _registerFunded(address(token), 10 ether);
        _createBounty(id, 8 ether);
        vm.prank(founder);
        vm.expectRevert(
            abi.encodeWithSelector(IContriboRewards.InsufficientAvailable.selector, id, 3 ether, 2 ether)
        );
        vault.withdraw(id, 3 ether, founder);
    }

    function test_RevertWhen_UnauthorizedWithdraw() public {
        uint256 id = _registerFunded(address(token), 10 ether);
        vm.prank(founder);
        vault.setApprover(id, approver, true);

        vm.prank(mallory);
        vm.expectRevert(abi.encodeWithSelector(IContriboRewards.NotProjectOwner.selector, id, mallory));
        vault.withdraw(id, 1 ether, mallory);

        vm.prank(approver);
        vm.expectRevert(abi.encodeWithSelector(IContriboRewards.NotProjectOwner.selector, id, approver));
        vault.withdraw(id, 1 ether, approver);

        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(IContriboRewards.NotProjectOwner.selector, id, admin));
        vault.withdraw(id, 1 ether, admin);
    }

    function test_RevertWhen_WithdrawInvalidParams() public {
        uint256 id = _registerFunded(address(token), 10 ether);
        vm.startPrank(founder);
        vm.expectRevert(IContriboRewards.ZeroAddress.selector);
        vault.withdraw(id, 1 ether, address(0));
        vm.expectRevert(IContriboRewards.ZeroAmount.selector);
        vault.withdraw(id, 0, founder);
        vm.stopPrank();
    }

    function test_CancelExpiredBountyThenRefund() public {
        uint256 id = _registerFunded(address(token), 10 ether);
        uint256 bountyId = _createBounty(id, 6 ether);
        IContriboRewards.Bounty memory b = vault.getBounty(bountyId);

        vm.warp(b.deadline + 1);
        vm.expectEmit(address(vault));
        emit IContriboRewards.BountyCancelled(bountyId, id, 6 ether);
        vm.prank(founder);
        vault.cancelBounty(bountyId);

        assertEq(uint8(vault.getBounty(bountyId).status), uint8(IContriboRewards.BountyStatus.Cancelled));
        _assertBalances(id, 10 ether, 0, 0, 10 ether, 0, 0);

        vm.prank(founder);
        vault.withdraw(id, 10 ether, founder);
        _assertBalances(id, 0, 0, 0, 10 ether, 0, 10 ether);
    }

    function test_RevertWhen_CancelBountyBeforeDeadline() public {
        uint256 id = _registerFunded(address(token), 10 ether);
        uint256 bountyId = _createBounty(id, 6 ether);
        uint64 deadline = vault.getBounty(bountyId).deadline;

        vm.warp(deadline);
        vm.prank(founder);
        vm.expectRevert(
            abi.encodeWithSelector(IContriboRewards.BountyNotExpired.selector, bountyId, deadline)
        );
        vault.cancelBounty(bountyId);
    }

    function test_RevertWhen_CancelAwardedOrCancelledBounty() public {
        uint256 id = _registerFunded(address(token), 10 ether);
        uint256 awarded = _createBounty(id, 3 ether);
        uint256 cancelled = _createBounty(id, 3 ether);

        vm.prank(founder);
        vault.awardBounty(awarded, REF_1, alice);
        vm.warp(block.timestamp + 8 days);

        vm.startPrank(founder);
        vm.expectRevert(abi.encodeWithSelector(IContriboRewards.BountyNotOpen.selector, awarded));
        vault.cancelBounty(awarded);

        vault.cancelBounty(cancelled);
        vm.expectRevert(abi.encodeWithSelector(IContriboRewards.BountyNotOpen.selector, cancelled));
        vault.cancelBounty(cancelled);
        vm.expectRevert(abi.encodeWithSelector(IContriboRewards.BountyNotOpen.selector, cancelled));
        vault.awardBounty(cancelled, REF_2, bob);
        vm.stopPrank();

        _assertBalances(id, 7 ether, 0, 3 ether, 10 ether, 0, 0);
    }

    function test_RevertWhen_NonOwnerCancelsBounty() public {
        uint256 id = _registerFunded(address(token), 10 ether);
        uint256 bountyId = _createBounty(id, 6 ether);
        vm.warp(block.timestamp + 8 days);
        vm.prank(mallory);
        vm.expectRevert(abi.encodeWithSelector(IContriboRewards.NotProjectOwner.selector, id, mallory));
        vault.cancelBounty(bountyId);
    }

    // =====================================================================
    // Pause (platform admin)
    // =====================================================================

    function test_PauseBlocksNewActivityButNotClaimsOrWithdrawals() public {
        uint256 id = _registerFunded(address(token), 10 ether);
        uint256 bountyId = _createBounty(id, 2 ether);
        vm.prank(founder);
        vault.approveContribution(id, REF_1, alice, 1 ether);

        vm.prank(admin);
        vault.pause();

        vm.startPrank(founder);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vault.registerProject(address(token), "", bytes32(0));
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vault.deposit(id, 1 ether);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vault.createBounty(id, 1 ether, uint64(block.timestamp + 1 days));
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vault.approveContribution(id, REF_2, bob, 1 ether);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vault.awardBounty(bountyId, REF_2, bob);

        vault.withdraw(id, 1 ether, founder);
        vm.warp(block.timestamp + 8 days);
        vault.cancelBounty(bountyId);
        vm.stopPrank();

        vm.prank(alice);
        vault.claim(id, REF_1, alice);
        assertEq(token.balanceOf(alice), 1 ether);

        vm.prank(admin);
        vault.unpause();
        vm.prank(founder);
        vault.approveContribution(id, REF_2, bob, 1 ether);
    }

    function test_RevertWhen_NonAdminPauses() public {
        vm.prank(founder);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, founder));
        vault.pause();
    }

    // =====================================================================
    // Transfer failures and reentrancy
    // =====================================================================

    function test_RejectingRecipientCanClaimElsewhere() public {
        RejectingReceiver rejecting = new RejectingReceiver();
        uint256 id = _registerFunded(NATIVE, 5 ether);
        vm.prank(founder);
        vault.approveContribution(id, REF_1, address(rejecting), 2 ether);

        vm.prank(address(rejecting));
        vm.expectRevert(IContriboRewards.NativeTransferFailed.selector);
        vault.claim(id, REF_1, address(rejecting));
        _assertBalances(id, 3 ether, 0, 2 ether, 5 ether, 0, 0);

        vm.prank(address(rejecting));
        vault.claim(id, REF_1, bob);
        assertEq(bob.balance, 2 ether);
    }

    function test_ReentrantNativeClaimIsBlocked() public {
        Reenterer attacker = new Reenterer(vault);
        uint256 id = _registerFunded(NATIVE, 10 ether);
        vm.prank(founder);
        vault.approveContribution(id, REF_1, address(attacker), 1 ether);
        attacker.configure(REF_1, id, 0);

        attacker.claim();
        assertFalse(attacker.reentrySucceeded());
        assertEq(address(attacker).balance, 1 ether);
        _assertBalances(id, 9 ether, 0, 0, 10 ether, 1 ether, 0);
    }

    function test_ReentrantTokenClaimIsBlocked() public {
        CallbackERC20 cb = new CallbackERC20();
        cb.mint(founder, 10 ether);
        Reenterer attacker = new Reenterer(vault);
        uint256 id = _register(address(cb));
        vm.startPrank(founder);
        cb.approve(address(vault), type(uint256).max);
        vault.deposit(id, 10 ether);
        vault.approveContribution(id, REF_1, address(attacker), 1 ether);
        vm.stopPrank();
        attacker.configure(REF_1, id, 0);

        attacker.claim();
        assertFalse(attacker.reentrySucceeded());
        assertEq(cb.balanceOf(address(attacker)), 1 ether);
        assertEq(cb.balanceOf(address(vault)), 9 ether);
    }

    function test_ReentrantWithdrawIsBlocked() public {
        Reenterer attackerOwner = new Reenterer(vault);
        uint256 id = attackerOwner.register(NATIVE);
        vm.prank(founder);
        vault.deposit{value: 5 ether}(id, 5 ether);
        attackerOwner.configure(bytes32(0), id, 1);

        attackerOwner.withdraw(2 ether);
        assertFalse(attackerOwner.reentrySucceeded());
        assertEq(address(attackerOwner).balance, 2 ether);
        _assertBalances(id, 3 ether, 0, 0, 5 ether, 0, 2 ether);
    }

    // =====================================================================
    // Policy tracking
    // =====================================================================

    function test_ApprovalEmitsPolicyInForce() public {
        uint256 id = _registerFunded(address(token), 10 ether);
        bytes32 v2 = keccak256("contribo:policy:v2");
        vm.prank(founder);
        vault.setPolicyHash(id, v2);

        vm.expectEmit(address(vault));
        emit IContriboRewards.ContributionApproved(id, REF_1, alice, 1 ether, 0, v2, founder);
        vm.prank(founder);
        vault.approveContribution(id, REF_1, alice, 1 ether);
    }
}
