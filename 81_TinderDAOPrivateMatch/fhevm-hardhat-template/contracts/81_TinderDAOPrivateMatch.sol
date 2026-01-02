
// pragma solidity ^0.8.25;

// /* Zama FHEVM */
// import { FHE, ebool, euint8, euint16, externalEuint8, externalEuint16 } from "@fhevm/solidity/lib/FHE.sol";
// // import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";
// import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";
// contract TinderDAOPrivateMatch is ZamaEthereumConfig {
//     struct Profile {
//         address owner;
//         euint8 age;        // 1..120
//         euint8 gender;     // 0=unknown,1=male,2=female,3=other
//         euint16 interests; // bitmask (up to 16 flags)
//         euint16 region;    // region code
//         bool set;
//     }

//     struct Preference {
//         address requester;
//         euint8 minAge;
//         euint8 maxAge;
//         euint8 desiredGender; // 255 = any (we'll use 255 as wildcard)
//         euint16 interestsMask; // desired interests bitmask
//         euint16 region;       // required region (or 65535 = any)
//         bool set;
//     }

//     uint256 public nextProfileId;
//     uint256 public nextPrefId;

//     mapping(uint256 => Profile) public profiles;
//     mapping(uint256 => Preference) public prefs;

//     event ProfilePublished(uint256 indexed profileId, address indexed owner);
//     event PreferenceSubmitted(uint256 indexed prefId, address indexed requester);
//     event MatchComputed(uint256 indexed profileId, uint256 indexed prefId, bytes32 matchHandle);
//     event MatchMadePublic(uint256 indexed profileId, uint256 indexed prefId);

//     constructor() {
//         nextProfileId = 1;
//         nextPrefId = 1;
//     }

//     /// Publish encrypted profile (external ciphertexts + attestation)
//     function publishProfile(
//         externalEuint8 encAge,
//         externalEuint8 encGender,
//         externalEuint16 encInterests,
//         externalEuint16 encRegion,
//         bytes calldata attestation
//     ) external returns (uint256 id) {
//         euint8 age = FHE.fromExternal(encAge, attestation);
//         euint8 gender = FHE.fromExternal(encGender, attestation);
//         euint16 interests = FHE.fromExternal(encInterests, attestation);
//         euint16 region = FHE.fromExternal(encRegion, attestation);

//         id = nextProfileId++;
//         Profile storage P = profiles[id];
//         P.owner = msg.sender;
//         P.age = age;
//         P.gender = gender;
//         P.interests = interests;
//         P.region = region;
//         P.set = true;

//         // allow owner to access their profile handles (for user decryption)
//         FHE.allow(P.age, msg.sender);
//         FHE.allow(P.gender, msg.sender);
//         FHE.allow(P.interests, msg.sender);
//         FHE.allow(P.region, msg.sender);

//         // ensure contract has (transient/persistent) access for later computation
//         FHE.allowThis(P.age);
//         FHE.allowThis(P.gender);
//         FHE.allowThis(P.interests);
//         FHE.allowThis(P.region);

//         emit ProfilePublished(id, msg.sender);
//     }

//     /// Submit encrypted preference
//     function submitPreference(
//         externalEuint8 encMinAge,
//         externalEuint8 encMaxAge,
//         externalEuint8 encDesiredGender,
//         externalEuint16 encInterestsMask,
//         externalEuint16 encRegion,
//         bytes calldata attestation
//     ) external returns (uint256 id) {
//         euint8 minAge = FHE.fromExternal(encMinAge, attestation);
//         euint8 maxAge = FHE.fromExternal(encMaxAge, attestation);
//         euint8 desiredGender = FHE.fromExternal(encDesiredGender, attestation);
//         euint16 interestsMask = FHE.fromExternal(encInterestsMask, attestation);
//         euint16 region = FHE.fromExternal(encRegion, attestation);

