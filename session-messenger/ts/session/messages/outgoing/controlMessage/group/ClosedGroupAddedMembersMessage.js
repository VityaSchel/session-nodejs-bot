"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClosedGroupAddedMembersMessage = void 0;
const protobuf_1 = require("../../../../../protobuf");
const String_1 = require("../../../../utils/String");
const ClosedGroupMessage_1 = require("./ClosedGroupMessage");
class ClosedGroupAddedMembersMessage extends ClosedGroupMessage_1.ClosedGroupMessage {
    addedMembers;
    constructor(params) {
        super({
            timestamp: params.timestamp,
            identifier: params.identifier,
            groupId: params.groupId,
        });
        this.addedMembers = params.addedMembers;
        if (!this.addedMembers?.length) {
            throw new Error('addedMembers cannot be empty');
        }
    }
    dataProto() {
        const dataMessage = super.dataProto();
        dataMessage.closedGroupControlMessage.type =
            protobuf_1.SignalService.DataMessage.ClosedGroupControlMessage.Type.MEMBERS_ADDED;
        dataMessage.closedGroupControlMessage.members = this.addedMembers.map(String_1.fromHexToArray);
        return dataMessage;
    }
}
exports.ClosedGroupAddedMembersMessage = ClosedGroupAddedMembersMessage;
