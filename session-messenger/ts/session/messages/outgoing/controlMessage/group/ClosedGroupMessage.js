"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClosedGroupMessage = void 0;
const protobuf_1 = require("../../../../../protobuf");
const types_1 = require("../../../../types");
const DataMessage_1 = require("../../DataMessage");
class ClosedGroupMessage extends DataMessage_1.DataMessage {
    groupId;
    constructor(params) {
        super({
            timestamp: params.timestamp,
            identifier: params.identifier,
        });
        this.groupId = types_1.PubKey.cast(params.groupId);
        if (!this.groupId || this.groupId.key.length === 0) {
            throw new Error('groupId must be set');
        }
    }
    static areAdminsMembers(admins, members) {
        return admins.every(a => members.includes(a));
    }
    dataProto() {
        const dataMessage = new protobuf_1.SignalService.DataMessage();
        dataMessage.closedGroupControlMessage = new protobuf_1.SignalService.DataMessage.ClosedGroupControlMessage();
        return dataMessage;
    }
}
exports.ClosedGroupMessage = ClosedGroupMessage;
