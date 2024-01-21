"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UnsendMessage = void 0;
const protobuf_1 = require("../../../../protobuf");
const ContentMessage_1 = require("../ContentMessage");
class UnsendMessage extends ContentMessage_1.ContentMessage {
    author;
    constructor(params) {
        super({ timestamp: params.timestamp, author: params.author });
        this.author = params.author;
    }
    contentProto() {
        return new protobuf_1.SignalService.Content({
            unsendMessage: this.unsendProto(),
        });
    }
    unsendProto() {
        return new protobuf_1.SignalService.Unsend({
            timestamp: this.timestamp,
            author: this.author,
        });
    }
}
exports.UnsendMessage = UnsendMessage;
