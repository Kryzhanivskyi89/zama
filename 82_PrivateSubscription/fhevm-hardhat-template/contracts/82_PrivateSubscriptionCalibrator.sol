// SPDX-License-Identifier: MIT
// pragma solidity ^0.8.25;

/* Zama FHEVM */
import { FHE, ebool, euint8, euint16, externalEuint8, externalEuint16 } from "@fhevm/solidity/lib/FHE.sol";
// import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";
contract PrivateSubscription is ZamaEthereumConfig {
    struct Profile {
        address user;
        euint8 duration;  // subscription duration (1–12 months)
        euint16 budget;   // user’s budget (0–1000$)
        euint8 content;   // preferred content category (0=general,1=music,2=video,3=games)
        euint8 plan;      // resulting subscription tier (0=Basic,1=Standard,2=Premium)
        bool active;
    }

    uint256 public nextId;
    mapping(uint256 => Profile) private profiles;

    event ProfileCreated(uint256 indexed id, address indexed user);
    event PlanCalculated(uint256 indexed id, bytes32 planHandle);
    event PlanMadePublic(uint256 indexed id);

    constructor() {
        nextId = 1;
    }

    function submitPreferences(
        externalEuint8 encDuration,
        externalEuint16 encBudget,
        externalEuint8 encContent,
        bytes calldata attestation
    ) external returns (uint256 id) {
        euint8 duration = FHE.fromExternal(encDuration, attestation);
        euint16 budget = FHE.fromExternal(encBudget, attestation);
        euint8 content = FHE.fromExternal(encContent, attestation);

        id = nextId++;
        Profile storage P = profiles[id];
        P.user = msg.sender;
        P.duration = duration;
        P.budget = budget;
        P.content = content;
        P.active = true;

        // Basic logic for plan selection
        // Premium if (budget > 700)
        // Standard if (budget > 300)
        // else Basic
        ebool isPremium = FHE.gt(budget, FHE.asEuint16(700));
        ebool isStandard = FHE.and(FHE.gt(budget, FHE.asEuint16(300)), FHE.le(budget, FHE.asEuint16(700)));

        euint8 basePlan = FHE.asEuint8(0); // Basic
        euint8 stdPlan = FHE.asEuint8(1);  // Standard
        euint8 premPlan = FHE.asEuint8(2); // Premium

        euint8 planIfStd = FHE.select(isStandard, stdPlan, basePlan);
        euint8 finalPlan = FHE.select(isPremium, premPlan, planIfStd);

        P.plan = finalPlan;

        // ACLs
        FHE.allow(P.plan, msg.sender);
        FHE.allowThis(P.plan);

        emit ProfileCreated(id, msg.sender);
        emit PlanCalculated(id, FHE.toBytes32(P.plan));
    }

    /// @notice Returns the encrypted plan handle
    function planHandle(uint256 id) external view returns (bytes32) {
        require(profiles[id].active, "no profile");
        return FHE.toBytes32(profiles[id].plan);
    }

    /// @notice Make the encrypted plan publicly decryptable
    function makePlanPublic(uint256 id) external {
        Profile storage P = profiles[id];
        require(P.active, "no profile");
        require(msg.sender == P.user, "not owner");
        FHE.makePubliclyDecryptable(P.plan);
        emit PlanMadePublic(id);
    }

    function ownerOf(uint256 id) external view returns (address) {
        return profiles[id].user;
    }
}
