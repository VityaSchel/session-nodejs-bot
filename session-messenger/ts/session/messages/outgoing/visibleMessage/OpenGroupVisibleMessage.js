"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenGroupVisibleMessage = void 0;
const settings_key_1 = require("../../../../data/settings-key");
const storage_1 = require("../../../../util/storage");
const VisibleMessage_1 = require("./VisibleMessage");
class OpenGroupVisibleMessage extends VisibleMessage_1.VisibleMessage {
    blocksCommunityMessageRequests;
    constructor(params) {
        super(params);
        this.blocksCommunityMessageRequests = !storage_1.Storage.get(settings_key_1.SettingsKey.hasBlindedMsgRequestsEnabled);
    }
    dataProto() {
        const dataMessage = super.dataProto();
        dataMessage.blocksCommunityMessageRequests = this.blocksCommunityMessageRequests;
        return dataMessage;
    }
}
exports.OpenGroupVisibleMessage = OpenGroupVisibleMessage;
