"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOurProfile = exports.getUserED25519KeyPairBytes = exports.getUserED25519KeyPair = exports.getIdentityKeyPair = exports.getOurPubKeyFromCache = exports.getOurPubKeyStrFromCache = exports.isUsFromCache = void 0;
const lodash_1 = __importDefault(require("lodash"));
const _1 = require(".");
const data_1 = require("../../data/data");
const types_1 = require("../types");
const String_1 = require("./String");
const conversations_1 = require("../conversations");
const storage_1 = require("../../util/storage");
const sessionjs_logger_1 = require("../../sessionjs-logger");
function isUsFromCache(pubKey) {
    if (!pubKey) {
        throw new Error('pubKey is not set');
    }
    const ourNumber = _1.UserUtils.getOurPubKeyStrFromCache();
    const pubKeyStr = pubKey instanceof types_1.PubKey ? pubKey.key : pubKey;
    return pubKeyStr === ourNumber;
}
exports.isUsFromCache = isUsFromCache;
function getOurPubKeyStrFromCache() {
    const ourNumber = (0, storage_1.getOurPubKeyStrFromStorage)();
    if (!ourNumber) {
        throw new Error('ourNumber is not set');
    }
    return ourNumber;
}
exports.getOurPubKeyStrFromCache = getOurPubKeyStrFromCache;
function getOurPubKeyFromCache() {
    const ourNumber = _1.UserUtils.getOurPubKeyStrFromCache();
    if (!ourNumber) {
        throw new Error('ourNumber is not set');
    }
    return types_1.PubKey.cast(ourNumber);
}
exports.getOurPubKeyFromCache = getOurPubKeyFromCache;
let cachedIdentityKeyPair;
async function getIdentityKeyPair() {
    if (cachedIdentityKeyPair) {
        return cachedIdentityKeyPair;
    }
    const item = await data_1.Data.getItemById('identityKey');
    cachedIdentityKeyPair = item?.value;
    return cachedIdentityKeyPair;
}
exports.getIdentityKeyPair = getIdentityKeyPair;
async function getUserED25519KeyPair() {
    const ed25519KeyPairBytes = await (0, exports.getUserED25519KeyPairBytes)();
    if (ed25519KeyPairBytes) {
        const { pubKeyBytes, privKeyBytes } = ed25519KeyPairBytes;
        return {
            pubKey: (0, String_1.toHex)(pubKeyBytes),
            privKey: (0, String_1.toHex)(privKeyBytes),
        };
    }
    return undefined;
}
exports.getUserED25519KeyPair = getUserED25519KeyPair;
const getUserED25519KeyPairBytes = async () => {
    const item = await _1.UserUtils.getIdentityKeyPair();
    const ed25519KeyPair = item?.ed25519KeyPair;
    if (ed25519KeyPair?.publicKey && ed25519KeyPair?.privateKey) {
        const pubKeyBytes = new Uint8Array(lodash_1.default.map(ed25519KeyPair.publicKey, a => a));
        const privKeyBytes = new Uint8Array(lodash_1.default.map(ed25519KeyPair.privateKey, a => a));
        return {
            pubKeyBytes,
            privKeyBytes,
        };
    }
    return undefined;
};
exports.getUserED25519KeyPairBytes = getUserED25519KeyPairBytes;
function getOurProfile() {
    try {
        const ourNumber = storage_1.Storage.get('primaryDevicePubKey');
        const ourConversation = (0, conversations_1.getConversationController)().get(ourNumber);
        const ourProfileKeyHex = ourConversation.get('profileKey');
        const profileKeyAsBytes = ourProfileKeyHex ? (0, String_1.fromHexToArray)(ourProfileKeyHex) : null;
        const avatarPointer = ourConversation.get('avatarPointer');
        const displayName = ourConversation.getRealSessionUsername() || 'Anonymous';
        return {
            displayName,
            avatarPointer,
            profileKey: profileKeyAsBytes?.length ? profileKeyAsBytes : null,
        };
    }
    catch (e) {
        sessionjs_logger_1.console.error(`Failed to get our profile: ${e}`);
        return undefined;
    }
}
exports.getOurProfile = getOurProfile;
