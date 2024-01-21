"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Storage = exports.saveRecentReations = exports.getRecentReactions = exports.saveRecoveryPhrase = exports.getCurrentRecoveryPhrase = exports.setLastProfileUpdateTimestamp = exports.getLastProfileUpdateTimestamp = exports.setSignWithRecoveryPhrase = exports.isSignWithRecoveryPhrase = exports.setSignInByLinking = exports.isSignInByLinking = exports.getOurPubKeyStrFromStorage = exports.setLocalPubKey = void 0;
const lodash_1 = require("lodash");
const data_1 = require("../data/data");
const constants_1 = require("../session/constants");
const releaseFeature_1 = require("./releaseFeature");
const sessionjs_logger_1 = require("../sessionjs-logger");
let ready = false;
let items;
let callbacks = [];
reset();
async function put(key, value) {
    if (value === undefined) {
        throw new Error('Tried to store undefined');
    }
    if (!ready) {
        sessionjs_logger_1.console.warn('Called storage.put before storage is ready. key:', key);
    }
    const data = { id: key, value };
    items[key] = data;
    await data_1.Data.createOrUpdateItem(data);
    if ((0, lodash_1.isBoolean)(value)) {
        sessionjs_logger_1.console.log('updateSettingsBoolValue', key, value);
    }
}
function get(key, defaultValue) {
    if (!ready) {
        sessionjs_logger_1.console.warn('Called storage.get before storage is ready. key:', key);
    }
    const item = items[key];
    if (!item) {
        return defaultValue;
    }
    return item.value;
}
async function remove(key) {
    if (!ready) {
        sessionjs_logger_1.console.warn('Called storage.get before storage is ready. key:', key);
    }
    delete items[key];
    sessionjs_logger_1.console.log('deleteSettingsBoolValue', key);
    await data_1.Data.removeItemById(key);
}
function onready(callback) {
    if (ready) {
        callback();
    }
    else {
        callbacks.push(callback);
    }
}
function callListeners() {
    if (ready) {
        callbacks.forEach(callback => {
            callback();
        });
        callbacks = [];
    }
}
async function fetch() {
    reset();
    const array = await data_1.Data.getAllItems();
    for (let i = 0, max = array.length; i < max; i += 1) {
        const item = array[i];
        const { id } = item;
        items[id] = item;
    }
    ready = true;
    callListeners();
}
function reset() {
    ready = false;
    items = Object.create(null);
}
async function setLocalPubKey(pubkey) {
    await put('number_id', `${pubkey}.1`);
}
exports.setLocalPubKey = setLocalPubKey;
function getOurPubKeyStrFromStorage() {
    const numberId = get('number_id');
    if (numberId === undefined) {
        return undefined;
    }
    return numberId.split('.')[0];
}
exports.getOurPubKeyStrFromStorage = getOurPubKeyStrFromStorage;
function isSignInByLinking() {
    const isByLinking = get('is_sign_in_by_linking');
    if (isByLinking === undefined) {
        return false;
    }
    return isByLinking;
}
exports.isSignInByLinking = isSignInByLinking;
async function setSignInByLinking(isLinking) {
    await put('is_sign_in_by_linking', isLinking);
}
exports.setSignInByLinking = setSignInByLinking;
function isSignWithRecoveryPhrase() {
    const isRecoveryPhraseUsed = get('is_sign_in_recovery_phrase');
    if (isRecoveryPhraseUsed === undefined) {
        return false;
    }
    return isRecoveryPhraseUsed;
}
exports.isSignWithRecoveryPhrase = isSignWithRecoveryPhrase;
async function setSignWithRecoveryPhrase(isRecoveryPhraseUsed) {
    await put('is_sign_in_recovery_phrase', isRecoveryPhraseUsed);
}
exports.setSignWithRecoveryPhrase = setSignWithRecoveryPhrase;
function getLastProfileUpdateTimestamp() {
    return get('last_profile_update_timestamp');
}
exports.getLastProfileUpdateTimestamp = getLastProfileUpdateTimestamp;
async function setLastProfileUpdateTimestamp(lastUpdateTimestamp) {
    if (await releaseFeature_1.ReleasedFeatures.checkIsUserConfigFeatureReleased()) {
        return;
    }
    await put('last_profile_update_timestamp', lastUpdateTimestamp);
}
exports.setLastProfileUpdateTimestamp = setLastProfileUpdateTimestamp;
function getCurrentRecoveryPhrase() {
    return exports.Storage.get('mnemonic');
}
exports.getCurrentRecoveryPhrase = getCurrentRecoveryPhrase;
async function saveRecoveryPhrase(mnemonic) {
    return exports.Storage.put('mnemonic', mnemonic);
}
exports.saveRecoveryPhrase = saveRecoveryPhrase;
function getRecentReactions() {
    const reactions = exports.Storage.get('recent_reactions');
    if (reactions) {
        return reactions.split(' ');
    }
    return constants_1.DEFAULT_RECENT_REACTS;
}
exports.getRecentReactions = getRecentReactions;
async function saveRecentReations(reactions) {
    return exports.Storage.put('recent_reactions', reactions.join(' '));
}
exports.saveRecentReations = saveRecentReations;
exports.Storage = { fetch, put, get, remove, onready, reset };
