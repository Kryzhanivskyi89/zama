// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/* Zama FHEVM */
import { FHE, ebool, euint8, euint16, externalEuint16 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title Hidden Performance Bonus (Zama FHEVM)
/// @notice Employee sends encrypted KPI, HR sends encrypted target.
///         Contract returns encrypted bonus code: 0..3.
contract HiddenPerformanceBonus is ZamaEthereumConfig {

    struct EncryptedKPI {
        euint16 value;
        bool exists;
        address owner;
    }

    struct EncryptedTarget {
        euint16 value;
        bool exists;
        address owner;
    }

    mapping(address => EncryptedKPI) private employeeKPI;
    mapping(address => EncryptedTarget) private employeeTarget;
    mapping(address => euint8) private bonusCode;
    mapping(address => bool) private bonusExists;

    event KPISubmitted(address indexed employee);
    event TargetSubmitted(address indexed employee);
    event BonusComputed(address indexed employee, bytes32 handle);
    event BonusMadePublic(address indexed employee, bytes32 handle);

    /// employee submits encrypted KPI
    function submitKPI(
        externalEuint16 encKPI,
        bytes calldata attestation
    ) external {
        euint16 value = FHE.fromExternal(encKPI, attestation);

        employeeKPI[msg.sender] = EncryptedKPI({
            value: value,
            exists: true,
            owner: msg.sender
        });

        FHE.allow(employeeKPI[msg.sender].value, msg.sender);
        FHE.allowThis(employeeKPI[msg.sender].value);

        emit KPISubmitted(msg.sender);
    }

    /// HR submits encrypted target KPI for employee
    function submitTarget(
        address employee,
        externalEuint16 encTarget,
        bytes calldata attestation
    ) external {
        require(employee != address(0), "invalid employee");

        euint16 value = FHE.fromExternal(encTarget, attestation);

        employeeTarget[employee] = EncryptedTarget({
            value: value,
            exists: true,
            owner: msg.sender
        });

        FHE.allow(employeeTarget[employee].value, msg.sender);
        FHE.allowThis(employeeTarget[employee].value);

        emit TargetSubmitted(employee);
    }

    /// Compute homomorphic bonus based on KPI vs target
    function computeBonus(address employee) external returns (bytes32) {
        require(employeeKPI[employee].exists, "no KPI");
        require(employeeTarget[employee].exists, "no target");

        euint16 kpi = employeeKPI[employee].value;
        euint16 target = employeeTarget[employee].value;

        // thresholds: target, 110% target, 130% target
        // FHE.mul works only on small ints -> use scaling: (kpi * 100) >= target * 110
        euint16 kpi100 = FHE.mul(kpi, FHE.asEuint16(100));
        euint16 target100 = FHE.mul(target, FHE.asEuint16(100));

        euint16 target110 = FHE.mul(target, FHE.asEuint16(110));
        euint16 target130 = FHE.mul(target, FHE.asEuint16(130));

        euint8 zero = FHE.asEuint8(0);
        euint8 one  = FHE.asEuint8(1);
        euint8 two  = FHE.asEuint8(2);
        euint8 three = FHE.asEuint8(3);

        // kpi >= target
        ebool lvl1 = FHE.ge(kpi, target);
        // kpi >= 110%
        ebool lvl2 = FHE.ge(kpi100, target110);
        // kpi >= 130%
        ebool lvl3 = FHE.ge(kpi100, target130);

        // build a 0..3 value
        euint8 base = FHE.select(lvl1, one, zero);
        euint8 mid  = FHE.select(lvl2, two, base);
        euint8 fin  = FHE.select(lvl3, three, mid);

        bonusCode[employee] = fin;
        bonusExists[employee] = true;

        FHE.allow(bonusCode[employee], employee);
        FHE.allowThis(bonusCode[employee]);

        bytes32 handle = FHE.toBytes32(bonusCode[employee]);
        emit BonusComputed(employee, handle);

        return handle;
    }

    /// employee wants to make bonus publicly decryptable
    function makeBonusPublic() external {
        require(bonusExists[msg.sender], "no bonus yet");
        FHE.makePubliclyDecryptable(bonusCode[msg.sender]);
        emit BonusMadePublic(msg.sender, FHE.toBytes32(bonusCode[msg.sender]));
    }

    /// frontend reads this to decrypt
    function bonusHandle(address employee) external view returns (bytes32) {
        require(bonusExists[employee], "no bonus");
        return FHE.toBytes32(bonusCode[employee]);
    }

    function hasBonus(address employee) external view returns (bool) {
        return bonusExists[employee];
    }
}
