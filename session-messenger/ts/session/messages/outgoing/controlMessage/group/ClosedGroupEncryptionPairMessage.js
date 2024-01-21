"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClosedGroupEncryptionPairMessage = void 0;
const protobuf_1 = require("../../../../../protobuf");
const ClosedGroupMessage_1 = require("./ClosedGroupMessage");
class ClosedGroupEncryptionPairMessage extends ClosedGroupMessage_1.ClosedGroupMessage {
    encryptedKeyPairs;
    constructor(params) {
        super({
            timestamp: params.timestamp,
            identifier: params.identifier,
            groupId: params.groupId,
        });
        this.encryptedKeyPairs = params.encryptedKeyPairs;
        if (this.encryptedKeyPairs.length === 0) {
            throw new Error('EncryptedKeyPairs cannot be empty');
        }
    }
    dataProto() {
        const dataMessage = super.dataProto();
        dataMessage.closedGroupControlMessage.type =
            protobuf_1.SignalService.DataMessage.ClosedGroupControlMessage.Type.ENCRYPTION_KEY_PAIR;
        dataMessage.closedGroupControlMessage.wrappers = this.encryptedKeyPairs.map(w => {
            const { publicKey, encryptedKeyPair } = w;
            return {
                publicKey,
                encryptedKeyPair,
            };
        });
        return dataMessage;
    }
}
exports.ClosedGroupEncryptionPairMessage = ClosedGroupEncryptionPairMessage;
