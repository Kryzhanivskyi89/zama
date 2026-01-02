// SPDX-License-Identifier: MIT
// pragma solidity ^0.8.27;

import { FHE, euint16, externalEuint16 } from "@fhevm/solidity/lib/FHE.sol";
// import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract PrivateTrustChain is ZamaEthereumConfig {
    struct Chain {
        bool exists;
        euint16 trustScore;     // encrypted accumulated trust
        uint256 links;          // count of links in chain
    }

    mapping(bytes32 => Chain) private chains;

    event TrustAdded(bytes32 indexed chainId, uint256 newLength);
    event MadePublic(bytes32 indexed chainId);

    /// @notice Create chain if not exists
    function initChain(bytes32 chainId) public {
        Chain storage C = chains[chainId];
        require(!C.exists, "exists");

        C.exists = true;
        C.trustScore = FHE.asEuint16(0);
        C.links = 0;

        FHE.allowThis(C.trustScore);
    }

    /// @notice Supplier adds encrypted trust score for previous supplier
    function addTrust(
        bytes32 chainId,
        externalEuint16 extTrust,
        bytes calldata att
    ) external {
        Chain storage C = chains[chainId];

        if (!C.exists) {
            C.exists = true;
            C.trustScore = FHE.asEuint16(0);
            FHE.allowThis(C.trustScore);
        }

        euint16 t = FHE.fromExternal(extTrust, att);
        euint16 newSum = FHE.add(C.trustScore, t);

        C.trustScore = newSum;
        FHE.allowThis(C.trustScore);

        C.links++;

        emit TrustAdded(chainId, C.links);
    }

    function makePublic(bytes32 chainId) external {
        Chain storage C = chains[chainId];
        require(C.exists, "no");

        FHE.makePubliclyDecryptable(C.trustScore);
        emit MadePublic(chainId);
    }

    function trustHandle(bytes32 chainId) external view returns (bytes32) {
        Chain storage C = chains[chainId];
        require(C.exists, "no");
        return FHE.toBytes32(C.trustScore);
    }

    function links(bytes32 chainId) external view returns (uint256) {
        return chains[chainId].links;
    }
}
