"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findCachedBlindedMatchOrLookupOnAllServers = exports.getCachedNakedKeyFromBlindedNoServerPubkey = exports.findCachedOurBlindedPubkeyOrLookItUp = exports.findCachedBlindedIdFromUnblinded = exports.findCachedBlindedMatchOrLookItUp = exports.getUsBlindedInThatServer = exports.isUsAnySogsFromCache = exports.tryMatchBlindWithStandardKey = exports.addCachedBlindedKey = exports.getCachedNakedKeyFromBlinded = exports.isNonBlindedKey = exports.writeKnownBlindedKeys = exports.loadKnownBlindedKeys = exports.TEST_getCachedBlindedKeys = exports.TEST_resetCachedBlindedKeys = void 0;
const libsodium_wrappers_sumo_1 = require("libsodium-wrappers-sumo");
const curve25519_js_1 = require("curve25519-js");
const lodash_1 = require("lodash");
const conversations_1 = require("../../../conversations");
const types_1 = require("../../../types");
const data_1 = require("../../../../data/data");
const SodiumUtils_1 = require("../../../utils/SodiumUtils");
const opengroups_1 = require("../../../../data/opengroups");
const utils_1 = require("../../../utils");
const sogsBlinding_1 = require("./sogsBlinding");
const String_1 = require("../../../utils/String");
const settings_key_1 = require("../../../../data/settings-key");
const sqlSharedTypes_1 = require("../../../../types/sqlSharedTypes");
const storage_1 = require("../../../../util/storage");
const sessionjs_logger_1 = require("../../../../sessionjs-logger");
let cachedKnownMapping = null;
function TEST_resetCachedBlindedKeys() {
    cachedKnownMapping = null;
}
exports.TEST_resetCachedBlindedKeys = TEST_resetCachedBlindedKeys;
function TEST_getCachedBlindedKeys() {
    return (0, lodash_1.cloneDeep)(cachedKnownMapping);
}
exports.TEST_getCachedBlindedKeys = TEST_getCachedBlindedKeys;
async function loadKnownBlindedKeys() {
    if (cachedKnownMapping !== null) {
        throw new Error('loadKnownBlindedKeys must only be called once');
    }
    const fromDb = await data_1.Data.getItemById(settings_key_1.KNOWN_BLINDED_KEYS_ITEM);
    if (fromDb && fromDb.value && !(0, lodash_1.isEmpty)(fromDb.value)) {
        try {
            const read = JSON.parse(fromDb.value);
            cachedKnownMapping = cachedKnownMapping || [];
            read.forEach((elem) => {
                cachedKnownMapping?.push(elem);
            });
        }
        catch (e) {
            sessionjs_logger_1.console.error(e.message);
            cachedKnownMapping = [];
        }
    }
    else {
        cachedKnownMapping = [];
    }
}
exports.loadKnownBlindedKeys = loadKnownBlindedKeys;
async function writeKnownBlindedKeys() {
    if (cachedKnownMapping && cachedKnownMapping.length) {
        await storage_1.Storage.put(settings_key_1.KNOWN_BLINDED_KEYS_ITEM, JSON.stringify(cachedKnownMapping));
    }
}
exports.writeKnownBlindedKeys = writeKnownBlindedKeys;
function assertLoaded() {
    if (cachedKnownMapping === null) {
        throw new Error('loadKnownBlindedKeys must be called on app start');
    }
    return cachedKnownMapping;
}
function isNonBlindedKey(blindedId) {
    if (blindedId.startsWith(types_1.KeyPrefixType.unblinded) ||
        blindedId.startsWith(types_1.KeyPrefixType.standard)) {
        return true;
    }
    return false;
}
exports.isNonBlindedKey = isNonBlindedKey;
function getCachedNakedKeyFromBlinded(blindedId, serverPublicKey) {
    if (isNonBlindedKey(blindedId)) {
        return blindedId;
    }
    const found = assertLoaded().find(m => m.serverPublicKey === serverPublicKey && m.blindedId === blindedId);
    return found?.realSessionId || undefined;
}
exports.getCachedNakedKeyFromBlinded = getCachedNakedKeyFromBlinded;
async function addCachedBlindedKey({ blindedId, serverPublicKey, realSessionId, }) {
    if (isNonBlindedKey(blindedId)) {
        throw new Error('blindedId is not a blinded key');
    }
    if (!isNonBlindedKey(realSessionId)) {
        throw new Error('realSessionId must not be blinded');
    }
    const assertLoadedCache = assertLoaded();
    const foundIndex = assertLoadedCache.findIndex(m => m.blindedId === blindedId && serverPublicKey === m.serverPublicKey);
    if (foundIndex >= 0) {
        if (assertLoadedCache[foundIndex].realSessionId !== realSessionId) {
            sessionjs_logger_1.console.warn(`overriding cached blinded mapping for ${assertLoadedCache[foundIndex].realSessionId} with ${realSessionId} on ${serverPublicKey}`);
            assertLoadedCache[foundIndex].realSessionId = realSessionId;
            await writeKnownBlindedKeys();
        }
        return;
    }
    assertLoadedCache.push({ blindedId, serverPublicKey, realSessionId });
    await writeKnownBlindedKeys();
}
exports.addCachedBlindedKey = addCachedBlindedKey;
function tryMatchBlindWithStandardKey(standardSessionId, blindedSessionId, serverPubKey, sodium) {
    if (!standardSessionId.startsWith(types_1.KeyPrefixType.standard)) {
        throw new Error('standardKey must be a standard key (starting with 05)');
    }
    if (!types_1.PubKey.isBlinded(blindedSessionId)) {
        throw new Error('blindedKey must be a blinded key (starting with 15 or 25)');
    }
    try {
        const sessionIdNoPrefix = types_1.PubKey.removePrefixIfNeeded(types_1.PubKey.cast(standardSessionId).key);
        const blindedIdNoPrefix = types_1.PubKey.removePrefixIfNeeded(types_1.PubKey.cast(blindedSessionId).key);
        const kBytes = (0, SodiumUtils_1.generateBlindingFactor)(serverPubKey, sodium);
        const inbin = (0, libsodium_wrappers_sumo_1.from_hex)(sessionIdNoPrefix);
        const xEd25519Key = (0, curve25519_js_1.crypto_sign_curve25519_pk_to_ed25519)(inbin);
        const pk1 = (0, SodiumUtils_1.combineKeys)(kBytes, xEd25519Key, sodium);
        const pk2 = (0, lodash_1.cloneDeep)(pk1);
        pk2[31] = pk1[31] ^ 0b1000_0000;
        const match = (0, lodash_1.isEqual)(blindedIdNoPrefix, (0, libsodium_wrappers_sumo_1.to_hex)(pk1)) || (0, lodash_1.isEqual)(blindedIdNoPrefix, (0, libsodium_wrappers_sumo_1.to_hex)(pk2));
        if (!match) {
            return false;
        }
        return true;
    }
    catch (e) {
        sessionjs_logger_1.console.warn('Failed to do crypto tryMatchBlindWithStandardKey with ', e.message);
        return false;
    }
}
exports.tryMatchBlindWithStandardKey = tryMatchBlindWithStandardKey;
function findNotCachedBlindingMatch(blindedId, serverPublicKey, sodium) {
    if (isNonBlindedKey(blindedId)) {
        throw new Error('findNotCachedBlindingMatch blindedId is supposed to be blinded');
    }
    const foundConvoMatchingBlindedPubkey = (0, conversations_1.getConversationController)()
        .getConversations()
        .filter(m => m.isPrivate() && m.isApproved() && !types_1.PubKey.isBlinded(m.id))
        .find(m => {
        return tryMatchBlindWithStandardKey(m.id, blindedId, serverPublicKey, sodium);
    });
    return foundConvoMatchingBlindedPubkey?.get('id') || undefined;
}
function isUsAnySogsFromCache(blindedOrNakedId) {
    const usUnblinded = utils_1.UserUtils.getOurPubKeyStrFromCache();
    if (!types_1.PubKey.isBlinded(blindedOrNakedId)) {
        return blindedOrNakedId === usUnblinded;
    }
    const found = assertLoaded().find(m => m.blindedId === blindedOrNakedId && m.realSessionId === usUnblinded);
    return Boolean(found);
}
exports.isUsAnySogsFromCache = isUsAnySogsFromCache;
function getUsBlindedInThatServer(convo) {
    if (!convo) {
        return undefined;
    }
    const convoId = (0, lodash_1.isString)(convo) ? convo : convo.id;
    if (!(0, conversations_1.getConversationController)()
        .get(convoId)
        ?.isOpenGroupV2()) {
        return undefined;
    }
    const room = opengroups_1.OpenGroupData.getV2OpenGroupRoom((0, lodash_1.isString)(convo) ? convo : convo.id);
    if (!room || !(0, sqlSharedTypes_1.roomHasBlindEnabled)(room) || !room.serverPublicKey) {
        return undefined;
    }
    const usNaked = utils_1.UserUtils.getOurPubKeyStrFromCache();
    const found = assertLoaded().find(m => m.serverPublicKey === room.serverPublicKey && m.realSessionId === usNaked);
    return found?.blindedId;
}
exports.getUsBlindedInThatServer = getUsBlindedInThatServer;
function findNotCachedBlindedConvoFromUnblindedKey(unblindedID, serverPublicKey, sodium) {
    if (types_1.PubKey.isBlinded(unblindedID)) {
        throw new Error('findNotCachedBlindedConvoFromUnblindedKey unblindedID is supposed to be unblinded!');
    }
    const foundConvosForThisServerPk = (0, conversations_1.getConversationController)()
        .getConversations()
        .filter(m => m.isPrivate() && types_1.PubKey.isBlinded(m.id) && m.isActive())
        .filter(m => {
        return tryMatchBlindWithStandardKey(unblindedID, m.id, serverPublicKey, sodium);
    }) || [];
    return foundConvosForThisServerPk;
}
async function findCachedBlindedMatchOrLookItUp(blindedId, serverPubKey, sodium) {
    if (!types_1.PubKey.isBlinded(blindedId)) {
        return blindedId;
    }
    const found = getCachedNakedKeyFromBlinded(blindedId, serverPubKey);
    if (found) {
        return found;
    }
    const realSessionIdFound = findNotCachedBlindingMatch(blindedId, serverPubKey, sodium);
    if (realSessionIdFound) {
        await addCachedBlindedKey({
            blindedId,
            realSessionId: realSessionIdFound,
            serverPublicKey: serverPubKey,
        });
        return realSessionIdFound;
    }
    return undefined;
}
exports.findCachedBlindedMatchOrLookItUp = findCachedBlindedMatchOrLookItUp;
function findCachedBlindedIdFromUnblinded(unblindedId, serverPubKey) {
    if (types_1.PubKey.isBlinded(unblindedId)) {
        throw new Error('findCachedBlindedIdFromUnblinded needs an unblindedID');
    }
    const found = assertLoaded().find(m => m.serverPublicKey === serverPubKey && m.realSessionId === unblindedId);
    return found?.blindedId || undefined;
}
exports.findCachedBlindedIdFromUnblinded = findCachedBlindedIdFromUnblinded;
async function findCachedOurBlindedPubkeyOrLookItUp(serverPubKey, sodium) {
    const ourNakedSessionID = utils_1.UserUtils.getOurPubKeyStrFromCache();
    if (types_1.PubKey.isBlinded(ourNakedSessionID)) {
        throw new Error('findCachedBlindedIdFromUnblindedOrLookItUp needs a unblindedID');
    }
    let found = findCachedBlindedIdFromUnblinded(ourNakedSessionID, serverPubKey);
    if (found) {
        return found;
    }
    const signingKeys = await utils_1.UserUtils.getUserED25519KeyPairBytes();
    if (!signingKeys) {
        throw new Error('addSingleOutgoingMessage: getUserED25519KeyPairBytes returned nothing');
    }
    const blindedPubkeyForThisSogs = sogsBlinding_1.SogsBlinding.getBlindedPubKey((0, String_1.fromHexToArray)(serverPubKey), signingKeys, sodium);
    found = findCachedBlindedIdFromUnblinded(ourNakedSessionID, serverPubKey);
    if (found) {
        return found;
    }
    await addCachedBlindedKey({
        blindedId: blindedPubkeyForThisSogs,
        serverPublicKey: serverPubKey,
        realSessionId: ourNakedSessionID,
    });
    return blindedPubkeyForThisSogs;
}
exports.findCachedOurBlindedPubkeyOrLookItUp = findCachedOurBlindedPubkeyOrLookItUp;
function getCachedNakedKeyFromBlindedNoServerPubkey(blindedId) {
    if (isNonBlindedKey(blindedId)) {
        return blindedId;
    }
    const found = assertLoaded().find(m => m.blindedId === blindedId);
    return found?.realSessionId || undefined;
}
exports.getCachedNakedKeyFromBlindedNoServerPubkey = getCachedNakedKeyFromBlindedNoServerPubkey;
function findCachedBlindedMatchOrLookupOnAllServers(unblindedId, sodium) {
    if (types_1.PubKey.isBlinded(unblindedId)) {
        throw new Error('findCachedBlindedMatchOrLookupOnAllServers needs an unblindedId');
    }
    const allServerPubkeys = opengroups_1.OpenGroupData.getAllOpengroupsServerPubkeys();
    let matchingServerPubkeyWithThatBlindedId = (0, lodash_1.flatten)(allServerPubkeys.map(serverPk => {
        return findNotCachedBlindedConvoFromUnblindedKey(unblindedId, serverPk, sodium);
    }));
    matchingServerPubkeyWithThatBlindedId =
        (0, lodash_1.uniqBy)(matchingServerPubkeyWithThatBlindedId, m => m.id) || [];
    return matchingServerPubkeyWithThatBlindedId;
}
exports.findCachedBlindedMatchOrLookupOnAllServers = findCachedBlindedMatchOrLookupOnAllServers;
