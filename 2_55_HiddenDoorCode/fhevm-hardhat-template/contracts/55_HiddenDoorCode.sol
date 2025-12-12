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

/// @title HiddenDoorCode
/// @notice Контракт зберігає зашифрований код (1–9999), гравець шифрує спробу; відповідь: 0=correct,1=too low,2=too high.
contract HiddenDoorCode is ZamaEthereumConfig {

    euint16 private secretCode;
    bool private codeSet;

    // зашифрований результат останньої спроби по гравцю
    mapping(address => euint8) private lastResult;
    mapping(address => bool) private hasResult;

    event CodeSet(address indexed owner);
    event GuessSubmitted(address indexed player, bytes32 resultHandle);
    event ResultMadePublic(address indexed player, bytes32 resultHandle);

    constructor() {}

    /// @notice Адмін встановлює зашифрований код (1–9999)
    function setSecretCode(
        externalEuint16 encCode,
        bytes calldata attestation
    ) external {
        euint16 code = FHE.fromExternal(encCode, attestation);
        secretCode = code;
        codeSet = true;

        FHE.allowThis(secretCode);

        emit CodeSet(msg.sender);
    }

    /// @notice Гравець подає зашифровану спробу, контракт повертає handle на 0/1/2:
    /// 0 = correct, 1 = guess < code (too low), 2 = guess > code (too high)
    function submitGuess(
        externalEuint16 encGuess,
        bytes calldata attestation
    ) external returns (bytes32) {
        require(codeSet, "code not set");

        euint16 guess = FHE.fromExternal(encGuess, attestation);
        euint16 code = secretCode;

        ebool isEq = FHE.eq(guess, code);
        ebool isLt = FHE.lt(guess, code);
        ebool isGt = FHE.gt(guess, code);

        euint8 zero = FHE.asEuint8(0); // correct
        euint8 one = FHE.asEuint8(1);  // low
        euint8 two = FHE.asEuint8(2);  // high

        // default 0, if low -> 1, if high -> 2 (але eq має пріоритет)
        euint8 tmp = FHE.select(isLt, one, zero);
        euint8 tmp2 = FHE.select(isGt, two, tmp);
        euint8 res = FHE.select(isEq, zero, tmp2);

        lastResult[msg.sender] = res;
        hasResult[msg.sender] = true;

        FHE.allow(lastResult[msg.sender], msg.sender);
        FHE.allowThis(lastResult[msg.sender]);

        bytes32 handle = FHE.toBytes32(lastResult[msg.sender]);
        emit GuessSubmitted(msg.sender, handle);
        return handle;
    }

    /// @notice Зробити свій останній результат публічно дешифровним
    function makeMyResultPublic() external {
        require(hasResult[msg.sender], "no result");
        FHE.makePubliclyDecryptable(lastResult[msg.sender]);
        emit ResultMadePublic(msg.sender, FHE.toBytes32(lastResult[msg.sender]));
    }

    /// @notice Отримати bytes32 handle останнього результату
    function resultHandle(address player) external view returns (bytes32) {
        require(hasResult[player], "no result");
        return FHE.toBytes32(lastResult[player]);
    }

    function hasCode() external view returns (bool) {
        return codeSet;
    }

    function hasPlayerResult(address player) external view returns (bool) {
        return hasResult[player];
    }
}
