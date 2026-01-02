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

/// @title HiddenChallengeTier
/// @notice Player encrypts the number of completed challenges; contract maps it to a tier:
///         0 = None, 1 = Rookie, 2 = Pro, 3 = Legend.
///         Only the encrypted tier code is exposed and can be publicly decrypted.
contract HiddenChallengeTier is ZamaEthereumConfig {

    struct Entry {
        euint16 completed;   // encrypted number of completed challenges
        bool hasValue;

        euint8 tier;         // 0..3 encrypted
        bool tierComputed;
        bool tierMadePublic;

        address owner;
    }

    // userId (bytes32) -> Entry
    mapping(bytes32 => Entry) private entries;

    // userId -> tier handle
    mapping(bytes32 => bytes32) private tierHandles;

    event ChallengesSubmitted(bytes32 indexed userId, address indexed owner);
    event TierComputed(bytes32 indexed userId, bytes32 tierHandle);
    event TierMadePublic(bytes32 indexed userId, bytes32 tierHandle);

    constructor() {}

    /// @notice Submit or update encrypted completed-challenges count for a user.
    function submitCompleted(
        bytes32 userId,
        externalEuint16 encCompleted,
        bytes calldata attestation
    ) external {
        Entry storage E = entries[userId];

        if (E.hasValue) {
            require(msg.sender == E.owner, "not owner");
        } else {
            E.owner = msg.sender;
            E.hasValue = true;
        }

        euint16 val = FHE.fromExternal(encCompleted, attestation);
        E.completed = val;

        // invalidate previous tier
        E.tierComputed = false;
        E.tierMadePublic = false;

        FHE.allow(E.completed, E.owner);
        FHE.allowThis(E.completed);

        emit ChallengesSubmitted(userId, E.owner);
    }

    /// @notice Compute encrypted tier based on completed challenges.
    /// Tiers (clear thresholds):
    ///   Rookie:  completed >= 1
    ///   Pro:     completed >= 10
    ///   Legend:  completed >= 50
    /// Tier encoding:
    ///   0 = None, 1 = Rookie, 2 = Pro, 3 = Legend.
    function computeTier(
        bytes32 userId,
        externalEuint16 encZero,
        bytes calldata attestation
    ) external returns (bytes32) {
        Entry storage E = entries[userId];
        require(E.hasValue, "no value submitted");

        euint16 zero16 = FHE.fromExternal(encZero, attestation);

        // clear thresholds
        uint16 rookieClear  = 1;
        uint16 proClear     = 10;
        uint16 legendClear  = 50;

        // encrypt thresholds
        euint16 rookie = FHE.asEuint16(rookieClear);
        euint16 pro    = FHE.asEuint16(proClear);
        euint16 legend = FHE.asEuint16(legendClear);

        // completed >= threshold ?
        ebool isRookie  = FHE.ge(E.completed, rookie);
        ebool isPro     = FHE.ge(E.completed, pro);
        ebool isLegend  = FHE.ge(E.completed, legend);

        // base 0..3
        euint8 zero8  = FHE.asEuint8(zero16);                // 0
        euint8 one8   = FHE.add(zero8, FHE.asEuint8(1));     // 1
        euint8 two8   = FHE.add(zero8, FHE.asEuint8(2));     // 2
        euint8 three8 = FHE.add(zero8, FHE.asEuint8(3));     // 3

        // tier = 0 by default
        euint8 tier = zero8;

        // If Rookie => at least Rookie
        tier = FHE.select(isRookie, one8, tier);
        // If Pro => upgrade to Pro
        tier = FHE.select(isPro, two8, tier);
        // If Legend => upgrade to Legend
        tier = FHE.select(isLegend, three8, tier);

        E.tier = tier;
        E.tierComputed = true;
        E.tierMadePublic = false;

        if (E.owner != address(0)) {
            FHE.allow(E.tier, E.owner);
        }
        FHE.allowThis(E.tier);

        bytes32 handle = FHE.toBytes32(E.tier);
        tierHandles[userId] = handle;

        emit TierComputed(userId, handle);
        return handle;
    }

    /// @notice Make tier publicly decryptable.
    function makeTierPublic(bytes32 userId) external {
        Entry storage E = entries[userId];
        require(E.tierComputed, "tier not computed");
        require(!E.tierMadePublic, "already public");
        require(msg.sender == E.owner, "not authorized");

        FHE.makePubliclyDecryptable(E.tier);
        E.tierMadePublic = true;

        bytes32 handle = FHE.toBytes32(E.tier);
        emit TierMadePublic(userId, handle);
    }

    /// @notice Get bytes32 handle for encrypted tier.
    function tierHandle(bytes32 userId) external view returns (bytes32) {
        require(entries[userId].tierComputed, "tier not computed");
        return FHE.toBytes32(entries[userId].tier);
    }

    function entryExists(bytes32 userId) external view returns (bool) {
        return entries[userId].hasValue;
    }

    function tierExists(bytes32 userId) external view returns (bool) {
        return entries[userId].tierComputed;
    }

    function entryOwner(bytes32 userId) external view returns (address) {
        return entries[userId].owner;
    }
}
