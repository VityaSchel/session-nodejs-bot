"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encryptAttachmentBufferNode = exports.decryptAttachmentBufferNode = void 0;
const sodiumNode_1 = require("./sodiumNode");
const sessionjs_logger_1 = require("../sessionjs-logger");
async function decryptAttachmentBufferNode(encryptingKey, bufferIn, getSodiumOverride) {
    const sodium = getSodiumOverride ? await getSodiumOverride() : await (0, sodiumNode_1.getSodiumNode)();
    const header = new Uint8Array(bufferIn.slice(0, sodium.crypto_secretstream_xchacha20poly1305_HEADERBYTES));
    const encryptedBuffer = new Uint8Array(bufferIn.slice(sodium.crypto_secretstream_xchacha20poly1305_HEADERBYTES));
    try {
        const state = sodium.crypto_secretstream_xchacha20poly1305_init_pull(header, encryptingKey);
        const messageTag = sodium.crypto_secretstream_xchacha20poly1305_pull(state, encryptedBuffer);
        if (messageTag.tag === sodium.crypto_secretstream_xchacha20poly1305_TAG_FINAL) {
            return messageTag.message;
        }
    }
    catch (e) {
        sessionjs_logger_1.console.error('Failed to load the file as an encrypted one', e);
    }
    return new Uint8Array();
}
exports.decryptAttachmentBufferNode = decryptAttachmentBufferNode;
async function encryptAttachmentBufferNode(encryptingKey, bufferIn, getSodiumOverride) {
    const sodium = getSodiumOverride ? await getSodiumOverride() : await (0, sodiumNode_1.getSodiumNode)();
    try {
        const uintArrayIn = new Uint8Array(bufferIn);
        const { state, header } = sodium.crypto_secretstream_xchacha20poly1305_init_push(encryptingKey);
        const bufferOut = sodium.crypto_secretstream_xchacha20poly1305_push(state, uintArrayIn, null, sodium.crypto_secretstream_xchacha20poly1305_TAG_FINAL);
        const encryptedBufferWithHeader = new Uint8Array(bufferOut.length + header.length);
        encryptedBufferWithHeader.set(header);
        encryptedBufferWithHeader.set(bufferOut, header.length);
        return { encryptedBufferWithHeader, header };
    }
    catch (e) {
        sessionjs_logger_1.console.error('encryptAttachmentBuffer error: ', e);
        return null;
    }
}
exports.encryptAttachmentBufferNode = encryptAttachmentBufferNode;
