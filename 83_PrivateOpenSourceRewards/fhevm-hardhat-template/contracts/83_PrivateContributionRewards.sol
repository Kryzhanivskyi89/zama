// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import { FHE, euint16, externalEuint16 } from "@fhevm/solidity/lib/FHE.sol";
// import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";
contract PrivateOpenSourceRewards is ZamaEthereumConfig {
    struct Project {
        bool exists;
        euint16 totalScore;     // encrypted accumulated score
        uint256 contributions;  // plain counter (for reference)
    }

    mapping(bytes32 => Project) private projects;

    event ScoreSubmitted(bytes32 indexed projectId, uint256 newCount);
    event MadePublic(bytes32 indexed projectId);

    /// @notice Create a new project (only if not exists)
    function initProject(bytes32 projectId) public {
        Project storage P = projects[projectId];
        require(!P.exists, "exists");

        P.exists = true;
        P.totalScore = FHE.asEuint16(0);
        P.contributions = 0;

        FHE.allowThis(P.totalScore);
    }

    /// @notice Submit encrypted score (0..65535)
    function submitScore(
        bytes32 projectId,
        externalEuint16 extScore,
        bytes calldata att
    ) external {
        Project storage P = projects[projectId];

        if (!P.exists) {
            // auto-create simplest possible
            P.exists = true;
            P.totalScore = FHE.asEuint16(0);
            FHE.allowThis(P.totalScore);
        }

        euint16 s = FHE.fromExternal(extScore, att);
        euint16 newSum = FHE.add(P.totalScore, s);

        P.totalScore = newSum;
        FHE.allowThis(P.totalScore);

        P.contributions++;

        emit ScoreSubmitted(projectId, P.contributions);
    }

    /// @notice Makes score publicly decryptable, allowing global `publicDecrypt`
    function makePublic(bytes32 projectId) external {
        Project storage P = projects[projectId];
        require(P.exists, "no");

        FHE.makePubliclyDecryptable(P.totalScore);

        emit MadePublic(projectId);
    }

    /// @notice Returns encrypted score handle
    function scoreHandle(bytes32 projectId) external view returns (bytes32) {
        Project storage P = projects[projectId];
        require(P.exists, "no");
        return FHE.toBytes32(P.totalScore);
    }

    /// @notice Just return number of contributions (plain)
    function contributions(bytes32 projectId) external view returns (uint256) {
        return projects[projectId].contributions;
    }
}
