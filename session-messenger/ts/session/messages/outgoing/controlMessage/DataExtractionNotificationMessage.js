"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendDataExtractionNotification = exports.DataExtractionNotificationMessage = void 0;
const uuid_1 = require("uuid");
const protobuf_1 = require("../../../../protobuf");
const __1 = require("..");
const types_1 = require("../../../types");
const __2 = require("../../..");
const conversations_1 = require("../../../conversations");
const utils_1 = require("../../../utils");
const settings_key_1 = require("../../../../data/settings-key");
const storage_1 = require("../../../../util/storage");
const namespaces_1 = require("../../../apis/snode_api/namespaces");
const sessionjs_logger_1 = require("../../../../sessionjs-logger");
class DataExtractionNotificationMessage extends __1.ContentMessage {
    referencedAttachmentTimestamp;
    constructor(params) {
        super({ timestamp: params.timestamp, identifier: params.identifier });
        this.referencedAttachmentTimestamp = params.referencedAttachmentTimestamp;
        if (!this.referencedAttachmentTimestamp) {
            throw new Error('referencedAttachmentTimestamp must be set');
        }
    }
    contentProto() {
        return new protobuf_1.SignalService.Content({
            dataExtractionNotification: this.dataExtractionProto(),
        });
    }
    dataExtractionProto() {
        const ACTION_ENUM = protobuf_1.SignalService.DataExtractionNotification.Type;
        const action = ACTION_ENUM.MEDIA_SAVED;
        return new protobuf_1.SignalService.DataExtractionNotification({
            type: action,
            timestamp: this.referencedAttachmentTimestamp,
        });
    }
}
exports.DataExtractionNotificationMessage = DataExtractionNotificationMessage;
const sendDataExtractionNotification = async (conversationId, attachmentSender, referencedAttachmentTimestamp) => {
    const convo = (0, conversations_1.getConversationController)().get(conversationId);
    if (!convo ||
        !convo.isPrivate() ||
        convo.isMe() ||
        utils_1.UserUtils.isUsFromCache(attachmentSender) ||
        !storage_1.Storage.get(settings_key_1.SettingsKey.settingsReadReceipt)) {
        sessionjs_logger_1.console.warn('Not sending saving attachment notification for', attachmentSender);
        return;
    }
    const dataExtractionNotificationMessage = new DataExtractionNotificationMessage({
        referencedAttachmentTimestamp,
        identifier: (0, uuid_1.v4)(),
        timestamp: Date.now(),
    });
    const pubkey = types_1.PubKey.cast(conversationId);
    sessionjs_logger_1.console.info(`Sending DataExtractionNotification to ${conversationId} about attachment: ${referencedAttachmentTimestamp}`);
    try {
        await (0, __2.getMessageQueue)().sendToPubKey(pubkey, dataExtractionNotificationMessage, namespaces_1.SnodeNamespaces.UserMessages);
    }
    catch (e) {
        sessionjs_logger_1.console.warn('failed to send data extraction notification', e);
    }
};
exports.sendDataExtractionNotification = sendDataExtractionNotification;
