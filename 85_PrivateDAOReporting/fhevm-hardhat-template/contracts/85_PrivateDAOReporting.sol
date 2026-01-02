// // SPDX-License-Identifier: MIT
// pragma solidity ^0.8.27;

// import { FHE, euint16, externalEuint16 } from "@fhevm/solidity/lib/FHE.sol";
// // import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";
// import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";
// contract PrivateDAOReporting is ZamaEthereumConfig {
//     struct DAO {
//         bool exists;
//         euint16 totalKPI;
//         uint256 submits;
//     }

//     mapping(bytes32 => DAO) private daos;

//     event KPISubmitted(bytes32 indexed daoId, uint256 newCount);
//     event DAOMadePublic(bytes32 indexed daoId);

//     function initDAO(bytes32 daoId) public {
//         DAO storage D = daos[daoId];
//         require(!D.exists, "exists");

//         D.exists = true;
//         D.totalKPI = FHE.asEuint16(0);
//         D.submits = 0;

//         FHE.allowThis(D.totalKPI);
//     }

//     function submitKPI(
//         bytes32 daoId,
//         externalEuint16 extKPI,
//         bytes calldata att
//     ) external {
//         DAO storage D = daos[daoId];

//         if (!D.exists) {
//             D.exists = true;
//             D.totalKPI = FHE.asEuint16(0);
//             FHE.allowThis(D.totalKPI);
//         }

//         euint16 k = FHE.fromExternal(extKPI, att);
//         euint16 newSum = FHE.add(D.totalKPI, k);

//         D.totalKPI = newSum;
//         FHE.allowThis(D.totalKPI);

//         D.submits++;

//         emit KPISubmitted(daoId, D.submits);
//     }

//     function makePublic(bytes32 daoId) external {
//         DAO storage D = daos[daoId];
//         require(D.exists, "no");

//         FHE.makePubliclyDecryptable(D.totalKPI);

//         emit DAOMadePublic(daoId);
//     }

//     function kpiHandle(bytes32 daoId) external view returns (bytes32) {
//         DAO storage D = daos[daoId];
//         require(D.exists, "no");
//         return FHE.toBytes32(D.totalKPI);
//     }

//     function count(bytes32 daoId) external view returns (uint256) {
//         return daos[daoId].submits;
//     }
// }


pragma solidity ^0.8.27;

import { FHE, euint16, externalEuint16 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract PrivateDAOReporting is ZamaEthereumConfig {

    struct DAO {
        bool exists;
        euint16 totalKPI;
        uint256 submits;
    }

    mapping(bytes32 => DAO) private daos;

    event KPISubmitted(bytes32 indexed daoId, uint256 newCount);
    event DAOMadePublic(bytes32 indexed daoId);

    function initDAO(bytes32 daoId) public {
        DAO storage D = daos[daoId];
        require(!D.exists, "exists");

        D.exists = true;
        D.totalKPI = FHE.asEuint16(0);
        D.submits = 0;

        FHE.allowThis(D.totalKPI);
    }

    function submitKPI(
        bytes32 daoId,
        externalEuint16 extKPI,
        bytes calldata att
    ) external {
        DAO storage D = daos[daoId];

        if (!D.exists) {
            D.exists = true;
            D.totalKPI = FHE.asEuint16(0);
            FHE.allowThis(D.totalKPI);
        }

        euint16 k = FHE.fromExternal(extKPI, att);
        euint16 newSum = FHE.add(D.totalKPI, k);

        D.totalKPI = newSum;
        FHE.allowThis(D.totalKPI);

        D.submits++;

        emit KPISubmitted(daoId, D.submits);
    }

    function makePublic(bytes32 daoId) external {
        DAO storage D = daos[daoId];
        require(D.exists, "no dao");

        FHE.makePubliclyDecryptable(D.totalKPI);
        emit DAOMadePublic(daoId);
    }

    function kpiHandle(bytes32 daoId) external view returns (bytes32) {
        DAO storage D = daos[daoId];
        require(D.exists, "no dao");
        return FHE.toBytes32(D.totalKPI);
    }

    function count(bytes32 daoId) external view returns (uint256) {
        return daos[daoId].submits;
    }
}
