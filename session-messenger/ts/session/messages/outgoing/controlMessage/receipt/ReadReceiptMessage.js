"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReadReceiptMessage = void 0;
const protobuf_1 = require("../../../../../protobuf");
const ReceiptMessage_1 = require("./ReceiptMessage");
class ReadReceiptMessage extends ReceiptMessage_1.ReceiptMessage {
    getReceiptType() {
        return protobuf_1.SignalService.ReceiptMessage.Type.READ;
    }
}
exports.ReadReceiptMessage = ReadReceiptMessage;
