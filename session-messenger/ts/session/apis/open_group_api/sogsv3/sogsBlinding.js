"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SogsBlinding = void 0;
const libsodium_wrappers_sumo_1 = require("libsodium-wrappers-sumo");
const lodash_1 = require("lodash");
const String_1 = require("../../../utils/String");
const crypto_1 = require("../../../crypto");
const utils_1 = require("../../../utils");
const types_1 = require("../../../types");
const SodiumUtils_1 = require("../../../utils/SodiumUtils");
const onionSend_1 = require("../../../onions/onionSend");
const sessionjs_logger_1 = require("../../../../sessionjs-logger");
async function getSogsSignature({ blinded, ka, kA, toSign, signingKeys, }) {
    const sodium = await (0, crypto_1.getSodiumRenderer)();
    if (blinded && ka && kA) {
        return blindedED25519Signature(toSign, signingKeys, ka, kA);
    }
    return sodium.crypto_sign_detached(toSign, signingKeys.privKeyBytes);
}
async function getOpenGroupHeaders(data) {
    const { signingKeys, serverPK, nonce, method, path, timestamp, blinded, body } = data;
    const sodium = await (0, crypto_1.getSodiumRenderer)();
    let pubkey;
    let ka;
    let kA;
    if (blinded) {
        const blindingValues = getBlindingValues(serverPK, signingKeys, sodium);
        ka = blindingValues.secretKey;
        kA = blindingValues.publicKey;
        pubkey = `${types_1.KeyPrefixType.blinded15}${(0, String_1.toHex)(kA)}`;
    }
    else {
        pubkey = `${types_1.KeyPrefixType.unblinded}${(0, String_1.toHex)(signingKeys.pubKeyBytes)}`;
    }
    const rawPath = onionSend_1.OnionSending.endpointRequiresDecoding(path);
    const encodedPath = new Uint8Array((0, String_1.encode)(rawPath, 'utf8'));
    let toSign = (0, crypto_1.concatUInt8Array)(serverPK, nonce, (0, String_1.stringToUint8Array)(timestamp.toString()), (0, String_1.stringToUint8Array)(method), encodedPath);
    if (body) {
        const bodyHashed = sodium.crypto_generichash(64, body);
        toSign = (0, crypto_1.concatUInt8Array)(toSign, bodyHashed);
    }
    const signature = await exports.SogsBlinding.getSogsSignature({ blinded, kA, ka, signingKeys, toSign });
    const headers = {
        'X-SOGS-Pubkey': pubkey,
        'X-SOGS-Timestamp': `${timestamp}`,
        'X-SOGS-Nonce': (0, String_1.fromUInt8ArrayToBase64)(nonce),
        'X-SOGS-Signature': (0, String_1.fromUInt8ArrayToBase64)(signature),
    };
    return headers;
}
async function blindedED25519Signature(messageParts, ourKeyPair, ka, kA) {
    const sodium = await (0, crypto_1.getSodiumRenderer)();
    const sEncode = ourKeyPair.privKeyBytes.slice(0, 32);
    const shaFullLength = sodium.crypto_hash_sha512(sEncode);
    const Hrh = shaFullLength.slice(32);
    const r = sodium.crypto_core_ed25519_scalar_reduce(sha512Multipart([Hrh, kA, messageParts]));
    const sigR = sodium.crypto_scalarmult_ed25519_base_noclamp(r);
    const HRAM = sodium.crypto_core_ed25519_scalar_reduce(sha512Multipart([sigR, kA, messageParts]));
    const sigS = sodium.crypto_core_ed25519_scalar_add(r, sodium.crypto_core_ed25519_scalar_mul(HRAM, ka));
    const fullSig = (0, crypto_1.concatUInt8Array)(sigR, sigS);
    return fullSig;
}
const sha512Multipart = (parts) => {
    return (0, libsodium_wrappers_sumo_1.crypto_hash_sha512)((0, crypto_1.concatUInt8Array)(...parts));
};
const getBlindedPubKey = (serverPK, signingKeys, sodium) => {
    const blindedPubKeyBytes = getBlindingValues(serverPK, signingKeys, sodium);
    return `${types_1.KeyPrefixType.blinded15}${(0, libsodium_wrappers_sumo_1.to_hex)(blindedPubKeyBytes.publicKey)}`;
};
const getBlindingValues = (serverPK, signingKeys, sodium) => {
    const k = sodium.crypto_core_ed25519_scalar_reduce(sodium.crypto_generichash(64, serverPK));
    let a = sodium.crypto_sign_ed25519_sk_to_curve25519(signingKeys.privKeyBytes);
    if (a.length > 32) {
        sessionjs_logger_1.console.warn('length of signing key is too long, cutting to 32: oldlength', a.length);
        a = a.slice(0, 32);
    }
    const ka = sodium.crypto_core_ed25519_scalar_mul(k, a);
    const kA = sodium.crypto_scalarmult_ed25519_base_noclamp(ka);
    return {
        a,
        secretKey: ka,
        publicKey: kA,
    };
};
const encryptBlindedMessage = async (options) => {
    const { rawData, senderSigningKey, serverPubKey, recipientSigningKey, recipientBlindedPublicKey, } = options;
    const sodium = await (0, crypto_1.getSodiumRenderer)();
    const aBlindingValues = exports.SogsBlinding.getBlindingValues(serverPubKey, senderSigningKey, sodium);
    let kB;
    if (!recipientBlindedPublicKey && recipientSigningKey) {
        const bBlindingValues = exports.SogsBlinding.getBlindingValues(serverPubKey, recipientSigningKey, sodium);
        kB = bBlindingValues.publicKey;
    }
    if (recipientBlindedPublicKey) {
        kB = recipientBlindedPublicKey;
    }
    if (!kB) {
        sessionjs_logger_1.console.error('No recipient-side data provided for encryption');
        return null;
    }
    const { a, publicKey: kA } = aBlindingValues;
    const encryptKey = sodium.crypto_generichash(32, (0, crypto_1.concatUInt8Array)(sodium.crypto_scalarmult_ed25519_noclamp(a, kB), kA, kB));
    const plaintext = (0, crypto_1.concatUInt8Array)(rawData, senderSigningKey.pubKeyBytes);
    const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
    const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(plaintext, null, null, nonce, encryptKey);
    const prefixData = new Uint8Array(utils_1.StringUtils.encode('\x00', 'utf8'));
    const data = (0, crypto_1.concatUInt8Array)(prefixData, ciphertext, nonce);
    return data;
};
async function decryptWithSessionBlindingProtocol(data, isOutgoing, otherBlindedPublicKey, serverPubkey, userEd25519KeyPair) {
    const sodium = await (0, crypto_1.getSodiumRenderer)();
    if (data.length <= sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES) {
        throw new Error(`data is too short. should be at least ${sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES} but is ${data.length}`);
    }
    const blindedKeyPair = exports.SogsBlinding.getBlindingValues((0, libsodium_wrappers_sumo_1.from_hex)(serverPubkey), userEd25519KeyPair, sodium);
    if (!blindedKeyPair) {
        throw new Error('Decryption failed');
    }
    const otherKeyBytes = (0, libsodium_wrappers_sumo_1.from_hex)(types_1.PubKey.removePrefixIfNeeded(otherBlindedPublicKey));
    const kA = isOutgoing ? blindedKeyPair.publicKey : otherKeyBytes;
    const decKey = (0, SodiumUtils_1.sharedBlindedEncryptionKey)({
        secretKey: userEd25519KeyPair.privKeyBytes,
        otherBlindedPublicKey: otherKeyBytes,
        fromBlindedPublicKey: kA,
        toBlindedPublicKey: isOutgoing ? otherKeyBytes : blindedKeyPair.publicKey,
        sodium,
    });
    if (!decKey) {
        throw new Error('Decryption failed');
    }
    const version = data[0];
    const ciphertext = data.slice(1, data.length - sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
    const nonce = data.slice(data.length - sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
    if (version !== 0) {
        throw new Error('Decryption failed');
    }
    const innerBytes = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(null, ciphertext, null, nonce, decKey);
    if (!innerBytes) {
        throw new Error('Decryption failed');
    }
    const numBytesPubkey = types_1.PubKey.PUBKEY_LEN_NO_PREFIX / 2;
    if (innerBytes.length <= numBytesPubkey) {
        throw new Error('Decryption failed');
    }
    const plainText = innerBytes.slice(0, innerBytes.length - numBytesPubkey);
    const senderEdpk = innerBytes.slice(innerBytes.length - numBytesPubkey);
    const blindingFactor = (0, SodiumUtils_1.generateBlindingFactor)(serverPubkey, sodium);
    const sharedSecret = (0, SodiumUtils_1.combineKeys)(blindingFactor, senderEdpk, sodium);
    if (!(0, lodash_1.isEqual)(kA, sharedSecret)) {
        throw new Error('Invalid Signature');
    }
    const senderSessionIdBytes = (0, SodiumUtils_1.toX25519)(senderEdpk, sodium);
    return { plainText, senderUnblinded: `${types_1.KeyPrefixType.standard}${(0, libsodium_wrappers_sumo_1.to_hex)(senderSessionIdBytes)}` };
}
exports.SogsBlinding = {
    getSogsSignature,
    getOpenGroupHeaders,
    sha512Multipart,
    getBlindedPubKey,
    getBlindingValues,
    encryptBlindedMessage,
    decryptWithSessionBlindingProtocol,
};
