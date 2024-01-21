"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleMessageJob = exports.toRegularMessage = void 0;
const lodash_1 = __importStar(require("lodash"));
const attachments_1 = require("./attachments");
const data_1 = require("../data/data");
const conversations_1 = require("../session/conversations");
const conversationAttributes_1 = require("../models/conversationAttributes");
const messageType_1 = require("../models/messageType");
const ProfileManager_1 = require("../session/profile_manager/ProfileManager");
const releaseFeature_1 = require("../util/releaseFeature");
const types_1 = require("../session/types");
const sessionjs_logger_1 = require("../sessionjs-logger");
async function copyFromQuotedMessage(msg, quote) {
    if (!quote) {
        return;
    }
}
async function processProfileKeyNoCommit(conversation, sendingDeviceConversation, profileKeyBuffer) {
    if (conversation.isPrivate()) {
        await conversation.setProfileKey(profileKeyBuffer, false);
    }
    else {
        await sendingDeviceConversation.setProfileKey(profileKeyBuffer, false);
    }
}
function updateReadStatus(message) {
    if (message.isExpirationTimerUpdate()) {
        message.set({ unread: conversationAttributes_1.READ_MESSAGE_STATE.read });
    }
}
function handleSyncedReceiptsNoCommit(message, conversation) {
    const sentTimestamp = message.get('sent_at');
    if (sentTimestamp) {
        conversation.markConversationRead(sentTimestamp);
    }
}
function toRegularMessage(rawDataMessage) {
    return {
        ...lodash_1.default.pick(rawDataMessage, [
            'attachments',
            'preview',
            'reaction',
            'body',
            'flags',
            'profileKey',
            'openGroupInvitation',
            'quote',
            'profile',
            'expireTimer',
            'blocksCommunityMessageRequests',
        ]),
        isRegularMessage: true,
    };
}
exports.toRegularMessage = toRegularMessage;
async function handleRegularMessage(conversation, sendingDeviceConversation, message, rawDataMessage, source, messageHash) {
    const type = message.get('type');
    await copyFromQuotedMessage(message, rawDataMessage.quote);
    if (rawDataMessage.openGroupInvitation) {
        message.set({ groupInvitation: rawDataMessage.openGroupInvitation });
    }
    const existingExpireTimer = conversation.get('expireTimer');
    message.set({
        flags: rawDataMessage.flags,
        attachments: rawDataMessage.attachments,
        body: rawDataMessage.body,
        conversationId: conversation.id,
        messageHash,
        errors: [],
    });
    if (existingExpireTimer) {
        message.set({ expireTimer: existingExpireTimer });
    }
    const serverTimestamp = message.get('serverTimestamp');
    if (conversation.isPublic() &&
        types_1.PubKey.isBlinded(sendingDeviceConversation.id) &&
        (0, lodash_1.isNumber)(serverTimestamp)) {
        const updateBlockTimestamp = !rawDataMessage.blocksCommunityMessageRequests
            ? 0
            : serverTimestamp;
        await sendingDeviceConversation.updateBlocksSogsMsgReqsTimestamp(updateBlockTimestamp, false);
    }
    if (type === 'incoming') {
        if (conversation.isPrivate()) {
            updateReadStatus(message);
            const incomingMessageCount = await data_1.Data.getMessageCountByType(conversation.id, messageType_1.MessageDirection.incoming);
            const isFirstRequestMessage = incomingMessageCount < 2;
            if (conversation.isIncomingRequest() &&
                isFirstRequestMessage) {
            }
            if (conversation.isOutgoingRequest()) {
                await conversation.addIncomingApprovalMessage(lodash_1.default.toNumber(message.get('sent_at')) - 1, source);
            }
            await conversation.setDidApproveMe(true);
        }
    }
    else if (type === 'outgoing') {
        const userConfigLibsession = await releaseFeature_1.ReleasedFeatures.checkIsUserConfigFeatureReleased();
        if (!userConfigLibsession) {
            handleSyncedReceiptsNoCommit(message, conversation);
            if (conversation.isPrivate()) {
                await conversation.setIsApproved(true);
            }
        }
    }
    const conversationActiveAt = conversation.get('active_at');
    if (!conversationActiveAt ||
        conversation.isHidden() ||
        (message.get('sent_at') || 0) > conversationActiveAt) {
        conversation.set({
            active_at: message.get('sent_at'),
            lastMessage: message.getNotificationText(),
        });
        await conversation.unhideIfNeeded(false);
    }
    if (rawDataMessage.profileKey) {
        await processProfileKeyNoCommit(conversation, sendingDeviceConversation, rawDataMessage.profileKey);
    }
    await conversation.notifyTypingNoCommit({
        isTyping: false,
        sender: source,
    });
}
async function handleExpirationTimerUpdateNoCommit(conversation, message, source, expireTimer) {
    message.set({
        expirationTimerUpdate: {
            source,
            expireTimer,
        },
        unread: conversationAttributes_1.READ_MESSAGE_STATE.read,
    });
    conversation.set({ expireTimer });
    await conversation.updateExpireTimer(expireTimer, source, message.get('received_at'), {}, false);
}
function markConvoAsReadIfOutgoingMessage(conversation, message) {
    const isOutgoingMessage = message.get('type') === 'outgoing' || message.get('direction') === 'outgoing';
    if (isOutgoingMessage) {
        const sentAt = message.get('sent_at') || message.get('serverTimestamp');
        if (sentAt) {
            conversation.markConversationRead(sentAt);
        }
    }
}
async function handleMessageJob(messageModel, conversation, regularDataMessage, confirm, source, messageHash) {
    sessionjs_logger_1.console.info(`Starting handleMessageJob for message ${messageModel.idForLogging()}, ${messageModel.get('serverTimestamp') || messageModel.get('timestamp')} in conversation ${conversation.idForLogging()}`);
    const sendingDeviceConversation = await (0, conversations_1.getConversationController)().getOrCreateAndWait(source, conversationAttributes_1.ConversationTypeEnum.PRIVATE);
    try {
        messageModel.set({ flags: regularDataMessage.flags });
        if (messageModel.isExpirationTimerUpdate()) {
            const { expireTimer } = regularDataMessage;
            const oldValue = conversation.get('expireTimer');
            if (expireTimer === oldValue) {
                confirm?.();
                sessionjs_logger_1.console.info('Dropping ExpireTimerUpdate message as we already have the same one set.');
                return;
            }
            await handleExpirationTimerUpdateNoCommit(conversation, messageModel, source, expireTimer);
        }
        else {
            await handleRegularMessage(conversation, sendingDeviceConversation, messageModel, regularDataMessage, source, messageHash);
        }
        const id = await messageModel.commit();
        messageModel.set({ id });
        conversation.set({
            active_at: Math.max(conversation.get('active_at'), messageModel.get('sent_at') || 0),
        });
        conversation.updateLastMessage();
        await conversation.commit();
        if (conversation.id !== sendingDeviceConversation.id) {
            await sendingDeviceConversation.commit();
        }
        void (0, attachments_1.queueAttachmentDownloads)(messageModel, conversation);
        if (messageModel.isIncoming() && regularDataMessage.profile) {
            await ProfileManager_1.ProfileManager.updateProfileOfContact(sendingDeviceConversation.id, regularDataMessage.profile.displayName, regularDataMessage.profile.profilePicture, regularDataMessage.profileKey);
        }
        markConvoAsReadIfOutgoingMessage(conversation, messageModel);
        if (messageModel.get('unread')) {
            conversation.throttledNotify(messageModel);
        }
        confirm?.();
    }
    catch (error) {
        const errorForLog = error && error.stack ? error.stack : error;
        sessionjs_logger_1.console.error('handleMessageJob', messageModel.idForLogging(), 'error:', errorForLog);
    }
}
exports.handleMessageJob = handleMessageJob;
