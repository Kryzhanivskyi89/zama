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

/// @title SecretWeightGuess
/// @notice Контракт зберігає зашифрований "вагу предмета", гравець шифрує оцінку і отримує 0/1/2:
///         0 = very close, 1 = close, 2 = far (encrypted).
contract SecretWeightGuess is ZamaEthereumConfig {

    euint16 private secretWeight;
    bool private weightSet;

    // зашифрований рівень близькості останньої спроби
    mapping(address => euint8) private lastFeedback;
    mapping(address => bool) private hasFeedback;

    event WeightSet(address indexed setter);
    event GuessSubmitted(address indexed player, bytes32 feedbackHandle);
    event FeedbackMadePublic(address indexed player, bytes32 feedbackHandle);

    constructor() {}

    /// @notice Адмін встановлює зашифрований weight (наприклад, 0–10000)
    function setSecretWeight(
        externalEuint16 encWeight,
        bytes calldata attestation
    ) external {
        euint16 w = FHE.fromExternal(encWeight, attestation);
        secretWeight = w;
        weightSet = true;

        FHE.allowThis(secretWeight);

        emit WeightSet(msg.sender);
    }

    /// @notice Гравець подає зашифровану оцінку, контракт повертає 0/1/2:
    /// 0 = very close, 1 = close, 2 = far
    function submitGuess(
        externalEuint16 encGuess,
        bytes calldata attestation
    ) external returns (bytes32) {
        require(weightSet, "weight not set");

        euint16 guess = FHE.fromExternal(encGuess, attestation);
        euint16 target = secretWeight;

        // |guess - target|
        euint16 maxVal = FHE.max(guess, target);
        euint16 minVal = FHE.min(guess, target);
        euint16 diff = FHE.sub(maxVal, minVal);

        // Пороги близькості:
        // very close: diff <= t1
        // close: diff <= t2 (але > t1)
        // far: diff > t2
        euint16 t1 = FHE.asEuint16(5);    // дуже близько
        euint16 t2 = FHE.asEuint16(20);   // близько

        ebool diff_le_t1 = FHE.le(diff, t1);
        ebool diff_le_t2 = FHE.le(diff, t2);

        ebool isVeryClose = diff_le_t1;
        ebool isCloseRaw = diff_le_t2;
        ebool isClose = FHE.and(isCloseRaw, FHE.not(isVeryClose));

        ebool isFar = FHE.and(
            FHE.not(isVeryClose),
            FHE.not(isClose)
        );

        euint8 zero = FHE.asEuint8(0); // very close
        euint8 one = FHE.asEuint8(1);  // close
        euint8 two = FHE.asEuint8(2);  // far

        // мапимо до 0/1/2
        euint8 tmp = FHE.select(isClose, one, two);    // close → 1, else 2
        euint8 level = FHE.select(isVeryClose, zero, tmp);

        lastFeedback[msg.sender] = level;
        hasFeedback[msg.sender] = true;

        FHE.allow(lastFeedback[msg.sender], msg.sender);
        FHE.allowThis(lastFeedback[msg.sender]);

        bytes32 handle = FHE.toBytes32(lastFeedback[msg.sender]);
        emit GuessSubmitted(msg.sender, handle);
        return handle;
    }

    /// @notice Зробити свій останній feedback публічно дешифровним
    function makeMyFeedbackPublic() external {
        require(hasFeedback[msg.sender], "no feedback");
        FHE.makePubliclyDecryptable(lastFeedback[msg.sender]);
        emit FeedbackMadePublic(msg.sender, FHE.toBytes32(lastFeedback[msg.sender]));
    }

    /// @notice Отримати bytes32 handle останнього feedback
    function feedbackHandle(address player) external view returns (bytes32) {
        require(hasFeedback[player], "no feedback");
        return FHE.toBytes32(lastFeedback[player]);
    }

    function hasWeight() external view returns (bool) {
        return weightSet;
    }

    function hasPlayerFeedback(address player) external view returns (bool) {
        return hasFeedback[player];
    }
}
