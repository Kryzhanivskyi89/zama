// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/* Zama FHEVM */
import {
    FHE,
    ebool,
    euint8,
    euint16,
    externalEuint8
} from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title PrivateCoinFlipperVsHouse
/// @notice Користувач шифрує вибір (0=heads,1=tails), контракт зберігає зашифрований house bias та
///         веде зашифрований лічильник перемог; повертає 0=lose,1=win,2=push.
contract PrivateCoinFlipperVsHouse is ZamaEthereumConfig {

    // зашифрований bias монети дому: 0=heads, 1=tails
    euint8 private houseBias;
    bool private biasSet;

    // зашифрований лічильник перемог гравця проти дому
    mapping(address => euint16) private wins;
    mapping(address => bool) private hasWins;

    // зашифрований результат останнього фліпу гравця
    mapping(address => euint8) private lastResult;
    mapping(address => bool) private hasResult;

    event BiasSet(address indexed setter);
    event FlipPlayed(address indexed player, bytes32 resultHandle);
    event ResultMadePublic(address indexed player, bytes32 resultHandle);
    event WinsMadePublic(address indexed player, bytes32 winsHandle);

    constructor() {}

    /// @notice Дім встановлює зашифрований bias монети: 0=heads,1=tails
    function setHouseBias(
        externalEuint8 encBias,
        bytes calldata attestation
    ) external {
        euint8 b = FHE.fromExternal(encBias, attestation);
        houseBias = b;
        biasSet = true;

        FHE.allowThis(houseBias);

        emit BiasSet(msg.sender);
    }

    /// @notice Гравець шифрує свій вибір 0/1 і грає проти дому.
    /// @return bytes32 handle до euint8: 0=lose,1=win,2=push
    function playFlip(
        externalEuint8 encChoice,
        bytes calldata attestation
    ) external returns (bytes32) {
        require(biasSet, "bias not set");

        // зашифрований вибір гравця
        euint8 choice = FHE.fromExternal(encChoice, attestation);
        euint8 bias = houseBias;

        // для різноманітності додамо простий encrypted "push":
        // push, якщо choice XOR bias == 0 (тобто choice==bias) І при цьому wins вже >= 10
        ebool sameSide = FHE.eq(choice, bias);

        euint16 currentWins;
        if (!hasWins[msg.sender]) {
            currentWins = FHE.asEuint16(0);
            hasWins[msg.sender] = true;
            wins[msg.sender] = currentWins;
        } else {
            currentWins = wins[msg.sender];
        }

        euint16 ten = FHE.asEuint16(10);
        ebool manyWins = FHE.ge(currentWins, ten);

        ebool pushCond = FHE.and(sameSide, manyWins);

        // базовий виграш: win, якщо choice == bias (і не push)
        ebool winRaw = sameSide;
        ebool winCond = FHE.and(winRaw, FHE.not(pushCond));

        // флаг: 0=lose,1=win,2=push
        euint8 zero = FHE.asEuint8(0);
        euint8 one = FHE.asEuint8(1);
        euint8 two = FHE.asEuint8(2);

        euint8 tmp = FHE.select(winCond, one, zero);
        euint8 resultFlag = FHE.select(pushCond, two, tmp);

        // оновити encrypted wins
        euint16 one16 = FHE.asEuint16(1);
        ebool isWinBool = winCond;
        euint16 inc = FHE.select(isWinBool, one16, FHE.asEuint16(0));
        euint16 newWins = FHE.add(currentWins, inc);
        wins[msg.sender] = newWins;

        lastResult[msg.sender] = resultFlag;
        hasResult[msg.sender] = true;

        // дозволи
        FHE.allow(wins[msg.sender], msg.sender);
        FHE.allowThis(wins[msg.sender]);

        FHE.allow(lastResult[msg.sender], msg.sender);
        FHE.allowThis(lastResult[msg.sender]);

        bytes32 handle = FHE.toBytes32(lastResult[msg.sender]);
        emit FlipPlayed(msg.sender, handle);
        return handle;
    }

    /// @notice Зробити останній результат публічно дешифровним
    function makeMyResultPublic() external {
        require(hasResult[msg.sender], "no result");
        FHE.makePubliclyDecryptable(lastResult[msg.sender]);
        emit ResultMadePublic(msg.sender, FHE.toBytes32(lastResult[msg.sender]));
    }

    /// @notice Зробити свої wins публічно дешифровними
    function makeMyWinsPublic() external {
        require(hasWins[msg.sender], "no wins");
        FHE.makePubliclyDecryptable(wins[msg.sender]);
        emit WinsMadePublic(msg.sender, FHE.toBytes32(wins[msg.sender]));
    }

    /// @notice handle останнього результату (0/1/2)
    function resultHandle(address player) external view returns (bytes32) {
        require(hasResult[player], "no result");
        return FHE.toBytes32(lastResult[player]);
    }

    /// @notice handle encrypted перемог (uint16)
    function winsHandle(address player) external view returns (bytes32) {
        require(hasWins[player], "no wins");
        return FHE.toBytes32(wins[player]);
    }

    function hasBias() external view returns (bool) {
        return biasSet;
    }

    function hasPlayerResult(address player) external view returns (bool) {
        return hasResult[player];
    }
}
