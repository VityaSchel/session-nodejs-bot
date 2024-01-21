"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionUtilUserGroups = void 0;
const data_1 = require("../../../data/data");
const opengroups_1 = require("../../../data/opengroups");
const sqlSharedTypes_1 = require("../../../types/sqlSharedTypes");
const libsession_worker_interface_1 = require("../../../webworker/workers/browser/libsession_worker_interface");
const conversations_1 = require("../../conversations");
const sessionjs_logger_1 = require("../../../sessionjs-logger");
function isUserGroupToStoreInWrapper(convo) {
    return isCommunityToStoreInWrapper(convo) || isLegacyGroupToStoreInWrapper(convo);
}
function isCommunityToStoreInWrapper(convo) {
    return convo.isGroup() && convo.isPublic() && convo.isActive();
}
function isLegacyGroupToStoreInWrapper(convo) {
    return (convo.isGroup() &&
        !convo.isPublic() &&
        convo.id.startsWith('05') &&
        convo.isActive() &&
        !convo.get('isKickedFromGroup') &&
        !convo.get('left'));
}
function isLegacyGroupToRemoveFromDBIfNotInWrapper(convo) {
    return (convo.isGroup() && !convo.isPublic() && convo.id.startsWith('05'));
}
async function insertGroupsFromDBIntoWrapperAndRefresh(convoId) {
    const foundConvo = (0, conversations_1.getConversationController)().get(convoId);
    if (!foundConvo) {
        return;
    }
    if (!isUserGroupToStoreInWrapper(foundConvo)) {
        return;
    }
    const convoType = isCommunityToStoreInWrapper(foundConvo)
        ? 'Community'
        : 'LegacyGroup';
    switch (convoType) {
        case 'Community':
            const asOpengroup = foundConvo.toOpenGroupV2();
            const roomDetails = opengroups_1.OpenGroupData.getV2OpenGroupRoomByRoomId(asOpengroup);
            if (!roomDetails) {
                return;
            }
            const fullUrl = await libsession_worker_interface_1.UserGroupsWrapperActions.buildFullUrlFromDetails(roomDetails.serverUrl, roomDetails.roomId, roomDetails.serverPublicKey);
            const wrapperComm = (0, sqlSharedTypes_1.getCommunityInfoFromDBValues)({
                priority: foundConvo.get('priority'),
                fullUrl,
            });
            try {
                sessionjs_logger_1.console.debug(`inserting into usergroup wrapper "${JSON.stringify(wrapperComm)}"...`);
                await libsession_worker_interface_1.UserGroupsWrapperActions.setCommunityByFullUrl(wrapperComm.fullUrl, wrapperComm.priority);
            }
            catch (e) {
                sessionjs_logger_1.console.warn(`UserGroupsWrapperActions.set of ${convoId} failed with ${e.message}`);
            }
            break;
        case 'LegacyGroup':
            const encryptionKeyPair = await data_1.Data.getLatestClosedGroupEncryptionKeyPair(convoId);
            const wrapperLegacyGroup = (0, sqlSharedTypes_1.getLegacyGroupInfoFromDBValues)({
                id: foundConvo.id,
                priority: foundConvo.get('priority'),
                members: foundConvo.get('members') || [],
                groupAdmins: foundConvo.get('groupAdmins') || [],
                displayNameInProfile: foundConvo.get('displayNameInProfile'),
                encPubkeyHex: encryptionKeyPair?.publicHex || '',
                encSeckeyHex: encryptionKeyPair?.privateHex || '',
                lastJoinedTimestamp: foundConvo.get('lastJoinedTimestamp') || 0,
            });
            try {
                sessionjs_logger_1.console.debug(`inserting into usergroup wrapper "${foundConvo.id}"... }`, JSON.stringify(wrapperLegacyGroup));
                await libsession_worker_interface_1.UserGroupsWrapperActions.setLegacyGroup(wrapperLegacyGroup);
            }
            catch (e) {
                sessionjs_logger_1.console.warn(`UserGroupsWrapperActions.set of ${convoId} failed with ${e.message}`);
            }
            break;
        default:
            (0, sqlSharedTypes_1.assertUnreachable)(convoType, `insertGroupsFromDBIntoWrapperAndRefresh case not handeld "${convoType}"`);
    }
}
async function getCommunityByConvoIdNotCached(convoId) {
    return libsession_worker_interface_1.UserGroupsWrapperActions.getCommunityByFullUrl(convoId);
}
async function getAllCommunitiesNotCached() {
    return libsession_worker_interface_1.UserGroupsWrapperActions.getAllCommunities();
}
async function removeCommunityFromWrapper(_convoId, fullUrlWithOrWithoutPubkey) {
    const fromWrapper = await libsession_worker_interface_1.UserGroupsWrapperActions.getCommunityByFullUrl(fullUrlWithOrWithoutPubkey);
    if (fromWrapper) {
        await libsession_worker_interface_1.UserGroupsWrapperActions.eraseCommunityByFullUrl(fromWrapper.fullUrlWithPubkey);
    }
}
async function removeLegacyGroupFromWrapper(groupPk) {
    try {
        await libsession_worker_interface_1.UserGroupsWrapperActions.eraseLegacyGroup(groupPk);
    }
    catch (e) {
        sessionjs_logger_1.console.warn(`UserGroupsWrapperActions.eraseLegacyGroup with = ${groupPk} failed with`, e.message);
    }
}
function getUserGroupTypes() {
    return ['Community', 'LegacyGroup'];
}
exports.SessionUtilUserGroups = {
    isUserGroupToStoreInWrapper,
    insertGroupsFromDBIntoWrapperAndRefresh,
    getUserGroupTypes,
    isCommunityToStoreInWrapper,
    getAllCommunitiesNotCached,
    getCommunityByConvoIdNotCached,
    removeCommunityFromWrapper,
    isLegacyGroupToStoreInWrapper,
    isLegacyGroupToRemoveFromDBIfNotInWrapper,
    removeLegacyGroupFromWrapper,
};
