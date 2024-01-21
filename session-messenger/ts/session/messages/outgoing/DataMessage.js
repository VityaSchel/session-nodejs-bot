"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataMessage = void 0;
const _1 = require(".");
const protobuf_1 = require("../../../protobuf");
class DataMessage extends _1.ContentMessage {
    contentProto() {
        return new protobuf_1.SignalService.Content({
            dataMessage: this.dataProto(),
        });
    }
}
exports.DataMessage = DataMessage;
