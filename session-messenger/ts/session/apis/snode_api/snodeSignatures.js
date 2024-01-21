"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SnodeSignature = void 0;
const sessionjs_logger_1 = require("../../../sessionjs-logger");
const crypto_1 = require("../../crypto");
const utils_1 = require("../../utils");
const String_1 = require("../../utils/String");
const getNetworkTime_1 = require("./getNetworkTime");
async function getSnodeSignatureByHashesParams({ messages, method, pubkey, }) {
    const ourEd25519Key = await utils_1.UserUtils.getUserED25519KeyPair();
    if (!ourEd25519Key) {
        const err = `getSnodeSignatureParams "${method}": User has no getUserED25519KeyPair()`;
        sessionjs_logger_1.console.warn(err);
        throw new Error(err);
    }
    const edKeyPrivBytes = (0, String_1.fromHexToArray)(ourEd25519Key?.privKey);
    const verificationData = utils_1.StringUtils.encode(`${method}${messages.join('')}`, 'utf8');
    const message = new Uint8Array(verificationData);
    const sodium = await (0, crypto_1.getSodiumRenderer)();
    try {
        const signature = sodium.crypto_sign_detached(message, edKeyPrivBytes);
        const signatureBase64 = (0, String_1.fromUInt8ArrayToBase64)(signature);
        return {
            signature: signatureBase64,
            pubkey_ed25519: ourEd25519Key.pubKey,
            pubkey,
            messages,
        };
    }
    catch (e) {
        sessionjs_logger_1.console.warn('getSnodeSignatureParams failed with: ', e.message);
        throw e;
    }
}
async function getSnodeSignatureParams(params) {
    const ourEd25519Key = await utils_1.UserUtils.getUserED25519KeyPair();
    if (!ourEd25519Key) {
        const err = `getSnodeSignatureParams "${params.method}": User has no getUserED25519KeyPair()`;
        sessionjs_logger_1.console.warn(err);
        throw new Error(err);
    }
    const namespace = params.namespace || 0;
    const edKeyPrivBytes = (0, String_1.fromHexToArray)(ourEd25519Key?.privKey);
    const signatureTimestamp = getNetworkTime_1.GetNetworkTime.getNowWithNetworkOffset();
    const withoutNamespace = `${params.method}${signatureTimestamp}`;
    const withNamespace = `${params.method}${namespace}${signatureTimestamp}`;
    const verificationData = namespace === 0
        ? utils_1.StringUtils.encode(withoutNamespace, 'utf8')
        : utils_1.StringUtils.encode(withNamespace, 'utf8');
    const message = new Uint8Array(verificationData);
    const sodium = await (0, crypto_1.getSodiumRenderer)();
    try {
        const signature = sodium.crypto_sign_detached(message, edKeyPrivBytes);
        const signatureBase64 = (0, String_1.fromUInt8ArrayToBase64)(signature);
        return {
            timestamp: signatureTimestamp,
            signature: signatureBase64,
            pubkey_ed25519: ourEd25519Key.pubKey,
            pubkey: params.pubkey,
        };
    }
    catch (e) {
        sessionjs_logger_1.console.warn('getSnodeSignatureParams failed with: ', e.message);
        throw e;
    }
}
async function generateUpdateExpirySignature({ shortenOrExtend, timestamp, messageHashes, }) {
    const ourEd25519Key = await utils_1.UserUtils.getUserED25519KeyPair();
    if (!ourEd25519Key) {
        const err = 'getSnodeSignatureParams "expiry": User has no getUserED25519KeyPair()';
        sessionjs_logger_1.console.warn(err);
        throw new Error(err);
    }
    const edKeyPrivBytes = (0, String_1.fromHexToArray)(ourEd25519Key?.privKey);
    const verificationString = `expire${shortenOrExtend}${timestamp}${messageHashes.join('')}`;
    const verificationData = utils_1.StringUtils.encode(verificationString, 'utf8');
    const message = new Uint8Array(verificationData);
    const sodium = await (0, crypto_1.getSodiumRenderer)();
    try {
        const signature = sodium.crypto_sign_detached(message, edKeyPrivBytes);
        const signatureBase64 = (0, String_1.fromUInt8ArrayToBase64)(signature);
        return {
            signature: signatureBase64,
            pubkey_ed25519: ourEd25519Key.pubKey,
        };
    }
    catch (e) {
        sessionjs_logger_1.console.warn('generateSignature failed with: ', e.message);
        return null;
    }
}
exports.SnodeSignature = {
    getSnodeSignatureParams,
    getSnodeSignatureByHashesParams,
    generateUpdateExpirySignature,
};
