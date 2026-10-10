// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {IContriboRewards} from "./interfaces/IContriboRewards.sol";

/// @title ContriboRewards
/// @notice Project registry and reward vault for Contribo.
///
/// Founders register projects, fund them onchain, and either approve rewards
/// from the project's general pool or escrow fixed bounties. Authorized
/// approvers (the project owner and addresses the owner designates, such as the
/// Contribo verification backend) register accepted contributions. Contributors
/// then pull their rewards with `claim`.
///
/// Trust model:
/// - Funds become owed to a contributor the moment a reward is approved. From
///   then on nobody (owner, approvers or platform admin) can withdraw or redirect them.
/// - Open bounty escrow cannot be reclaimed by the owner before its deadline.
/// - Unallocated (`available`) funds remain under the owner's control.
/// - The platform admin can only pause new deposits, registrations, bounties and
///   approvals. Claims, withdrawals of available funds and bounty cancellations
///   always remain possible.
///
/// Supported assets: native MON (`address(0)`) or a standard ERC-20 token.
/// Fee-on-transfer tokens are rejected at deposit; rebasing tokens are not supported.
contract ContriboRewards is IContriboRewards, Ownable2Step, Pausable, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    /// @notice Sentinel asset address representing native MON.
    address public constant NATIVE = address(0);

    /// @notice Number of registered projects. Project IDs start at 1.
    uint256 public projectCount;
    /// @notice Number of created bounties. Bounty IDs start at 1.
    uint256 public bountyCount;

    mapping(uint256 projectId => Project) private _projects;
    mapping(uint256 projectId => ProjectBalances) private _balances;
    /// @dev Approver sets are versioned so an ownership transfer clears them in O(1).
    mapping(uint256 projectId => uint256) private _approverEpoch;
    mapping(uint256 projectId => mapping(uint256 epoch => mapping(address account => bool))) private
        _approvers;
    mapping(uint256 bountyId => Bounty) private _bounties;
    mapping(uint256 projectId => mapping(bytes32 contributionRef => Contribution)) private _contributions;

    constructor(address initialAdmin) Ownable(initialAdmin) {}

    // ---------------------------------------------------------------------
    // Modifiers
    // ---------------------------------------------------------------------

    modifier onlyProjectOwner(uint256 projectId) {
        _requireProjectOwner(projectId);
        _;
    }

    modifier onlyApprover(uint256 projectId) {
        _requireApprover(projectId);
        _;
    }

    // ---------------------------------------------------------------------
    // Project registry
    // ---------------------------------------------------------------------

    /// @notice Registers a project owned by the caller.
    /// @param asset Reward asset: `address(0)` for native MON or an ERC-20 contract.
    /// @param metadataURI Offchain project reference (e.g. the Contribo project URL).
    /// @param policyHash Hash of the published reward policy, or 0 if none yet.
    function registerProject(address asset, string calldata metadataURI, bytes32 policyHash)
        external
        whenNotPaused
        returns (uint256 projectId)
    {
        if (asset != NATIVE && asset.code.length == 0) revert InvalidAsset(asset);

        projectId = ++projectCount;
        Project storage project = _projects[projectId];
        project.owner = msg.sender;
        project.asset = asset;
        project.policyHash = policyHash;
        project.metadataURI = metadataURI;

        emit ProjectRegistered(projectId, msg.sender, asset, metadataURI, policyHash);
    }

    function setMetadataURI(uint256 projectId, string calldata metadataURI)
        external
        onlyProjectOwner(projectId)
    {
        _projects[projectId].metadataURI = metadataURI;
        emit ProjectMetadataUpdated(projectId, metadataURI);
    }

    /// @notice Records the reward policy now in force. Rewards approved afterwards emit this hash.
    function setPolicyHash(uint256 projectId, bytes32 policyHash) external onlyProjectOwner(projectId) {
        _projects[projectId].policyHash = policyHash;
        emit RewardPolicyUpdated(projectId, policyHash);
    }

    /// @notice Grants or revokes the right to approve contributions for a project.
    function setApprover(uint256 projectId, address approver, bool allowed)
        external
        onlyProjectOwner(projectId)
    {
        if (approver == address(0)) revert ZeroAddress();
        _approvers[projectId][_approverEpoch[projectId]][approver] = allowed;
        emit ApproverUpdated(projectId, approver, allowed);
    }

    /// @notice Starts a two-step ownership transfer. Pass `address(0)` to cancel a pending transfer.
    function transferProjectOwnership(uint256 projectId, address newOwner)
        external
        onlyProjectOwner(projectId)
    {
        _projects[projectId].pendingOwner = newOwner;
        emit ProjectOwnershipTransferStarted(projectId, msg.sender, newOwner);
    }

    /// @notice Completes an ownership transfer. Clears all approvers set by the previous owner.
    function acceptProjectOwnership(uint256 projectId) external {
        Project storage project = _projects[projectId];
        if (project.owner == address(0)) revert ProjectNotFound(projectId);
        if (msg.sender != project.pendingOwner) revert NotPendingOwner(projectId, msg.sender);

        address previousOwner = project.owner;
        project.owner = msg.sender;
        delete project.pendingOwner;
        _approverEpoch[projectId]++;
        emit ProjectOwnershipTransferred(projectId, previousOwner, msg.sender);
        emit ApproversCleared(projectId);
    }

    // ---------------------------------------------------------------------
    // Funding
    // ---------------------------------------------------------------------

    /// @notice Adds funds to a project's available reward pool.
    /// @dev Anyone may fund a project; deposited funds are controlled by the project owner
    ///      until they are allocated to a bounty or an approved reward.
    ///      For native projects send exactly `amount` as `msg.value`; for ERC-20 projects
    ///      approve this contract first and send no value.
    function deposit(uint256 projectId, uint256 amount) external payable nonReentrant whenNotPaused {
        Project storage project = _requireProject(projectId);
        if (amount == 0) revert ZeroAmount();

        address asset = project.asset;
        if (asset == NATIVE) {
            if (msg.value != amount) revert IncorrectNativeValue(amount, msg.value);
        } else {
            if (msg.value != 0) revert IncorrectNativeValue(0, msg.value);
            IERC20 token = IERC20(asset);
            uint256 balanceBefore = token.balanceOf(address(this));
            token.safeTransferFrom(msg.sender, address(this), amount);
            uint256 received = token.balanceOf(address(this)) - balanceBefore;
            if (received != amount) revert UnsupportedToken(amount, received);
        }

        ProjectBalances storage balances = _balances[projectId];
        balances.available += amount;
        balances.totalDeposited += amount;

        emit Deposited(projectId, msg.sender, amount);
    }

    /// @notice Returns unallocated funds to the owner-chosen recipient.
    /// @dev Escrowed bounties and approved rewards can never be withdrawn.
    function withdraw(uint256 projectId, uint256 amount, address to)
        external
        nonReentrant
        onlyProjectOwner(projectId)
    {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        ProjectBalances storage balances = _balances[projectId];
        _requireAvailable(projectId, balances, amount);
        balances.available -= amount;
        balances.totalWithdrawn += amount;

        emit Withdrawn(projectId, to, amount);
        _transferOut(_projects[projectId].asset, to, amount);
    }

    // ---------------------------------------------------------------------
    // Bounties
    // ---------------------------------------------------------------------

    /// @notice Escrows `amount` of available funds as a fixed bounty.
    /// @param deadline Earliest time after which the owner may cancel the bounty if unawarded.
    function createBounty(uint256 projectId, uint256 amount, uint64 deadline)
        external
        whenNotPaused
        onlyProjectOwner(projectId)
        returns (uint256 bountyId)
    {
        if (amount == 0) revert ZeroAmount();
        // Deadlines are coarse (days); validator timestamp drift is irrelevant.
        // forge-lint: disable-next-line(block-timestamp)
        if (deadline <= block.timestamp) revert InvalidDeadline(deadline);

        ProjectBalances storage balances = _balances[projectId];
        _requireAvailable(projectId, balances, amount);
        balances.available -= amount;
        balances.escrowed += amount;

        bountyId = ++bountyCount;
        _bounties[bountyId] = Bounty({
            projectId: projectId,
            amount: amount,
            deadline: deadline,
            status: BountyStatus.Open,
            contributionRef: bytes32(0)
        });

        emit BountyCreated(bountyId, projectId, amount, deadline);
    }

    /// @notice Releases an unawarded bounty's escrow back to the available pool after its deadline.
    function cancelBounty(uint256 bountyId) external {
        Bounty storage bounty = _requireBounty(bountyId);
        uint256 projectId = bounty.projectId;
        _requireProjectOwner(projectId);
        if (bounty.status != BountyStatus.Open) revert BountyNotOpen(bountyId);
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp <= bounty.deadline) revert BountyNotExpired(bountyId, bounty.deadline);

        bounty.status = BountyStatus.Cancelled;
        ProjectBalances storage balances = _balances[projectId];
        balances.escrowed -= bounty.amount;
        balances.available += bounty.amount;

        emit BountyCancelled(bountyId, projectId, bounty.amount);
    }

    // ---------------------------------------------------------------------
    // Contribution approvals
    // ---------------------------------------------------------------------

    /// @notice Approves a reward for an accepted contribution, paid from the project's available pool.
    /// @param contributionRef Reference unique within the project, e.g. keccak256("github:<repoId>:<prNumber>").
    function approveContribution(
        uint256 projectId,
        bytes32 contributionRef,
        address contributor,
        uint256 amount
    ) external whenNotPaused onlyApprover(projectId) {
        if (amount == 0) revert ZeroAmount();

        ProjectBalances storage balances = _balances[projectId];
        _requireAvailable(projectId, balances, amount);
        balances.available -= amount;
        balances.committed += amount;

        _recordContribution(projectId, contributionRef, contributor, amount, 0);
    }

    /// @notice Awards an open bounty to an accepted contribution.
    function awardBounty(uint256 bountyId, bytes32 contributionRef, address contributor)
        external
        whenNotPaused
    {
        Bounty storage bounty = _requireBounty(bountyId);
        uint256 projectId = bounty.projectId;
        _requireApprover(projectId);
        if (bounty.status != BountyStatus.Open) revert BountyNotOpen(bountyId);

        uint256 amount = bounty.amount;
        bounty.status = BountyStatus.Awarded;
        bounty.contributionRef = contributionRef;

        ProjectBalances storage balances = _balances[projectId];
        balances.escrowed -= amount;
        balances.committed += amount;

        _recordContribution(projectId, contributionRef, contributor, amount, bountyId);
    }

    // ---------------------------------------------------------------------
    // Claims
    // ---------------------------------------------------------------------

    /// @notice Pays an approved reward. Only the contributor can claim, to any recipient they choose.
    function claim(uint256 projectId, bytes32 contributionRef, address to) external nonReentrant {
        if (to == address(0)) revert ZeroAddress();

        Contribution storage contribution = _contributions[projectId][contributionRef];
        if (contribution.status != ContributionStatus.Approved) {
            revert NotClaimable(projectId, contributionRef);
        }
        if (msg.sender != contribution.contributor) {
            revert NotContributor(projectId, contributionRef, msg.sender);
        }

        uint256 amount = contribution.amount;

        contribution.status = ContributionStatus.Claimed;
        ProjectBalances storage balances = _balances[projectId];
        balances.committed -= amount;
        balances.totalPaid += amount;

        emit RewardClaimed(projectId, contributionRef, msg.sender, to, amount);
        _transferOut(_projects[projectId].asset, to, amount);
    }

    // ---------------------------------------------------------------------
    // Platform admin
    // ---------------------------------------------------------------------

    /// @notice Halts new registrations, deposits, bounties and approvals. Never blocks claims or withdrawals.
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function getProject(uint256 projectId) external view returns (Project memory) {
        return _projects[projectId];
    }

    function getBalances(uint256 projectId) external view returns (ProjectBalances memory) {
        return _balances[projectId];
    }

    function getBounty(uint256 bountyId) external view returns (Bounty memory) {
        return _bounties[bountyId];
    }

    function getContribution(uint256 projectId, bytes32 contributionRef)
        external
        view
        returns (Contribution memory)
    {
        return _contributions[projectId][contributionRef];
    }

    /// @notice Whether `account` may approve contributions for the project (the owner always can).
    function isApprover(uint256 projectId, address account) public view returns (bool) {
        address projectOwner = _projects[projectId].owner;
        return projectOwner != address(0)
            && (account == projectOwner || _approvers[projectId][_approverEpoch[projectId]][account]);
    }

    // ---------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------

    function _recordContribution(
        uint256 projectId,
        bytes32 contributionRef,
        address contributor,
        uint256 amount,
        uint256 bountyId
    ) private {
        if (contributionRef == bytes32(0)) revert InvalidContributionRef();
        if (_contributions[projectId][contributionRef].status != ContributionStatus.None) {
            revert ContributionExists(projectId, contributionRef);
        }
        // The owner cannot reward themselves: that would bypass bounty escrow rules.
        if (
            contributor == address(0) || contributor == address(this)
                || contributor == _projects[projectId].owner
        ) {
            revert InvalidContributor(contributor);
        }

        _contributions[projectId][contributionRef] = Contribution({
            contributor: contributor, amount: amount, bountyId: bountyId, status: ContributionStatus.Approved
        });

        emit ContributionApproved(
            projectId,
            contributionRef,
            contributor,
            amount,
            bountyId,
            _projects[projectId].policyHash,
            msg.sender
        );
    }

    function _transferOut(address asset, address to, uint256 amount) private {
        if (asset == NATIVE) {
            // `to` is chosen only by the contributor (claim) or the project owner (withdraw),
            // after all state updates, under the reentrancy guard.
            // forge-lint: disable-next-line(arbitrary-send-eth)
            (bool success,) = to.call{value: amount}("");
            if (!success) revert NativeTransferFailed();
        } else {
            IERC20(asset).safeTransfer(to, amount);
        }
    }

    function _requireProject(uint256 projectId) private view returns (Project storage project) {
        project = _projects[projectId];
        if (project.owner == address(0)) revert ProjectNotFound(projectId);
    }

    function _requireProjectOwner(uint256 projectId) private view {
        if (_requireProject(projectId).owner != msg.sender) revert NotProjectOwner(projectId, msg.sender);
    }

    function _requireApprover(uint256 projectId) private view {
        _requireProject(projectId);
        if (!isApprover(projectId, msg.sender)) revert NotApprover(projectId, msg.sender);
    }

    function _requireBounty(uint256 bountyId) private view returns (Bounty storage bounty) {
        bounty = _bounties[bountyId];
        if (bounty.status == BountyStatus.None) revert BountyNotFound(bountyId);
    }

    function _requireAvailable(uint256 projectId, ProjectBalances storage balances, uint256 amount)
        private
        view
    {
        if (amount > balances.available) {
            revert InsufficientAvailable(projectId, amount, balances.available);
        }
    }
}
