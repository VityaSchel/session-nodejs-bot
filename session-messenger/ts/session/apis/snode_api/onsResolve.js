"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ONSResolve = void 0;
const lodash_1 = __importStar(require("lodash"));
const crypto_1 = require("../../crypto");
const String_1 = require("../../utils/String");
const batchRequest_1 = require("./batchRequest");
const getNetworkTime_1 = require("./getNetworkTime");
const snodePool_1 = require("./snodePool");
const sessionjs_logger_1 = require("../../../sessionjs-logger");
const onsNameRegex = '^\\w([\\w-]*[\\w])?$';
function buildOnsResolveRequests(base64EncodedNameHash) {
    const request = {
        method: 'oxend_request',
        params: {
            endpoint: 'ons_resolve',
            params: { type: 0, name_hash: base64EncodedNameHash },
        },
    };
    return [request];
}
async function getSessionIDForOnsName(onsNameCase) {
    const validationCount = 3;
    const onsNameLowerCase = onsNameCase.toLowerCase();
    const sodium = await (0, crypto_1.getSodiumRenderer)();
    const nameAsData = (0, String_1.stringToUint8Array)(onsNameLowerCase);
    const nameHash = sodium.crypto_generichash(sodium.crypto_generichash_BYTES, nameAsData);
    const base64EncodedNameHash = (0, String_1.fromUInt8ArrayToBase64)(nameHash);
    const onsResolveRequests = buildOnsResolveRequests(base64EncodedNameHash);
    const promises = (0, lodash_1.range)(0, validationCount).map(async () => {
        const targetNode = await (0, snodePool_1.getRandomSnode)();
        const results = await (0, batchRequest_1.doSnodeBatchRequest)(onsResolveRequests, targetNode, 4000, null);
        const firstResult = results[0];
        if (!firstResult || firstResult.code !== 200 || !firstResult.body) {
            throw new Error('ONSresolve:Failed to resolve ONS');
        }
        const parsedBody = firstResult.body;
        getNetworkTime_1.GetNetworkTime.handleTimestampOffsetFromNetwork('ons_resolve', parsedBody.t);
        const intermediate = parsedBody?.result;
        if (!intermediate || !intermediate?.encrypted_value) {
            throw new Error('ONSresolve: no encrypted_value');
        }
        const hexEncodedCipherText = intermediate?.encrypted_value;
        const isArgon2Based = !intermediate?.nonce;
        const ciphertext = (0, String_1.fromHexToArray)(hexEncodedCipherText);
        let sessionIDAsData;
        let nonce;
        let key;
        if (isArgon2Based) {
            const salt = new Uint8Array(sodium.crypto_pwhash_SALTBYTES);
            nonce = new Uint8Array(sodium.crypto_secretbox_NONCEBYTES);
            try {
                const keyHex = sodium.crypto_pwhash(sodium.crypto_secretbox_KEYBYTES, onsNameLowerCase, salt, sodium.crypto_pwhash_OPSLIMIT_MODERATE, sodium.crypto_pwhash_MEMLIMIT_MODERATE, sodium.crypto_pwhash_ALG_ARGON2ID13, 'hex');
                if (!keyHex) {
                    throw new Error('ONSresolve: key invalid argon2');
                }
                key = (0, String_1.fromHexToArray)(keyHex);
            }
            catch (e) {
                throw new Error('ONSresolve: Hashing failed');
            }
            sessionIDAsData = sodium.crypto_secretbox_open_easy(ciphertext, nonce, key);
            if (!sessionIDAsData) {
                throw new Error('ONSresolve: Decryption failed');
            }
            return (0, String_1.toHex)(sessionIDAsData);
        }
        const hexEncodedNonce = intermediate.nonce;
        if (!hexEncodedNonce) {
            throw new Error('ONSresolve: No hexEncodedNonce');
        }
        nonce = (0, String_1.fromHexToArray)(hexEncodedNonce);
        try {
            key = sodium.crypto_generichash(sodium.crypto_generichash_BYTES, nameAsData, nameHash);
            if (!key) {
                throw new Error('ONSresolve: Hashing failed');
            }
        }
        catch (e) {
            sessionjs_logger_1.console.warn('ONSresolve: hashing failed', e);
            throw new Error('ONSresolve: Hashing failed');
        }
        sessionIDAsData = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(null, ciphertext, null, nonce, key);
        if (!sessionIDAsData) {
            throw new Error('ONSresolve: Decryption failed');
        }
        return (0, String_1.toHex)(sessionIDAsData);
    });
    try {
        const allResolvedSessionIds = await Promise.all(promises);
        if (allResolvedSessionIds?.length !== validationCount) {
            throw new Error('ONSresolve: Validation failed');
        }
        if (lodash_1.default.uniq(allResolvedSessionIds).length !== 1) {
            throw new Error('ONSresolve: Validation failed');
        }
        return allResolvedSessionIds[0];
    }
    catch (e) {
        sessionjs_logger_1.console.warn('ONSresolve: error', e);
        throw e;
    }
}
exports.ONSResolve = { onsNameRegex, getSessionIDForOnsName };
