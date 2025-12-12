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

/// @title EncryptedPuzzleSteps
/// @notice Гравець шифрує к-сть кроків, контракт зберігає зашифрований рекорд і повертає 0/1 (новий рекорд / ні).
contract EncryptedPuzzleSteps is ZamaEthereumConfig {

    // зашифрований кращий результат по гравцю
    mapping(address => euint16) private bestSteps;
    mapping(address => bool) private hasBest;

    // зашифрований флаг 0/1 останньої спроби
    mapping(address => euint8) private lastFlag;
    mapping(address => bool) private hasFlag;

    event StepsSubmitted(address indexed player, bytes32 flagHandle);
    event FlagMadePublic(address indexed player, bytes32 flagHandle);

    constructor() {}

    /// @notice Гравець подає зашифровані steps, контракт повертає handle до 0/1 (новий рекорд / ні).
    function submitSteps(
        externalEuint16 encSteps,
        bytes calldata attestation
    ) external returns (bytes32) {
        // відновлюємо зашифрований steps
        euint16 steps = FHE.fromExternal(encSteps, attestation);

        euint8 one = FHE.asEuint8(1);
        euint8 zero = FHE.asEuint8(0);
        euint8 flag;

        if (!hasBest[msg.sender]) {
            // перший результат → автоматично новий рекорд
            bestSteps[msg.sender] = steps;
            hasBest[msg.sender] = true;
            flag = one;
        } else {
            euint16 currentBest = bestSteps[msg.sender];

            // newBest = steps < currentBest
            ebool isBetter = FHE.lt(steps, currentBest);

            // якщо кращий → оновлюємо bestSteps
            euint16 newBestSteps = FHE.select(isBetter, steps, currentBest);
            bestSteps[msg.sender] = newBestSteps;

            // флаг 0/1
            flag = FHE.select(isBetter, one, zero);
        }

        lastFlag[msg.sender] = flag;
        hasFlag[msg.sender] = true;

        // дозволяємо гравцю і контракту
        FHE.allow(bestSteps[msg.sender], msg.sender);
        FHE.allowThis(bestSteps[msg.sender]);

        FHE.allow(lastFlag[msg.sender], msg.sender);
        FHE.allowThis(lastFlag[msg.sender]);

        bytes32 handle = FHE.toBytes32(lastFlag[msg.sender]);
        emit StepsSubmitted(msg.sender, handle);
        return handle;
    }

    /// @notice Зробити останній флаг публічно дешифровним
    function makeMyFlagPublic() external {
        require(hasFlag[msg.sender], "no flag");
        FHE.makePubliclyDecryptable(lastFlag[msg.sender]);
        emit FlagMadePublic(msg.sender, FHE.toBytes32(lastFlag[msg.sender]));
    }

    /// @notice Повертає bytes32 handle останнього флагу (0/1)
    function flagHandle(address player) external view returns (bytes32) {
        require(hasFlag[player], "no flag");
        return FHE.toBytes32(lastFlag[player]);
    }

    /// @notice Чи є вже рекорд для гравця
    function hasRecord(address player) external view returns (bool) {
        return hasBest[player];
    }
}
