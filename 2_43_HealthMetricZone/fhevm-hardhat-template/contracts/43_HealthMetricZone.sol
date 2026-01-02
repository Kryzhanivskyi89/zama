// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/* Zama FHE */
import { FHE, ebool, euint8, euint16, externalEuint16 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title HealthMetricZone (Zama FHE)
/// @notice 
contract HealthMetricZone is ZamaEthereumConfig {

    mapping(address => euint8) private lastZone;
    mapping(address => bool) private zoneExists;

    event MetricsSubmitted(address indexed owner, bytes32 zoneHandle);
    event ZoneMadePublic(address indexed owner, bytes32 zoneHandle);

    constructor() {}

    /// @notice 
    /// @param encHeartRate external зашифрований пульс (euint16)
    /// @param encSystolic external зашифрований систолічний тиск (euint16)
    /// @param encDiastolic external зашифрований діастолічний тиск (euint16)
    /// @param attestation список підписів копроцесорів (attestation) для fromExternal
    /// @return bytes32 handle до зашифрованої зони (можна передати фронтенду)
    function submitMetrics(
        externalEuint16 encHeartRate,
        externalEuint16 encSystolic,
        externalEuint16 encDiastolic,
        bytes calldata attestation
    ) external returns (bytes32) {
        // Перетворення зовнішніх (attested) значень у внутрішні handles
        euint16 hr = FHE.fromExternal(encHeartRate, attestation);
        euint16 sys = FHE.fromExternal(encSystolic, attestation);
        euint16 dia = FHE.fromExternal(encDiastolic, attestation);

        // --- Параметри зон (прикладні пороги, можна змінити) ---
        // Пульс (bpm):
        // normal: 50 <= hr <= 100
        // warning: 100 < hr < 120
        // danger: hr < 50 OR hr >= 120
        euint16 hr_low_th = FHE.asEuint16(50);
        euint16 hr_normal_high = FHE.asEuint16(100);
        euint16 hr_warn_high = FHE.asEuint16(120);

        // Тиск (systolic, mmHg example):
        // normal: sys < 120
        // warning: 120 <= sys < 140
        // danger: sys >= 140
        euint16 sys_warn_low = FHE.asEuint16(120);
        euint16 sys_danger = FHE.asEuint16(140);

        // --- Обчислення зон для пульсу (encrypted booleans) ---
        ebool hr_lt_low = FHE.lt(hr, hr_low_th);
        ebool hr_le_normal = FHE.le(hr, hr_normal_high); // <=100
        ebool hr_ge_warn = FHE.ge(hr, hr_normal_high);   // >=100
        ebool hr_lt_warnHigh = FHE.lt(hr, hr_warn_high); // <120
        ebool hr_warn_cond = FHE.and(hr_ge_warn, hr_lt_warnHigh); // 100..119
        ebool hr_danger_high = FHE.ge(hr, hr_warn_high); // >=120
        ebool hr_danger = FHE.or(hr_lt_low, hr_danger_high);

        // --- Обчислення зон для тиску (systolic) ---
        ebool sys_lt_warn = FHE.lt(sys, sys_warn_low);       // <120 normal
        ebool sys_ge_warn = FHE.ge(sys, sys_warn_low);       // >=120
        ebool sys_lt_danger = FHE.lt(sys, sys_danger);       // <140
        ebool sys_warn_cond = FHE.and(sys_ge_warn, sys_lt_danger); // 120..139
        ebool sys_danger_cond = FHE.ge(sys, sys_danger);     // >=140

        // --- Конвертація булевих зон в euint8 (0/1/2) ---
        euint8 zero = FHE.asEuint8(0);
        euint8 one = FHE.asEuint8(1);
        euint8 two = FHE.asEuint8(2);

        // hrZone: default 0, if warning -> 1, if danger -> 2
        euint8 hrZone1 = FHE.select(hr_warn_cond, one, zero);
        euint8 hrZone = FHE.select(hr_danger, two, hrZone1);

        // bpZone: using systolic only for simplicity; same pattern
        euint8 bpZone1 = FHE.select(sys_warn_cond, one, zero);
        euint8 bpZone = FHE.select(sys_danger_cond, two, bpZone1);

        // --- Об'єднана зона = max(hrZone, bpZone)  (беремо гіршу зону) ---
        euint8 overallZone = FHE.max(hrZone, bpZone);

        // Зберігаємо handle в стейті
        lastZone[msg.sender] = overallZone;
        zoneExists[msg.sender] = true;

        // Надаємо доступ користувачу і цьому контракту до збереженого handle
        FHE.allow(lastZone[msg.sender], msg.sender);
        FHE.allowThis(lastZone[msg.sender]);

        bytes32 handle = FHE.toBytes32(lastZone[msg.sender]);

        emit MetricsSubmitted(msg.sender, handle);
        return handle;
    }

    /// @notice Дозволити публічну дешифрацію останньої зони (користувач викликає сам)
    function makeMyZonePublic() external {
        require(zoneExists[msg.sender], "no zone");
        FHE.makePubliclyDecryptable(lastZone[msg.sender]);
        emit ZoneMadePublic(msg.sender, FHE.toBytes32(lastZone[msg.sender]));
    }

    /// @notice Отримати bytes32 handle останньої зони (щоб фронтенд міг запросити розшифровку)
    function zoneHandle(address user) external view returns (bytes32) {
        require(zoneExists[user], "no zone");
        return FHE.toBytes32(lastZone[user]);
    }

    /// @notice Для зовнішніх контрактів: перевірка чи існує зона
    function hasZone(address user) external view returns (bool) {
        return zoneExists[user];
    }
}
