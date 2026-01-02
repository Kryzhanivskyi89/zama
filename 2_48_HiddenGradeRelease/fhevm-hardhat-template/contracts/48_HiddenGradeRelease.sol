// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/* Zama FHEVM */
import { FHE, euint8, euint16, ebool, externalEuint16 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title HiddenGradeRelease — Zama FHE Encrypted Grading System
/// @notice Student submits encrypted test scores → contract computes grade (A/B/C/F) + passed flag.
contract HiddenGradeRelease is ZamaEthereumConfig {

    struct GradeData {
        euint16 totalScore;  // encrypted sum of all scores
        euint8 grade;        // 0=A,1=B,2=C,3=F
        ebool passed;        // true/false
        bool exists;
    }

    mapping(address => GradeData) private records;

    event ScoresSubmitted(address indexed student, bytes32 gradeHandle, bytes32 passHandle);
    event PublicEnabled(address indexed student);

    constructor() {}

    /// @notice Submit encrypted test results (3 test scores for simplicity)
    /// @param s1 external encrypted uint16
    /// @param s2 external encrypted uint16
    /// @param s3 external encrypted uint16
    /// @param attestation coprocessor attestation for fromExternal conversion
    function submitScores(
        externalEuint16 s1,
        externalEuint16 s2,
        externalEuint16 s3,
        bytes calldata attestation
    ) external returns (bytes32 gradeHandle, bytes32 passHandle)
    {
        // Convert external → internal encrypted values
        euint16 a = FHE.fromExternal(s1, attestation);
        euint16 b = FHE.fromExternal(s2, attestation);
        euint16 c = FHE.fromExternal(s3, attestation);

        // encrypted sum
        euint16 sum = FHE.add(FHE.add(a, b), c);

        // thresholds for grading
        euint16 A_th = FHE.asEuint16(270); // 90*3
        euint16 B_th = FHE.asEuint16(210); // 70*3
        euint16 C_th = FHE.asEuint16(150); // 50*3

        // Determine grade
        ebool isA = FHE.ge(sum, A_th);
        ebool isB = FHE.and(FHE.ge(sum, B_th), FHE.lt(sum, A_th));
        ebool isC = FHE.and(FHE.ge(sum, C_th), FHE.lt(sum, B_th));
        ebool isF = FHE.lt(sum, C_th);

        euint8 gA = FHE.asEuint8(0);
        euint8 gB = FHE.asEuint8(1);
        euint8 gC = FHE.asEuint8(2);
        euint8 gF = FHE.asEuint8(3);

        euint8 grade1 = FHE.select(isA, gA, gF);
        euint8 grade2 = FHE.select(isB, gB, grade1);
        euint8 grade  = FHE.select(isC, gC, grade2);

        // passed if score ≥ C threshold
        ebool passed = FHE.ge(sum, C_th);

        // store encrypted results
        records[msg.sender] = GradeData({
            totalScore: sum,
            grade: grade,
            passed: passed,
            exists: true
        });

        // Allow student + contract to read encrypted values
        FHE.allow(sum, msg.sender);
        FHE.allow(grade, msg.sender);
        FHE.allow(passed, msg.sender);

        FHE.allowThis(sum);
        FHE.allowThis(grade);
        FHE.allowThis(passed);

        gradeHandle = FHE.toBytes32(grade);
        passHandle  = FHE.toBytes32(passed);

        emit ScoresSubmitted(msg.sender, gradeHandle, passHandle);
    }

    /// @notice Enable public decryption of grade + pass flag (optional)
    function makePublic() external {
        require(records[msg.sender].exists, "no record");

        FHE.makePubliclyDecryptable(records[msg.sender].grade);
        FHE.makePubliclyDecryptable(records[msg.sender].passed);

        emit PublicEnabled(msg.sender);
    }

    /// @notice Get encrypted handles (grade + passed)
    function getHandles(address student) external view returns (bytes32 gradeH, bytes32 passH) {
        require(records[student].exists, "no record");
        return (
            FHE.toBytes32(records[student].grade),
            FHE.toBytes32(records[student].passed)
        );
    }

    function hasRecord(address student) external view returns (bool) {
        return records[student].exists;
    }
}
