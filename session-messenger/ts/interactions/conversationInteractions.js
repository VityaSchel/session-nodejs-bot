"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.callRecipient = exports.showLinkSharingConfirmationModalDialog = exports.replyToMessage = exports.clearOurAvatar = exports.uploadOurAvatar = exports.setDisappearingMessagesByConvoId = exports.deleteAllMessagesByConvoIdWithConfirmation = exports.deleteAllMessagesByConvoIdNoConfirmation = exports.showChangeNickNameByConvoId = exports.clearNickNameByConvoId = exports.setNotificationForConvoId = exports.markAllReadByConvoId = exports.showUnbanUserByConvoId = exports.showBanUserByConvoId = exports.showRemoveModeratorsByConvoId = exports.showAddModeratorsByConvoId = exports.showInviteContactByConvoId = exports.showLeaveGroupByConvoId = exports.showUpdateGroupMembersByConvoId = exports.showUpdateGroupNameByConvoId = exports.declineConversationWithConfirm = exports.declineConversationWithoutConfirm = exports.approveConvoAndSendResponse = exports.unblockConvoById = exports.blockConvoById = exports.copyPublicKeyByConvoId = void 0;
const lodash_1 = require("lodash");
const conversationAttributes_1 = require("../models/conversationAttributes");
const utils_1 = require("../session/utils");
const data_1 = require("../data/data");
const settings_key_1 = require("../data/settings-key");
const FileServerApi_1 = require("../session/apis/file_server_api/FileServerApi");
const utils_2 = require("../session/apis/open_group_api/utils");
const conversations_1 = require("../session/conversations");
const crypto_1 = require("../session/crypto");
const DecryptedAttachmentsManager_1 = require("../session/crypto/DecryptedAttachmentsManager");
const Performance_1 = require("../session/utils/Performance");
const String_1 = require("../session/utils/String");
const ConfigurationSyncJob_1 = require("../session/utils/job_runners/jobs/ConfigurationSyncJob");
const libsession_utils_contacts_1 = require("../session/utils/libsession/libsession_utils_contacts");
const syncUtils_1 = require("../session/utils/sync/syncUtils");
const types_1 = require("../types");
const MIME_1 = require("../types/MIME");
const MessageAttachment_1 = require("../types/MessageAttachment");
const VisualAttachment_1 = require("../types/attachments/VisualAttachment");
const blockedNumberController_1 = require("../util/blockedNumberController");
const profileEncrypter_1 = require("../util/crypto/profileEncrypter");
const releaseFeature_1 = require("../util/releaseFeature");
const storage_1 = require("../util/storage");
const libsession_worker_interface_1 = require("../webworker/workers/browser/libsession_worker_interface");
const sessionjs_logger_1 = require("../sessionjs-logger");
async function copyPublicKeyByConvoId(convoId) {
    if (utils_2.OpenGroupUtils.isOpenGroupV2(convoId)) {
        const fromWrapper = await libsession_worker_interface_1.UserGroupsWrapperActions.getCommunityByFullUrl(convoId);
        if (!fromWrapper) {
            sessionjs_logger_1.console.warn('opengroup to copy was not found in the UserGroupsWrapper');
            return;
        }
        if (fromWrapper.fullUrlWithPubkey) {
            sessionjs_logger_1.console.log('Copy', fromWrapper.fullUrlWithPubkey);
        }
    }
    else {
        sessionjs_logger_1.console.log('Copy', convoId);
    }
}
exports.copyPublicKeyByConvoId = copyPublicKeyByConvoId;
async function blockConvoById(conversationId) {
    const conversation = (0, conversations_1.getConversationController)().get(conversationId);
    if (!conversation.id || conversation.isPublic()) {
        return;
    }
    await blockedNumberController_1.BlockedNumberController.block(conversation.id);
    await conversation.commit();
    sessionjs_logger_1.console.log('blocked');
}
exports.blockConvoById = blockConvoById;
async function unblockConvoById(conversationId) {
    const conversation = (0, conversations_1.getConversationController)().get(conversationId);
    if (!conversation) {
        await blockedNumberController_1.BlockedNumberController.unblockAll([conversationId]);
        sessionjs_logger_1.console.log('unblocked');
        return;
    }
    if (!conversation.id || conversation.isPublic()) {
        return;
    }
    await blockedNumberController_1.BlockedNumberController.unblockAll([conversationId]);
    sessionjs_logger_1.console.log('unblocked');
    await conversation.commit();
}
exports.unblockConvoById = unblockConvoById;
const approveConvoAndSendResponse = async (conversationId, syncToDevices = true) => {
    const convoToApprove = (0, conversations_1.getConversationController)().get(conversationId);
    if (!convoToApprove) {
        sessionjs_logger_1.console.info('Conversation is already approved.');
        return;
    }
    await convoToApprove.setIsApproved(true, false);
    await convoToApprove.commit();
    await convoToApprove.sendMessageRequestResponse();
    if (syncToDevices) {
        await (0, syncUtils_1.forceSyncConfigurationNowIfNeeded)();
    }
};
exports.approveConvoAndSendResponse = approveConvoAndSendResponse;
async function declineConversationWithoutConfirm({ blockContact, conversationId, currentlySelectedConvo, syncToDevices, }) {
    const conversationToDecline = (0, conversations_1.getConversationController)().get(conversationId);
    if (!conversationToDecline || !conversationToDecline.isPrivate()) {
        sessionjs_logger_1.console.info('No conversation to decline.');
        return;
    }
    await conversationToDecline.setIsApproved(false, false);
    await conversationToDecline.setDidApproveMe(false, false);
    await conversationToDecline.commit();
    if (blockContact) {
        await blockConvoById(conversationId);
    }
    if (conversationToDecline.isPrivate() &&
        !libsession_utils_contacts_1.SessionUtilContact.isContactToStoreInWrapper(conversationToDecline)) {
        await libsession_utils_contacts_1.SessionUtilContact.removeContactFromWrapper(conversationToDecline.id);
    }
    if (syncToDevices) {
        await (0, syncUtils_1.forceSyncConfigurationNowIfNeeded)();
    }
    if (currentlySelectedConvo && currentlySelectedConvo === conversationId) {
        sessionjs_logger_1.console.log('[SBOT/redux] resetConversationExternal');
    }
}
exports.declineConversationWithoutConfirm = declineConversationWithoutConfirm;
const declineConversationWithConfirm = ({}) => {
    sessionjs_logger_1.console.log('[SBOT/redux] updateConfirmModal');
};
exports.declineConversationWithConfirm = declineConversationWithConfirm;
async function showUpdateGroupNameByConvoId(conversationId) {
    const conversation = (0, conversations_1.getConversationController)().get(conversationId);
    if (conversation.isClosedGroup()) {
        await Promise.all(conversation
            .get('members')
            .map(m => (0, conversations_1.getConversationController)().getOrCreateAndWait(m, conversationAttributes_1.ConversationTypeEnum.PRIVATE)));
    }
    sessionjs_logger_1.console.log('[SBOT/redux] updateGroupNameModal');
}
exports.showUpdateGroupNameByConvoId = showUpdateGroupNameByConvoId;
async function showUpdateGroupMembersByConvoId(conversationId) {
    const conversation = (0, conversations_1.getConversationController)().get(conversationId);
    if (conversation.isClosedGroup()) {
        await Promise.all(conversation
            .get('members')
            .map(m => (0, conversations_1.getConversationController)().getOrCreateAndWait(m, conversationAttributes_1.ConversationTypeEnum.PRIVATE)));
    }
    sessionjs_logger_1.console.log('[SBOT/redux] updateGroupMembersModal');
}
exports.showUpdateGroupMembersByConvoId = showUpdateGroupMembersByConvoId;
function showLeaveGroupByConvoId(conversationId) {
    const conversation = (0, conversations_1.getConversationController)().get(conversationId);
    if (!conversation.isGroup()) {
        throw new Error('showLeaveGroupDialog() called with a non group convo.');
    }
    const title = 'leavegroup_title';
    const message = 'leavegroup_confirmation';
    const isAdmin = (conversation.get('groupAdmins') || []).includes(utils_1.UserUtils.getOurPubKeyStrFromCache());
    const isClosedGroup = conversation.isClosedGroup() || false;
    const isPublic = conversation.isPublic() || false;
    if (isPublic || (isClosedGroup && !isAdmin)) {
        const onClickClose = () => {
            sessionjs_logger_1.console.log('[SBOT/redux] updateConfirmModal');
        };
        sessionjs_logger_1.console.log('[SBOT/redux] updateConfirmModal');
        return;
    }
    sessionjs_logger_1.console.log('[SBOT/redux] adminLeaveClosedGroup');
}
exports.showLeaveGroupByConvoId = showLeaveGroupByConvoId;
function showInviteContactByConvoId(conversationId) {
    sessionjs_logger_1.console.log('[SBOT/redux] updateInviteContactModal');
}
exports.showInviteContactByConvoId = showInviteContactByConvoId;
function showAddModeratorsByConvoId(conversationId) {
    sessionjs_logger_1.console.log('[SBOT/redux] updateAddModeratorsModal');
}
exports.showAddModeratorsByConvoId = showAddModeratorsByConvoId;
function showRemoveModeratorsByConvoId(conversationId) {
    sessionjs_logger_1.console.log('[SBOT/redux] updateRemoveModeratorsModal');
}
exports.showRemoveModeratorsByConvoId = showRemoveModeratorsByConvoId;
function showBanUserByConvoId(conversationId, pubkey) {
    sessionjs_logger_1.console.log('[SBOT/redux] updateBanOrUnbanUserModal');
}
exports.showBanUserByConvoId = showBanUserByConvoId;
function showUnbanUserByConvoId(conversationId, pubkey) {
    sessionjs_logger_1.console.log('[SBOT/redux] updateBanOrUnbanUserModal');
}
exports.showUnbanUserByConvoId = showUnbanUserByConvoId;
async function markAllReadByConvoId(conversationId) {
    const conversation = (0, conversations_1.getConversationController)().get(conversationId);
    (0, Performance_1.perfStart)(`markAllReadByConvoId-${conversationId}`);
    await conversation?.markAllAsRead();
    (0, Performance_1.perfEnd)(`markAllReadByConvoId-${conversationId}`, 'markAllReadByConvoId');
}
exports.markAllReadByConvoId = markAllReadByConvoId;
async function setNotificationForConvoId(conversationId, selected) {
    const conversation = (0, conversations_1.getConversationController)().get(conversationId);
    const existingSettings = conversation.get('triggerNotificationsFor');
    if (existingSettings !== selected) {
        conversation.set({ triggerNotificationsFor: selected });
        await conversation.commit();
    }
}
exports.setNotificationForConvoId = setNotificationForConvoId;
async function clearNickNameByConvoId(conversationId) {
    const conversation = (0, conversations_1.getConversationController)().get(conversationId);
    await conversation.setNickname(null, true);
}
exports.clearNickNameByConvoId = clearNickNameByConvoId;
function showChangeNickNameByConvoId(conversationId) {
    sessionjs_logger_1.console.log('[SBOT/redux] changeNickNameModal');
}
exports.showChangeNickNameByConvoId = showChangeNickNameByConvoId;
async function deleteAllMessagesByConvoIdNoConfirmation(conversationId) {
    const conversation = (0, conversations_1.getConversationController)().get(conversationId);
    await data_1.Data.removeAllMessagesInConversation(conversationId);
    conversation.set({
        lastMessage: null,
    });
    await conversation.commit();
    sessionjs_logger_1.console.log('[SBOT/redux] conversationReset');
}
exports.deleteAllMessagesByConvoIdNoConfirmation = deleteAllMessagesByConvoIdNoConfirmation;
function deleteAllMessagesByConvoIdWithConfirmation(conversationId) {
    const onClickClose = () => {
        sessionjs_logger_1.console.log('[SBOT/redux] updateConfirmModal');
    };
    const onClickOk = async () => {
        await deleteAllMessagesByConvoIdNoConfirmation(conversationId);
        onClickClose();
    };
    sessionjs_logger_1.console.log('[SBOT/redux] updateConfirmModal');
}
exports.deleteAllMessagesByConvoIdWithConfirmation = deleteAllMessagesByConvoIdWithConfirmation;
async function setDisappearingMessagesByConvoId(conversationId, seconds) {
    const conversation = (0, conversations_1.getConversationController)().get(conversationId);
    const canSetDisappearing = !conversation.isOutgoingRequest() && !conversation.isIncomingRequest();
    if (!canSetDisappearing) {
        sessionjs_logger_1.console.log('[SBOT/redux] pushMustBeApproved');
        return;
    }
    if (!seconds || seconds <= 0) {
        await conversation.updateExpireTimer(null);
    }
    else {
        await conversation.updateExpireTimer(seconds);
    }
}
exports.setDisappearingMessagesByConvoId = setDisappearingMessagesByConvoId;
async function uploadOurAvatar(newAvatarDecrypted) {
    const ourConvo = (0, conversations_1.getConversationController)().get(utils_1.UserUtils.getOurPubKeyStrFromCache());
    if (!ourConvo) {
        sessionjs_logger_1.console.warn('ourConvo not found... This is not a valid case');
        return null;
    }
    let profileKey;
    let decryptedAvatarData;
    if (newAvatarDecrypted) {
        profileKey = (await (0, crypto_1.getSodiumRenderer)()).randombytes_buf(32);
        decryptedAvatarData = newAvatarDecrypted;
    }
    else {
        const ourConvoProfileKey = (0, conversations_1.getConversationController)()
            .get(utils_1.UserUtils.getOurPubKeyStrFromCache())
            ?.get('profileKey') || null;
        profileKey = ourConvoProfileKey ? (0, String_1.fromHexToArray)(ourConvoProfileKey) : null;
        if (!profileKey) {
            sessionjs_logger_1.console.info('our profileKey not found. Not reuploading our avatar');
            return null;
        }
        const currentAttachmentPath = ourConvo.getAvatarPath();
        if (!currentAttachmentPath) {
            sessionjs_logger_1.console.warn('No attachment currently set for our convo.. Nothing to do.');
            return null;
        }
        const decryptedAvatarUrl = await (0, DecryptedAttachmentsManager_1.getDecryptedMediaUrl)(currentAttachmentPath, MIME_1.IMAGE_JPEG, true);
        if (!decryptedAvatarUrl) {
            sessionjs_logger_1.console.warn('Could not decrypt avatar stored locally..');
            return null;
        }
        const blob = await (0, VisualAttachment_1.urlToBlob)(decryptedAvatarUrl);
        decryptedAvatarData = await blob.arrayBuffer();
    }
    if (!decryptedAvatarData?.byteLength) {
        sessionjs_logger_1.console.warn('Could not read content of avatar ...');
        return null;
    }
    const encryptedData = await (0, profileEncrypter_1.encryptProfile)(decryptedAvatarData, profileKey);
    const avatarPointer = await (0, FileServerApi_1.uploadFileToFsWithOnionV4)(encryptedData);
    if (!avatarPointer) {
        sessionjs_logger_1.console.warn('failed to upload avatar to fileserver');
        return null;
    }
    const { fileUrl, fileId } = avatarPointer;
    ourConvo.set('avatarPointer', fileUrl);
    const upgraded = await (0, MessageAttachment_1.processNewAttachment)({
        isRaw: true,
        data: decryptedAvatarData,
        contentType: types_1.MIME.IMAGE_UNKNOWN,
    });
    ourConvo.set('avatarInProfile', undefined);
    const displayName = ourConvo.get('displayNameInProfile');
    ourConvo.set({ profileKey: (0, String_1.toHex)(profileKey) });
    await ourConvo.setSessionProfile({
        avatarPath: upgraded.path,
        displayName,
        avatarImageId: fileId,
    });
    const newTimestampReupload = Date.now();
    await storage_1.Storage.put(settings_key_1.SettingsKey.lastAvatarUploadTimestamp, newTimestampReupload);
    if (newAvatarDecrypted) {
        await (0, storage_1.setLastProfileUpdateTimestamp)(Date.now());
        await ConfigurationSyncJob_1.ConfigurationSync.queueNewJobIfNeeded();
        const userConfigLibsession = await releaseFeature_1.ReleasedFeatures.checkIsUserConfigFeatureReleased();
        if (!userConfigLibsession) {
            await utils_1.SyncUtils.forceSyncConfigurationNowIfNeeded(true);
        }
    }
    else {
        sessionjs_logger_1.console.info(`Reuploading avatar finished at ${newTimestampReupload}, newAttachmentPointer ${fileUrl}`);
    }
    return {
        avatarPointer: ourConvo.get('avatarPointer'),
        profileKey: ourConvo.get('profileKey'),
    };
}
exports.uploadOurAvatar = uploadOurAvatar;
async function clearOurAvatar(commit = true) {
    const ourConvo = (0, conversations_1.getConversationController)().get(utils_1.UserUtils.getOurPubKeyStrFromCache());
    if (!ourConvo) {
        sessionjs_logger_1.console.warn('ourConvo not found... This is not a valid case');
        return;
    }
    if ((0, lodash_1.isNil)(ourConvo.get('avatarPointer')) &&
        (0, lodash_1.isNil)(ourConvo.get('avatarInProfile')) &&
        (0, lodash_1.isNil)(ourConvo.get('profileKey'))) {
        return;
    }
    ourConvo.set('avatarPointer', undefined);
    ourConvo.set('avatarInProfile', undefined);
    ourConvo.set('profileKey', undefined);
    await (0, storage_1.setLastProfileUpdateTimestamp)(Date.now());
    if (commit) {
        await ourConvo.commit();
        await utils_1.SyncUtils.forceSyncConfigurationNowIfNeeded(true);
    }
}
exports.clearOurAvatar = clearOurAvatar;
async function replyToMessage(messageId) {
    const quotedMessageModel = await data_1.Data.getMessageById(messageId);
    if (!quotedMessageModel) {
        sessionjs_logger_1.console.warn('Failed to find message to reply to');
        return;
    }
    const conversationModel = (0, conversations_1.getConversationController)().getOrThrow(quotedMessageModel.get('conversationId'));
    const quotedMessageProps = await conversationModel.makeQuote(quotedMessageModel);
    if (quotedMessageProps) {
        sessionjs_logger_1.console.log('[SBOT/redux] quoteMessage');
    }
    else {
        sessionjs_logger_1.console.log('[SBOT/redux] quoteMessage');
    }
}
exports.replyToMessage = replyToMessage;
async function showLinkSharingConfirmationModalDialog(e) {
    const pastedText = e.clipboardData.getData('text');
    if (isURL(pastedText)) {
        const alreadyDisplayedPopup = (await data_1.Data.getItemById(settings_key_1.SettingsKey.hasLinkPreviewPopupBeenDisplayed))?.value || false;
        if (!alreadyDisplayedPopup) {
            sessionjs_logger_1.console.log('[SBOT/redux] updateConfirmModal');
        }
    }
}
exports.showLinkSharingConfirmationModalDialog = showLinkSharingConfirmationModalDialog;
function isURL(str) {
    const urlRegex = '^(?!mailto:)(?:(?:http|https|ftp)://)(?:\\S+(?::\\S*)?@)?(?:(?:(?:[1-9]\\d?|1\\d\\d|2[01]\\d|22[0-3])(?:\\.(?:1?\\d{1,2}|2[0-4]\\d|25[0-5])){2}(?:\\.(?:[0-9]\\d?|1\\d\\d|2[0-4]\\d|25[0-4]))|(?:(?:[a-z\\u00a1-\\uffff0-9]+-?)*[a-z\\u00a1-\\uffff0-9]+)(?:\\.(?:[a-z\\u00a1-\\uffff0-9]+-?)*[a-z\\u00a1-\\uffff0-9]+)*(?:\\.(?:[a-z\\u00a1-\\uffff]{2,})))|localhost)(?::\\d{2,5})?(?:(/|\\?|#)[^\\s]*)?$';
    const url = new RegExp(urlRegex, 'i');
    return str.length < 2083 && url.test(str);
}
async function callRecipient(pubkey, canCall) {
    const convo = (0, conversations_1.getConversationController)().get(pubkey);
    if (!canCall) {
        sessionjs_logger_1.console.log('[SBOT] Unable To Call');
        return;
    }
    if (convo && convo.isPrivate() && !convo.isMe()) {
        await utils_1.CallManager.USER_callRecipient(convo.id);
    }
}
exports.callRecipient = callRecipient;
