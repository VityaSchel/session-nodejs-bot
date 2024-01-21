"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.roomHasReactionsEnabled = exports.capabilitiesListHasBlindEnabled = exports.roomHasBlindEnabled = exports.assertUnreachable = exports.getLegacyGroupInfoFromDBValues = exports.getCommunityInfoFromDBValues = exports.getContactInfoFromDBValues = exports.CONFIG_DUMP_TABLE = void 0;
const libsodium_wrappers_sumo_1 = require("libsodium-wrappers-sumo");
const lodash_1 = require("lodash");
const String_1 = require("../session/utils/String");
const sessionjs_logger_1 = require("../sessionjs-logger");
exports.CONFIG_DUMP_TABLE = 'configDump';
function getContactInfoFromDBValues({ id, dbApproved, dbApprovedMe, dbBlocked, dbName, dbNickname, priority, dbProfileUrl, dbProfileKey, dbCreatedAtSeconds, }) {
    const wrapperContact = {
        id,
        approved: !!dbApproved,
        approvedMe: !!dbApprovedMe,
        blocked: !!dbBlocked,
        priority,
        nickname: dbNickname,
        name: dbName,
        createdAtSeconds: dbCreatedAtSeconds,
    };
    if (wrapperContact.profilePicture?.url !== dbProfileUrl ||
        !(0, lodash_1.isEqual)(wrapperContact.profilePicture?.key, dbProfileKey)) {
        wrapperContact.profilePicture = {
            url: dbProfileUrl || null,
            key: dbProfileKey && !(0, lodash_1.isEmpty)(dbProfileKey) ? (0, String_1.fromHexToArray)(dbProfileKey) : null,
        };
    }
    return wrapperContact;
}
exports.getContactInfoFromDBValues = getContactInfoFromDBValues;
function getCommunityInfoFromDBValues({ priority, fullUrl, }) {
    const community = {
        fullUrl,
        priority: priority || 0,
    };
    return community;
}
exports.getCommunityInfoFromDBValues = getCommunityInfoFromDBValues;
function maybeArrayJSONtoArray(arr) {
    try {
        if ((0, lodash_1.isArray)(arr)) {
            return arr;
        }
        const parsed = JSON.parse(arr);
        if ((0, lodash_1.isArray)(parsed)) {
            return parsed;
        }
        return [];
    }
    catch (e) {
        return [];
    }
}
function getLegacyGroupInfoFromDBValues({ id, priority, members: maybeMembers, displayNameInProfile, encPubkeyHex, encSeckeyHex, groupAdmins: maybeAdmins, lastJoinedTimestamp, }) {
    const admins = maybeArrayJSONtoArray(maybeAdmins);
    const members = maybeArrayJSONtoArray(maybeMembers);
    const wrappedMembers = (members || []).map(m => {
        return {
            isAdmin: admins.includes(m),
            pubkeyHex: m,
        };
    });
    const legacyGroup = {
        pubkeyHex: id,
        name: displayNameInProfile || '',
        priority: priority || 0,
        members: wrappedMembers,
        encPubkey: !(0, lodash_1.isEmpty)(encPubkeyHex) ? (0, libsodium_wrappers_sumo_1.from_hex)(encPubkeyHex) : new Uint8Array(),
        encSeckey: !(0, lodash_1.isEmpty)(encSeckeyHex) ? (0, libsodium_wrappers_sumo_1.from_hex)(encSeckeyHex) : new Uint8Array(),
        joinedAtSeconds: Math.floor(lastJoinedTimestamp / 1000),
    };
    return legacyGroup;
}
exports.getLegacyGroupInfoFromDBValues = getLegacyGroupInfoFromDBValues;
function assertUnreachable(_x, message) {
    const msg = `assertUnreachable: Didn't expect to get here with "${message}"`;
    sessionjs_logger_1.console.info(msg);
    throw new Error(msg);
}
exports.assertUnreachable = assertUnreachable;
function roomHasBlindEnabled(openGroup) {
    return capabilitiesListHasBlindEnabled(openGroup?.capabilities);
}
exports.roomHasBlindEnabled = roomHasBlindEnabled;
function capabilitiesListHasBlindEnabled(caps) {
    return Boolean(caps?.includes('blind'));
}
exports.capabilitiesListHasBlindEnabled = capabilitiesListHasBlindEnabled;
function roomHasReactionsEnabled(openGroup) {
    return Boolean(openGroup?.capabilities?.includes('reactions'));
}
exports.roomHasReactionsEnabled = roomHasReactionsEnabled;
