"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toRawMessage = void 0;
const ClosedGroupMessage_1 = require("../messages/outgoing/controlMessage/group/ClosedGroupMessage");
const ClosedGroupNewMessage_1 = require("../messages/outgoing/controlMessage/group/ClosedGroupNewMessage");
const ClosedGroupEncryptionPairReplyMessage_1 = require("../messages/outgoing/controlMessage/group/ClosedGroupEncryptionPairReplyMessage");
const ExpirationTimerUpdateMessage_1 = require("../messages/outgoing/controlMessage/ExpirationTimerUpdateMessage");
const protobuf_1 = require("../../protobuf");
function getEncryptionTypeFromMessageType(message, isGroup = false) {
    if (message instanceof ClosedGroupNewMessage_1.ClosedGroupNewMessage ||
        message instanceof ClosedGroupEncryptionPairReplyMessage_1.ClosedGroupEncryptionPairReplyMessage) {
        return protobuf_1.SignalService.Envelope.Type.SESSION_MESSAGE;
    }
    if (message instanceof ClosedGroupMessage_1.ClosedGroupMessage ||
        (message instanceof ExpirationTimerUpdateMessage_1.ExpirationTimerUpdateMessage && message.groupId) ||
        isGroup) {
        return protobuf_1.SignalService.Envelope.Type.CLOSED_GROUP_MESSAGE;
    }
    return protobuf_1.SignalService.Envelope.Type.SESSION_MESSAGE;
}
async function toRawMessage(destinationPubKey, message, namespace, isGroup = false) {
    const ttl = message.ttl();
    const plainTextBuffer = message.plainTextBuffer();
    const encryption = getEncryptionTypeFromMessageType(message, isGroup);
    const rawMessage = {
        identifier: message.identifier,
        plainTextBuffer,
        device: destinationPubKey.key,
        ttl,
        encryption,
        namespace,
    };
    return rawMessage;
}
exports.toRawMessage = toRawMessage;
