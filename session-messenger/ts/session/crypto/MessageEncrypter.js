"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encryptUsingSessionProtocol = exports.encrypt = exports.getSodiumRenderer = exports.concatUInt8Array = void 0;
const protobuf_1 = require("../../protobuf");
const types_1 = require("../types");
const _1 = require(".");
Object.defineProperty(exports, "concatUInt8Array", { enumerable: true, get: function () { return _1.concatUInt8Array; } });
Object.defineProperty(exports, "getSodiumRenderer", { enumerable: true, get: function () { return _1.getSodiumRenderer; } });
const String_1 = require("../utils/String");
const data_1 = require("../../data/data");
const utils_1 = require("../utils");
const BufferPadding_1 = require("./BufferPadding");
const sessionjs_logger_1 = require("../../sessionjs-logger");
async function encrypt(device, plainTextBuffer, encryptionType) {
    const { CLOSED_GROUP_MESSAGE, SESSION_MESSAGE } = protobuf_1.SignalService.Envelope.Type;
    if (encryptionType !== CLOSED_GROUP_MESSAGE && encryptionType !== SESSION_MESSAGE) {
        throw new Error(`Invalid encryption type:${encryptionType}`);
    }
    const encryptForClosedGroup = encryptionType === CLOSED_GROUP_MESSAGE;
    const plainText = (0, BufferPadding_1.addMessagePadding)(plainTextBuffer);
    if (encryptForClosedGroup) {
        const hexEncryptionKeyPair = await data_1.Data.getLatestClosedGroupEncryptionKeyPair(device.key);
        if (!hexEncryptionKeyPair) {
            sessionjs_logger_1.console.warn("Couldn't get key pair for closed group during encryption");
            throw new Error("Couldn't get key pair for closed group");
        }
        const hexPubFromECKeyPair = types_1.PubKey.cast(hexEncryptionKeyPair.publicHex);
        const cipherTextClosedGroup = await _1.MessageEncrypter.encryptUsingSessionProtocol(hexPubFromECKeyPair, plainText);
        return {
            envelopeType: CLOSED_GROUP_MESSAGE,
            cipherText: cipherTextClosedGroup,
        };
    }
    const cipherText = await _1.MessageEncrypter.encryptUsingSessionProtocol(device, plainText);
    return { envelopeType: SESSION_MESSAGE, cipherText };
}
exports.encrypt = encrypt;
async function encryptUsingSessionProtocol(recipientHexEncodedX25519PublicKey, plaintext) {
    const userED25519KeyPairHex = await utils_1.UserUtils.getUserED25519KeyPair();
    if (!userED25519KeyPairHex ||
        !userED25519KeyPairHex.pubKey?.length ||
        !userED25519KeyPairHex.privKey?.length) {
        throw new Error("Couldn't find user ED25519 key pair.");
    }
    const sodium = await (0, _1.getSodiumRenderer)();
    const recipientX25519PublicKey = recipientHexEncodedX25519PublicKey.withoutPrefixToArray();
    const userED25519PubKeyBytes = (0, String_1.fromHexToArray)(userED25519KeyPairHex.pubKey);
    const userED25519SecretKeyBytes = (0, String_1.fromHexToArray)(userED25519KeyPairHex.privKey);
    const verificationData = (0, _1.concatUInt8Array)(plaintext, userED25519PubKeyBytes, recipientX25519PublicKey);
    const signature = sodium.crypto_sign_detached(verificationData, userED25519SecretKeyBytes);
    if (!signature || signature.length === 0) {
        throw new Error("Couldn't sign message");
    }
    const plaintextWithMetadata = (0, _1.concatUInt8Array)(plaintext, userED25519PubKeyBytes, signature);
    const ciphertext = sodium.crypto_box_seal(plaintextWithMetadata, recipientX25519PublicKey);
    if (!ciphertext) {
        throw new Error("Couldn't encrypt message.");
    }
    return ciphertext;
}
exports.encryptUsingSessionProtocol = encryptUsingSessionProtocol;
