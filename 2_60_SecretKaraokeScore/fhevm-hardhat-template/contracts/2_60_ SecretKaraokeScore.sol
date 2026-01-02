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

/// @title SecretKaraokeScore
/// @notice User encrypts a local karaoke score; contract maps it to a tier:
///         0 = None, 1 = Bronze, 2 = Silver, 3 = Gold.
///         ТЕПЕР: той самий userId може оновлювати свій скор скільки завгодно разів.
contract SecretKaraokeScore is ZamaEthereumConfig {

    struct Entry {
        euint16 score;
        bool hasScore;

        euint8 level;           // 0..3 encrypted
        bool levelComputed;
        bool levelMadePublic;

        address owner;
    }

    // userId (bytes32) -> Entry
    mapping(bytes32 => Entry) private entries;

    // userId -> level handle
    mapping(bytes32 => bytes32) private levelHandles;

    event ScoreSubmitted(bytes32 indexed userId, address indexed owner);
    event LevelComputed(bytes32 indexed userId, bytes32 levelHandle);
    event LevelMadePublic(bytes32 indexed userId, bytes32 levelHandle);

    constructor() {}

    /// @notice Submit or update encrypted karaoke score for a user.
    /// @dev Якщо запис уже існує, дозволяється оновлення тільки власнику.
    function submitScore(
        bytes32 userId,
        externalEuint16 encScore,
        bytes calldata attestation
    ) external {
        Entry storage E = entries[userId];

        if (E.hasScore) {
            // уже є скор – дозволяємо оновлювати тільки власнику
            require(msg.sender == E.owner, "not owner");
        } else {
            // перший сабміт
            E.owner = msg.sender;
            E.hasScore = true;
        }

        euint16 score = FHE.fromExternal(encScore, attestation);

        E.score = score;

        // Якщо рівень уже був порахований раніше – вважаємо його неактуальним
        E.levelComputed = false;
        E.levelMadePublic = false;

        FHE.allow(E.score, E.owner);
        FHE.allowThis(E.score);

        emit ScoreSubmitted(userId, E.owner);
    }

    /// @notice Compute encrypted karaoke level based on score.
    /// Tiers:
    ///   Bronze: score >= 200
    ///   Silver: score >= 500
    ///   Gold:   score >= 800
    /// Level encoding:
    ///   0 = None, 1 = Bronze, 2 = Silver, 3 = Gold.
    function computeLevel(
        bytes32 userId,
        externalEuint16 encZero,
        bytes calldata attestation
    ) external returns (bytes32) {
        Entry storage E = entries[userId];
        require(E.hasScore, "score not submitted");

        // дозволяємо будь-кому тригерити compute, або можна додати:
        // require(msg.sender == E.owner, "not owner");

        // encrypted 0 for casting to euint8
        euint16 zero16 = FHE.fromExternal(encZero, attestation);

        // Clear thresholds
        uint16 bronzeClear = 200;
        uint16 silverClear = 500;
        uint16 goldClear   = 800;

        // Encrypt thresholds inside contract
        euint16 bronze = FHE.asEuint16(bronzeClear);
        euint16 silver = FHE.asEuint16(silverClear);
        euint16 gold   = FHE.asEuint16(goldClear);

        // score >= threshold ?
        ebool isBronze = FHE.ge(E.score, bronze);
        ebool isSilver = FHE.ge(E.score, silver);
        ebool isGold   = FHE.ge(E.score, gold);

        // Base 0..3
        euint8 zero8  = FHE.asEuint8(zero16);                // 0
        euint8 one8   = FHE.add(zero8, FHE.asEuint8(1));     // 1
        euint8 two8   = FHE.add(zero8, FHE.asEuint8(2));     // 2
        euint8 three8 = FHE.add(zero8, FHE.asEuint8(3));     // 3

        // Level = 0 by default
        euint8 lvl = zero8;
        // If Bronze => at least Bronze
        lvl = FHE.select(isBronze, one8, lvl);
        // If Silver => upgrade to Silver
        lvl = FHE.select(isSilver, two8, lvl);
        // If Gold   => upgrade to Gold
        lvl = FHE.select(isGold, three8, lvl);

        E.level = lvl;
        E.levelComputed = true;
        E.levelMadePublic = false; // новий рівень ще не публічний

        if (E.owner != address(0)) {
            FHE.allow(E.level, E.owner);
        }
        FHE.allowThis(E.level);

        bytes32 handle = FHE.toBytes32(E.level);
        levelHandles[userId] = handle;

        emit LevelComputed(userId, handle);
        return handle;
    }

    /// @notice Mark encrypted level as publicly decryptable.
    function makeLevelPublic(bytes32 userId) external {
        Entry storage E = entries[userId];
        require(E.levelComputed, "level not computed");
        require(!E.levelMadePublic, "already public");
        require(msg.sender == E.owner, "not authorized");

        FHE.makePubliclyDecryptable(E.level);
        E.levelMadePublic = true;

        bytes32 handle = FHE.toBytes32(E.level);
        emit LevelMadePublic(userId, handle);
    }

    /// @notice Return bytes32 handle for encrypted level.
    function levelHandle(bytes32 userId) external view returns (bytes32) {
        require(entries[userId].levelComputed, "level not computed");
        return FHE.toBytes32(entries[userId].level);
    }

    function entryExists(bytes32 userId) external view returns (bool) {
        return entries[userId].hasScore;
    }

    function levelExists(bytes32 userId) external view returns (bool) {
        return entries[userId].levelComputed;
    }

    function entryOwner(bytes32 userId) external view returns (address) {
        return entries[userId].owner;
    }
}