//         id = nextPrefId++;
//         Preference storage Q = prefs[id];
//         Q.requester = msg.sender;
//         Q.minAge = minAge;
//         Q.maxAge = maxAge;
//         Q.desiredGender = desiredGender;
//         Q.interestsMask = interestsMask;
//         Q.region = region;
//         Q.set = true;

//         // allow requester to access their pref handles
//         FHE.allow(Q.minAge, msg.sender);
//         FHE.allow(Q.maxAge, msg.sender);
//         FHE.allow(Q.desiredGender, msg.sender);
//         FHE.allow(Q.interestsMask, msg.sender);
//         FHE.allow(Q.region, msg.sender);

//         FHE.allowThis(Q.minAge);
//         FHE.allowThis(Q.maxAge);
//         FHE.allowThis(Q.desiredGender);
//         FHE.allowThis(Q.interestsMask);
//         FHE.allowThis(Q.region);

//         emit PreferenceSubmitted(id, msg.sender);
//     }

//     /// Compute match handle between profile and preference (symbolic, returns handle)
//     /// This does not reveal plaintext; it returns bytes32 handle pointing to encrypted boolean/int
//     function computeMatchHandle(uint256 profileId, uint256 prefId) external returns (bytes32 handle) {
//         Profile storage P = profiles[profileId];
//         Preference storage Q = prefs[prefId];
//         require(P.set, "profile not set");
//         require(Q.set, "preference not set");

//         // Age check: minAge <= age <= maxAge
//         ebool geMin = FHE.ge(P.age, Q.minAge);
//         ebool leMax = FHE.le(P.age, Q.maxAge);
//         ebool ageOk = FHE.and(geMin, leMax);

//         // Gender check: either desiredGender == 255 (wildcard) OR equal
//         euint8 wildcard = FHE.asEuint8(255);
//         ebool wantAny = FHE.eq(Q.desiredGender, wildcard);
//         ebool genderEq = FHE.eq(P.gender, Q.desiredGender);
//         ebool genderOk = FHE.or(wantAny, genderEq);

//         // Region check: 65535 means any
//         euint16 regionAny = FHE.asEuint16(65535);
//         ebool regionAnyB = FHE.eq(Q.region, regionAny);
//         ebool regionEq = FHE.eq(P.region, Q.region);
//         ebool regionOk = FHE.or(regionAnyB, regionEq);

//         // Interests overlap: (P.interests & Q.interestsMask) != 0
//         euint16 overlap = FHE.and(P.interests, Q.interestsMask);
//         ebool interestsOverlap = FHE.ne(overlap, FHE.asEuint16(0));

//         // final match = ageOk && genderOk && regionOk && interestsOverlap
//         ebool matchBool = FHE.and(ageOk, FHE.and(genderOk, FHE.and(regionOk, interestsOverlap)));

//         // represent as euint8 1 or 0
//         euint8 one = FHE.asEuint8(1);
//         euint8 zero = FHE.asEuint8(0);
//         euint8 matchUint = FHE.select(matchBool, one, zero);

//         // Grant access: requester + profile owner + contract (for auditing)
//         FHE.allow(matchUint, Q.requester);
//         FHE.allow(matchUint, P.owner);
//         FHE.allowThis(matchUint);

//         handle = FHE.toBytes32(matchUint);
//         emit MatchComputed(profileId, prefId, handle);
//     }

//     /// View opaque handle (bytes32)
//     function matchHandle(uint256 profileId, uint256 prefId) external view returns (bytes32) {
//         // For convenience: recompute deterministic handle if already computed in storage
//         // But since we don't persist matchUint, we compute on the fly similarly:
//         Profile storage P = profiles[profileId];
//         Preference storage Q = prefs[prefId];
//         require(P.set && Q.set, "not set");
//         // We cannot execute FHE ops in view? We can return FHE.toBytes32 on derived value only if we had it.
//         // To keep it simple, require that computeMatchHandle was called previously and its handle accessible via event.
//         // However library allows FHE.toBytes32 on stored handles; we didn't store - so better to have user call computeMatchHandle first.
//         revert("call computeMatchHandle first");
//     }

