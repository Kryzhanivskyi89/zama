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

/// @title PrivateChessRatingGate
/// @notice Гравець шифрує свій ELO, контракт зберігає encrypted рейтинг і для кожного турніру повертає 0/1: допущен / ні.
contract PrivateChessRatingGate is ZamaEthereumConfig {

    // зашифрований рейтинг по гравцю
    mapping(address => euint16) private rating;
    mapping(address => bool) private hasRating;

    // зашифрований останній флаг для (гравець, турнір)
    mapping(bytes32 => euint8) private lastGateFlag; // 0/1
    mapping(bytes32 => bool) private hasGateFlag;

    event RatingSubmitted(address indexed player);
    event GateChecked(address indexed player, bytes32 indexed tournamentId, bytes32 flagHandle);
    event GateFlagMadePublic(address indexed player, bytes32 indexed tournamentId, bytes32 flagHandle);

    constructor() {}

    /// @notice Гравець подає зашифрований рейтинг ELO
    function submitRating(
        externalEuint16 encRating,
        bytes calldata attestation
    ) external {
        euint16 r = FHE.fromExternal(encRating, attestation);

        rating[msg.sender] = r;
        hasRating[msg.sender] = true;

        FHE.allow(rating[msg.sender], msg.sender);
        FHE.allowThis(rating[msg.sender]);

        emit RatingSubmitted(msg.sender);
    }

    /// @notice Перевірити, чи рейтинг гравця >= зашифрованого порогу для турніру.
    /// @param tournamentId bytes32 ідентифікатор турніру (frontend генерує / задає)
    /// @param encThreshold externalEuint16 зашифрований rating threshold
    /// @param attestation attestation з relayer.encrypt
    /// @return bytes32 handle до euint8: 1 = допущен, 0 = не допущен
    function checkGate(
        bytes32 tournamentId,
        externalEuint16 encThreshold,
        bytes calldata attestation
    ) external returns (bytes32) {
        require(hasRating[msg.sender], "no rating");

        euint16 thr = FHE.fromExternal(encThreshold, attestation);
        euint16 r = rating[msg.sender];

        // accessGranted = r >= thr
        ebool geThr = FHE.ge(r, thr);

        euint8 one = FHE.asEuint8(1);
        euint8 zero = FHE.asEuint8(0);
        euint8 flag = FHE.select(geThr, one, zero);

        bytes32 key = keccak256(abi.encodePacked(msg.sender, tournamentId));
        lastGateFlag[key] = flag;
        hasGateFlag[key] = true;

        FHE.allow(lastGateFlag[key], msg.sender);
        FHE.allowThis(lastGateFlag[key]);

        bytes32 handle = FHE.toBytes32(lastGateFlag[key]);
        emit GateChecked(msg.sender, tournamentId, handle);
        return handle;
    }

    /// @notice Зробити флаг для турніру публічно дешифровним
    function makeGateFlagPublic(bytes32 tournamentId) external {
        bytes32 key = keccak256(abi.encodePacked(msg.sender, tournamentId));
        require(hasGateFlag[key], "no flag");
        FHE.makePubliclyDecryptable(lastGateFlag[key]);
        emit GateFlagMadePublic(msg.sender, tournamentId, FHE.toBytes32(lastGateFlag[key]));
    }

    /// @notice Повернути bytes32 handle флагу для (msg.sender, tournamentId)
    function gateFlagHandle(bytes32 tournamentId) external view returns (bytes32) {
        bytes32 key = keccak256(abi.encodePacked(msg.sender, tournamentId));
        require(hasGateFlag[key], "no flag");
        return FHE.toBytes32(lastGateFlag[key]);
    }

    /// @notice Чи є рейтинг у гравця
    function hasRatingFor(address player) external view returns (bool) {
        return hasRating[player];
    }
}
