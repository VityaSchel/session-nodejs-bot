"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ECKeyPair = void 0;
const String_1 = require("../session/utils/String");
class ECKeyPair {
    publicKeyData;
    privateKeyData;
    constructor(publicKeyData, privateKeyData) {
        this.publicKeyData = publicKeyData;
        this.privateKeyData = privateKeyData;
    }
    static fromArrayBuffer(pub, priv) {
        return new ECKeyPair(new Uint8Array(pub), new Uint8Array(priv));
    }
    static fromKeyPair(pair) {
        return new ECKeyPair(new Uint8Array(pair.pubKey), new Uint8Array(pair.privKey));
    }
    static fromHexKeyPair(pair) {
        return new ECKeyPair((0, String_1.fromHexToArray)(pair.publicHex), (0, String_1.fromHexToArray)(pair.privateHex));
    }
    toString() {
        const hexKeypair = this.toHexKeyPair();
        return `ECKeyPair: ${hexKeypair.publicHex} ${hexKeypair.privateHex}`;
    }
    toHexKeyPair() {
        const publicHex = (0, String_1.toHex)(this.publicKeyData);
        const privateHex = (0, String_1.toHex)(this.privateKeyData);
        return {
            publicHex,
            privateHex,
        };
    }
}
exports.ECKeyPair = ECKeyPair;
