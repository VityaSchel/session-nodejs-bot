"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPublicMessageSentFromNotUs = exports.createPublicMessageSentFromUs = exports.markAttributesAsReadIfNeeded = exports.createSwarmMessageSentFromNotUs = exports.createSwarmMessageSentFromUs = void 0;
const utils_1 = require("../session/utils");
const libsession_utils_convo_info_volatile_1 = require("../session/utils/libsession/libsession_utils_convo_info_volatile");
const conversationAttributes_1 = require("./conversationAttributes");
const message_1 = require("./message");
function getSharedAttributesForSwarmMessage({ conversationId, messageHash, sentAt, }) {
    const now = Date.now();
    return {
        sent_at: sentAt,
        received_at: now,
        conversationId,
        messageHash,
    };
}
function createSwarmMessageSentFromUs(args) {
    const messageData = {
        ...getSharedAttributesForSwarmMessage(args),
        ...getSharedAttributesForOutgoingMessage(),
        expirationStartTimestamp: Math.min(args.sentAt, Date.now()),
    };
    return new message_1.MessageModel(messageData);
}
exports.createSwarmMessageSentFromUs = createSwarmMessageSentFromUs;
function createSwarmMessageSentFromNotUs(args) {
    const messageData = {
        ...getSharedAttributesForSwarmMessage(args),
        ...getSharedAttributesForIncomingMessage(),
        source: args.sender,
    };
    return new message_1.MessageModel(messageData);
}
exports.createSwarmMessageSentFromNotUs = createSwarmMessageSentFromNotUs;
function getSharedAttributesForPublicMessage({ serverTimestamp, serverId, conversationId, }) {
    return {
        serverTimestamp: serverTimestamp || undefined,
        serverId: serverId || undefined,
        sent_at: serverTimestamp,
        received_at: serverTimestamp,
        isPublic: true,
        conversationId,
        messageHash: '',
        expirationStartTimestamp: undefined,
    };
}
function getSharedAttributesForOutgoingMessage() {
    return {
        source: utils_1.UserUtils.getOurPubKeyStrFromCache(),
        unread: conversationAttributes_1.READ_MESSAGE_STATE.read,
        sent_to: [],
        sent: true,
        type: 'outgoing',
        direction: 'outgoing',
    };
}
function getSharedAttributesForIncomingMessage() {
    return {
        unread: conversationAttributes_1.READ_MESSAGE_STATE.unread,
        type: 'incoming',
        direction: 'incoming',
    };
}
function markAttributesAsReadIfNeeded(messageAttributes) {
    if (messageAttributes.unread === conversationAttributes_1.READ_MESSAGE_STATE.unread) {
        const latestUnreadForThisConvo = libsession_utils_convo_info_volatile_1.SessionUtilConvoInfoVolatile.getVolatileInfoCached(messageAttributes.conversationId);
        const sentAt = messageAttributes.serverTimestamp || messageAttributes.sent_at;
        if (sentAt &&
            latestUnreadForThisConvo?.lastRead &&
            sentAt <= latestUnreadForThisConvo.lastRead) {
            messageAttributes.unread = conversationAttributes_1.READ_MESSAGE_STATE.read;
        }
    }
}
exports.markAttributesAsReadIfNeeded = markAttributesAsReadIfNeeded;
function createPublicMessageSentFromUs(args) {
    const messageData = {
        ...getSharedAttributesForPublicMessage(args),
        ...getSharedAttributesForOutgoingMessage(),
    };
    return new message_1.MessageModel(messageData);
}
exports.createPublicMessageSentFromUs = createPublicMessageSentFromUs;
function createPublicMessageSentFromNotUs(args) {
    const messageAttributes = {
        ...getSharedAttributesForPublicMessage(args),
        ...getSharedAttributesForIncomingMessage(),
        source: args.sender,
    };
    markAttributesAsReadIfNeeded(messageAttributes);
    return new message_1.MessageModel(messageAttributes);
}
exports.createPublicMessageSentFromNotUs = createPublicMessageSentFromNotUs;
