"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProfileManager = void 0;
const lodash_1 = require("lodash");
const conversations_1 = require("../conversations");
const utils_1 = require("../utils");
const String_1 = require("../utils/String");
const AvatarDownloadJob_1 = require("../utils/job_runners/jobs/AvatarDownloadJob");
const sessionjs_logger_1 = require("../../sessionjs-logger");
async function updateOurProfileSync(displayName, profileUrl, profileKey, priority) {
    const us = utils_1.UserUtils.getOurPubKeyStrFromCache();
    const ourConvo = (0, conversations_1.getConversationController)().get(us);
    if (!ourConvo?.id) {
        sessionjs_logger_1.console.warn('[profileupdate] Cannot update our profile without convo associated');
        return;
    }
    await updateProfileOfContact(us, displayName, profileUrl, profileKey);
    if (priority !== null && ourConvo.get('priority') !== priority) {
        ourConvo.set('priority', priority);
        await ourConvo.commit();
    }
}
async function updateProfileOfContact(pubkey, displayName, profileUrl, profileKey) {
    const conversation = (0, conversations_1.getConversationController)().get(pubkey);
    if (!conversation || !conversation.isPrivate()) {
        sessionjs_logger_1.console.warn('updateProfileOfContact can only be used for existing and private convos');
        return;
    }
    let changes = false;
    const existingDisplayName = conversation.get('displayNameInProfile');
    if (existingDisplayName !== displayName && !(0, lodash_1.isEmpty)(displayName)) {
        conversation.set('displayNameInProfile', displayName || undefined);
        changes = true;
    }
    const profileKeyHex = !profileKey || (0, lodash_1.isEmpty)(profileKey) ? null : (0, String_1.toHex)(profileKey);
    let avatarChanged = false;
    const prevPointer = conversation.get('avatarPointer');
    const prevProfileKey = conversation.get('profileKey');
    if (prevPointer !== profileUrl || prevProfileKey !== profileKeyHex) {
        conversation.set({
            avatarPointer: profileUrl || undefined,
            profileKey: profileKeyHex || undefined,
        });
        avatarChanged = true;
    }
    if ((!profileUrl || !profileKeyHex) && conversation.get('avatarInProfile')) {
        conversation.set({ avatarInProfile: undefined });
        changes = true;
    }
    if (changes) {
        await conversation.commit();
    }
    if (avatarChanged) {
        await AvatarDownloadJob_1.AvatarDownload.addAvatarDownloadJob({
            conversationId: pubkey,
        });
    }
}
exports.ProfileManager = {
    updateOurProfileSync,
    updateProfileOfContact,
};
