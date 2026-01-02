// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/* Zama FHEVM */
import {
    FHE,
    ebool,
    euint8,
    euint16,
    externalEuint8,
    externalEuint16
} from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title BlindTargetRange
/// @notice Admin задає зашифрений інтервал по X, гравець шифрує X, контракт повертає зону:
///         0 = far, 1 = near, 2 = center (euint8 з handle).
contract BlindTargetRange is ZamaEthereumConfig {

    struct EncInterval {
        address owner;
        euint16 left;   // ліва межа
        euint16 right;  // права межа
        bool exists;
    }

    struct EncShot {
        address shooter;
        euint16 x;      // координата пострілу
        bool exists;
    }

    uint256 public nextIntervalId;
    uint256 public nextShotId;

    mapping(uint256 => EncInterval) private intervals;
    mapping(uint256 => EncShot) private shots;

    // key = keccak256(intervalId, shotId)
    mapping(bytes32 => euint8) private shotResult;      // 0/1/2
    mapping(bytes32 => bool) private shotResultExists;

    event IntervalSubmitted(uint256 indexed intervalId, address indexed owner);
    event ShotSubmitted(uint256 indexed shotId, address indexed shooter);
    event ShotComputed(uint256 indexed intervalId, uint256 indexed shotId, bytes32 pairKey);
    event ShotMadePublic(uint256 indexed intervalId, uint256 indexed shotId, bytes32 pairKey);

    constructor() {
        nextIntervalId = 1;
        nextShotId = 1;
    }

    /* ============== Submit encrypted interval ============== */

    /// @notice Admin подає зашифрований інтервал [L, R]
    function submitInterval(
        externalEuint16 encLeft,
        externalEuint16 encRight,
        bytes calldata attestation
    ) external returns (uint256 id) {
        euint16 L = FHE.fromExternal(encLeft, attestation);
        euint16 R = FHE.fromExternal(encRight, attestation);

        id = nextIntervalId++;
        EncInterval storage I = intervals[id];
        I.owner = msg.sender;
        I.left = L;
        I.right = R;
        I.exists = true;

        FHE.allow(I.left, msg.sender);
        FHE.allow(I.right, msg.sender);

        FHE.allowThis(I.left);
        FHE.allowThis(I.right);

        emit IntervalSubmitted(id, msg.sender);
    }

    /* ============== Submit encrypted shot ============== */

    /// @notice Гравець подає зашифровану координату X
    function submitShot(
        externalEuint16 encX,
        bytes calldata attestation
    ) external returns (uint256 id) {
        euint16 xVal = FHE.fromExternal(encX, attestation);

        id = nextShotId++;
        EncShot storage S = shots[id];
        S.shooter = msg.sender;
        S.x = xVal;
        S.exists = true;

        FHE.allow(S.x, msg.sender);
        FHE.allowThis(S.x);

        emit ShotSubmitted(id, msg.sender);
    }

    /* ============== Compute hit zone homomorphically ============== */

    /// @notice Обчислює зону попадання: 0=far,1=near,2=center
    /// @dev Логіка проста: порівнюємо X з L/R та кількома порогами.
    function computeHit(
        uint256 intervalId,
        uint256 shotId,
        externalEuint16 encNearRadius,
        externalEuint16 encCenterRadius,
        bytes calldata attestation
    ) external returns (bytes32) {
        require(intervals[intervalId].exists, "no interval");
        require(shots[shotId].exists, "no shot");

        EncInterval storage I = intervals[intervalId];
        EncShot storage S = shots[shotId];

        // радіуси зон ззовні (як threshold в PrivateDonorMatch)
        euint16 nearR = FHE.fromExternal(encNearRadius, attestation);
        euint16 centerR = FHE.fromExternal(encCenterRadius, attestation);

        // базові межі
        euint16 L = I.left;
        euint16 R = I.right;
        euint16 X = S.x;

        // центральна точка: беремо середину між L і R приблизно через пороги
        // замість ділення робимо 3 зони за зсувом від лівої межі

        // offset = X - L (якщо X < L → treat як far)
        ebool x_ge_L = FHE.ge(X, L);
        euint16 diffXL = FHE.sub(X, L);       // коректно інтерпретується, коли X>=L
        euint16 zero16 = FHE.asEuint16(0);
        euint16 offset = FHE.select(x_ge_L, diffXL, zero16);

        // довжина інтервалу: len = R - L
        euint16 len = FHE.sub(R, L);

        // center зона: |X - середини| <= centerR
        // без ділення: беремо «середню» точку через умову:
        //   X >= L + centerR  AND  X <= R - centerR
        euint16 leftCenter = FHE.add(L, centerR);
        euint16 rightCenter = FHE.sub(R, centerR);
        ebool ge_leftCenter = FHE.ge(X, leftCenter);
        ebool le_rightCenter = FHE.le(X, rightCenter);
        ebool centerZone = FHE.and(ge_leftCenter, le_rightCenter);

        // near зона: в межах [L - nearR, R + nearR], але не center
        euint16 leftNearExt = FHE.sub(L, nearR);
        euint16 rightNearExt = FHE.add(R, nearR);
        ebool ge_leftNear = FHE.ge(X, leftNearExt);
        ebool le_rightNear = FHE.le(X, rightNearExt);
        ebool nearRaw = FHE.and(ge_leftNear, le_rightNear);
        ebool nearZone = FHE.and(nearRaw, FHE.not(centerZone));

        // far: все інше
        ebool farZone = FHE.and(
            FHE.not(centerZone),
            FHE.not(nearZone)
        );

        // мапимо в 0/1/2
        euint8 zero = FHE.asEuint8(0);
        euint8 one = FHE.asEuint8(1);
        euint8 two = FHE.asEuint8(2);

        euint8 tmp = FHE.select(nearZone, one, zero);
        euint8 hitVal = FHE.select(centerZone, two, tmp);

        bytes32 pairKey = keccak256(abi.encodePacked(intervalId, shotId));
        shotResult[pairKey] = hitVal;
        shotResultExists[pairKey] = true;

        // дозволяємо власникам інтервалу/шоту
        FHE.allow(shotResult[pairKey], I.owner);
        FHE.allow(shotResult[pairKey], S.shooter);
        FHE.allowThis(shotResult[pairKey]);

        emit ShotComputed(intervalId, shotId, pairKey);

        return FHE.toBytes32(shotResult[pairKey]);
    }

    /// @notice Робить результат публічно дешифровним (аналог makeMatchPublic)
    function makeHitPublic(uint256 intervalId, uint256 shotId) external {
        bytes32 pairKey = keccak256(abi.encodePacked(intervalId, shotId));
        require(shotResultExists[pairKey], "no result");

        EncInterval storage I = intervals[intervalId];
        EncShot storage S = shots[shotId];

        require(msg.sender == I.owner || msg.sender == S.shooter, "not authorized");

        FHE.makePubliclyDecryptable(shotResult[pairKey]);

        emit ShotMadePublic(intervalId, shotId, pairKey);
    }

    /// @notice Повертає bytes32 handle результату
    function hitHandle(uint256 intervalId, uint256 shotId) external view returns (bytes32) {
        bytes32 pairKey = keccak256(abi.encodePacked(intervalId, shotId));
        require(shotResultExists[pairKey], "no result");
        return FHE.toBytes32(shotResult[pairKey]);
    }

    /* ============== Helpers / getters ============== */

    function intervalOwner(uint256 intervalId) external view returns (address) {
        return intervals[intervalId].owner;
    }

    function shotOwner(uint256 shotId) external view returns (address) {
        return shots[shotId].shooter;
    }

    function intervalExists(uint256 intervalId) external view returns (bool) {
        return intervals[intervalId].exists;
    }

    function shotExists(uint256 shotId) external view returns (bool) {
        return shots[shotId].exists;
    }
}
