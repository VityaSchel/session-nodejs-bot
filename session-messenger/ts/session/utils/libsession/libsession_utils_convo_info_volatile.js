"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionUtilConvoInfoVolatile = void 0;
const lodash_1 = require("lodash");
const data_1 = require("../../../data/data");
const opengroups_1 = require("../../../data/opengroups");
const sqlSharedTypes_1 = require("../../../types/sqlSharedTypes");
const libsession_worker_interface_1 = require("../../../webworker/workers/browser/libsession_worker_interface");
const utils_1 = require("../../apis/open_group_api/utils");
const conversations_1 = require("../../conversations");
const libsession_utils_contacts_1 = require("./libsession_utils_contacts");
const libsession_utils_user_groups_1 = require("./libsession_utils_user_groups");
const libsession_utils_user_profile_1 = require("./libsession_utils_user_profile");
const sessionjs_logger_1 = require("../../../sessionjs-logger");
const mapped1o1WrapperValues = new Map();
const mappedLegacyGroupWrapperValues = new Map();
const mappedCommunityWrapperValues = new Map();
function isConvoToStoreInWrapper(convo) {
    return (libsession_utils_user_groups_1.SessionUtilUserGroups.isUserGroupToStoreInWrapper(convo) ||
        libsession_utils_contacts_1.SessionUtilContact.isContactToStoreInWrapper(convo) ||
        libsession_utils_user_profile_1.SessionUtilUserProfile.isUserProfileToStoreInWrapper(convo.id));
}
function getConvoType(convo) {
    const convoType = libsession_utils_contacts_1.SessionUtilContact.isContactToStoreInWrapper(convo) ||
        libsession_utils_user_profile_1.SessionUtilUserProfile.isUserProfileToStoreInWrapper(convo.id)
        ? '1o1'
        : libsession_utils_user_groups_1.SessionUtilUserGroups.isCommunityToStoreInWrapper(convo)
            ? 'Community'
            : 'LegacyGroup';
    return convoType;
}
async function insertConvoFromDBIntoWrapperAndRefresh(convoId) {
    const foundConvo = (0, conversations_1.getConversationController)().get(convoId);
    if (!foundConvo || !isConvoToStoreInWrapper(foundConvo)) {
        return;
    }
    const isForcedUnread = foundConvo.isMarkedUnread();
    const timestampFromDbMs = (await data_1.Data.fetchConvoMemoryDetails(convoId))?.lastReadTimestampMessage;
    const lastReadMessageTimestamp = !!timestampFromDbMs && (0, lodash_1.isFinite)(timestampFromDbMs) && timestampFromDbMs > 0
        ? timestampFromDbMs
        : 0;
    sessionjs_logger_1.console.debug(`inserting into convoVolatile wrapper: ${convoId} lastMessageReadTimestamp:${lastReadMessageTimestamp} forcedUnread:${isForcedUnread}...`);
    const convoType = getConvoType(foundConvo);
    switch (convoType) {
        case '1o1':
            try {
                await libsession_worker_interface_1.ConvoInfoVolatileWrapperActions.set1o1(convoId, lastReadMessageTimestamp, isForcedUnread);
                await refreshConvoVolatileCached(convoId, false, false);
            }
            catch (e) {
                sessionjs_logger_1.console.warn(`ConvoInfoVolatileWrapperActions.set1o1 of ${convoId} failed with ${e.message}`);
            }
            break;
        case 'LegacyGroup':
            try {
                await libsession_worker_interface_1.ConvoInfoVolatileWrapperActions.setLegacyGroup(convoId, lastReadMessageTimestamp, isForcedUnread);
                await refreshConvoVolatileCached(convoId, true, false);
            }
            catch (e) {
                sessionjs_logger_1.console.warn(`ConvoInfoVolatileWrapperActions.setLegacyGroup of ${convoId} failed with ${e.message}`);
            }
            break;
        case 'Community':
            try {
                const asOpengroup = foundConvo.toOpenGroupV2();
                const roomDetails = opengroups_1.OpenGroupData.getV2OpenGroupRoomByRoomId(asOpengroup);
                if (!roomDetails || (0, lodash_1.isEmpty)(roomDetails.serverPublicKey)) {
                    return;
                }
                const fullUrlWithPubkey = await libsession_worker_interface_1.UserGroupsWrapperActions.buildFullUrlFromDetails(roomDetails.serverUrl, roomDetails.roomId, roomDetails.serverPublicKey);
                await libsession_worker_interface_1.ConvoInfoVolatileWrapperActions.setCommunityByFullUrl(fullUrlWithPubkey, lastReadMessageTimestamp, isForcedUnread);
                await refreshConvoVolatileCached(convoId, false, false);
            }
            catch (e) {
                sessionjs_logger_1.console.warn(`ConvoInfoVolatileWrapperActions.setCommunityByFullUrl of ${convoId} failed with ${e.message}`);
            }
            break;
        default:
            (0, sqlSharedTypes_1.assertUnreachable)(convoType, `insertConvoFromDBIntoWrapperAndRefresh unhandled case "${convoType}"`);
    }
}
async function refreshConvoVolatileCached(convoId, isLegacyGroup, duringAppStart) {
    try {
        let convoType = '1o1';
        let refreshed = false;
        if (utils_1.OpenGroupUtils.isOpenGroupV2(convoId)) {
            convoType = 'Community';
        }
        else if (convoId.startsWith('05') && isLegacyGroup) {
            convoType = 'LegacyGroup';
        }
        else if (convoId.startsWith('05')) {
            convoType = '1o1';
        }
        switch (convoType) {
            case '1o1':
                const fromWrapper1o1 = await libsession_worker_interface_1.ConvoInfoVolatileWrapperActions.get1o1(convoId);
                if (fromWrapper1o1) {
                    mapped1o1WrapperValues.set(convoId, fromWrapper1o1);
                }
                refreshed = true;
                break;
            case 'LegacyGroup':
                const fromWrapperLegacyGroup = await libsession_worker_interface_1.ConvoInfoVolatileWrapperActions.getLegacyGroup(convoId);
                if (fromWrapperLegacyGroup) {
                    mappedLegacyGroupWrapperValues.set(convoId, fromWrapperLegacyGroup);
                }
                refreshed = true;
                break;
            case 'Community':
                const fromWrapperCommunity = await libsession_worker_interface_1.ConvoInfoVolatileWrapperActions.getCommunity(convoId);
                if (fromWrapperCommunity && fromWrapperCommunity.fullUrlWithPubkey) {
                    mappedCommunityWrapperValues.set(convoId, fromWrapperCommunity);
                }
                refreshed = true;
                break;
            default:
                (0, sqlSharedTypes_1.assertUnreachable)(convoType, `refreshConvoVolatileCached unhandled case "${convoType}"`);
        }
        if (refreshed && !duringAppStart) {
            (0, conversations_1.getConversationController)()
                .get(convoId)
                ?.triggerUIRefresh();
        }
    }
    catch (e) {
        sessionjs_logger_1.console.info(`refreshMappedValue for volatile convoID: ${convoId}`, e.message);
    }
}
function getVolatileInfoCached(convoId) {
    return (mapped1o1WrapperValues.get(convoId) ||
        mappedLegacyGroupWrapperValues.get(convoId) ||
        mappedCommunityWrapperValues.get(convoId));
}
async function removeCommunityFromWrapper(convoId, fullUrlWithPubkey) {
    try {
        await libsession_worker_interface_1.ConvoInfoVolatileWrapperActions.eraseCommunityByFullUrl(fullUrlWithPubkey);
    }
    catch (e) {
        sessionjs_logger_1.console.warn('removeCommunityFromWrapper failed with ', e.message);
    }
    mappedCommunityWrapperValues.delete(convoId);
}
async function removeLegacyGroupFromWrapper(convoId) {
    try {
        await libsession_worker_interface_1.ConvoInfoVolatileWrapperActions.eraseLegacyGroup(convoId);
    }
    catch (e) {
        sessionjs_logger_1.console.warn('removeLegacyGroupFromWrapper failed with ', e.message);
    }
    mappedLegacyGroupWrapperValues.delete(convoId);
}
async function removeContactFromWrapper(convoId) {
    try {
        await libsession_worker_interface_1.ConvoInfoVolatileWrapperActions.erase1o1(convoId);
    }
    catch (e) {
        sessionjs_logger_1.console.warn('removeContactFromWrapper failed with ', e.message);
    }
    mapped1o1WrapperValues.delete(convoId);
}
function getConvoInfoVolatileTypes() {
    return ['1o1', 'LegacyGroup', 'Community'];
}
exports.SessionUtilConvoInfoVolatile = {
    isConvoToStoreInWrapper,
    insertConvoFromDBIntoWrapperAndRefresh,
    refreshConvoVolatileCached,
    getConvoInfoVolatileTypes,
    getVolatileInfoCached,
    removeContactFromWrapper,
    removeLegacyGroupFromWrapper,
    removeCommunityFromWrapper,
};
