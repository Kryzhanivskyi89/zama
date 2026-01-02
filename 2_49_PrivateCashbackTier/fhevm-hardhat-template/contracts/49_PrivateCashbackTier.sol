// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import { 
    FHE, 
    euint16, 
    euint32,
    euint8,
    ebool,
    externalEuint32
} from "@fhevm/solidity/lib/FHE.sol";

import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title PrivateCashbackTier — User encrypts turnover, contract computes cashback tier under FHE.
contract PrivateCashbackTier is ZamaEthereumConfig {

    struct CashbackInfo {
        euint32 turnover;  // encrypted
        euint8 tier;       // 0=1%, 1=2%, 2=3%
        bool exists;
    }

    mapping(address => CashbackInfo) private users;

    event TurnoverSubmitted(address indexed user, bytes32 tierHandle);
    event TierMadePublic(address indexed user);

    constructor() {}

    /// @notice Submit encrypted turnover (0..100000)
    function submitTurnover(
        externalEuint32 encTurnover,
        bytes calldata attestation
    ) external returns (bytes32 tierHandle)
    {
        // convert external -> internal
        euint32 t = FHE.fromExternal(encTurnover, attestation);

        // thresholds as encrypted constants
        euint32 th3 = FHE.asEuint32(50000); // 3% cashback
        euint32 th2 = FHE.asEuint32(20000); // 2% cashback

        // comparisons
        ebool is3 = FHE.ge(t, th3);
        ebool is2 = FHE.and(FHE.ge(t, th2), FHE.lt(t, th3));
        ebool is1 = FHE.lt(t, th2);

        // tier codes
        euint8 t1 = FHE.asEuint8(0); // 1%
        euint8 t2 = FHE.asEuint8(1); // 2%
        euint8 t3 = FHE.asEuint8(2); // 3%

        // nested select
        euint8 tierTmp = FHE.select(is3, t3, t1);
        euint8 tier    = FHE.select(is2, t2, tierTmp);

        users[msg.sender] = CashbackInfo({
            turnover: t,
            tier: tier,
            exists: true
        });

        // grant owner + contract
        FHE.allow(t, msg.sender);
        FHE.allow(tier, msg.sender);

        FHE.allowThis(t);
        FHE.allowThis(tier);

        tierHandle = FHE.toBytes32(tier);

        emit TurnoverSubmitted(msg.sender, tierHandle);
    }

    /// @notice Make tier public (optional)
    function makeTierPublic() external {
        require(users[msg.sender].exists, "no record");
        FHE.makePubliclyDecryptable(users[msg.sender].tier);
        emit TierMadePublic(msg.sender);
    }

    /// @notice Get encrypted tier handle
    function getTierHandle(address user) external view returns (bytes32) {
        require(users[user].exists, "no record");
        return FHE.toBytes32(users[user].tier);
    }

    function hasRecord(address user) external view returns (bool) {
        return users[user].exists;
    }
}
