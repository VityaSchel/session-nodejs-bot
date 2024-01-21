"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TypingMessage = void 0;
const protobuf_1 = require("../../../../protobuf");
const __1 = require("../../..");
const __2 = require("..");
class TypingMessage extends __2.ContentMessage {
    isTyping;
    typingTimestamp;
    constructor(params) {
        super({ timestamp: params.timestamp, identifier: params.identifier });
        this.isTyping = params.isTyping;
        this.typingTimestamp = params.typingTimestamp;
    }
    ttl() {
        return __1.Constants.TTL_DEFAULT.TYPING_MESSAGE;
    }
    contentProto() {
        return new protobuf_1.SignalService.Content({
            typingMessage: this.typingProto(),
        });
    }
    typingProto() {
        const ACTION_ENUM = protobuf_1.SignalService.TypingMessage.Action;
        const action = this.isTyping ? ACTION_ENUM.STARTED : ACTION_ENUM.STOPPED;
        const finalTimestamp = this.typingTimestamp || Date.now();
        const typingMessage = new protobuf_1.SignalService.TypingMessage();
        typingMessage.action = action;
        typingMessage.timestamp = finalTimestamp;
        return typingMessage;
    }
}
exports.TypingMessage = TypingMessage;
