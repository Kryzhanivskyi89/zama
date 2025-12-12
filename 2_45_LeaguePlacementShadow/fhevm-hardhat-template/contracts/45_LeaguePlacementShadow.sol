// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/* Zama FHEVM */
import { FHE, ebool, euint8, euint16, externalEuint16 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title LeaguePlacementShadow (Zama FHEVM)
/// @notice Players submit encrypted tournament score; contract computes league code (0=Iron,1=Bronze,2=Silver,3=Gold)
contract LeaguePlacementShadow is ZamaEthereumConfig {

    struct EncScore {
        euint16 value;
        bool exists;
        address owner;
    }

    mapping(address => EncScore) private scores;
    mapping(address => euint8) private leagueCode;
    mapping(address => bool) private leagueExists;

    event ScoreSubmitted(address indexed player);
    event LeagueComputed(address indexed player, bytes32 handle);
    event LeagueMadePublic(address indexed player, bytes32 handle);

    constructor() {}

    /// @notice Player submits encrypted score (externalEuint16 + attestation)
    function submitScore(
        externalEuint16 encScore,
        bytes calldata attestation
    ) external {
        euint16 v = FHE.fromExternal(encScore, attestation);

        scores[msg.sender] = EncScore({
            value: v,
            exists: true,
            owner: msg.sender
        });

        // allow the player and this contract to access the encrypted score
        FHE.allow(scores[msg.sender].value, msg.sender);
        FHE.allowThis(scores[msg.sender].value);

        emit ScoreSubmitted(msg.sender);
    }

    /// @notice Compute player's league based on stored encrypted score
    /// thresholds are example values (customize as needed):
    /// Gold: score >= 2000
    /// Silver: score >= 1500
    /// Bronze: score >= 1000
    /// Iron: else
    function computeLeague(address player) external returns (bytes32) {
        require(scores[player].exists, "no score for player");

        euint16 sc = scores[player].value;

        // thresholds
        euint16 tBronze = FHE.asEuint16(1000);
        euint16 tSilver = FHE.asEuint16(1500);
        euint16 tGold   = FHE.asEuint16(2000);

        ebool isGold = FHE.ge(sc, tGold);
        ebool isSilver = FHE.ge(sc, tSilver);
        ebool isBronze = FHE.ge(sc, tBronze);

        euint8 zero = FHE.asEuint8(0);
        euint8 b1 = FHE.asEuint8(1);
        euint8 b2 = FHE.asEuint8(2);
        euint8 b3 = FHE.asEuint8(3);

        // start from Iron (0)
        euint8 lvl1 = FHE.select(isBronze, b1, zero);       // Bronze if >=1000
        euint8 lvl2 = FHE.select(isSilver, b2, lvl1);       // Silver if >=1500 else previous
        euint8 lvl3 = FHE.select(isGold,   b3, lvl2);       // Gold if >=2000 else previous

        leagueCode[player] = lvl3;
        leagueExists[player] = true;

        // allow player and contract to access league handle
        FHE.allow(leagueCode[player], player);
        FHE.allowThis(leagueCode[player]);

        bytes32 handle = FHE.toBytes32(leagueCode[player]);
        emit LeagueComputed(player, handle);
        return handle;
    }

    /// @notice Player can make their league publicly decryptable
    function makeMyLeaguePublic() external {
        require(leagueExists[msg.sender], "no league computed");
        FHE.makePubliclyDecryptable(leagueCode[msg.sender]);
        emit LeagueMadePublic(msg.sender, FHE.toBytes32(leagueCode[msg.sender]));
    }

    /// @notice Return bytes32 handle for player's league
    function leagueHandle(address player) external view returns (bytes32) {
        require(leagueExists[player], "no league");
        return FHE.toBytes32(leagueCode[player]);
    }

    function hasLeague(address player) external view returns (bool) {
        return leagueExists[player];
    }
}
