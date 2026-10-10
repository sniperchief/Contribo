// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {ContriboRewards} from "../src/ContriboRewards.sol";
import {IContriboRewards} from "../src/interfaces/IContriboRewards.sol";
import {MockERC20} from "./mocks/Mocks.sol";

abstract contract BaseTest is Test {
    ContriboRewards internal vault;
    MockERC20 internal token;

    address internal admin = makeAddr("admin");
    address internal founder = makeAddr("founder");
    address internal approver = makeAddr("approver");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal mallory = makeAddr("mallory");

    bytes32 internal constant POLICY_V1 = keccak256("contribo:policy:v1");
    bytes32 internal constant REF_1 = keccak256("github:1001:1");
    bytes32 internal constant REF_2 = keccak256("github:1001:2");

    address internal constant NATIVE = address(0);

    function setUp() public virtual {
        vault = new ContriboRewards(admin);
        token = new MockERC20();
        vm.deal(founder, 1_000_000 ether);
        vm.deal(mallory, 1_000 ether);
        token.mint(founder, 1_000_000 ether);
        vm.prank(founder);
        token.approve(address(vault), type(uint256).max);
    }

    function _register(address asset) internal returns (uint256 projectId) {
        vm.prank(founder);
        projectId = vault.registerProject(asset, "https://contribo.dev/p/example", POLICY_V1);
    }

    function _registerFunded(address asset, uint256 amount) internal returns (uint256 projectId) {
        projectId = _register(asset);
        _deposit(projectId, asset, amount);
    }

    function _deposit(uint256 projectId, address asset, uint256 amount) internal {
        vm.prank(founder);
        vault.deposit{value: asset == NATIVE ? amount : 0}(projectId, amount);
    }

    function _assertBalances(
        uint256 projectId,
        uint256 available,
        uint256 escrowed,
        uint256 committed,
        uint256 deposited,
        uint256 paid,
        uint256 withdrawn
    ) internal view {
        IContriboRewards.ProjectBalances memory b = vault.getBalances(projectId);
        assertEq(b.available, available, "available");
        assertEq(b.escrowed, escrowed, "escrowed");
        assertEq(b.committed, committed, "committed");
        assertEq(b.totalDeposited, deposited, "deposited");
        assertEq(b.totalPaid, paid, "paid");
        assertEq(b.totalWithdrawn, withdrawn, "withdrawn");
    }
}
