"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toX25519 = exports.generatePrivateKeyScalar = exports.sharedBlindedEncryptionKey = exports.combineKeys = exports.generateBlindingFactor = void 0;
const libsodium_wrappers_sumo_1 = require("libsodium-wrappers-sumo");
const crypto_1 = require("../crypto");
function generateBlindingFactor(serverPk, sodium) {
    const hexServerPk = (0, libsodium_wrappers_sumo_1.from_hex)(serverPk);
    const serverPkHash = sodium.crypto_generichash(64, hexServerPk);
    if (!serverPkHash.length) {
        throw new Error('generateBlindingFactor: crypto_generichash failed');
    }
    const k = sodium.crypto_core_ed25519_scalar_reduce(serverPkHash);
    return k;
}
exports.generateBlindingFactor = generateBlindingFactor;
function combineKeys(lhsKeyBytes, rhsKeyBytes, sodium) {
    return sodium.crypto_scalarmult_ed25519_noclamp(lhsKeyBytes, rhsKeyBytes);
}
exports.combineKeys = combineKeys;
function sharedBlindedEncryptionKey({ fromBlindedPublicKey, otherBlindedPublicKey, secretKey, sodium, toBlindedPublicKey, }) {
    const aBytes = generatePrivateKeyScalar(secretKey, sodium);
    const combinedKeyBytes = combineKeys(aBytes, otherBlindedPublicKey, sodium);
    return sodium.crypto_generichash(32, (0, crypto_1.concatUInt8Array)(combinedKeyBytes, fromBlindedPublicKey, toBlindedPublicKey));
}
exports.sharedBlindedEncryptionKey = sharedBlindedEncryptionKey;
function generatePrivateKeyScalar(secretKey, sodium) {
    return sodium.crypto_sign_ed25519_sk_to_curve25519(secretKey);
}
exports.generatePrivateKeyScalar = generatePrivateKeyScalar;
function toX25519(ed25519PublicKey, sodium) {
    return sodium.crypto_sign_ed25519_pk_to_curve25519(ed25519PublicKey);
}
exports.toX25519 = toX25519;
