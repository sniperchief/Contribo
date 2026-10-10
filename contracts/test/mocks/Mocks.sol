// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ContriboRewards} from "../../src/ContriboRewards.sol";

contract MockERC20 is ERC20 {
    constructor() ERC20("Mock USD", "mUSD") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @dev Burns 1% of every transfer.
contract FeeOnTransferERC20 is ERC20 {
    constructor() ERC20("Fee Token", "FEE") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) {
            uint256 fee = value / 100;
            super._update(from, address(0), fee);
            value -= fee;
        }
        super._update(from, to, value);
    }
}

/// @dev ERC-20 that calls back into the recipient on transfer (ERC-777 style hook).
contract CallbackERC20 is ERC20 {
    constructor() ERC20("Callback Token", "CBT") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (from != address(0) && to.code.length > 0) {
            // Recipients without the hook (e.g. the vault itself) are ignored.
            try Reenterer(payable(to)).onTokenReceived() {} catch {}
        }
    }
}

/// @dev Contributor contract that tries to re-enter the vault when it receives funds.
contract Reenterer {
    ContriboRewards public immutable vault;
    bytes32 public ref;
    uint256 public projectId;
    uint8 public mode; // 0 = re-claim, 1 = withdraw
    bool public reentrySucceeded;

    constructor(ContriboRewards vault_) {
        vault = vault_;
    }

    function configure(bytes32 ref_, uint256 projectId_, uint8 mode_) external {
        ref = ref_;
        projectId = projectId_;
        mode = mode_;
    }

    function claim() external {
        vault.claim(projectId, ref, address(this));
    }

    function withdraw(uint256 amount) external {
        vault.withdraw(projectId, amount, address(this));
    }

    function register(address asset) external returns (uint256) {
        return vault.registerProject(asset, "", bytes32(0));
    }

    function onTokenReceived() external {
        _reenter();
    }

    receive() external payable {
        _reenter();
    }

    function _reenter() private {
        bool ok;
        if (mode == 0) {
            (ok,) =
                address(vault).call(abi.encodeCall(ContriboRewards.claim, (projectId, ref, address(this))));
        } else {
            (ok,) =
                address(vault).call(abi.encodeCall(ContriboRewards.withdraw, (projectId, 1, address(this))));
        }
        if (ok) reentrySucceeded = true;
    }
}

/// @dev Rejects all native transfers.
contract RejectingReceiver {
    receive() external payable {
        revert("no thanks");
    }
}
