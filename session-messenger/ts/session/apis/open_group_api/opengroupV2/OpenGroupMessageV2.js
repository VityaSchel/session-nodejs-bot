"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenGroupMessageV2 = void 0;
const curve25519_js_1 = require("curve25519-js");
const util_worker_interface_1 = require("../../../../webworker/workers/browser/util_worker_interface");
const crypto_1 = require("../../../crypto");
const utils_1 = require("../../../utils");
const String_1 = require("../../../utils/String");
const sogsBlinding_1 = require("../sogsv3/sogsBlinding");
const sessionjs_logger_1 = require("../../../../sessionjs-logger");
class OpenGroupMessageV2 {
    serverId;
    sender;
    sentTimestamp;
    base64EncodedData;
    base64EncodedSignature;
    filesToLink;
    constructor(messageData) {
        const { base64EncodedData, sentTimestamp, base64EncodedSignature, sender, serverId, filesToLink, } = messageData;
        this.base64EncodedData = base64EncodedData;
        this.sentTimestamp = sentTimestamp;
        this.base64EncodedSignature = base64EncodedSignature;
        this.sender = sender;
        this.serverId = serverId;
        this.filesToLink = filesToLink;
    }
    static fromJson(json) {
        const { data: base64EncodedData, timestamp: sentTimestamp, server_id: serverId, public_key: sender, signature: base64EncodedSignature, files: filesToLink, } = json;
        if (!base64EncodedData || !sentTimestamp) {
            sessionjs_logger_1.console.info('invalid json to build OpenGroupMessageV2');
            throw new Error('OpengroupV2Message fromJson() failed');
        }
        return new OpenGroupMessageV2({
            base64EncodedData,
            base64EncodedSignature,
            sentTimestamp,
            serverId,
            sender,
            filesToLink,
        });
    }
    async sign(ourKeyPair) {
        if (!ourKeyPair) {
            sessionjs_logger_1.console.warn("Couldn't find user X25519 key pair.");
            throw new Error("Couldn't sign message");
        }
        const data = (0, String_1.fromBase64ToArray)(this.base64EncodedData);
        const signature = (0, curve25519_js_1.sign)(new Uint8Array(ourKeyPair.privKey), data, null);
        if (!signature || signature.length === 0) {
            throw new Error("Couldn't sign message");
        }
        const base64Sig = await (0, util_worker_interface_1.callUtilsWorker)('arrayBufferToStringBase64', signature);
        return new OpenGroupMessageV2({
            base64EncodedData: this.base64EncodedData,
            sentTimestamp: this.sentTimestamp,
            base64EncodedSignature: base64Sig,
            sender: this.sender,
            serverId: this.serverId,
            filesToLink: this.filesToLink,
        });
    }
    async signWithBlinding(serverPubKey) {
        const signingKeys = await utils_1.UserUtils.getUserED25519KeyPairBytes();
        if (!signingKeys) {
            throw new Error('signWithBlinding: getUserED25519KeyPairBytes returned nothing');
        }
        const sodium = await (0, crypto_1.getSodiumRenderer)();
        const blindedKeyPair = sogsBlinding_1.SogsBlinding.getBlindingValues((0, String_1.fromHexToArray)(serverPubKey), signingKeys, sodium);
        if (!blindedKeyPair) {
            throw new Error('signWithBlinding: getBlindedPubKey returned nothing');
        }
        const data = (0, String_1.fromBase64ToArray)(this.base64EncodedData);
        const signature = await sogsBlinding_1.SogsBlinding.getSogsSignature({
            blinded: true,
            ka: blindedKeyPair.secretKey,
            kA: blindedKeyPair.publicKey,
            toSign: data,
            signingKeys,
        });
        if (!signature || signature.length === 0) {
            throw new Error("Couldn't sign message");
        }
        const base64Sig = await (0, util_worker_interface_1.callUtilsWorker)('arrayBufferToStringBase64', signature);
        return new OpenGroupMessageV2({
            base64EncodedData: this.base64EncodedData,
            sentTimestamp: this.sentTimestamp,
            base64EncodedSignature: base64Sig,
            sender: this.sender,
            serverId: this.serverId,
            filesToLink: this.filesToLink,
        });
    }
    toJson() {
        const json = {
            data: this.base64EncodedData,
            timestamp: this.sentTimestamp,
        };
        if (this.serverId) {
            json.server_id = this.serverId;
        }
        if (this.sender) {
            json.public_key = this.sender;
        }
        if (this.base64EncodedSignature) {
            json.signature = this.base64EncodedSignature;
        }
        if (this.filesToLink) {
            json.files = this.filesToLink;
        }
        return json;
    }
    toBlindedMessageRequestJson() {
        const json = {
            message: this.base64EncodedData,
            timestamp: this.sentTimestamp,
        };
        if (this.serverId) {
            json.server_id = this.serverId;
        }
        if (this.sender) {
            json.public_key = this.sender;
        }
        if (this.base64EncodedSignature) {
            json.signature = this.base64EncodedSignature;
        }
        if (this.filesToLink) {
            json.files = this.filesToLink;
        }
        return json;
    }
}
exports.OpenGroupMessageV2 = OpenGroupMessageV2;
