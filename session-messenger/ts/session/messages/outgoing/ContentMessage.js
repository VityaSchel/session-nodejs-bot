"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContentMessage = void 0;
const _1 = require(".");
const protobuf_1 = require("../../../protobuf");
const constants_1 = require("../../constants");
class ContentMessage extends _1.Message {
    plainTextBuffer() {
        return protobuf_1.SignalService.Content.encode(this.contentProto()).finish();
    }
    ttl() {
        return constants_1.TTL_DEFAULT.TTL_MAX;
    }
}
exports.ContentMessage = ContentMessage;
