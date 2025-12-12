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

/// @title FHEJackpotThreshold
/// @notice Контракт зберігає зашифрований поріг джекпота, гравець шифрує суму/очки; відповідь: 1=jackpot ready, 0=not yet.
contract FHEJackpotThreshold is ZamaEthereumConfig {

    // зашифрований поріг джекпота
    euint16 private jackpotThreshold;
    bool private thresholdSet;

    // зашифрований флаг останньої перевірки по гравцю
    mapping(address => euint8) private lastFlag;
    mapping(address => bool) private hasFlag;

    event ThresholdSet(address indexed setter);
    event ProgressChecked(address indexed player, bytes32 flagHandle);
    event FlagMadePublic(address indexed player, bytes32 flagHandle);

    constructor() {}

    /// @notice Адмін встановлює зашифрований поріг джекпота
    function setJackpotThreshold(
        externalEuint16 encThreshold,
        bytes calldata attestation
    ) external {
        euint16 thr = FHE.fromExternal(encThreshold, attestation);
        jackpotThreshold = thr;
        thresholdSet = true;

        FHE.allowThis(jackpotThreshold);

        emit ThresholdSet(msg.sender);
    }

    /// @notice Гравець шифрує свою суму (депозити/очки), контракт повертає 1/0 (готово / ще ні)
    function checkJackpotProgress(
        externalEuint16 encAmount,
        bytes calldata attestation
    ) external returns (bytes32) {
        require(thresholdSet, "threshold not set");

        euint16 amount = FHE.fromExternal(encAmount, attestation);
        euint16 thr = jackpotThreshold;

        // ready = amount >= thr
        ebool geThr = FHE.ge(amount, thr);

        euint8 one = FHE.asEuint8(1);
        euint8 zero = FHE.asEuint8(0);
        euint8 flag = FHE.select(geThr, one, zero);

        lastFlag[msg.sender] = flag;
        hasFlag[msg.sender] = true;

        FHE.allow(lastFlag[msg.sender], msg.sender);
        FHE.allowThis(lastFlag[msg.sender]);

        bytes32 handle = FHE.toBytes32(lastFlag[msg.sender]);
        emit ProgressChecked(msg.sender, handle);
        return handle;
    }

    /// @notice Зробити свій останній флаг публічно дешифровним
    function makeMyFlagPublic() external {
        require(hasFlag[msg.sender], "no flag");
        FHE.makePubliclyDecryptable(lastFlag[msg.sender]);
        emit FlagMadePublic(msg.sender, FHE.toBytes32(lastFlag[msg.sender]));
    }

    /// @notice Отримати bytes32 handle до останнього флагу
    function flagHandle(address player) external view returns (bytes32) {
        require(hasFlag[player], "no flag");
        return FHE.toBytes32(lastFlag[player]);
    }

    function hasThreshold() external view returns (bool) {
        return thresholdSet;
    }

    function hasPlayerFlag(address player) external view returns (bool) {
        return hasFlag[player];
    }
}
