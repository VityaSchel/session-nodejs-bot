"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionUtilUserProfile = void 0;
const lodash_1 = require("lodash");
const __1 = require("..");
const libsession_worker_interface_1 = require("../../../webworker/workers/browser/libsession_worker_interface");
const conversations_1 = require("../../conversations");
const String_1 = require("../String");
const conversationAttributes_1 = require("../../../models/conversationAttributes");
const storage_1 = require("../../../util/storage");
const settings_key_1 = require("../../../data/settings-key");
const sessionjs_logger_1 = require("../../../sessionjs-logger");
async function insertUserProfileIntoWrapper(convoId) {
    if (!isUserProfileToStoreInWrapper(convoId)) {
        return;
    }
    const us = __1.UserUtils.getOurPubKeyStrFromCache();
    const ourConvo = (0, conversations_1.getConversationController)().get(us);
    if (!ourConvo) {
        throw new Error('insertUserProfileIntoWrapper needs a ourConvo to exist');
    }
    const dbName = ourConvo.get('displayNameInProfile') || '';
    const dbProfileUrl = ourConvo.get('avatarPointer') || '';
    const dbProfileKey = (0, String_1.fromHexToArray)(ourConvo.get('profileKey') || '');
    const priority = ourConvo.get('priority') || conversationAttributes_1.CONVERSATION_PRIORITIES.default;
    const areBlindedMsgRequestEnabled = !!storage_1.Storage.get(settings_key_1.SettingsKey.hasBlindedMsgRequestsEnabled);
    sessionjs_logger_1.console.debug(`inserting into userprofile wrapper: username:"${dbName}", priority:${priority} image:${JSON.stringify({ url: dbProfileUrl, key: dbProfileKey })}, settings: ${JSON.stringify({ areBlindedMsgRequestEnabled })}`);
    if (dbProfileUrl && !(0, lodash_1.isEmpty)(dbProfileKey)) {
        await libsession_worker_interface_1.UserConfigWrapperActions.setUserInfo(dbName, priority, {
            url: dbProfileUrl,
            key: dbProfileKey,
        });
    }
    else {
        await libsession_worker_interface_1.UserConfigWrapperActions.setUserInfo(dbName, priority, null);
    }
    await libsession_worker_interface_1.UserConfigWrapperActions.setEnableBlindedMsgRequest(areBlindedMsgRequestEnabled);
}
function isUserProfileToStoreInWrapper(convoId) {
    try {
        const us = __1.UserUtils.getOurPubKeyStrFromCache();
        return convoId === us;
    }
    catch (e) {
        return false;
    }
}
exports.SessionUtilUserProfile = {
    insertUserProfileIntoWrapper,
    isUserProfileToStoreInWrapper,
};
