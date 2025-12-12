// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/* Zama FHEVM */
import { FHE, ebool, euint8, externalEuint8 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title EncryptedDiceArena (Zama FHE)
/// @notice Player encrypts roll (1..6). Frontend also encrypts bot roll per-game.
///         Contract compares encrypted values and stores encrypted result:
///         0 = lose, 1 = draw, 2 = win
contract EncryptedDiceArena is ZamaEthereumConfig {

    // store last result per player (encrypted)
    mapping(address => euint8) private lastResult;
    mapping(address => bool) private resultExists;

    event RoundPlayed(address indexed player, bytes32 resultHandle);
    event ResultMadePublic(address indexed player, bytes32 resultHandle);

    constructor() {}

    /// @notice Play a round: submit player's encrypted roll and bot's encrypted roll (both external).
    /// @param encPlayer external encrypted player roll (externalEuint8)
    /// @param encBot external encrypted bot roll (externalEuint8)
    /// @param attestation attestation bytes for fromExternal
    /// @return bytes32 handle to encrypted result
    function playRound(
        externalEuint8 encPlayer,
        externalEuint8 encBot,
        bytes calldata attestation
    ) external returns (bytes32) {
        // convert external to internal encrypted handles
        euint8 p = FHE.fromExternal(encPlayer, attestation); // player's roll
        euint8 b = FHE.fromExternal(encBot, attestation);    // bot's roll

        // comparisons: gt / eq / lt
        ebool p_gt_b = FHE.gt(p, b);
        ebool p_eq_b = FHE.eq(p, b);
        // ebool p_lt_b = FHE.lt(p, b); // not needed explicitly

        // codes: 0 = lose, 1 = draw, 2 = win
        euint8 lose = FHE.asEuint8(0);
        euint8 draw = FHE.asEuint8(1);
        euint8 win  = FHE.asEuint8(2);

        // build code: default lose; if eq -> draw; if gt -> win
        euint8 tmp = FHE.select(p_eq_b, draw, lose);   // draw if equal else lose
        euint8 resultCode = FHE.select(p_gt_b, win, tmp); // win if p> b else previous

        lastResult[msg.sender] = resultCode;
        resultExists[msg.sender] = true;

        // allow player and contract to access
        FHE.allow(lastResult[msg.sender], msg.sender);
        FHE.allowThis(lastResult[msg.sender]);

        bytes32 handle = FHE.toBytes32(lastResult[msg.sender]);
        emit RoundPlayed(msg.sender, handle);
        return handle;
    }

    /// @notice Make your last result publicly decryptable
    function makeResultPublic() external {
        require(resultExists[msg.sender], "no result");
        FHE.makePubliclyDecryptable(lastResult[msg.sender]);
        emit ResultMadePublic(msg.sender, FHE.toBytes32(lastResult[msg.sender]));
    }

    /// @notice Return bytes32 handle for player's last result
    function roundHandle(address player) external view returns (bytes32) {
        require(resultExists[player], "no result");
        return FHE.toBytes32(lastResult[player]);
    }

    function hasResult(address player) external view returns (bool) {
        return resultExists[player];
    }
}
