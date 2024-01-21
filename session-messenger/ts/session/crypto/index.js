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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateCurve25519KeyPairWithoutPrefix = exports.generateGroupV3Keypair = exports.generateClosedGroupPublicKey = exports.concatUInt8Array = exports.sha256 = exports.getSodiumRenderer = exports.DecryptedAttachmentsManager = exports.MessageEncrypter = void 0;
const crypto_1 = __importDefault(require("crypto"));
const libsodium_wrappers_sumo_1 = __importDefault(require("libsodium-wrappers-sumo"));
const MessageEncrypter = __importStar(require("./MessageEncrypter"));
exports.MessageEncrypter = MessageEncrypter;
const DecryptedAttachmentsManager = __importStar(require("./DecryptedAttachmentsManager"));
exports.DecryptedAttachmentsManager = DecryptedAttachmentsManager;
const String_1 = require("../utils/String");
const keypairs_1 = require("../../receiver/keypairs");
async function getSodiumRenderer() {
    await libsodium_wrappers_sumo_1.default.ready;
    return libsodium_wrappers_sumo_1.default;
}
exports.getSodiumRenderer = getSodiumRenderer;
const sha256 = (s) => {
    return crypto_1.default
        .createHash('sha256')
        .update(s)
        .digest('base64');
};
exports.sha256 = sha256;
const concatUInt8Array = (...args) => {
    const totalLength = args.reduce((acc, current) => acc + current.length, 0);
    const concatted = new Uint8Array(totalLength);
    let currentIndex = 0;
    args.forEach(arr => {
        concatted.set(arr, currentIndex);
        currentIndex += arr.length;
    });
    return concatted;
};
exports.concatUInt8Array = concatUInt8Array;
async function generateClosedGroupPublicKey() {
    const sodium = await getSodiumRenderer();
    const ed25519KeyPair = sodium.crypto_sign_keypair();
    const x25519PublicKey = sodium.crypto_sign_ed25519_pk_to_curve25519(ed25519KeyPair.publicKey);
    const origPub = new Uint8Array(x25519PublicKey);
    const prependedX25519PublicKey = new Uint8Array(33);
    prependedX25519PublicKey.set(origPub, 1);
    prependedX25519PublicKey[0] = 5;
    return (0, String_1.toHex)(prependedX25519PublicKey);
}
exports.generateClosedGroupPublicKey = generateClosedGroupPublicKey;
async function generateGroupV3Keypair() {
    const sodium = await getSodiumRenderer();
    const ed25519KeyPair = sodium.crypto_sign_keypair();
    const publicKey = new Uint8Array(ed25519KeyPair.publicKey);
    const preprendedPubkey = new Uint8Array(33);
    preprendedPubkey.set(publicKey, 1);
    preprendedPubkey[0] = 3;
    return { pubkey: (0, String_1.toHex)(preprendedPubkey), privateKey: (0, String_1.toHex)(ed25519KeyPair.privateKey) };
}
exports.generateGroupV3Keypair = generateGroupV3Keypair;
async function generateCurve25519KeyPairWithoutPrefix() {
    const sodium = await getSodiumRenderer();
    try {
        const ed25519KeyPair = sodium.crypto_sign_keypair();
        const x25519PublicKey = sodium.crypto_sign_ed25519_pk_to_curve25519(ed25519KeyPair.publicKey);
        const x25519SecretKey = sodium.crypto_sign_ed25519_sk_to_curve25519(ed25519KeyPair.privateKey);
        return new keypairs_1.ECKeyPair(x25519PublicKey, x25519SecretKey);
    }
    catch (err) {
        return null;
    }
}
exports.generateCurve25519KeyPairWithoutPrefix = generateCurve25519KeyPairWithoutPrefix;