//     /// Make the match handle publicly decryptable - can be called by profile owner or requester
//     function makeMatchPublic(uint256 profileId, uint256 prefId) external {
//         Profile storage P = profiles[profileId];
//         Preference storage Q = prefs[prefId];
//         require(P.set && Q.set, "not set");
//         require(msg.sender == P.owner || msg.sender == Q.requester, "not permitted");

//         // We need to derive the same matchUint as in computeMatchHandle and mark it public.
//         // To avoid code duplication and to ensure handle exists, we recompute the logical matchUint here and call makePubliclyDecryptable.
//         ebool geMin = FHE.ge(P.age, Q.minAge);
//         ebool leMax = FHE.le(P.age, Q.maxAge);
//         ebool ageOk = FHE.and(geMin, leMax);

//         euint8 wildcard = FHE.asEuint8(255);
//         ebool wantAny = FHE.eq(Q.desiredGender, wildcard);
//         ebool genderEq = FHE.eq(P.gender, Q.desiredGender);
//         ebool genderOk = FHE.or(wantAny, genderEq);

//         euint16 regionAny = FHE.asEuint16(65535);
//         ebool regionAnyB = FHE.eq(Q.region, regionAny);
//         ebool regionEq = FHE.eq(P.region, Q.region);
//         ebool regionOk = FHE.or(regionAnyB, regionEq);

//         euint16 overlap = FHE.and(P.interests, Q.interestsMask);
//         ebool interestsOverlap = FHE.ne(overlap, FHE.asEuint16(0));

//         ebool matchBool = FHE.and(ageOk, FHE.and(genderOk, FHE.and(regionOk, interestsOverlap)));

//         euint8 one = FHE.asEuint8(1);
//         euint8 zero = FHE.asEuint8(0);
//         euint8 matchUint = FHE.select(matchBool, one, zero);

//         // Make publicly decryptable
//         FHE.makePubliclyDecryptable(matchUint);
//         emit MatchMadePublic(profileId, prefId);
//     }

//     /// simple getters
//     function ownerOfProfile(uint256 id) external view returns (address) { return profiles[id].owner; }
//     function ownerOfPref(uint256 id) external view returns (address) { return prefs[id].requester; }
//     function version() external pure returns (string memory) { return "TinderDAOPrivateMatch/1.0.0"; }
// }


// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {
    FHE,
    ebool,
    euint8,
    euint16,
    externalEuint8,
    externalEuint16
} from "@fhevm/solidity/lib/FHE.sol";

