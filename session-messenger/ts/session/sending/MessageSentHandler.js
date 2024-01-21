"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageSentHandler = void 0;
const lodash_1 = __importDefault(require("lodash"));
const data_1 = require("../../data/data");
const protobuf_1 = require("../../protobuf");
const push_notification_api_1 = require("../apis/push_notification_api");
const OpenGroupVisibleMessage_1 = require("../messages/outgoing/visibleMessage/OpenGroupVisibleMessage");
const utils_1 = require("../utils");
const sessionjs_logger_1 = require("../../sessionjs-logger");
async function handlePublicMessageSentSuccess(sentMessageIdentifier, result) {
    const { serverId, serverTimestamp } = result;
    try {
        const foundMessage = await fetchHandleMessageSentData(sentMessageIdentifier);
        if (!foundMessage) {
            throw new Error('handlePublicMessageSentSuccess(): The message should be in memory for an openGroup message');
        }
        foundMessage.set({
            serverTimestamp,
            serverId,
            isPublic: true,
            sent: true,
            sent_at: serverTimestamp,
            sync: true,
            synced: true,
            sentSync: true,
        });
        await foundMessage.commit();
        foundMessage.getConversation()?.updateLastMessage();
    }
    catch (e) {
        sessionjs_logger_1.console.error('Error setting public on message');
    }
}
async function handleMessageSentSuccess(sentMessage, effectiveTimestamp, wrappedEnvelope) {
    let fetchedMessage = await fetchHandleMessageSentData(sentMessage.identifier);
    if (!fetchedMessage) {
        return;
    }
    let sentTo = fetchedMessage.get('sent_to') || [];
    const isOurDevice = utils_1.UserUtils.isUsFromCache(sentMessage.device);
    const isClosedGroupMessage = sentMessage.encryption === protobuf_1.SignalService.Envelope.Type.CLOSED_GROUP_MESSAGE;
    const shouldTriggerSyncMessage = !isOurDevice &&
        !isClosedGroupMessage &&
        !fetchedMessage.get('synced') &&
        !fetchedMessage.get('sentSync');
    const shouldMarkMessageAsSynced = isOurDevice && fetchedMessage.get('sentSync');
    const contentDecoded = protobuf_1.SignalService.Content.decode(sentMessage.plainTextBuffer);
    const { dataMessage } = contentDecoded;
    const hasBodyOrAttachments = Boolean(dataMessage && (dataMessage.body || (dataMessage.attachments && dataMessage.attachments.length)));
    const shouldNotifyPushServer = hasBodyOrAttachments && !isOurDevice;
    if (shouldNotifyPushServer) {
        if (!wrappedEnvelope) {
            sessionjs_logger_1.console.warn('Should send PN notify but no wrapped envelope set.');
        }
        else {
            void push_notification_api_1.PnServer.notifyPnServer(wrappedEnvelope, sentMessage.device);
        }
    }
    if (shouldTriggerSyncMessage) {
        if (dataMessage) {
            try {
                await fetchedMessage.sendSyncMessage(dataMessage, effectiveTimestamp);
                const tempFetchMessage = await fetchHandleMessageSentData(sentMessage.identifier);
                if (!tempFetchMessage) {
                    sessionjs_logger_1.console.warn('Got an error while trying to sendSyncMessage(): fetchedMessage is null');
                    return;
                }
                fetchedMessage = tempFetchMessage;
            }
            catch (e) {
                sessionjs_logger_1.console.warn('Got an error while trying to sendSyncMessage():', e);
            }
        }
    }
    else if (shouldMarkMessageAsSynced) {
        fetchedMessage.set({ synced: true });
    }
    sentTo = lodash_1.default.union(sentTo, [sentMessage.device]);
    fetchedMessage.set({
        sent_to: sentTo,
        sent: true,
        expirationStartTimestamp: Date.now(),
        sent_at: effectiveTimestamp,
    });
    await fetchedMessage.commit();
    fetchedMessage.getConversation()?.updateLastMessage();
}
async function handleMessageSentFailure(sentMessage, error) {
    const fetchedMessage = await fetchHandleMessageSentData(sentMessage.identifier);
    if (!fetchedMessage) {
        return;
    }
    if (error instanceof Error) {
        await fetchedMessage.saveErrors(error);
    }
    if (!(sentMessage instanceof OpenGroupVisibleMessage_1.OpenGroupVisibleMessage)) {
        const isOurDevice = utils_1.UserUtils.isUsFromCache(sentMessage.device);
        if (isOurDevice && !fetchedMessage.get('sync')) {
            fetchedMessage.set({ sentSync: false });
        }
        fetchedMessage.set({
            expirationStartTimestamp: Date.now(),
        });
    }
    fetchedMessage.set({
        sent: true,
    });
    await fetchedMessage.commit();
    await fetchedMessage.getConversation()?.updateLastMessage();
}
async function fetchHandleMessageSentData(messageIdentifier) {
    const dbMessage = await data_1.Data.getMessageById(messageIdentifier);
    if (!dbMessage) {
        return null;
    }
    return dbMessage;
}
exports.MessageSentHandler = {
    handlePublicMessageSentSuccess,
    handleMessageSentSuccess,
    handleMessageSentFailure,
};
