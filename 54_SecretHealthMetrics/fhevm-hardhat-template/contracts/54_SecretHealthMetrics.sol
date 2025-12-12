// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/* Zama FHEVM */
import { FHE,
         ebool,
         euint8,
         euint16,
         euint256,
         externalEuint8,
         externalEuint16,
         externalEuint256 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title SecretHealthMetrics (FHE)
/// @notice Citizens submit encrypted health metrics; Regions submit encrypted thresholds.
/// Contract computes encrypted match (0/1) homomorphically.
contract SecretHealthMetrics is ZamaEthereumConfig {

    struct EncProfile {
        address owner;
        euint8 ageGroup;        // e.g. 0=child,1=adult,2=senior
        euint8 bmiCategory;     // 0=normal,1=overweight,2=obese
        euint16 bpIndex;        // 0..65535
        bool exists;
    }

    uint256 public nextCitizenId;
    uint256 public nextRegionId;

    mapping(uint256 => EncProfile) private citizens;
    mapping(uint256 => EncProfile) private regions;

    // pairKey => encrypted 0/1 (euint8)
    mapping(bytes32 => euint8) private pairMatch;
    mapping(bytes32 => bool) private pairMatchExists;

    event CitizenSubmitted(uint256 indexed citizenId, address indexed owner);
    event RegionSubmitted(uint256 indexed regionId, address indexed owner);
    event MatchComputed(uint256 indexed citizenId, uint256 indexed regionId, bytes32 matchKey);
    event MatchMadePublic(uint256 indexed citizenId, uint256 indexed regionId, bytes32 matchKey);

    constructor() {
        nextCitizenId = 1;
        nextRegionId = 1;
    }

    /* ================= Submit encrypted profiles ================= */

    /// @notice Submit encrypted citizen profile
    /// @param encAgeGroup external euint8 handle
    /// @param encBmiCategory external euint8 handle
    /// @param encBpIndex external euint16 handle
    /// @param attestation coprocessors' attestation bytes
    function submitCitizen(
        externalEuint8 encAgeGroup,
        externalEuint8 encBmiCategory,
        externalEuint16 encBpIndex,
        bytes calldata attestation
    ) external returns (uint256 id) {
        euint8 age = FHE.fromExternal(encAgeGroup, attestation);
        euint8 bmi = FHE.fromExternal(encBmiCategory, attestation);
        euint16 bp = FHE.fromExternal(encBpIndex, attestation);

        id = nextCitizenId++;
        EncProfile storage P = citizens[id];
        P.owner = msg.sender;
        P.ageGroup = age;
        P.bmiCategory = bmi;
        P.bpIndex = bp;
        P.exists = true;

        // Allow the owner to decrypt/use and allow contract itself for future comps
        FHE.allow(P.ageGroup, msg.sender);
        FHE.allow(P.bmiCategory, msg.sender);
        FHE.allow(P.bpIndex, msg.sender);

        FHE.allowThis(P.ageGroup);
        FHE.allowThis(P.bmiCategory);
        FHE.allowThis(P.bpIndex);

        emit CitizenSubmitted(id, msg.sender);
    }

    /// @notice Submit encrypted region thresholds
    function submitRegion(
        externalEuint8 encMinAgeGroup,
        externalEuint8 encMaxBmiCategory,
        externalEuint16 encMaxBpIndex,
        bytes calldata attestation
    ) external returns (uint256 id) {
        euint8 minAge = FHE.fromExternal(encMinAgeGroup, attestation);
        euint8 maxBmi = FHE.fromExternal(encMaxBmiCategory, attestation);
        euint16 maxBp = FHE.fromExternal(encMaxBpIndex, attestation);

        id = nextRegionId++;
        EncProfile storage P = regions[id];
        P.owner = msg.sender;
        P.ageGroup = minAge; // interpret as minAgeGroup
        P.bmiCategory = maxBmi; // interpret as maxBmiCategory
        P.bpIndex = maxBp; // interpret as maxBpIndex
        P.exists = true;

        // Allow the owner and this contract to access encrypted fields
        FHE.allow(P.ageGroup, msg.sender);
        FHE.allow(P.bmiCategory, msg.sender);
        FHE.allow(P.bpIndex, msg.sender);

        FHE.allowThis(P.ageGroup);
        FHE.allowThis(P.bmiCategory);
        FHE.allowThis(P.bpIndex);

        emit RegionSubmitted(id, msg.sender);
    }

    /* ================= Compute match homomorphically ================= */

    /// @notice Compute encrypted match between citizen and region
    /// Logic:
    ///   - ageOk = citizen.ageGroup >= region.ageGroup (minAge)
    ///   - bmiOk = citizen.bmiCategory <= region.bmiCategory (maxBmi)
    ///   - bpOk  = citizen.bpIndex <= region.bpIndex (maxBp)
    /// overallMatch = ageOk AND bmiOk AND bpOk
    function computeHealthMatch(
        uint256 citizenId,
        uint256 regionId
    ) external returns (bytes32) {
        require(citizens[citizenId].exists, "no citizen");
        require(regions[regionId].exists, "no region");

        EncProfile storage C = citizens[citizenId];
        EncProfile storage R = regions[regionId];

        // comparisons
        ebool ageOk = FHE.ge(C.ageGroup, R.ageGroup);        // citizen.age >= region.minAge
        ebool bmiOk = FHE.le(C.bmiCategory, R.bmiCategory);  // citizen.bmi <= region.maxBmi
        ebool bpOk  = FHE.le(C.bpIndex, R.bpIndex);          // citizen.bpIndex <= region.maxBp

        ebool tmp = FHE.and(ageOk, bmiOk);
        ebool matchBool = FHE.and(tmp, bpOk);

        // convert to euint8 (0/1) to store
        euint8 one = FHE.asEuint8(1);
        euint8 zero8 = FHE.asEuint8(0);
        euint8 matchVal = FHE.select(matchBool, one, zero8);

        bytes32 pairKey = keccak256(abi.encodePacked(citizenId, regionId));
        pairMatch[pairKey] = matchVal;
        pairMatchExists[pairKey] = true;

        // Allow both parties to access/decrypt the result if desired
        FHE.allow(pairMatch[pairKey], citizens[citizenId].owner);
        FHE.allow(pairMatch[pairKey], regions[regionId].owner);
        FHE.allowThis(pairMatch[pairKey]);

        emit MatchComputed(citizenId, regionId, pairKey);

        return FHE.toBytes32(pairMatch[pairKey]);
    }

    /// @notice Make previously computed match publicly decryptable
    function makeMatchPublic(uint256 citizenId, uint256 regionId) external {
        bytes32 pairKey = keccak256(abi.encodePacked(citizenId, regionId));
        require(pairMatchExists[pairKey], "no match computed");

        EncProfile storage C = citizens[citizenId];
        EncProfile storage R = regions[regionId];

        // only allow owners to set public (policy)
        require(msg.sender == C.owner || msg.sender == R.owner, "not authorized");

        FHE.makePubliclyDecryptable(pairMatch[pairKey]);

        emit MatchMadePublic(citizenId, regionId, pairKey);
    }

    /// @notice Return bytes32 handle for a previously computed match
    function matchHandle(uint256 citizenId, uint256 regionId) external view returns (bytes32) {
        bytes32 pairKey = keccak256(abi.encodePacked(citizenId, regionId));
        require(pairMatchExists[pairKey], "no match");
        return FHE.toBytes32(pairMatch[pairKey]);
    }

    /* ================= Helpers / getters ================= */

    function citizenOwner(uint256 citizenId) external view returns (address) {
        return citizens[citizenId].owner;
    }

    function regionOwner(uint256 regionId) external view returns (address) {
        return regions[regionId].owner;
    }

    function citizenExists(uint256 citizenId) external view returns (bool) {
        return citizens[citizenId].exists;
    }

    function regionExists(uint256 regionId) external view returns (bool) {
        return regions[regionId].exists;
    }
}
