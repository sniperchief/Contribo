// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @title IContriboRewards
/// @notice Types, events and errors for the Contribo project registry and reward vault.
interface IContriboRewards {
    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    struct Project {
        address owner;
        address pendingOwner;
        /// @dev Reward asset; `address(0)` means native MON. Fixed at registration.
        address asset;
        /// @dev Hash of the offchain reward policy currently in force (0 if none).
        bytes32 policyHash;
        string metadataURI;
    }

    /// @notice Per-project accounting. At all times:
    /// totalDeposited == available + escrowed + committed + totalPaid + totalWithdrawn
    struct ProjectBalances {
        /// @dev Unallocated funds. The only balance the owner can withdraw or allocate.
        uint256 available;
        /// @dev Funds locked in open bounties.
        uint256 escrowed;
        /// @dev Approved rewards not yet claimed. Owed to contributors.
        uint256 committed;
        uint256 totalDeposited;
        uint256 totalPaid;
        uint256 totalWithdrawn;
    }

    enum BountyStatus {
        None,
        Open,
        Awarded,
        Cancelled
    }

    struct Bounty {
        uint256 projectId;
        uint256 amount;
        /// @dev The owner may cancel an unawarded bounty only after this time.
        uint64 deadline;
        BountyStatus status;
        /// @dev Contribution that was awarded the bounty (0 until awarded).
        bytes32 contributionRef;
    }

    enum ContributionStatus {
        None,
        Approved,
        Claimed
    }

    /// @dev Keyed by (projectId, contributionRef); references are unique within a project.
    struct Contribution {
        address contributor;
        uint256 amount;
        /// @dev Bounty the reward came from, or 0 for a reward from the general pool.
        uint256 bountyId;
        ContributionStatus status;
    }

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event ProjectRegistered(
        uint256 indexed projectId,
        address indexed owner,
        address indexed asset,
        string metadataURI,
        bytes32 policyHash
    );
    event ProjectMetadataUpdated(uint256 indexed projectId, string metadataURI);
    event RewardPolicyUpdated(uint256 indexed projectId, bytes32 policyHash);
    event ApproverUpdated(uint256 indexed projectId, address indexed approver, bool allowed);
    /// @dev Emitted when ownership changes: approvers chosen by the previous owner lose their rights.
    event ApproversCleared(uint256 indexed projectId);
    event ProjectOwnershipTransferStarted(
        uint256 indexed projectId, address indexed owner, address indexed pendingOwner
    );
    event ProjectOwnershipTransferred(
        uint256 indexed projectId, address indexed previousOwner, address indexed newOwner
    );

    event Deposited(uint256 indexed projectId, address indexed from, uint256 amount);
    event Withdrawn(uint256 indexed projectId, address indexed to, uint256 amount);

    event BountyCreated(uint256 indexed bountyId, uint256 indexed projectId, uint256 amount, uint64 deadline);
    event BountyCancelled(uint256 indexed bountyId, uint256 indexed projectId, uint256 amount);

    event ContributionApproved(
        uint256 indexed projectId,
        bytes32 indexed contributionRef,
        address indexed contributor,
        uint256 amount,
        uint256 bountyId,
        bytes32 policyHash,
        address approver
    );
    event RewardClaimed(
        uint256 indexed projectId,
        bytes32 indexed contributionRef,
        address indexed contributor,
        address to,
        uint256 amount
    );

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error ZeroAddress();
    error ZeroAmount();
    error InvalidAsset(address asset);
    error ProjectNotFound(uint256 projectId);
    error NotProjectOwner(uint256 projectId, address caller);
    error NotPendingOwner(uint256 projectId, address caller);
    error NotApprover(uint256 projectId, address caller);
    error InsufficientAvailable(uint256 projectId, uint256 requested, uint256 available);
    error IncorrectNativeValue(uint256 expected, uint256 received);
    error UnsupportedToken(uint256 expected, uint256 received);
    error NativeTransferFailed();
    error InvalidContributionRef();
    error ContributionExists(uint256 projectId, bytes32 contributionRef);
    error InvalidContributor(address contributor);
    error NotClaimable(uint256 projectId, bytes32 contributionRef);
    error NotContributor(uint256 projectId, bytes32 contributionRef, address caller);
    error BountyNotFound(uint256 bountyId);
    error BountyNotOpen(uint256 bountyId);
    error InvalidDeadline(uint64 deadline);
    error BountyNotExpired(uint256 bountyId, uint64 deadline);
}
