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

/// @title Blind Freelance Matching (FHE)
/// @notice Фрілансери та замовники подають зашифровані профілі. Контракт обчислює збіг гомоморфно.
contract BlindFreelanceMatch is ZamaEthereumConfig {

    struct EncProfile {
        address owner;
        euint256 skillsMask; // bitmask: кожен біт = навичка
        euint8  level;       // наприклад: 0..255
        euint16 rateOrBudget; // ставка (freelancer) або maxBudget (job)
        bool exists;
    }

    uint256 public nextFreelancerId;
    uint256 public nextJobId;

    mapping(uint256 => EncProfile) private freelancers;
    mapping(uint256 => EncProfile) private jobs;

    // pairKey => encrypted 0/1 (euint8)
    mapping(bytes32 => euint8) private pairMatch;
    mapping(bytes32 => bool) private pairMatchExists;

    event FreelancerSubmitted(uint256 indexed freelancerId, address indexed owner);
    event JobSubmitted(uint256 indexed jobId, address indexed owner);
    event MatchComputed(uint256 indexed freelancerId, uint256 indexed jobId, bytes32 matchKey);
    event MatchMadePublic(uint256 indexed freelancerId, uint256 indexed jobId, bytes32 matchKey);

    constructor() {
        nextFreelancerId = 1;
        nextJobId = 1;
    }

    /* ================= Submit encrypted profiles ================= */

    /// @notice Submit encrypted freelancer profile
    /// @param encSkillsMask external euint256 handle (bitmask of skills)
    /// @param encLevel       external euint8 handle (experience/level)
    /// @param encRate        external euint16 handle (expected rate)
    /// @param attestation    coprocessors' attestation bytes
    function submitFreelancer(
        externalEuint256 encSkillsMask,
        externalEuint8 encLevel,
        externalEuint16 encRate,
        bytes calldata attestation
    ) external returns (uint256 id) {
        euint256 skills = FHE.fromExternal(encSkillsMask, attestation);
        euint8 level = FHE.fromExternal(encLevel, attestation);
        euint16 rate = FHE.fromExternal(encRate, attestation);

        id = nextFreelancerId++;
        EncProfile storage P = freelancers[id];
        P.owner = msg.sender;
        P.skillsMask = skills;
        P.level = level;
        P.rateOrBudget = rate;
        P.exists = true;

        // Allow the owner to decrypt/use and allow contract itself for future comps
        FHE.allow(P.skillsMask, msg.sender);
        FHE.allow(P.level, msg.sender);
        FHE.allow(P.rateOrBudget, msg.sender);

        FHE.allowThis(P.skillsMask);
        FHE.allowThis(P.level);
        FHE.allowThis(P.rateOrBudget);

        emit FreelancerSubmitted(id, msg.sender);
    }

    /// @notice Submit encrypted job (by заказчик)
    function submitJob(
        externalEuint256 encSkillsMask,
        externalEuint8 encMinLevel,
        externalEuint16 encMaxBudget,
        bytes calldata attestation
    ) external returns (uint256 id) {
        euint256 skills = FHE.fromExternal(encSkillsMask, attestation);
        euint8 minLevel = FHE.fromExternal(encMinLevel, attestation);
        euint16 maxBudget = FHE.fromExternal(encMaxBudget, attestation);

        id = nextJobId++;
        EncProfile storage P = jobs[id];
        P.owner = msg.sender;
        P.skillsMask = skills;
        P.level = minLevel; // interpret as minimum required level
        P.rateOrBudget = maxBudget;
        P.exists = true;

        // Allow the owner and this contract to access encrypted fields
        FHE.allow(P.skillsMask, msg.sender);
        FHE.allow(P.level, msg.sender);
        FHE.allow(P.rateOrBudget, msg.sender);

        FHE.allowThis(P.skillsMask);
        FHE.allowThis(P.level);
        FHE.allowThis(P.rateOrBudget);

        emit JobSubmitted(id, msg.sender);
    }

    /* ================= Compute match homomorphically ================= */

    /// @notice Compute encrypted match between freelancer and job
    /// Logic:
    ///   - skillOverlap = freelancer.skillsMask AND job.skillsMask
    ///   - skillOk = (skillOverlap != 0)
    ///   - levelOk = freelancer.level >= job.level (freelancer has at least min level)
    ///   - budgetOk = freelancer.rateOrBudget <= job.rateOrBudget
    /// overallMatch = skillOk AND levelOk AND budgetOk
    function computeMatch(
        uint256 freelancerId,
        uint256 jobId
    ) external returns (bytes32) {
        require(freelancers[freelancerId].exists, "no freelancer");
        require(jobs[jobId].exists, "no job");

        EncProfile storage F = freelancers[freelancerId];
        EncProfile storage J = jobs[jobId];

        // 1) skill overlap: bitwise AND
        euint256 overlap = FHE.and(F.skillsMask, J.skillsMask);

        // zero constant
        euint256 zero256 = FHE.asEuint256(0);

        // 2) skillOk: overlap != 0
        ebool skillOk = FHE.ne(overlap, zero256);

        // 3) levelOk: F.level >= J.level
        ebool levelOk = FHE.ge(F.level, J.level);

        // 4) budgetOk: F.rateOrBudget <= J.rateOrBudget
        ebool budgetOk = FHE.le(F.rateOrBudget, J.rateOrBudget);

        // 5) combine: skillOk AND levelOk AND budgetOk
        ebool tmp = FHE.and(skillOk, levelOk);
        ebool matchBool = FHE.and(tmp, budgetOk);

        // convert to euint8 (0/1) so it can be stored and returned as handle
        euint8 one = FHE.asEuint8(1);
        euint8 zero8 = FHE.asEuint8(0);
        euint8 matchVal = FHE.select(matchBool, one, zero8);

        bytes32 pairKey = keccak256(abi.encodePacked(freelancerId, jobId));
        pairMatch[pairKey] = matchVal;
        pairMatchExists[pairKey] = true;

        // Allow both parties to access/decrypt the result if desired
        FHE.allow(pairMatch[pairKey], freelancers[freelancerId].owner);
        FHE.allow(pairMatch[pairKey], jobs[jobId].owner);
        FHE.allowThis(pairMatch[pairKey]);

        emit MatchComputed(freelancerId, jobId, pairKey);

        return FHE.toBytes32(pairMatch[pairKey]);
    }

    /// @notice Make previously computed match publicly decryptable
    function makeMatchPublic(uint256 freelancerId, uint256 jobId) external {
        bytes32 pairKey = keccak256(abi.encodePacked(freelancerId, jobId));
        require(pairMatchExists[pairKey], "no match computed");

        EncProfile storage F = freelancers[freelancerId];
        EncProfile storage J = jobs[jobId];

        // only allow owners to set public (policy choice)
        require(msg.sender == F.owner || msg.sender == J.owner, "not authorized");

        FHE.makePubliclyDecryptable(pairMatch[pairKey]);

        emit MatchMadePublic(freelancerId, jobId, pairKey);
    }

    /// @notice Return bytes32 handle for a previously computed match
    function matchHandle(uint256 freelancerId, uint256 jobId) external view returns (bytes32) {
        bytes32 pairKey = keccak256(abi.encodePacked(freelancerId, jobId));
        require(pairMatchExists[pairKey], "no match");
        return FHE.toBytes32(pairMatch[pairKey]);
    }

    /* ================= Helpers / getters ================= */

    function freelancerOwner(uint256 freelancerId) external view returns (address) {
        return freelancers[freelancerId].owner;
    }

    function jobOwner(uint256 jobId) external view returns (address) {
        return jobs[jobId].owner;
    }

    function freelancerExists(uint256 freelancerId) external view returns (bool) {
        return freelancers[freelancerId].exists;
    }

    function jobExists(uint256 jobId) external view returns (bool) {
        return jobs[jobId].exists;
    }
}
