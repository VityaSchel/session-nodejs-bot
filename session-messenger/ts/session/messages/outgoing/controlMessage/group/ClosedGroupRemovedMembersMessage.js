"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClosedGroupRemovedMembersMessage = void 0;
const protobuf_1 = require("../../../../../protobuf");
const String_1 = require("../../../../utils/String");
const ClosedGroupMessage_1 = require("./ClosedGroupMessage");
class ClosedGroupRemovedMembersMessage extends ClosedGroupMessage_1.ClosedGroupMessage {
    removedMembers;
    constructor(params) {
        super({
            timestamp: params.timestamp,
            identifier: params.identifier,
            groupId: params.groupId,
        });
        this.removedMembers = params.removedMembers;
        if (!this.removedMembers?.length) {
            throw new Error('removedMembers cannot be empty');
        }
    }
    dataProto() {
        const dataMessage = super.dataProto();
        dataMessage.closedGroupControlMessage.type =
            protobuf_1.SignalService.DataMessage.ClosedGroupControlMessage.Type.MEMBERS_REMOVED;
        dataMessage.closedGroupControlMessage.members = this.removedMembers.map(String_1.fromHexToArray);
        return dataMessage;
    }
}
exports.ClosedGroupRemovedMembersMessage = ClosedGroupRemovedMembersMessage;
