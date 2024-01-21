"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReceiptMessage = void 0;
const protobuf_1 = require("../../../../../protobuf");
const __1 = require("../..");
class ReceiptMessage extends __1.ContentMessage {
    timestamps;
    constructor({ timestamp, identifier, timestamps }) {
        super({ timestamp, identifier });
        this.timestamps = timestamps;
    }
    contentProto() {
        return new protobuf_1.SignalService.Content({
            receiptMessage: this.receiptProto(),
        });
    }
    receiptProto() {
        return new protobuf_1.SignalService.ReceiptMessage({
            type: this.getReceiptType(),
            timestamp: this.timestamps,
        });
    }
}
exports.ReceiptMessage = ReceiptMessage;
