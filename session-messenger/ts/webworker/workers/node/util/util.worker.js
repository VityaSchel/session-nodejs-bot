"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bytebuffer_1 = __importDefault(require("bytebuffer"));
const curve25519_js_1 = require("curve25519-js");
const libsodium_wrappers_sumo_1 = __importDefault(require("libsodium-wrappers-sumo"));
const lodash_1 = __importDefault(require("lodash"));
const encrypt_attachment_buffer_1 = require("../../../../node/encrypt_attachment_buffer");
const crypto_1 = __importDefault(require("crypto"));
const sessionjs_logger_1 = require("../../../../sessionjs-logger");
async function getSodiumWorker() {
    await libsodium_wrappers_sumo_1.default.ready;
    return libsodium_wrappers_sumo_1.default;
}
const functions = {
    arrayBufferToStringBase64,
    fromBase64ToArrayBuffer,
    fromHexToArrayBuffer,
    verifyAllSignatures,
    DecryptAESGCM,
    deriveSymmetricKey,
    encryptForPubkey,
    decryptAttachmentBufferNode,
    encryptAttachmentBufferNode,
    bytesFromString,
};
self.onmessage = async (e) => {
    const [jobId, fnName, ...args] = e.data;
    try {
        const fn = functions[fnName];
        if (!fn) {
            throw new Error(`Worker: job ${jobId} did not find function ${fnName}`);
        }
        const result = await fn(...args);
        postMessage([jobId, null, result]);
    }
    catch (error) {
        const errorForDisplay = prepareErrorForPostMessage(error);
        postMessage([jobId, errorForDisplay]);
    }
};
function prepareErrorForPostMessage(error) {
    if (!error) {
        return null;
    }
    if (error.stack) {
        return error.stack;
    }
    return error.message;
}
function arrayBufferToStringBase64(arrayBuffer) {
    return bytebuffer_1.default.wrap(arrayBuffer).toString('base64');
}
async function encryptAttachmentBufferNode(encryptingKey, bufferIn) {
    return (0, encrypt_attachment_buffer_1.encryptAttachmentBufferNode)(encryptingKey, bufferIn, getSodiumWorker);
}
async function decryptAttachmentBufferNode(encryptingKey, bufferIn) {
    return (0, encrypt_attachment_buffer_1.decryptAttachmentBufferNode)(encryptingKey, bufferIn, getSodiumWorker);
}
function fromBase64ToArrayBuffer(base64Str) {
    return bytebuffer_1.default.wrap(base64Str, 'base64').toArrayBuffer();
}
function fromBase64ToUint8Array(base64Str) {
    return new Uint8Array(bytebuffer_1.default.wrap(base64Str, 'base64').toArrayBuffer());
}
function fromHexToArray(hexStr) {
    return new Uint8Array(bytebuffer_1.default.wrap(hexStr, 'hex').toArrayBuffer());
}
function fromHexToArrayBuffer(hexStr) {
    return bytebuffer_1.default.wrap(hexStr, 'hex').toArrayBuffer();
}
function bytesFromString(str) {
    return bytebuffer_1.default.wrap(str, 'utf8').toArrayBuffer();
}
async function verifyAllSignatures(uncheckedSignatureMessages) {
    const checked = [];
    for (let index = 0; index < uncheckedSignatureMessages.length; index++) {
        const unchecked = uncheckedSignatureMessages[index];
        try {
            const valid = await verifySignature(unchecked.sender, unchecked.base64EncodedData, unchecked.base64EncodedSignature);
            if (valid) {
                checked.push(unchecked.base64EncodedData);
                continue;
            }
            sessionjs_logger_1.console.info('got an opengroup message with an invalid signature');
        }
        catch (e) {
            sessionjs_logger_1.console.error(e);
        }
    }
    return lodash_1.default.compact(checked) || [];
}
async function verifySignature(senderPubKey, messageBase64, signatureBase64) {
    try {
        if (typeof senderPubKey !== 'string') {
            throw new Error('senderPubKey type not correct');
        }
        if (typeof messageBase64 !== 'string') {
            throw new Error('messageBase64 type not correct');
        }
        if (typeof signatureBase64 !== 'string') {
            throw new Error('signatureBase64 type not correct');
        }
        const messageData = fromBase64ToUint8Array(messageBase64);
        const signature = fromBase64ToUint8Array(signatureBase64);
        const isBlindedSender = senderPubKey.startsWith('15') || senderPubKey.startsWith('25');
        const pubkeyWithoutPrefix = senderPubKey.slice(2);
        const pubkeyBytes = fromHexToArray(pubkeyWithoutPrefix);
        if (isBlindedSender) {
            const sodium = await getSodiumWorker();
            const blindedVerifySig = sodium.crypto_sign_verify_detached(signature, messageData, pubkeyBytes);
            if (!blindedVerifySig) {
                sessionjs_logger_1.console.info('Invalid signature blinded');
                return false;
            }
            return true;
        }
        const verifyRet = (0, curve25519_js_1.verify)(pubkeyBytes, messageData, signature);
        if (!verifyRet) {
            sessionjs_logger_1.console.error('Invalid signature not blinded');
            return false;
        }
        return true;
    }
    catch (e) {
        sessionjs_logger_1.console.error('verifySignature got an error:', e);
        return false;
    }
}
const NONCE_LENGTH = 12;
async function deriveSymmetricKey(x25519PublicKey, x25519PrivateKey) {
    assertArrayBufferView(x25519PublicKey);
    assertArrayBufferView(x25519PrivateKey);
    const ephemeralSecret = (0, curve25519_js_1.sharedKey)(x25519PrivateKey, x25519PublicKey);
    const salt = bytesFromString('LOKI');
    const key = await crypto_1.default.subtle.importKey('raw', salt, { name: 'HMAC', hash: { name: 'SHA-256' } }, false, ['sign']);
    const symmetricKey = await crypto_1.default.subtle.sign({ name: 'HMAC', hash: 'SHA-256' }, key, ephemeralSecret);
    return symmetricKey;
}
function assertArrayBufferView(val) {
    if (!ArrayBuffer.isView(val)) {
        throw new Error('val type not correct');
    }
}
async function encryptForPubkey(pubkeyX25519str, payloadBytes) {
    try {
        if (typeof pubkeyX25519str !== 'string') {
            throw new Error('pubkeyX25519str type not correct');
        }
        assertArrayBufferView(payloadBytes);
        const ran = (await getSodiumWorker()).randombytes_buf(32);
        const ephemeral = (0, curve25519_js_1.generateKeyPair)(ran);
        const pubkeyX25519Buffer = fromHexToArray(pubkeyX25519str);
        const symmetricKey = await deriveSymmetricKey(pubkeyX25519Buffer, new Uint8Array(ephemeral.private));
        const ciphertext = await EncryptAESGCM(symmetricKey, payloadBytes);
        return { ciphertext, symmetricKey, ephemeralKey: ephemeral.public };
    }
    catch (e) {
        sessionjs_logger_1.console.error('encryptForPubkey got an error:', e);
        return null;
    }
}
async function EncryptAESGCM(symmetricKey, plaintext) {
    const nonce = crypto_1.default.getRandomValues(new Uint8Array(NONCE_LENGTH));
    const key = await crypto_1.default.subtle.importKey('raw', symmetricKey, { name: 'AES-GCM' }, false, [
        'encrypt',
    ]);
    const ciphertext = await crypto_1.default.subtle.encrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, key, plaintext);
    const ivAndCiphertext = new Uint8Array(NONCE_LENGTH + ciphertext.byteLength);
    ivAndCiphertext.set(nonce);
    ivAndCiphertext.set(new Uint8Array(ciphertext), nonce.byteLength);
    return ivAndCiphertext;
}
async function DecryptAESGCM(symmetricKey, ivAndCiphertext) {
    assertArrayBufferView(symmetricKey);
    assertArrayBufferView(ivAndCiphertext);
    const nonce = ivAndCiphertext.buffer.slice(0, NONCE_LENGTH);
    const ciphertext = ivAndCiphertext.buffer.slice(NONCE_LENGTH);
    const key = await crypto_1.default.subtle.importKey('raw', symmetricKey.buffer, { name: 'AES-GCM' }, false, ['decrypt']);
    return crypto_1.default.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, ciphertext);
}
