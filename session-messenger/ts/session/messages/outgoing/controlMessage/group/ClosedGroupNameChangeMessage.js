"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClosedGroupNameChangeMessage = void 0;
const protobuf_1 = require("../../../../../protobuf");
const ClosedGroupMessage_1 = require("./ClosedGroupMessage");
class ClosedGroupNameChangeMessage extends ClosedGroupMessage_1.ClosedGroupMessage {
    name;
    constructor(params) {
        super({
            timestamp: params.timestamp,
            identifier: params.identifier,
            groupId: params.groupId,
        });
        this.name = params.name;
        if (this.name.length === 0) {
            throw new Error('name cannot be empty');
        }
    }
    dataProto() {
        const dataMessage = super.dataProto();
        dataMessage.closedGroupControlMessage.type =
            protobuf_1.SignalService.DataMessage.ClosedGroupControlMessage.Type.NAME_CHANGE;
        dataMessage.closedGroupControlMessage.name = this.name;
        return dataMessage;
    }
}
exports.ClosedGroupNameChangeMessage = ClosedGroupNameChangeMessage;
