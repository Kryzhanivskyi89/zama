// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/* Zama FHE - строго по офіційним контрактам */
import { FHE, ebool, euint64, euint8, externalEuint64, externalEbool } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract ConfidentialClientFilter is ZamaEthereumConfig {
    // Зашифрований профіль клієнта (мінімум для фільтрації)
    struct EncClient {
        address owner;
        ebool isCorporate;   // true якщо корпоративний
        euint64 turnover;    // оборот (за домовленість — у умовних одиницях)
        bool exists;
    }

    uint256 public nextClientId;
    mapping(uint256 => EncClient) private clients;

    // Збережений результат фільтрації для пари (clientId,thresholdHandle) або просто clientId
    mapping(uint256 => euint8) private clientFilterResult; // 0/1 зашифровано
    mapping(uint256 => bool) private clientFilterExists;

    event ClientSubmitted(uint256 indexed clientId, address indexed owner);
    event FilterComputed(uint256 indexed clientId, bytes32 resultHandle);
    event FilterMadePublic(uint256 indexed clientId, bytes32 resultHandle);

    constructor() {
        nextClientId = 1;
    }

    /* ============== Submit encrypted client profile ============== */

    /// @notice Користувач відправляє свої зашифровані поля як external values + attestation
    /// ATTENTION: fromExternal перевіряє атестацію (coprocessors) і grant'ить трансієнтний доступ.
    function submitClient(
        externalEbool encIsCorporate,
        externalEuint64 encTurnover,
        bytes calldata attestation
    ) external returns (uint256 clientId) {
        ebool isCorp = FHE.fromExternal(encIsCorporate, attestation);
        euint64 to   = FHE.fromExternal(encTurnover, attestation);

        clientId = nextClientId++;
        EncClient storage C = clients[clientId];
        C.owner = msg.sender;
        C.isCorporate = isCorp;
        C.turnover = to;
        C.exists = true;

        // Дати доступ власнику (щоб він міг декодувати/отримувати свої дані) і контракту
        FHE.allow(C.isCorporate, msg.sender);
        FHE.allow(C.turnover, msg.sender);

        FHE.allowThis(C.isCorporate);
        FHE.allowThis(C.turnover);

        emit ClientSubmitted(clientId, msg.sender);
    }

    /* ============== Compute filter homomorphically ============== */

    /// @notice Обчислити фільтр "isCorporate AND turnover >= threshold"
    /// threshold передається як externalEuint64 з атестацією (щоб threshold міг бути зашифрованим)
    /// Результат зберігається як euint8 (0/1) і повертається handle (bytes32) для фронтенду
    function computeFilter(
        uint256 clientId,
        externalEuint64 encryptedThreshold,
        bytes calldata attestation
    ) external returns (bytes32) {
        require(clients[clientId].exists, "no client");

        EncClient storage C = clients[clientId];

        // Дістати threshold з external value
        euint64 threshold = FHE.fromExternal(encryptedThreshold, attestation);

        // порівняння turnover >= threshold -> ebool
        ebool turnoverOk = FHE.ge(C.turnover, threshold);

        // and з прапорцем корпоративності
        ebool finalOk = FHE.and(C.isCorporate, turnoverOk);

        // Конвертуємо в euint8 (0/1) для зберігання/передачі
        euint8 one = FHE.asEuint8(1);
        euint8 zero = FHE.asEuint8(0);
        euint8 resultVal = FHE.select(finalOk, one, zero);

        clientFilterResult[clientId] = resultVal;
        clientFilterExists[clientId] = true;

        // Дати доступ власнику і цьому контракту на результат
        FHE.allow(clientFilterResult[clientId], clients[clientId].owner);
        FHE.allowThis(clientFilterResult[clientId]);

        bytes32 handle = FHE.toBytes32(clientFilterResult[clientId]);

        emit FilterComputed(clientId, handle);
        return handle;
    }

    /// @notice Зробити раніше обчислений результат публічно розшифровуваним
    /// Вимагаємо, щоб client.owner викликав цю функцію (policy можна змінити)
    function makeFilterPublic(uint256 clientId) external {
        require(clientFilterExists[clientId], "no filter");
        require(clients[clientId].exists, "no client");
        require(msg.sender == clients[clientId].owner, "not authorized");

        FHE.makePubliclyDecryptable(clientFilterResult[clientId]);
        bytes32 handle = FHE.toBytes32(clientFilterResult[clientId]);
        emit FilterMadePublic(clientId, handle);
    }

    /* ============== Getters / helpers ============== */

    function clientOwner(uint256 clientId) external view returns (address) {
        return clients[clientId].owner;
    }

    function clientExists(uint256 clientId) external view returns (bool) {
        return clients[clientId].exists;
    }

    function filterHandle(uint256 clientId) external view returns (bytes32) {
        require(clientFilterExists[clientId], "no filter");
        return FHE.toBytes32(clientFilterResult[clientId]);
    }
}
