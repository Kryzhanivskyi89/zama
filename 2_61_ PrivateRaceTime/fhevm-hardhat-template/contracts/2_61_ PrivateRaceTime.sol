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

/// @title PrivateRaceTime
/// @notice User encrypts race time (seconds); contract stores encrypted personal best
///         and for each new time returns only an encrypted flag:
///         0 = not personal best, 1 = new personal best.
contract PrivateRaceTime is ZamaEthereumConfig {

    struct Runner {
        euint16 bestTime;        // encrypted best (lower is better)
        bool hasBest;

        euint8 lastFlag;         // encrypted 0/1 for last submission
        bool flagComputed;
        bool flagMadePublic;

        address owner;
    }

    // userId (bytes32) -> Runner
    mapping(bytes32 => Runner) private runners;

    // userId -> flag handle
    mapping(bytes32 => bytes32) private flagHandles;

    event TimeSubmitted(bytes32 indexed userId, address indexed owner);
    event FlagComputed(bytes32 indexed userId, bytes32 flagHandle);
    event FlagMadePublic(bytes32 indexed userId, bytes32 flagHandle);

    constructor() {}

    /// @notice Submit a new encrypted race time for userId.
    /// @param userId arbitrary bytes32 id (e.g. keccak256 of wallet or nickname)
    /// @param encTime encrypted race time as externalEuint16
    /// @param attestation relayer attestation for encTime
    function submitTime(
        bytes32 userId,
        externalEuint16 encTime,
        bytes calldata attestation
    ) external {
        Runner storage R = runners[userId];

        if (R.hasBest) {
            // запис уже існує – дозволяємо оновлення тільки власнику
            require(msg.sender == R.owner, "not owner");
        } else {
            // перший сабміт – ініціалізуємо запис
            R.owner = msg.sender;
            R.hasBest = false;   // best ще не заданий
        }

        // decrypt new time into encrypted form usable on-chain
        euint16 newTime = FHE.fromExternal(encTime, attestation);

        if (!R.hasBest) {
            // перший час – автоматично стає best
            R.bestTime = newTime;
            R.hasBest = true;
        } else {
            // порівнюємо: якщо новий час кращий (менший) – оновлюємо best
            ebool isBetter = FHE.lt(newTime, R.bestTime);
            euint16 chosen = FHE.select(isBetter, newTime, R.bestTime);
            R.bestTime = chosen;
        }

        // після submitTime ми ще не рахуємо прапор – це окремий крок computeFlag
        R.flagComputed = false;
        R.flagMadePublic = false;

        FHE.allow(R.bestTime, R.owner);
        FHE.allowThis(R.bestTime);

        emit TimeSubmitted(userId, R.owner);
    }
    /// @notice Compute encrypted flag for the last submitted time:
    ///         1 = it was a personal best, 0 = not.
    /// @dev User must provide again the same encrypted time that was just submitted.
    /// @param userId user identifier
    /// @param encTime encrypted race time as externalEuint16 (same value as in submitTime)
    /// @param attestation relayer attestation for encTime
    function computeFlag(
        bytes32 userId,
        externalEuint16 encTime,
        bytes calldata attestation
    ) external returns (bytes32) {
        Runner storage R = runners[userId];
        require(R.owner != address(0), "runner not initialized");
        require(R.hasBest, "no best time yet");

        euint16 newTime = FHE.fromExternal(encTime, attestation);

        // flag = 1 якщо newTime == bestTime, інакше 0
        ebool isBest = FHE.eq(newTime, R.bestTime);

        euint8 zero8 = FHE.asEuint8(0);
        euint8 one8  = FHE.asEuint8(1);

        euint8 flag = FHE.select(isBest, one8, zero8);

        R.lastFlag = flag;
        R.flagComputed = true;
        R.flagMadePublic = false;

        if (R.owner != address(0)) {
            FHE.allow(R.lastFlag, R.owner);
        }
        FHE.allowThis(R.lastFlag);

        bytes32 handle = FHE.toBytes32(R.lastFlag);
        flagHandles[userId] = handle;

        emit FlagComputed(userId, handle);
        return handle;
    }



    /// @notice Make the last flag publicly decryptable (0/1).
    function makeFlagPublic(bytes32 userId) external {
        Runner storage R = runners[userId];
        require(R.flagComputed, "flag not computed");
        require(!R.flagMadePublic, "already public");
        require(msg.sender == R.owner, "not authorized");

        FHE.makePubliclyDecryptable(R.lastFlag);
        R.flagMadePublic = true;

        bytes32 handle = FHE.toBytes32(R.lastFlag);
        emit FlagMadePublic(userId, handle);
    }

    /// @notice Return bytes32 handle for encrypted personal-best flag (0/1).
    function flagHandle(bytes32 userId) external view returns (bytes32) {
        require(runners[userId].flagComputed, "flag not computed");
        return FHE.toBytes32(runners[userId].lastFlag);
    }

    function hasBestTime(bytes32 userId) external view returns (bool) {
        return runners[userId].hasBest;
    }

    function flagExists(bytes32 userId) external view returns (bool) {
        return runners[userId].flagComputed;
    }

    function runnerOwner(bytes32 userId) external view returns (address) {
        return runners[userId].owner;
    }
}
