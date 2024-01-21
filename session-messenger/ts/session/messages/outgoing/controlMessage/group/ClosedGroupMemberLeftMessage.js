"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClosedGroupMemberLeftMessage = void 0;
const protobuf_1 = require("../../../../../protobuf");
const ClosedGroupMessage_1 = require("./ClosedGroupMessage");
class ClosedGroupMemberLeftMessage extends ClosedGroupMessage_1.ClosedGroupMessage {
    dataProto() {
        const dataMessage = super.dataProto();
        dataMessage.closedGroupControlMessage.type =
            protobuf_1.SignalService.DataMessage.ClosedGroupControlMessage.Type.MEMBER_LEFT;
        return dataMessage;
    }
}
exports.ClosedGroupMemberLeftMessage = ClosedGroupMemberLeftMessage;
