"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClosedGroupNewMessage = void 0;
const protobuf_1 = require("../../../../../protobuf");
const ClosedGroupMessage_1 = require("./ClosedGroupMessage");
const String_1 = require("../../../../utils/String");
const sessionjs_logger_1 = require("../../../../../sessionjs-logger");
class ClosedGroupNewMessage extends ClosedGroupMessage_1.ClosedGroupMessage {
    name;
    members;
    admins;
    keypair;
    expireTimer;
    constructor(params) {
        super({
            timestamp: params.timestamp,
            identifier: params.identifier,
            groupId: params.groupId,
        });
        this.name = params.name;
        this.members = params.members;
        this.admins = params.admins;
        this.keypair = params.keypair;
        this.expireTimer = params.expireTimer;
        if (!params.admins || params.admins.length === 0) {
            throw new Error('Admins must be set');
        }
        if (!params.members || params.members.length === 0) {
            throw new Error('Members must be set');
        }
        if (!ClosedGroupMessage_1.ClosedGroupMessage.areAdminsMembers(params.admins, params.members)) {
            throw new Error('Admins must all be members of the group');
        }
        if (!params.name || params.name.length === 0) {
            throw new Error('Name must cannot be empty');
        }
        if (params.keypair.privateKeyData.byteLength === 0 ||
            params.keypair.publicKeyData.byteLength === 0) {
            throw new Error('PrivKey or pubkey is empty and cannot be');
        }
    }
    dataProto() {
        const dataMessage = new protobuf_1.SignalService.DataMessage();
        dataMessage.closedGroupControlMessage = new protobuf_1.SignalService.DataMessage.ClosedGroupControlMessage();
        dataMessage.closedGroupControlMessage.type =
            protobuf_1.SignalService.DataMessage.ClosedGroupControlMessage.Type.NEW;
        dataMessage.closedGroupControlMessage.publicKey = (0, String_1.fromHexToArray)(this.groupId.key);
        dataMessage.closedGroupControlMessage.name = this.name;
        dataMessage.closedGroupControlMessage.admins = this.admins.map(String_1.fromHexToArray);
        dataMessage.closedGroupControlMessage.members = this.members.map(String_1.fromHexToArray);
        dataMessage.closedGroupControlMessage.expireTimer = this.expireTimer;
        try {
            dataMessage.closedGroupControlMessage.encryptionKeyPair = new protobuf_1.SignalService.KeyPair();
            dataMessage.closedGroupControlMessage.encryptionKeyPair.privateKey = new Uint8Array(this.keypair.privateKeyData);
            dataMessage.closedGroupControlMessage.encryptionKeyPair.publicKey = new Uint8Array(this.keypair.publicKeyData);
        }
        catch (e) {
            sessionjs_logger_1.console.error('Failed to add encryptionKeyPair to group:', e);
            throw new Error('Failed to add encryptionKeyPair to group:');
        }
        return dataMessage;
    }
}
exports.ClosedGroupNewMessage = ClosedGroupNewMessage;
