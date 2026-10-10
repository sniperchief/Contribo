// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {ContriboRewards} from "../src/ContriboRewards.sol";

/// @notice Deploys ContriboRewards. Not yet used: deployment is planned for a later phase.
///
/// Dry run (local simulation, nothing is broadcast):
///   CONTRIBO_ADMIN=0x... forge script script/DeployContriboRewards.s.sol
///
/// Testnet deployment (later):
///   CONTRIBO_ADMIN=0x... forge script script/DeployContriboRewards.s.sol \
///     --rpc-url monad_testnet --account monad-deployer --broadcast
contract DeployContriboRewards is Script {
    function run() external returns (ContriboRewards vault) {
        address admin = vm.envAddress("CONTRIBO_ADMIN");

        vm.startBroadcast();
        vault = new ContriboRewards(admin);
        vm.stopBroadcast();

        console.log("ContriboRewards deployed at", address(vault));
        console.log("Platform admin", admin);
    }
}
