// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/* Zama FHEVM */
import {
    FHE,
    ebool,
    euint8,
    euint16,
    externalEuint16
} from "@fhevm/solidity/lib/FHE.sol";

import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract SecretMemoryMatch is ZamaEthereumConfig {

    // encrypted card
    struct EncCard {
        address owner;
        euint16 value;
        bool exists;
    }

    // mapping cardId → encrypted card
    mapping(uint256 => EncCard) private cards;

    // store encrypted match result per user
    mapping(address => euint8) private lastMatch;
    mapping(address => bool) private hasMatch;

    event CardSet(uint256 indexed cardId, address indexed owner);
    event GuessComputed(address indexed player);
    event GuessMadePublic(address indexed player);

    constructor() {
        // NO constructor args (just like your example)
    }

    /* ----------------------------------------------
             ADMIN SET ENCRYPTED CARD VALUE
       ---------------------------------------------- */

    function setCard(
        uint256 cardId,
        externalEuint16 encryptedValue,
        bytes calldata attestation
    ) external {
        require(cardId == 1 || cardId == 2, "Only card 1 or 2 allowed");

        euint16 v = FHE.fromExternal(encryptedValue, attestation);

        EncCard storage C = cards[cardId];
        C.owner = msg.sender;
        C.value = v;
        C.exists = true;

        FHE.allow(C.value, msg.sender);
        FHE.allowThis(C.value);

        emit CardSet(cardId, msg.sender);
    }

    /* ----------------------------------------------
                 PLAYER GUESS + MATCH CHECK
       ---------------------------------------------- */

    function guess(
        externalEuint16 encGuess1,
        externalEuint16 encGuess2,
        bytes calldata attestation
    ) external returns (bytes32) {
        require(cards[1].exists && cards[2].exists, "cards not ready");

        euint16 g1 = FHE.fromExternal(encGuess1, attestation);
        euint16 g2 = FHE.fromExternal(encGuess2, attestation);

        // valid guess: only two cards exist → 1 and 2
        ebool valid1 = FHE.or(
            FHE.eq(g1, FHE.asEuint16(1)),
            FHE.eq(g1, FHE.asEuint16(2))
        );

        ebool valid2 = FHE.or(
            FHE.eq(g2, FHE.asEuint16(1)),
            FHE.eq(g2, FHE.asEuint16(2))
        );

        // card values
        euint16 v1 = cards[1].value;
        euint16 v2 = cards[2].value;

        // check equality
        ebool matchBool = FHE.eq(v1, v2);

        // convert boolean → encrypted uint8
        euint8 one  = FHE.asEuint8(1);
        euint8 zero = FHE.asEuint8(0);

        euint8 matchVal = FHE.select(matchBool, one, zero);

        // save result per user
        lastMatch[msg.sender] = matchVal;
        hasMatch[msg.sender] = true;

        // allow access
        FHE.allow(matchVal, msg.sender);
        FHE.allowThis(matchVal);

        emit GuessComputed(msg.sender);

        // return bytes32 handle
        return FHE.toBytes32(matchVal);
    }

    /* ----------------------------------------------
           MAKE PUBLIC FOR publicDecrypt()
       ---------------------------------------------- */

    function makePublic(address player) external {
        require(msg.sender == player, "not authorized");
        require(hasMatch[player], "no match");

        FHE.makePubliclyDecryptable(lastMatch[player]);
        emit GuessMadePublic(player);
    }

    /* ----------------------------------------------
                     RETURN HANDLE
       ---------------------------------------------- */

    function getHandle(address player) external view returns (bytes32) {
        require(hasMatch[player], "no match");

        return FHE.toBytes32(lastMatch[player]);
    }
}
