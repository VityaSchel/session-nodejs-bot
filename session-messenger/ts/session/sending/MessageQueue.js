"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMessageQueue = exports.MessageQueue = void 0;
const abort_controller_1 = require("abort-controller");
const PendingMessageCache_1 = require("./PendingMessageCache");
const utils_1 = require("../utils");
const types_1 = require("../types");
const _1 = require(".");
const ClosedGroupMessage_1 = require("../messages/outgoing/controlMessage/group/ClosedGroupMessage");
const ConfigurationMessage_1 = require("../messages/outgoing/controlMessage/ConfigurationMessage");
const MessageSentHandler_1 = require("./MessageSentHandler");
const ExpirationTimerUpdateMessage_1 = require("../messages/outgoing/controlMessage/ExpirationTimerUpdateMessage");
const UnsendMessage_1 = require("../messages/outgoing/controlMessage/UnsendMessage");
const sogsV3SendReaction_1 = require("../apis/open_group_api/sogsv3/sogsV3SendReaction");
const SharedConfigMessage_1 = require("../messages/outgoing/controlMessage/SharedConfigMessage");
const sessionjs_logger_1 = require("../../sessionjs-logger");
class MessageQueue {
    jobQueues = new Map();
    pendingMessageCache;
    constructor(cache) {
        this.pendingMessageCache = cache ?? new PendingMessageCache_1.PendingMessageCache();
        void this.processAllPending();
    }
    async sendToPubKey(destinationPubKey, message, namespace, sentCb, isGroup = false) {
        if (message instanceof ConfigurationMessage_1.ConfigurationMessage || !!message.syncTarget) {
            throw new Error('SyncMessage needs to be sent with sendSyncMessage');
        }
        await this.process(destinationPubKey, message, namespace, sentCb, isGroup);
    }
    async sendToOpenGroupV2({ blinded, filesToLink, message, roomInfos, }) {
        try {
            if (message.reaction) {
                await (0, sogsV3SendReaction_1.sendSogsReactionOnionV4)(roomInfos.serverUrl, roomInfos.roomId, new abort_controller_1.AbortController().signal, message.reaction, blinded);
                return;
            }
            const result = await _1.MessageSender.sendToOpenGroupV2(message, roomInfos, blinded, filesToLink);
            const { sentTimestamp, serverId } = result;
            if (!serverId || serverId === -1) {
                throw new Error(`Invalid serverId returned by server: ${serverId}`);
            }
            await MessageSentHandler_1.MessageSentHandler.handlePublicMessageSentSuccess(message.identifier, {
                serverId,
                serverTimestamp: sentTimestamp,
            });
        }
        catch (e) {
            sessionjs_logger_1.console.warn(`Failed to send message to open group: ${roomInfos.serverUrl}:${roomInfos.roomId}:`, e);
            await MessageSentHandler_1.MessageSentHandler.handleMessageSentFailure(message, e || new Error('Failed to send message to open group.'));
        }
    }
    async sendToOpenGroupV2BlindedRequest({ encryptedContent, message, recipientBlindedId, roomInfos, }) {
        try {
            if (!types_1.PubKey.isBlinded(recipientBlindedId)) {
                throw new Error('sendToOpenGroupV2BlindedRequest needs a blindedId');
            }
            const { serverTimestamp, serverId } = await _1.MessageSender.sendToOpenGroupV2BlindedRequest(encryptedContent, roomInfos, recipientBlindedId);
            if (!serverId || serverId === -1) {
                throw new Error(`Invalid serverId returned by server: ${serverId}`);
            }
            await MessageSentHandler_1.MessageSentHandler.handlePublicMessageSentSuccess(message.identifier, {
                serverId,
                serverTimestamp,
            });
        }
        catch (e) {
            sessionjs_logger_1.console.warn(`Failed to send message to open group: ${roomInfos.serverUrl}:${roomInfos.roomId}:`, e.message);
            await MessageSentHandler_1.MessageSentHandler.handleMessageSentFailure(message, e || new Error('Failed to send message to open group.'));
        }
    }
    async sendToGroup({ message, namespace, groupPubKey, sentCb, }) {
        let destinationPubKey = groupPubKey;
        if (message instanceof ExpirationTimerUpdateMessage_1.ExpirationTimerUpdateMessage || message instanceof ClosedGroupMessage_1.ClosedGroupMessage) {
            destinationPubKey = groupPubKey || message.groupId;
        }
        if (!destinationPubKey) {
            throw new Error('Invalid group message passed in sendToGroup.');
        }
        return this.sendToPubKey(types_1.PubKey.cast(destinationPubKey), message, namespace, sentCb, true);
    }
    async sendSyncMessage({ namespace, message, sentCb, }) {
        if (!message) {
            return;
        }
        if (!(message instanceof ConfigurationMessage_1.ConfigurationMessage) &&
            !(message instanceof UnsendMessage_1.UnsendMessage) &&
            !(message instanceof SharedConfigMessage_1.SharedConfigMessage) &&
            !message?.syncTarget) {
            throw new Error('Invalid message given to sendSyncMessage');
        }
        const ourPubKey = utils_1.UserUtils.getOurPubKeyStrFromCache();
        await this.process(types_1.PubKey.cast(ourPubKey), message, namespace, sentCb);
    }
    async sendToPubKeyNonDurably({ message, namespace, pubkey, }) {
        let rawMessage;
        try {
            rawMessage = await utils_1.MessageUtils.toRawMessage(pubkey, message, namespace);
            const { wrappedEnvelope, effectiveTimestamp } = await _1.MessageSender.send(rawMessage);
            await MessageSentHandler_1.MessageSentHandler.handleMessageSentSuccess(rawMessage, effectiveTimestamp, wrappedEnvelope);
            return effectiveTimestamp;
        }
        catch (error) {
            if (rawMessage) {
                await MessageSentHandler_1.MessageSentHandler.handleMessageSentFailure(rawMessage, error);
            }
            return false;
        }
    }
    async processPending(device, isSyncMessage = false) {
        const messages = await this.pendingMessageCache.getForDevice(device);
        const jobQueue = this.getJobQueue(device);
        messages.forEach(async (message) => {
            const messageId = message.identifier;
            if (!jobQueue.has(messageId)) {
                const job = async () => {
                    try {
                        const { wrappedEnvelope, effectiveTimestamp } = await _1.MessageSender.send(message, undefined, undefined, isSyncMessage);
                        await MessageSentHandler_1.MessageSentHandler.handleMessageSentSuccess(message, effectiveTimestamp, wrappedEnvelope);
                        const cb = this.pendingMessageCache.callbacks.get(message.identifier);
                        if (cb) {
                            await cb(message);
                        }
                        this.pendingMessageCache.callbacks.delete(message.identifier);
                    }
                    catch (error) {
                        void MessageSentHandler_1.MessageSentHandler.handleMessageSentFailure(message, error);
                    }
                    finally {
                        void this.pendingMessageCache.remove(message);
                    }
                };
                await jobQueue.addWithId(messageId, job);
            }
        });
    }
    async processAllPending() {
        const devices = await this.pendingMessageCache.getDevices();
        const promises = devices.map(async (device) => this.processPending(device));
        return Promise.all(promises);
    }
    async process(destinationPk, message, namespace, sentCb, isGroup = false) {
        const us = utils_1.UserUtils.getOurPubKeyFromCache();
        let isSyncMessage = false;
        if (us && destinationPk.isEqual(us)) {
            if (_1.MessageSender.isSyncMessage(message)) {
                sessionjs_logger_1.console.info('OutgoingMessageQueue: Processing sync message');
                isSyncMessage = true;
            }
            else {
                sessionjs_logger_1.console.warn('Dropping message in process() to be sent to ourself');
                return;
            }
        }
        await this.pendingMessageCache.add(destinationPk, message, namespace, sentCb, isGroup);
        void this.processPending(destinationPk, isSyncMessage);
    }
    getJobQueue(device) {
        let queue = this.jobQueues.get(device.key);
        if (!queue) {
            queue = new utils_1.JobQueue();
            this.jobQueues.set(device.key, queue);
        }
        return queue;
    }
}
exports.MessageQueue = MessageQueue;
let messageQueue;
function getMessageQueue() {
    if (!messageQueue) {
        messageQueue = new MessageQueue();
    }
    return messageQueue;
}
exports.getMessageQueue = getMessageQueue;
