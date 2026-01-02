// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/* Zama FHEVM */
import { FHE, ebool, euint8, euint16, externalEuint8, externalEuint16 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract PrivateDonorMatch is ZamaEthereumConfig {

    // Minimal encrypted profile used for matching
    struct EncProfile {
        address owner;
        euint8 bloodType;   // e.g., 0=A,1=B,2=AB,3=O
        euint8 rh;          // 0=neg,1=pos
        euint16 hlaScore;   // aggregated HLA match score (higher = better)
        bool exists;
    }

    uint256 public nextDonorId;
    uint256 public nextRecipientId;

    mapping(uint256 => EncProfile) private donors;
    mapping(uint256 => EncProfile) private recipients;

    // store computed match result per pair key (keccak256(donorId,recipientId))
    mapping(bytes32 => euint8) private pairMatch;       // 0 / 1 encrypted
    mapping(bytes32 => bool) private pairMatchExists;

    event DonorSubmitted(uint256 indexed donorId, address indexed owner);
    event RecipientSubmitted(uint256 indexed recipientId, address indexed owner);
    event MatchComputed(uint256 indexed donorId, uint256 indexed recipientId, bytes32 matchKey);
    event MatchMadePublic(uint256 indexed donorId, uint256 indexed recipientId, bytes32 matchKey);

    constructor() {
        nextDonorId = 1;
        nextRecipientId = 1;
    }

    /* ============== Submit encrypted profiles ============== */

    /// @notice Submit encrypted donor profile
    function submitDonor(
        externalEuint8 encBloodType,
        externalEuint8 encRh,
        externalEuint16 encHlaScore,
        bytes calldata attestation
    ) external returns (uint256 id) {
        euint8 blood = FHE.fromExternal(encBloodType, attestation);
        euint8 rhv   = FHE.fromExternal(encRh, attestation);
        euint16 hla  = FHE.fromExternal(encHlaScore, attestation);

        id = nextDonorId++;
        EncProfile storage P = donors[id];
        P.owner = msg.sender;
        P.bloodType = blood;
        P.rh = rhv;
        P.hlaScore = hla;
        P.exists = true;

        // Allow the owner (user) and this contract to access the encrypted fields
        FHE.allow(P.bloodType, msg.sender);
        FHE.allow(P.rh, msg.sender);
        FHE.allow(P.hlaScore, msg.sender);

        FHE.allowThis(P.bloodType);
        FHE.allowThis(P.rh);
        FHE.allowThis(P.hlaScore);

        emit DonorSubmitted(id, msg.sender);
    }

    /// @notice Submit encrypted recipient profile (same structure)
    function submitRecipient(
        externalEuint8 encBloodType,
        externalEuint8 encRh,
        externalEuint16 encHlaScore,
        bytes calldata attestation
    ) external returns (uint256 id) {
        euint8 blood = FHE.fromExternal(encBloodType, attestation);
        euint8 rhv   = FHE.fromExternal(encRh, attestation);
        euint16 hla  = FHE.fromExternal(encHlaScore, attestation);

        id = nextRecipientId++;
        EncProfile storage P = recipients[id];
        P.owner = msg.sender;
        P.bloodType = blood;
        P.rh = rhv;
        P.hlaScore = hla;
        P.exists = true;

        // Allow the owner and this contract to access the encrypted fields
        FHE.allow(P.bloodType, msg.sender);
        FHE.allow(P.rh, msg.sender);
        FHE.allow(P.hlaScore, msg.sender);

        FHE.allowThis(P.bloodType);
        FHE.allowThis(P.rh);
        FHE.allowThis(P.hlaScore);

        emit RecipientSubmitted(id, msg.sender);
    }

    /* ============== Compute match homomorphically ============== */

    /// @notice Compute homomorphic match between a donor and a recipient.
    /// The logic below is an example: blood type equality AND rh equality AND hlaScore >= threshold.
    /// The function stores an encrypted 0/1 result and makes it available via matchHandle.
    function computeMatch(
        uint256 donorId,
        uint256 recipientId,
        externalEuint16 encryptedThreshold,
        bytes calldata attestation
    ) external returns (bytes32) {
        require(donors[donorId].exists, "no donor");
        require(recipients[recipientId].exists, "no recipient");

        EncProfile storage D = donors[donorId];
        EncProfile storage R = recipients[recipientId];

        // ✅ FIX: Decrypt the threshold from external encrypted input
        euint16 threshold = FHE.fromExternal(encryptedThreshold, attestation);

        // 1) blood type equality
        ebool bloodEq = FHE.eq(D.bloodType, R.bloodType);

        // 2) rh equality
        ebool rhEq = FHE.eq(D.rh, R.rh);

        // 3) hlaScore >= threshold
        ebool hlaOk = FHE.ge(D.hlaScore, threshold);

        // 4) overall match = bloodEq AND rhEq AND hlaOk
        ebool tmp = FHE.and(bloodEq, rhEq);
        ebool matchBool = FHE.and(tmp, hlaOk);

        // convert boolean to euint8 (0/1) so we can store as bytes32 handle if needed
        euint8 one = FHE.asEuint8(1);
        euint8 zero = FHE.asEuint8(0);
        euint8 matchVal = FHE.select(matchBool, one, zero);

        // store result under pair key (so frontends can request handle)
        bytes32 pairKey = keccak256(abi.encodePacked(donorId, recipientId));

        pairMatch[pairKey] = matchVal;
        pairMatchExists[pairKey] = true;

        // allow contract and original owners (optional) to access the encrypted result
        // Allow both donor and recipient to decrypt it if desired
        FHE.allow(pairMatch[pairKey], donors[donorId].owner);
        FHE.allow(pairMatch[pairKey], recipients[recipientId].owner);
        FHE.allowThis(pairMatch[pairKey]);

        emit MatchComputed(donorId, recipientId, pairKey);

        // return bytes32 handle that represents the encrypted match result
        return FHE.toBytes32(pairMatch[pairKey]);
    }

    /// @notice Mark the previously computed match result as publicly decryptable
    function makeMatchPublic(uint256 donorId, uint256 recipientId) external {
        bytes32 pairKey = keccak256(abi.encodePacked(donorId, recipientId));
        require(pairMatchExists[pairKey], "no match computed");

        // optional: require either donor or recipient calls this (or another policy)
        // For now allow either owner to make public
        EncProfile storage D = donors[donorId];
        EncProfile storage R = recipients[recipientId];
        require(msg.sender == D.owner || msg.sender == R.owner, "not authorized");

        FHE.makePubliclyDecryptable(pairMatch[pairKey]);

        emit MatchMadePublic(donorId, recipientId, pairKey);
    }

    /// @notice Return the bytes32 handle for a previously computed match
    function matchHandle(uint256 donorId, uint256 recipientId) external view returns (bytes32) {
        bytes32 pairKey = keccak256(abi.encodePacked(donorId, recipientId));
        require(pairMatchExists[pairKey], "no match");
        return FHE.toBytes32(pairMatch[pairKey]);
    }

    /* ============== Helpers / getters ============== */

    function donorOwner(uint256 donorId) external view returns (address) {
        return donors[donorId].owner;
    }

    function recipientOwner(uint256 recipientId) external view returns (address) {
        return recipients[recipientId].owner;
    }

    function donorExists(uint256 donorId) external view returns (bool) {
        return donors[donorId].exists;
    }

    function recipientExists(uint256 recipientId) external view returns (bool) {
        return recipients[recipientId].exists;
    }
}
