"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageRequestResponse = void 0;
const protobuf_1 = require("../../../../protobuf");
const ContentMessage_1 = require("../ContentMessage");
const VisibleMessage_1 = require("../visibleMessage/VisibleMessage");
class MessageRequestResponse extends ContentMessage_1.ContentMessage {
    profileKey;
    profile;
    constructor(params) {
        super({
            timestamp: params.timestamp,
        });
        const profile = (0, VisibleMessage_1.buildProfileForOutgoingMessage)(params);
        this.profile = profile.lokiProfile;
        this.profileKey = profile.profileKey;
    }
    contentProto() {
        return new protobuf_1.SignalService.Content({
            messageRequestResponse: this.messageRequestResponseProto(),
        });
    }
    messageRequestResponseProto() {
        return new protobuf_1.SignalService.MessageRequestResponse({
            isApproved: true,
            profileKey: this.profileKey?.length ? this.profileKey : undefined,
            profile: this.profile,
        });
    }
}
exports.MessageRequestResponse = MessageRequestResponse;
