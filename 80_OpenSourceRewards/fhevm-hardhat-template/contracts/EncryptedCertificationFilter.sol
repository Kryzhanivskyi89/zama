// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import { FHE, euint16, externalEuint16 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract EncryptedCertificationFilter is ZamaEthereumConfig {

    struct CertificateData {
        bool exists;
        euint16 totalLevel;
        uint256 submissions;
    }

    mapping(bytes32 => CertificateData) private certs;

    event CertificateSubmitted(bytes32 indexed certId, uint256 newCount);
    event MadePublic(bytes32 indexed certId);

    function initCertificate(bytes32 certId) public {
        CertificateData storage C = certs[certId];
        require(!C.exists, "exists");

        C.exists = true;
        C.totalLevel = FHE.asEuint16(0);
        C.submissions = 0;

        FHE.allowThis(C.totalLevel);
    }

    /// @notice Submit encrypted qualification level
    /// Split into handle (32 bytes) + proof (remaining bytes)
    function submitCertificate(
        bytes32 certId,
        bytes calldata encryptedData
    ) external {
        CertificateData storage C = certs[certId];

        if (!C.exists) {
            C.exists = true;
            C.totalLevel = FHE.asEuint16(0);
            FHE.allowThis(C.totalLevel);
        }

        // Split the encrypted data: first 32 bytes = handle, rest = proof
        require(encryptedData.length >= 32, "invalid_data");
        
        bytes memory handle = encryptedData[:32];
        bytes memory proof = encryptedData[32:];

        // Now use the handle with FHE.fromExternal
        euint16 lvl = FHE.fromExternal(externalEuint16.wrap(bytes32(handle)), proof);
        euint16 newTotal = FHE.add(C.totalLevel, lvl);

        C.totalLevel = newTotal;
        FHE.allowThis(C.totalLevel);

        C.submissions++;

        emit CertificateSubmitted(certId, C.submissions);
    }

    function makePublic(bytes32 certId) external {
        CertificateData storage C = certs[certId];
        require(C.exists, "no");

        FHE.makePubliclyDecryptable(C.totalLevel);

        emit MadePublic(certId);
    }

    function certificateHandle(bytes32 certId) external view returns (bytes32) {
        CertificateData storage C = certs[certId];
        require(C.exists, "no");
        return FHE.toBytes32(C.totalLevel);
    }

    function submissions(bytes32 certId) external view returns (uint256) {
        return certs[certId].submissions;
    }
}
