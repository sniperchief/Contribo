// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {ContriboRewards} from "../../src/ContriboRewards.sol";
import {IContriboRewards} from "../../src/interfaces/IContriboRewards.sol";
import {MockERC20} from "../mocks/Mocks.sol";

/// @dev Drives random sequences of valid (and deliberately invalid) actions against the vault.
contract Handler is Test {
    ContriboRewards public immutable vault;
    MockERC20 public immutable token;

    address public immutable founder = makeAddr("inv-founder");
    address public immutable approver = makeAddr("inv-approver");
    address public immutable treasury = makeAddr("inv-treasury");
    address[3] public contributors = [makeAddr("inv-c0"), makeAddr("inv-c1"), makeAddr("inv-c2")];

    uint256[2] public projectIds;

    struct Ref {
        uint256 projectId;
        bytes32 ref;
    }

    Ref[] public refs;
    uint256[] public bountyIds;

    // Ghost state.
    mapping(uint256 projectId => uint256) public ghostPaid;
    mapping(address asset => uint256) public ghostReceivedByContributors;
    uint256 public unexpectedSuccesses;
    uint256 public calls;

    constructor(ContriboRewards vault_, MockERC20 token_) {
        vault = vault_;
        token = token_;

        vm.startPrank(founder);
        projectIds[0] = vault.registerProject(address(0), "native", keccak256("p0"));
        projectIds[1] = vault.registerProject(address(token), "erc20", keccak256("p1"));
        vault.setApprover(projectIds[0], approver, true);
        vault.setApprover(projectIds[1], approver, true);
        token.approve(address(vault), type(uint256).max);
        vm.stopPrank();
    }

    // ------------------------------------------------------------------
    // Actions
    // ------------------------------------------------------------------

    function deposit(uint256 projectSeed, uint256 amount) external {
        calls++;
        uint256 id = _project(projectSeed);
        amount = bound(amount, 1, 1_000 ether);
        bool native = vault.getProject(id).asset == address(0);
        if (native) vm.deal(founder, founder.balance + amount);
        else token.mint(founder, amount);

        vm.prank(founder);
        vault.deposit{value: native ? amount : 0}(id, amount);
    }

    function createBounty(uint256 projectSeed, uint256 amount, uint256 duration) external {
        calls++;
        uint256 id = _project(projectSeed);
        uint256 available = vault.getBalances(id).available;
        if (available == 0) return;
        amount = bound(amount, 1, available);
        duration = bound(duration, 1, 30 days);

        vm.prank(founder);
        bountyIds.push(vault.createBounty(id, amount, uint64(block.timestamp + duration)));
    }

    function cancelBounty(uint256 bountySeed) external {
        calls++;
        if (bountyIds.length == 0) return;
        uint256 bountyId = bountyIds[bountySeed % bountyIds.length];
        IContriboRewards.Bounty memory b = vault.getBounty(bountyId);
        bool shouldSucceed = b.status == IContriboRewards.BountyStatus.Open && block.timestamp > b.deadline;

        vm.prank(founder);
        try vault.cancelBounty(bountyId) {
            if (!shouldSucceed) unexpectedSuccesses++;
        } catch {}
    }

    function approve(uint256 projectSeed, uint256 contributorSeed, uint256 amount) external {
        calls++;
        uint256 id = _project(projectSeed);
        uint256 available = vault.getBalances(id).available;
        if (available == 0) return;
        amount = bound(amount, 1, available);
        bytes32 ref = keccak256(abi.encode("ref", refs.length));

        vm.prank(approver);
        vault.approveContribution(id, ref, _contributor(contributorSeed), amount);
        refs.push(Ref(id, ref));
    }

    function awardBounty(uint256 bountySeed, uint256 contributorSeed) external {
        calls++;
        if (bountyIds.length == 0) return;
        uint256 bountyId = bountyIds[bountySeed % bountyIds.length];
        IContriboRewards.Bounty memory b = vault.getBounty(bountyId);
        bool open = b.status == IContriboRewards.BountyStatus.Open;
        bytes32 ref = keccak256(abi.encode("ref", refs.length));

        vm.prank(approver);
        try vault.awardBounty(bountyId, ref, _contributor(contributorSeed)) {
            if (!open) unexpectedSuccesses++;
            refs.push(Ref(b.projectId, ref));
        } catch {}
    }

    function claim(uint256 refSeed) external {
        calls++;
        if (refs.length == 0) return;
        Ref memory r = refs[refSeed % refs.length];
        IContriboRewards.Contribution memory c = vault.getContribution(r.projectId, r.ref);
        bool claimable = c.status == IContriboRewards.ContributionStatus.Approved;

        vm.prank(c.contributor);
        try vault.claim(r.projectId, r.ref, c.contributor) {
            if (!claimable) unexpectedSuccesses++;
            ghostPaid[r.projectId] += c.amount;
            ghostReceivedByContributors[vault.getProject(r.projectId).asset] += c.amount;
        } catch {}
    }

    function withdraw(uint256 projectSeed, uint256 amount) external {
        calls++;
        uint256 id = _project(projectSeed);
        uint256 available = vault.getBalances(id).available;
        amount = bound(amount, 1, available + 10 ether);

        vm.prank(founder);
        try vault.withdraw(id, amount, treasury) {
            if (amount > available) unexpectedSuccesses++;
        } catch {}
    }

    /// Attacker attempts: steal another contributor's reward, approve without rights, reuse a ref.
    function attack(uint256 refSeed, uint256 projectSeed) external {
        calls++;
        address attacker = makeAddr("inv-attacker");
        uint256 id = _project(projectSeed);

        vm.prank(attacker);
        try vault.approveContribution(id, keccak256("attacker-ref"), attacker, 1) {
            unexpectedSuccesses++;
        } catch {}

        vm.prank(attacker);
        try vault.withdraw(id, 1, attacker) {
            unexpectedSuccesses++;
        } catch {}

        if (refs.length == 0) return;
        Ref memory r = refs[refSeed % refs.length];
        vm.prank(attacker);
        try vault.claim(r.projectId, r.ref, attacker) {
            unexpectedSuccesses++;
        } catch {}

        // Re-using an existing reference within its project must fail.
        vm.prank(approver);
        try vault.approveContribution(r.projectId, r.ref, attacker, 1) {
            unexpectedSuccesses++;
        } catch {}
    }

    function warp(uint256 seconds_) external {
        calls++;
        vm.warp(block.timestamp + bound(seconds_, 1, 10 days));
    }

    // ------------------------------------------------------------------
    // Views for invariants
    // ------------------------------------------------------------------

    function projectCount() external pure returns (uint256) {
        return 2;
    }

    function refsLength() external view returns (uint256) {
        return refs.length;
    }

    function bountyIdsLength() external view returns (uint256) {
        return bountyIds.length;
    }

    function _project(uint256 seed) private view returns (uint256) {
        return projectIds[seed % 2];
    }

    function _contributor(uint256 seed) private view returns (address) {
        return contributors[seed % contributors.length];
    }
}
