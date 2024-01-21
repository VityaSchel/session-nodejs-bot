"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.joinOpenGroupV2WithUIEvents = exports.parseOpenGroupV2 = void 0;
const sessionjs_logger_1 = require("../../../../sessionjs-logger");
const conversations_1 = require("../../../conversations");
const utils_1 = require("../../../utils");
const syncUtils_1 = require("../../../utils/sync/syncUtils");
const OpenGroupUtils_1 = require("../utils/OpenGroupUtils");
const ApiUtil_1 = require("./ApiUtil");
const OpenGroupManagerV2_1 = require("./OpenGroupManagerV2");
function parseOpenGroupV2(urlWithPubkey) {
    const trimmed = urlWithPubkey.trim();
    try {
        if (!OpenGroupUtils_1.openGroupV2CompleteURLRegex.test(trimmed)) {
            throw new Error('regex fail');
        }
        const prefixedUrl = (0, OpenGroupUtils_1.prefixify)(trimmed);
        const url = new URL(prefixedUrl);
        const serverUrl = `${url.protocol}//${url.host}`;
        const room = {
            serverUrl,
            roomId: url.pathname.slice(1),
            serverPublicKey: url.search.slice(OpenGroupUtils_1.publicKeyParam.length + 1),
        };
        return room;
    }
    catch (e) {
        sessionjs_logger_1.console.error('Invalid Opengroup v2 join URL:', trimmed, e);
    }
    return undefined;
}
exports.parseOpenGroupV2 = parseOpenGroupV2;
async function joinOpenGroupV2(room, fromConfigMessage) {
    if (!room.serverUrl || !room.roomId || room.roomId.length < 1 || !room.serverPublicKey) {
        return undefined;
    }
    const serverUrl = room.serverUrl;
    const roomId = room.roomId;
    const publicKey = room.serverPublicKey.toLowerCase();
    const prefixedServer = (0, OpenGroupUtils_1.prefixify)(serverUrl);
    const alreadyExist = (0, ApiUtil_1.hasExistingOpenGroup)(serverUrl, roomId);
    const conversationId = (0, OpenGroupUtils_1.getOpenGroupV2ConversationId)(serverUrl, roomId);
    const existingConvo = (0, conversations_1.getConversationController)().get(conversationId);
    if (alreadyExist) {
        sessionjs_logger_1.console.warn('Skipping join opengroupv2: already exists');
        return undefined;
    }
    if (existingConvo) {
        sessionjs_logger_1.console.warn('leaving before rejoining open group v2 room', conversationId);
        await (0, conversations_1.getConversationController)().deleteCommunity(conversationId, {
            fromSyncMessage: true,
        });
    }
    try {
        const conversation = await utils_1.PromiseUtils.timeout((0, OpenGroupManagerV2_1.getOpenGroupManager)().attemptConnectionV2OneAtATime(prefixedServer, roomId, publicKey), 20000);
        if (!conversation) {
            sessionjs_logger_1.console.warn('Failed to join open group v2');
            throw new Error(window.i18n('connectToServerFail'));
        }
        if (!fromConfigMessage) {
            await (0, syncUtils_1.forceSyncConfigurationNowIfNeeded)();
        }
        return conversation;
    }
    catch (e) {
        sessionjs_logger_1.console.error('Could not join open group v2', e.message);
        throw e;
    }
}
async function joinOpenGroupV2WithUIEvents(completeUrl, showToasts, fromConfigMessage, uiCallback) {
    try {
        const parsedRoom = parseOpenGroupV2(completeUrl);
        if (!parsedRoom) {
            if (showToasts) {
                utils_1.ToastUtils.pushToastError('connectToServer', window.i18n('invalidOpenGroupUrl'));
            }
            return false;
        }
        const alreadyExist = (0, ApiUtil_1.hasExistingOpenGroup)(parsedRoom.serverUrl, parsedRoom.roomId);
        const conversationID = (0, OpenGroupUtils_1.getOpenGroupV2ConversationId)(parsedRoom.serverUrl, parsedRoom.roomId);
        if (alreadyExist || (0, conversations_1.getConversationController)().get(conversationID)) {
            const existingConvo = (0, conversations_1.getConversationController)().get(conversationID);
            await existingConvo.setDidApproveMe(true, false);
            await existingConvo.setIsApproved(true, false);
            await existingConvo.commit();
            if (showToasts) {
                utils_1.ToastUtils.pushToastError('publicChatExists', window.i18n('publicChatExists'));
            }
            return false;
        }
        if (showToasts) {
            utils_1.ToastUtils.pushToastInfo('connectingToServer', window.i18n('connectingToServer'));
        }
        uiCallback?.({ loadingState: 'started', conversationKey: conversationID });
        const convoCreated = await joinOpenGroupV2(parsedRoom, fromConfigMessage);
        if (convoCreated) {
            if (showToasts) {
                utils_1.ToastUtils.pushToastSuccess('connectToServerSuccess', window.i18n('connectToServerSuccess'));
            }
            uiCallback?.({ loadingState: 'finished', conversationKey: convoCreated?.id });
            return true;
        }
        if (showToasts) {
            utils_1.ToastUtils.pushToastError('connectToServerFail', window.i18n('connectToServerFail'));
        }
        uiCallback?.({ loadingState: 'failed', conversationKey: conversationID });
    }
    catch (error) {
        sessionjs_logger_1.console.warn('got error while joining open group:', error.message);
        if (showToasts) {
            utils_1.ToastUtils.pushToastError('connectToServerFail', window.i18n('connectToServerFail'));
        }
        uiCallback?.({ loadingState: 'failed', conversationKey: null });
    }
    return false;
}
exports.joinOpenGroupV2WithUIEvents = joinOpenGroupV2WithUIEvents;
