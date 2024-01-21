"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GroupInvitationMessage = void 0;
const __1 = require("..");
const protobuf_1 = require("../../../../protobuf");
class GroupInvitationMessage extends __1.DataMessage {
    url;
    name;
    expireTimer;
    constructor(params) {
        super({ timestamp: params.timestamp, identifier: params.identifier });
        this.url = params.url;
        this.name = params.name;
        this.expireTimer = params.expireTimer;
    }
    dataProto() {
        const openGroupInvitation = new protobuf_1.SignalService.DataMessage.OpenGroupInvitation({
            url: this.url,
            name: this.name,
        });
        return new protobuf_1.SignalService.DataMessage({
            openGroupInvitation,
            expireTimer: this.expireTimer,
        });
    }
}
exports.GroupInvitationMessage = GroupInvitationMessage;
