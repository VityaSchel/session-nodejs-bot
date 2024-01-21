"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExpirationTimerUpdateMessage = void 0;
const __1 = require("..");
const protobuf_1 = require("../../../../protobuf");
const types_1 = require("../../../types");
const utils_1 = require("../../../utils");
class ExpirationTimerUpdateMessage extends __1.DataMessage {
    groupId;
    syncTarget;
    expireTimer;
    constructor(params) {
        super({ timestamp: params.timestamp, identifier: params.identifier });
        this.expireTimer = params.expireTimer;
        const { groupId, syncTarget } = params;
        this.groupId = groupId ? types_1.PubKey.cast(groupId) : undefined;
        this.syncTarget = syncTarget ? types_1.PubKey.cast(syncTarget).key : undefined;
    }
    dataProto() {
        const data = new protobuf_1.SignalService.DataMessage();
        data.flags = protobuf_1.SignalService.DataMessage.Flags.EXPIRATION_TIMER_UPDATE;
        if (this.groupId) {
            const groupMessage = new protobuf_1.SignalService.GroupContext();
            const groupIdWithPrefix = types_1.PubKey.addTextSecurePrefixIfNeeded(this.groupId.key);
            const encoded = utils_1.StringUtils.encode(groupIdWithPrefix, 'utf8');
            const id = new Uint8Array(encoded);
            groupMessage.id = id;
            groupMessage.type = protobuf_1.SignalService.GroupContext.Type.DELIVER;
            data.group = groupMessage;
        }
        if (this.syncTarget) {
            data.syncTarget = this.syncTarget;
        }
        if (this.expireTimer) {
            data.expireTimer = this.expireTimer;
        }
        return data;
    }
}
exports.ExpirationTimerUpdateMessage = ExpirationTimerUpdateMessage;
