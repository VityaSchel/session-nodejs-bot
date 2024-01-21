"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClosedGroupVisibleMessage = void 0;
const protobuf_1 = require("../../../../protobuf");
const types_1 = require("../../../types");
const utils_1 = require("../../../utils");
const ClosedGroupMessage_1 = require("../controlMessage/group/ClosedGroupMessage");
class ClosedGroupVisibleMessage extends ClosedGroupMessage_1.ClosedGroupMessage {
    chatMessage;
    constructor(params) {
        super({
            timestamp: params.chatMessage.timestamp,
            identifier: params.identifier ?? params.chatMessage.identifier,
            groupId: params.groupId,
        });
        this.chatMessage = params.chatMessage;
        if (!params.groupId) {
            throw new Error('ClosedGroupVisibleMessage: groupId must be set');
        }
        if (types_1.PubKey.isClosedGroupV3(types_1.PubKey.cast(params.groupId).key)) {
            throw new Error('GroupContext should not be used anymore with closed group v3');
        }
    }
    dataProto() {
        const dataProto = this.chatMessage.dataProto();
        const groupMessage = new protobuf_1.SignalService.GroupContext();
        const groupIdWithPrefix = types_1.PubKey.addTextSecurePrefixIfNeeded(this.groupId.key);
        const encoded = utils_1.StringUtils.encode(groupIdWithPrefix, 'utf8');
        const id = new Uint8Array(encoded);
        groupMessage.id = id;
        groupMessage.type = protobuf_1.SignalService.GroupContext.Type.DELIVER;
        dataProto.group = groupMessage;
        return dataProto;
    }
}
exports.ClosedGroupVisibleMessage = ClosedGroupVisibleMessage;
