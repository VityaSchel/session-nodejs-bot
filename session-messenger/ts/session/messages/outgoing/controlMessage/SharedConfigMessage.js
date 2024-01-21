"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SharedConfigMessage = void 0;
const protobuf_1 = require("../../../../protobuf");
const __1 = require("..");
const constants_1 = require("../../../constants");
class SharedConfigMessage extends __1.ContentMessage {
    seqno;
    kind;
    data;
    constructor(params) {
        super({ timestamp: params.timestamp, identifier: params.identifier });
        this.data = params.data;
        this.kind = params.kind;
        this.seqno = params.seqno;
    }
    contentProto() {
        return new protobuf_1.SignalService.Content({
            sharedConfigMessage: this.sharedConfigProto(),
        });
    }
    ttl() {
        return constants_1.TTL_DEFAULT.TTL_CONFIG;
    }
    sharedConfigProto() {
        return new protobuf_1.SignalService.SharedConfigMessage({
            data: this.data,
            kind: this.kind,
            seqno: this.seqno,
        });
    }
}
exports.SharedConfigMessage = SharedConfigMessage;
