// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/* Zama FHEVM */
import { FHE, ebool, euint8, euint16, externalEuint16 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title SecretRiskMap (Geo Game)
/// @notice Player encrypts (X,Y). Contract encrypts map thresholds A,B,C.
///         Returns encrypted risk level: 0=safe,1=risky,2=dangerous.
contract SecretRiskMap is ZamaEthereumConfig {

    // encrypted map thresholds (unknown to players)
    euint16 private A;   // safe X limit
    euint16 private B;   // safe Y limit
    euint16 private C;   // risky X limit

    // player results
    mapping(address => euint8) private zone;
    mapping(address => bool) private zoneExists;

    event ThresholdsInitialized();
    event ZoneComputed(address indexed player, bytes32 handle);
    event ZoneMadePublic(address indexed player);

    constructor() {
        // Initialize encrypted map thresholds (owner sets defaults)
        // Example: safe zone X<2000, Y<2000, risky zone X<6000
        // These values are public, but if needed — we can allow owner to submit encrypted threshold.
        A = FHE.asEuint16(2000);
        B = FHE.asEuint16(2000);
        C = FHE.asEuint16(6000);

        FHE.allowThis(A);
        FHE.allowThis(B);
        FHE.allowThis(C);

        emit ThresholdsInitialized();
    }

    /// @notice Player submits encrypted coordinates (X,Y)
    /// @return handle to encrypted zone code
    function submitCoordinates(
        externalEuint16 encX,
        externalEuint16 encY,
        bytes calldata attestation
    ) external returns (bytes32) {

        euint16 X = FHE.fromExternal(encX, attestation);
        euint16 Y = FHE.fromExternal(encY, attestation);

        // Safe if X < A AND Y < B
        ebool safeX = FHE.lt(X, A);
        ebool safeY = FHE.lt(Y, B);
        ebool isSafe = FHE.and(safeX, safeY);

        // Risky if NOT safe AND X < C
        ebool riskyX = FHE.lt(X, C);
        ebool isRisky = FHE.and(FHE.not(isSafe), riskyX);

        // dangerous = else
        ebool isDangerous = FHE.not(FHE.or(isSafe, isRisky));

        // zone codes
        euint8 Zsafe = FHE.asEuint8(0);
        euint8 Zrisky = FHE.asEuint8(1);
        euint8 Zdanger = FHE.asEuint8(2);

        // Ternary logic: safe ? 0 : (risky ?1:2)
        euint8 z1 = FHE.select(isSafe, Zsafe, Zrisky);
        euint8 result = FHE.select(isDangerous, Zdanger, z1);

        zone[msg.sender] = result;
        zoneExists[msg.sender] = true;

        // Allow player + contract access
        FHE.allow(result, msg.sender);
        FHE.allowThis(result);

        bytes32 handle = FHE.toBytes32(result);
        emit ZoneComputed(msg.sender, handle);
        return handle;
    }

    /// @notice Make your result publicly decryptable
    function makeZonePublic() external {
        require(zoneExists[msg.sender], "no zone computed");
        FHE.makePubliclyDecryptable(zone[msg.sender]);
        emit ZoneMadePublic(msg.sender);
    }

    function zoneHandle(address player) external view returns (bytes32) {
        require(zoneExists[player], "no zone");
        return FHE.toBytes32(zone[player]);
    }

    function hasZone(address player) external view returns (bool) {
        return zoneExists[player];
    }
}
