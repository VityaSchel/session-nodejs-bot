"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.callLibSessionWorker = exports.ConvoInfoVolatileWrapperActions = exports.UserGroupsWrapperActions = exports.ContactsWrapperActions = exports.UserConfigWrapperActions = exports.GenericWrapperActions = void 0;
const path_1 = require("path");
const getRootPath_1 = require("../../../node/getRootPath");
const worker_interface_1 = require("../../worker_interface");
let libsessionWorkerInterface;
const internalCallLibSessionWorker = async ([config, fnName, ...args]) => {
    if (!libsessionWorkerInterface) {
        const libsessionWorkerPath = (0, path_1.join)((0, getRootPath_1.getAppRootPath)(), 'ts', 'webworker', 'workers', 'node', 'libsession', 'libsession.worker.js');
        libsessionWorkerInterface = new worker_interface_1.WorkerInterface(libsessionWorkerPath, 1 * 60 * 1000);
    }
    return libsessionWorkerInterface?.callWorker(config, fnName, ...args);
};
exports.GenericWrapperActions = {
    init: async (wrapperId, ed25519Key, dump) => (0, exports.callLibSessionWorker)([wrapperId, 'init', ed25519Key, dump]),
    confirmPushed: async (wrapperId, seqno, hash) => (0, exports.callLibSessionWorker)([wrapperId, 'confirmPushed', seqno, hash]),
    dump: async (wrapperId) => (0, exports.callLibSessionWorker)([wrapperId, 'dump']),
    merge: async (wrapperId, toMerge) => (0, exports.callLibSessionWorker)([wrapperId, 'merge', toMerge]),
    needsDump: async (wrapperId) => (0, exports.callLibSessionWorker)([wrapperId, 'needsDump']),
    needsPush: async (wrapperId) => (0, exports.callLibSessionWorker)([wrapperId, 'needsPush']),
    push: async (wrapperId) => (0, exports.callLibSessionWorker)([wrapperId, 'push']),
    storageNamespace: async (wrapperId) => (0, exports.callLibSessionWorker)([wrapperId, 'storageNamespace']),
    currentHashes: async (wrapperId) => (0, exports.callLibSessionWorker)([wrapperId, 'currentHashes']),
};
exports.UserConfigWrapperActions = {
    init: async (ed25519Key, dump) => exports.GenericWrapperActions.init('UserConfig', ed25519Key, dump),
    confirmPushed: async (seqno, hash) => exports.GenericWrapperActions.confirmPushed('UserConfig', seqno, hash),
    dump: async () => exports.GenericWrapperActions.dump('UserConfig'),
    merge: async (toMerge) => exports.GenericWrapperActions.merge('UserConfig', toMerge),
    needsDump: async () => exports.GenericWrapperActions.needsDump('UserConfig'),
    needsPush: async () => exports.GenericWrapperActions.needsPush('UserConfig'),
    push: async () => exports.GenericWrapperActions.push('UserConfig'),
    storageNamespace: async () => exports.GenericWrapperActions.storageNamespace('UserConfig'),
    currentHashes: async () => exports.GenericWrapperActions.currentHashes('UserConfig'),
    getUserInfo: async () => (0, exports.callLibSessionWorker)(['UserConfig', 'getUserInfo']),
    setUserInfo: async (name, priority, profilePic) => (0, exports.callLibSessionWorker)([
        'UserConfig',
        'setUserInfo',
        name,
        priority,
        profilePic,
    ]),
    getEnableBlindedMsgRequest: async () => (0, exports.callLibSessionWorker)(['UserConfig', 'getEnableBlindedMsgRequest']),
    setEnableBlindedMsgRequest: async (blindedMsgRequests) => (0, exports.callLibSessionWorker)([
        'UserConfig',
        'setEnableBlindedMsgRequest',
        blindedMsgRequests,
    ]),
};
exports.ContactsWrapperActions = {
    init: async (ed25519Key, dump) => exports.GenericWrapperActions.init('ContactsConfig', ed25519Key, dump),
    confirmPushed: async (seqno, hash) => exports.GenericWrapperActions.confirmPushed('ContactsConfig', seqno, hash),
    dump: async () => exports.GenericWrapperActions.dump('ContactsConfig'),
    merge: async (toMerge) => exports.GenericWrapperActions.merge('ContactsConfig', toMerge),
    needsDump: async () => exports.GenericWrapperActions.needsDump('ContactsConfig'),
    needsPush: async () => exports.GenericWrapperActions.needsPush('ContactsConfig'),
    push: async () => exports.GenericWrapperActions.push('ContactsConfig'),
    storageNamespace: async () => exports.GenericWrapperActions.storageNamespace('ContactsConfig'),
    currentHashes: async () => exports.GenericWrapperActions.currentHashes('ContactsConfig'),
    get: async (pubkeyHex) => (0, exports.callLibSessionWorker)(['ContactsConfig', 'get', pubkeyHex]),
    getAll: async () => (0, exports.callLibSessionWorker)(['ContactsConfig', 'getAll']),
    erase: async (pubkeyHex) => (0, exports.callLibSessionWorker)(['ContactsConfig', 'erase', pubkeyHex]),
    set: async (contact) => (0, exports.callLibSessionWorker)(['ContactsConfig', 'set', contact]),
};
exports.UserGroupsWrapperActions = {
    init: async (ed25519Key, dump) => exports.GenericWrapperActions.init('UserGroupsConfig', ed25519Key, dump),
    confirmPushed: async (seqno, hash) => exports.GenericWrapperActions.confirmPushed('UserGroupsConfig', seqno, hash),
    dump: async () => exports.GenericWrapperActions.dump('UserGroupsConfig'),
    merge: async (toMerge) => exports.GenericWrapperActions.merge('UserGroupsConfig', toMerge),
    needsDump: async () => exports.GenericWrapperActions.needsDump('UserGroupsConfig'),
    needsPush: async () => exports.GenericWrapperActions.needsPush('UserGroupsConfig'),
    push: async () => exports.GenericWrapperActions.push('UserGroupsConfig'),
    storageNamespace: async () => exports.GenericWrapperActions.storageNamespace('UserGroupsConfig'),
    currentHashes: async () => exports.GenericWrapperActions.currentHashes('UserGroupsConfig'),
    getCommunityByFullUrl: async (fullUrlWithOrWithoutPubkey) => (0, exports.callLibSessionWorker)([
        'UserGroupsConfig',
        'getCommunityByFullUrl',
        fullUrlWithOrWithoutPubkey,
    ]),
    setCommunityByFullUrl: async (fullUrl, priority) => (0, exports.callLibSessionWorker)([
        'UserGroupsConfig',
        'setCommunityByFullUrl',
        fullUrl,
        priority,
    ]),
    getAllCommunities: async () => (0, exports.callLibSessionWorker)(['UserGroupsConfig', 'getAllCommunities']),
    eraseCommunityByFullUrl: async (fullUrlWithoutPubkey) => (0, exports.callLibSessionWorker)([
        'UserGroupsConfig',
        'eraseCommunityByFullUrl',
        fullUrlWithoutPubkey,
    ]),
    buildFullUrlFromDetails: async (baseUrl, roomId, pubkeyHex) => (0, exports.callLibSessionWorker)([
        'UserGroupsConfig',
        'buildFullUrlFromDetails',
        baseUrl,
        roomId,
        pubkeyHex,
    ]),
    getLegacyGroup: async (pubkeyHex) => (0, exports.callLibSessionWorker)(['UserGroupsConfig', 'getLegacyGroup', pubkeyHex]),
    getAllLegacyGroups: async () => (0, exports.callLibSessionWorker)(['UserGroupsConfig', 'getAllLegacyGroups']),
    setLegacyGroup: async (info) => (0, exports.callLibSessionWorker)(['UserGroupsConfig', 'setLegacyGroup', info]),
    eraseLegacyGroup: async (pubkeyHex) => (0, exports.callLibSessionWorker)(['UserGroupsConfig', 'eraseLegacyGroup', pubkeyHex]),
};
exports.ConvoInfoVolatileWrapperActions = {
    init: async (ed25519Key, dump) => exports.GenericWrapperActions.init('ConvoInfoVolatileConfig', ed25519Key, dump),
    confirmPushed: async (seqno, hash) => exports.GenericWrapperActions.confirmPushed('ConvoInfoVolatileConfig', seqno, hash),
    dump: async () => exports.GenericWrapperActions.dump('ConvoInfoVolatileConfig'),
    merge: async (toMerge) => exports.GenericWrapperActions.merge('ConvoInfoVolatileConfig', toMerge),
    needsDump: async () => exports.GenericWrapperActions.needsDump('ConvoInfoVolatileConfig'),
    needsPush: async () => exports.GenericWrapperActions.needsPush('ConvoInfoVolatileConfig'),
    push: async () => exports.GenericWrapperActions.push('ConvoInfoVolatileConfig'),
    storageNamespace: async () => exports.GenericWrapperActions.storageNamespace('ConvoInfoVolatileConfig'),
    currentHashes: async () => exports.GenericWrapperActions.currentHashes('ConvoInfoVolatileConfig'),
    get1o1: async (pubkeyHex) => (0, exports.callLibSessionWorker)(['ConvoInfoVolatileConfig', 'get1o1', pubkeyHex]),
    getAll1o1: async () => (0, exports.callLibSessionWorker)(['ConvoInfoVolatileConfig', 'getAll1o1']),
    set1o1: async (pubkeyHex, lastRead, unread) => (0, exports.callLibSessionWorker)([
        'ConvoInfoVolatileConfig',
        'set1o1',
        pubkeyHex,
        lastRead,
        unread,
    ]),
    erase1o1: async (pubkeyHex) => (0, exports.callLibSessionWorker)(['ConvoInfoVolatileConfig', 'erase1o1', pubkeyHex]),
    getLegacyGroup: async (pubkeyHex) => (0, exports.callLibSessionWorker)(['ConvoInfoVolatileConfig', 'getLegacyGroup', pubkeyHex]),
    getAllLegacyGroups: async () => (0, exports.callLibSessionWorker)(['ConvoInfoVolatileConfig', 'getAllLegacyGroups']),
    setLegacyGroup: async (pubkeyHex, lastRead, unread) => (0, exports.callLibSessionWorker)([
        'ConvoInfoVolatileConfig',
        'setLegacyGroup',
        pubkeyHex,
        lastRead,
        unread,
    ]),
    eraseLegacyGroup: async (pubkeyHex) => (0, exports.callLibSessionWorker)(['ConvoInfoVolatileConfig', 'eraseLegacyGroup', pubkeyHex]),
    getCommunity: async (communityFullUrl) => (0, exports.callLibSessionWorker)(['ConvoInfoVolatileConfig', 'getCommunity', communityFullUrl]),
    getAllCommunities: async () => (0, exports.callLibSessionWorker)(['ConvoInfoVolatileConfig', 'getAllCommunities']),
    setCommunityByFullUrl: async (fullUrlWithPubkey, lastRead, unread) => (0, exports.callLibSessionWorker)([
        'ConvoInfoVolatileConfig',
        'setCommunityByFullUrl',
        fullUrlWithPubkey,
        lastRead,
        unread,
    ]),
    eraseCommunityByFullUrl: async (fullUrlWithOrWithoutPubkey) => (0, exports.callLibSessionWorker)([
        'ConvoInfoVolatileConfig',
        'eraseCommunityByFullUrl',
        fullUrlWithOrWithoutPubkey,
    ]),
};
const callLibSessionWorker = async (callToMake) => {
    return internalCallLibSessionWorker(callToMake);
};
exports.callLibSessionWorker = callLibSessionWorker;