import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract TinderDAOPrivateMatch is ZamaEthereumConfig {

    struct Profile {
        address owner;
        euint8 age;
        euint8 gender;
        euint16 interests;
        euint16 region;
        bool set;
    }

    struct Preference {
        address requester;
        euint8 minAge;
        euint8 maxAge;
        euint8 desiredGender;
        euint16 interestsMask;
        euint16 region;
        bool set;
    }

    uint256 public nextProfileId = 1;
    uint256 public nextPrefId = 1;

    mapping(uint256 => Profile) public profiles;
    mapping(uint256 => Preference) public prefs;

    // 🔥 Додаємо збереження match у state
    mapping(uint256 => mapping(uint256 => euint8)) public matchMap;

    event ProfilePublished(uint256 indexed id);
    event PreferenceSubmitted(uint256 indexed id);
    event MatchComputed(uint256 indexed profileId, uint256 indexed prefId, bytes32 handle);
    event MatchMadePublic(uint256 indexed profileId, uint256 indexed prefId);

    constructor() {}

    // ------------------------
    // INTERNAL MATCH FUNCTION
    // ------------------------

    function _compute(Profile storage P, Preference storage Q)
        internal returns (euint8)
    {
        ebool ageOK =
            FHE.and(FHE.ge(P.age, Q.minAge), FHE.le(P.age, Q.maxAge));

        ebool genderOK =
            FHE.or(
                FHE.eq(Q.desiredGender, FHE.asEuint8(255)),
                FHE.eq(P.gender, Q.desiredGender)
            );

        ebool regionOK =
            FHE.or(
                FHE.eq(Q.region, FHE.asEuint16(65535)),
                FHE.eq(P.region, Q.region)
            );

        euint16 overlap = FHE.and(P.interests, Q.interestsMask);

        ebool interestOK =
            FHE.ne(overlap, FHE.asEuint16(0));

        ebool ok = FHE.and(
            ageOK,
            FHE.and(genderOK, FHE.and(regionOK, interestOK))
        );

        return FHE.select(ok, FHE.asEuint8(1), FHE.asEuint8(0));
    }

    // ------------------------
    // PROFILE
    // ------------------------

    function publishProfile(
        externalEuint8 encAge,
        externalEuint8 encGender,
        externalEuint16 encInterests,
        externalEuint16 encRegion,
        bytes calldata proof
    ) external returns (uint256 id)
    {
        id = nextProfileId++;

        Profile storage P = profiles[id];
        P.owner = msg.sender;

        P.age = FHE.fromExternal(encAge, proof);
        P.gender = FHE.fromExternal(encGender, proof);
        P.interests = FHE.fromExternal(encInterests, proof);
        P.region = FHE.fromExternal(encRegion, proof);
        P.set = true;

        FHE.allowThis(P.age);
        FHE.allowThis(P.gender);
        FHE.allowThis(P.interests);
        FHE.allowThis(P.region);

        emit ProfilePublished(id);
    }

    // ------------------------
    // PREFERENCE
    // ------------------------

    function submitPreference(
        externalEuint8 a,
        externalEuint8 b,
        externalEuint8 c,
        externalEuint16 d,
        externalEuint16 e,
        bytes calldata proof
    ) external returns (uint256 id)
    {
        id = nextPrefId++;

        Preference storage Q = prefs[id];

        Q.requester = msg.sender;
        Q.minAge = FHE.fromExternal(a, proof);
        Q.maxAge = FHE.fromExternal(b, proof);
        Q.desiredGender = FHE.fromExternal(c, proof);
        Q.interestsMask = FHE.fromExternal(d, proof);
        Q.region = FHE.fromExternal(e, proof);
        Q.set = true;

        FHE.allowThis(Q.minAge);
        FHE.allowThis(Q.maxAge);
        FHE.allowThis(Q.desiredGender);
        FHE.allowThis(Q.interestsMask);
        FHE.allowThis(Q.region);

        emit PreferenceSubmitted(id);
    }

    // ------------------------
    // COMPUTE MATCH HANDLE
    // ------------------------

    function computeMatchHandle(uint256 pid, uint256 qid)
        external returns (bytes32)
    {
        Profile storage P = profiles[pid];
        Preference storage Q = prefs[qid];

        require(P.set && Q.set, "not set");

        euint8 result = _compute(P, Q);

        // СТОРІ LJEEF MATCH у state!!
        matchMap[pid][qid] = result;

        FHE.allowThis(result);
        FHE.allow(result, P.owner);
        FHE.allow(result, Q.requester);

        bytes32 handle = FHE.toBytes32(result);

        emit MatchComputed(pid, qid, handle);
        return handle;
    }

    // ------------------------
    // PUBLIC DECRYPT
    // ------------------------

    function makeMatchPublic(uint256 pid, uint256 qid) external {
        Profile storage P = profiles[pid];
        Preference storage Q = prefs[qid];

        require(P.set && Q.set, "not set");
        require(msg.sender == P.owner || msg.sender == Q.requester, "denied");

        euint8 h = matchMap[pid][qid];

        FHE.makePubliclyDecryptable(h);

        emit MatchMadePublic(pid, qid);
    }

    function getMatchHandle(uint256 pid, uint256 qid)
    external
    view
    returns (bytes32)
{
    return FHE.toBytes32(matchMap[pid][qid]);
}


}
