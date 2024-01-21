"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateMnemonic = exports.registerSingleDevice = exports.signInByLinkingDevice = exports.signInWithRecovery = exports.sessionGenerateKeyPair = void 0;
const conversations_1 = require("../session/conversations");
const crypto_1 = require("../session/crypto");
const String_1 = require("../session/utils/String");
const User_1 = require("../session/utils/User");
const mnemonic_1 = require("../session/crypto/mnemonic");
const settings_key_1 = require("../data/settings-key");
const storage_1 = require("./storage");
const registration_1 = require("./registration");
const conversationAttributes_1 = require("../models/conversationAttributes");
const libsession_utils_1 = require("../session/utils/libsession/libsession_utils");
const sessionjs_logger_1 = require("../sessionjs-logger");
async function sessionGenerateKeyPair(seed) {
    const sodium = await (0, crypto_1.getSodiumRenderer)();
    const ed25519KeyPair = sodium.crypto_sign_seed_keypair(new Uint8Array(seed));
    const x25519PublicKey = sodium.crypto_sign_ed25519_pk_to_curve25519(ed25519KeyPair.publicKey);
    const origPub = new Uint8Array(x25519PublicKey);
    const prependedX25519PublicKey = new Uint8Array(33);
    prependedX25519PublicKey.set(origPub, 1);
    prependedX25519PublicKey[0] = 5;
    const x25519SecretKey = sodium.crypto_sign_ed25519_sk_to_curve25519(ed25519KeyPair.privateKey);
    const x25519KeyPair = {
        pubKey: prependedX25519PublicKey.buffer,
        privKey: x25519SecretKey.buffer,
        ed25519KeyPair,
    };
    return x25519KeyPair;
}
exports.sessionGenerateKeyPair = sessionGenerateKeyPair;
const generateKeypair = async (mnemonic, mnemonicLanguage) => {
    let seedHex = (0, mnemonic_1.mnDecode)(mnemonic, mnemonicLanguage);
    const privKeyHexLength = 32 * 2;
    if (seedHex.length !== privKeyHexLength) {
        seedHex = seedHex.concat('0'.repeat(32));
        seedHex = seedHex.substring(0, privKeyHexLength);
    }
    const seed = (0, String_1.fromHex)(seedHex);
    return sessionGenerateKeyPair(seed);
};
async function signInWithRecovery(mnemonic, mnemonicLanguage, profileName) {
    return registerSingleDevice(mnemonic, mnemonicLanguage, profileName);
}
exports.signInWithRecovery = signInWithRecovery;
async function signInByLinkingDevice(mnemonic, mnemonicLanguage) {
    if (!mnemonic) {
        throw new Error('Session always needs a mnemonic. Either generated or given by the user');
    }
    if (!mnemonicLanguage) {
        throw new Error('We always needs a mnemonicLanguage');
    }
    const identityKeyPair = await generateKeypair(mnemonic, mnemonicLanguage);
    await (0, storage_1.setSignInByLinking)(true);
    await createAccount(identityKeyPair);
    await (0, storage_1.saveRecoveryPhrase)(mnemonic);
    const pubKeyString = (0, String_1.toHex)(identityKeyPair.pubKey);
    await registrationDone(pubKeyString, '');
    return pubKeyString;
}
exports.signInByLinkingDevice = signInByLinkingDevice;
async function registerSingleDevice(generatedMnemonic, mnemonicLanguage, profileName) {
    if (!generatedMnemonic) {
        throw new Error('Session always needs a mnemonic. Either generated or given by the user');
    }
    if (!profileName) {
        throw new Error('We always needs a profileName');
    }
    if (!mnemonicLanguage) {
        throw new Error('We always needs a mnemonicLanguage');
    }
    const identityKeyPair = await generateKeypair(generatedMnemonic, mnemonicLanguage);
    await createAccount(identityKeyPair);
    await (0, storage_1.saveRecoveryPhrase)(generatedMnemonic);
    await (0, storage_1.setLastProfileUpdateTimestamp)(Date.now());
    const pubKeyString = (0, String_1.toHex)(identityKeyPair.pubKey);
    await registrationDone(pubKeyString, profileName);
}
exports.registerSingleDevice = registerSingleDevice;
async function generateMnemonic() {
    const seedSize = 16;
    const seed = (await (0, crypto_1.getSodiumRenderer)()).randombytes_buf(seedSize);
    const hex = (0, String_1.toHex)(seed);
    return (0, mnemonic_1.mnEncode)(hex);
}
exports.generateMnemonic = generateMnemonic;
async function createAccount(identityKeyPair) {
    const sodium = await (0, crypto_1.getSodiumRenderer)();
    let password = (0, String_1.fromArrayBufferToBase64)(sodium.randombytes_buf(16));
    password = password.substring(0, password.length - 2);
    await Promise.all([
        storage_1.Storage.remove('identityKey'),
        storage_1.Storage.remove('signaling_key'),
        storage_1.Storage.remove('password'),
        storage_1.Storage.remove('registrationId'),
        storage_1.Storage.remove('number_id'),
        storage_1.Storage.remove('device_name'),
        storage_1.Storage.remove('userAgent'),
        storage_1.Storage.remove(settings_key_1.SettingsKey.settingsReadReceipt),
        storage_1.Storage.remove(settings_key_1.SettingsKey.settingsTypingIndicator),
        storage_1.Storage.remove('regionCode'),
        storage_1.Storage.remove('local_attachment_encrypted_key'),
    ]);
    const pubKeyString = (0, String_1.toHex)(identityKeyPair.pubKey);
    await storage_1.Storage.put('identityKey', identityKeyPair);
    await storage_1.Storage.put('password', password);
    await storage_1.Storage.put(settings_key_1.SettingsKey.settingsReadReceipt, false);
    await storage_1.Storage.put(settings_key_1.SettingsKey.settingsTypingIndicator, false);
    await storage_1.Storage.put(settings_key_1.SettingsKey.settingsOpengroupPruning, true);
    await (0, storage_1.setLocalPubKey)(pubKeyString);
}
async function registrationDone(ourPubkey, displayName) {
    sessionjs_logger_1.console.info(`registration done with user provided displayName "${displayName}"`);
    await storage_1.Storage.put('primaryDevicePubKey', ourPubkey);
    await registration_1.Registration.markDone();
    try {
        await libsession_utils_1.LibSessionUtil.initializeLibSessionUtilWrappers();
    }
    catch (e) {
        sessionjs_logger_1.console.warn('LibSessionUtil.initializeLibSessionUtilWrappers failed with', e.message);
    }
    const conversation = await (0, conversations_1.getConversationController)().getOrCreateAndWait(ourPubkey, conversationAttributes_1.ConversationTypeEnum.PRIVATE);
    conversation.setSessionDisplayNameNoCommit(displayName);
    await conversation.setIsApproved(true, false);
    await conversation.setDidApproveMe(true, false);
    await conversation.setHidden(true);
    await conversation.commit();
    const user = {
        ourNumber: (0, User_1.getOurPubKeyStrFromCache)(),
        ourPrimary: ourPubkey,
    };
    sessionjs_logger_1.console.log('[SBOT/redux] userActions');
    sessionjs_logger_1.console.info('dispatching registration event');
}
