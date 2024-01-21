"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CallMessage = void 0;
const protobuf_1 = require("../../../../protobuf");
const __1 = require("..");
const compiled_1 = require("../../../../protobuf/compiled");
const constants_1 = require("../../../constants");
class CallMessage extends __1.ContentMessage {
    type;
    sdpMLineIndexes;
    sdpMids;
    sdps;
    uuid;
    constructor(params) {
        super({ timestamp: params.timestamp, identifier: params.identifier });
        this.type = params.type;
        this.sdpMLineIndexes = params.sdpMLineIndexes;
        this.sdpMids = params.sdpMids;
        this.sdps = params.sdps;
        this.uuid = params.uuid;
        if (this.type !== compiled_1.signalservice.CallMessage.Type.END_CALL &&
            this.type !== compiled_1.signalservice.CallMessage.Type.PRE_OFFER &&
            (!this.sdps || this.sdps.length === 0)) {
            throw new Error('sdps must be set unless this is a END_CALL type message');
        }
        if (this.uuid.length === 0) {
            throw new Error('uuid must cannot be empty');
        }
    }
    contentProto() {
        return new protobuf_1.SignalService.Content({
            callMessage: this.dataCallProto(),
        });
    }
    ttl() {
        return constants_1.TTL_DEFAULT.CALL_MESSAGE;
    }
    dataCallProto() {
        return new protobuf_1.SignalService.CallMessage({
            type: this.type,
            sdpMLineIndexes: this.sdpMLineIndexes,
            sdpMids: this.sdpMids,
            sdps: this.sdps,
            uuid: this.uuid,
        });
    }
}
exports.CallMessage = CallMessage;
