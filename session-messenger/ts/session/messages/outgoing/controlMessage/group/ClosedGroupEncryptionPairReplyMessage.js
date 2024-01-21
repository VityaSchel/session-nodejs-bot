"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClosedGroupEncryptionPairReplyMessage = void 0;
const String_1 = require("../../../../utils/String");
const ClosedGroupEncryptionPairMessage_1 = require("./ClosedGroupEncryptionPairMessage");
class ClosedGroupEncryptionPairReplyMessage extends ClosedGroupEncryptionPairMessage_1.ClosedGroupEncryptionPairMessage {
    dataProto() {
        const dataMessage = super.dataProto();
        dataMessage.closedGroupControlMessage.publicKey = (0, String_1.fromHexToArray)(this.groupId.key);
        return dataMessage;
    }
}
exports.ClosedGroupEncryptionPairReplyMessage = ClosedGroupEncryptionPairReplyMessage;
