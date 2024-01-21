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
exports.handleNewClosedGroup = exports.sentAtMoreRecentThanWrapper = exports.handleClosedGroupControlMessage = exports.removeAllClosedGroupEncryptionKeyPairs = exports.addKeyPairToCacheAndDBIfNeeded = exports.getAllCachedECKeyPair = exports.distributingClosedGroupEncryptionKeyPairs = void 0;
const lodash_1 = __importStar(require("lodash"));
const data_1 = require("../data/data");
const protobuf_1 = require("../protobuf");
const session_1 = require("../session");
const conversations_1 = require("../session/conversations");
const ClosedGroup = __importStar(require("../session/group/closed-group"));
const types_1 = require("../session/types");
const String_1 = require("../session/utils/String");
const util_1 = require("../util");
const cache_1 = require("./cache");
const contentMessage_1 = require("./contentMessage");
const conversationAttributes_1 = require("../models/conversationAttributes");
const snode_api_1 = require("../session/apis/snode_api");
const namespaces_1 = require("../session/apis/snode_api/namespaces");
const ClosedGroupEncryptionPairReplyMessage_1 = require("../session/messages/outgoing/controlMessage/group/ClosedGroupEncryptionPairReplyMessage");
const utils_1 = require("../session/utils");
const Performance_1 = require("../session/utils/Performance");
const releaseFeature_1 = require("../util/releaseFeature");
const storage_1 = require("../util/storage");
const configMessage_1 = require("./configMessage");
const keypairs_1 = require("./keypairs");
const receiver_1 = require("./receiver");
const sessionjs_logger_1 = require("../sessionjs-logger");
exports.distributingClosedGroupEncryptionKeyPairs = new Map();
const cacheOfClosedGroupKeyPairs = new Map();
async function getAllCachedECKeyPair(groupPubKey) {
    let keyPairsFound = cacheOfClosedGroupKeyPairs.get(groupPubKey);
    if (!keyPairsFound || keyPairsFound.length === 0) {
        keyPairsFound = (await data_1.Data.getAllEncryptionKeyPairsForGroup(groupPubKey)) || [];
        cacheOfClosedGroupKeyPairs.set(groupPubKey, keyPairsFound);
    }
    return keyPairsFound.slice();
}
exports.getAllCachedECKeyPair = getAllCachedECKeyPair;
async function addKeyPairToCacheAndDBIfNeeded(groupPubKey, keyPair) {
    const existingKeyPairs = await getAllCachedECKeyPair(groupPubKey);
    const alreadySaved = existingKeyPairs.some(k => {
        return k.privateHex === keyPair.privateHex && k.publicHex === keyPair.publicHex;
    });
    if (alreadySaved) {
        return false;
    }
    await data_1.Data.addClosedGroupEncryptionKeyPair(groupPubKey, keyPair);
    if (!cacheOfClosedGroupKeyPairs.has(groupPubKey)) {
        cacheOfClosedGroupKeyPairs.set(groupPubKey, []);
    }
    cacheOfClosedGroupKeyPairs.get(groupPubKey)?.push(keyPair);
    return true;
}
exports.addKeyPairToCacheAndDBIfNeeded = addKeyPairToCacheAndDBIfNeeded;
async function removeAllClosedGroupEncryptionKeyPairs(groupPubKey) {
    cacheOfClosedGroupKeyPairs.set(groupPubKey, []);
    await data_1.Data.removeAllClosedGroupEncryptionKeyPairs(groupPubKey);
}
exports.removeAllClosedGroupEncryptionKeyPairs = removeAllClosedGroupEncryptionKeyPairs;
async function handleClosedGroupControlMessage(envelope, groupUpdate) {
    const { type } = groupUpdate;
    const { Type } = protobuf_1.SignalService.DataMessage.ClosedGroupControlMessage;
    sessionjs_logger_1.console.info(` handle closed group update from ${envelope.senderIdentity || envelope.source} about group ${envelope.source}`);
    if (types_1.PubKey.isClosedGroupV3(envelope.source)) {
        sessionjs_logger_1.console.warn('Message ignored; closed group v3 updates cannot come from SignalService.DataMessage.ClosedGroupControlMessage ');
        await (0, cache_1.removeFromCache)(envelope);
        return;
    }
    if (util_1.BlockedNumberController.isBlocked(types_1.PubKey.cast(envelope.source))) {
        sessionjs_logger_1.console.warn('Message ignored; destined for blocked group');
        await (0, cache_1.removeFromCache)(envelope);
        return;
    }
    if (type === Type.ENCRYPTION_KEY_PAIR) {
        const isComingFromGroupPubkey = envelope.type === protobuf_1.SignalService.Envelope.Type.CLOSED_GROUP_MESSAGE;
        await handleClosedGroupEncryptionKeyPair(envelope, groupUpdate, isComingFromGroupPubkey);
        return;
    }
    if (type === Type.NEW) {
        if (!(0, conversations_1.getConversationController)()
            .get(envelope.senderIdentity || envelope.source)
            ?.isApproved()) {
            sessionjs_logger_1.console.info('Received new closed group message from an unapproved sender -- dropping message.');
            return;
        }
        await handleNewClosedGroup(envelope, groupUpdate, false);
        return;
    }
    if (type === Type.NAME_CHANGE ||
        type === Type.MEMBERS_REMOVED ||
        type === Type.MEMBERS_ADDED ||
        type === Type.MEMBER_LEFT ||
        type === Type.ENCRYPTION_KEY_PAIR_REQUEST) {
        await performIfValid(envelope, groupUpdate);
        return;
    }
    sessionjs_logger_1.console.error('Unknown group update type: ', type);
    await (0, cache_1.removeFromCache)(envelope);
}
exports.handleClosedGroupControlMessage = handleClosedGroupControlMessage;
function sanityCheckNewGroup(groupUpdate) {
    const { name, publicKey, members, admins, encryptionKeyPair } = groupUpdate;
    if (!name?.length) {
        sessionjs_logger_1.console.warn('groupUpdate: name is empty');
        return false;
    }
    if (!name?.length) {
        sessionjs_logger_1.console.warn('groupUpdate: name is empty');
        return false;
    }
    if (!publicKey?.length) {
        sessionjs_logger_1.console.warn('groupUpdate: publicKey is empty');
        return false;
    }
    const hexGroupPublicKey = (0, String_1.toHex)(publicKey);
    if (!types_1.PubKey.from(hexGroupPublicKey)) {
        sessionjs_logger_1.console.warn('groupUpdate: publicKey is not recognized as a valid pubkey', hexGroupPublicKey);
        return false;
    }
    if (types_1.PubKey.isClosedGroupV3(hexGroupPublicKey)) {
        sessionjs_logger_1.console.warn('sanityCheckNewGroup: got a v3 new group as a ClosedGroupControlMessage. ');
        return false;
    }
    if (!members?.length) {
        sessionjs_logger_1.console.warn('groupUpdate: members is empty');
        return false;
    }
    if (members.some(m => m.length === 0)) {
        sessionjs_logger_1.console.warn('groupUpdate: one of the member pubkey is empty');
        return false;
    }
    if (!admins?.length) {
        sessionjs_logger_1.console.warn('groupUpdate: admins is empty');
        return false;
    }
    if (admins.some(a => a.length === 0)) {
        sessionjs_logger_1.console.warn('groupUpdate: one of the admins pubkey is empty');
        return false;
    }
    if (!encryptionKeyPair?.publicKey?.length) {
        sessionjs_logger_1.console.warn('groupUpdate: keypair publicKey is empty');
        return false;
    }
    if (!encryptionKeyPair?.privateKey?.length) {
        sessionjs_logger_1.console.warn('groupUpdate: keypair privateKey is empty');
        return false;
    }
    return true;
}
async function sentAtMoreRecentThanWrapper(envelopeSentAtMs, variant) {
    const userConfigReleased = await releaseFeature_1.ReleasedFeatures.checkIsUserConfigFeatureReleased();
    if (!userConfigReleased) {
        return 'unknown';
    }
    const settingsKey = (0, configMessage_1.getSettingsKeyFromLibsessionWrapper)(variant);
    if (!settingsKey) {
        return 'unknown';
    }
    const latestProcessedEnvelope = storage_1.Storage.get(settingsKey);
    if (!(0, lodash_1.isNumber)(latestProcessedEnvelope) || !latestProcessedEnvelope) {
        return 'envelope_more_recent';
    }
    const latestProcessedEnvelopeLess2Mins = latestProcessedEnvelope - 2 * 60 * 1000;
    return envelopeSentAtMs > latestProcessedEnvelopeLess2Mins
        ? 'envelope_more_recent'
        : 'wrapper_more_recent';
}
exports.sentAtMoreRecentThanWrapper = sentAtMoreRecentThanWrapper;
async function handleNewClosedGroup(envelope, groupUpdate, fromLegacyConfig) {
    if (groupUpdate.type !== protobuf_1.SignalService.DataMessage.ClosedGroupControlMessage.Type.NEW) {
        return;
    }
    if (!sanityCheckNewGroup(groupUpdate)) {
        sessionjs_logger_1.console.warn('Sanity check for newGroup failed, dropping the message...');
        await (0, cache_1.removeFromCache)(envelope);
        return;
    }
    const ourNumber = utils_1.UserUtils.getOurPubKeyFromCache();
    if (envelope.senderIdentity === ourNumber.key) {
        sessionjs_logger_1.console.warn('Dropping new closed group updatemessage from our other device.');
        await (0, cache_1.removeFromCache)(envelope);
        return;
    }
    const { name, publicKey, members: membersAsData, admins: adminsAsData, encryptionKeyPair, } = groupUpdate;
    const groupId = (0, String_1.toHex)(publicKey);
    const members = membersAsData.map(String_1.toHex);
    const admins = adminsAsData.map(String_1.toHex);
    const envelopeTimestamp = (0, lodash_1.toNumber)(envelope.timestamp);
    const sender = envelope.source;
    if (!fromLegacyConfig &&
        (await sentAtMoreRecentThanWrapper(envelopeTimestamp, 'UserGroupsConfig')) ===
            'wrapper_more_recent') {
        sessionjs_logger_1.console.info('dropping invite to legacy group because our wrapper is more recent');
        await (0, cache_1.removeFromCache)(envelope);
        return;
    }
    if (!members.includes(ourNumber.key)) {
        sessionjs_logger_1.console.info('Got a new group message but apparently we are not a member of it. Dropping it.');
        await (0, cache_1.removeFromCache)(envelope);
        return;
    }
    const groupConvo = (0, conversations_1.getConversationController)().get(groupId);
    const expireTimer = groupUpdate.expireTimer;
    if (groupConvo) {
        if (!groupConvo.get('isKickedFromGroup') && !groupConvo.get('left')) {
            const ecKeyPairAlreadyExistingConvo = new keypairs_1.ECKeyPair(encryptionKeyPair.publicKey, encryptionKeyPair.privateKey);
            const isKeyPairAlreadyHere = await addKeyPairToCacheAndDBIfNeeded(groupId, ecKeyPairAlreadyExistingConvo.toHexKeyPair());
            await groupConvo.updateExpireTimer(expireTimer, sender, Date.now());
            if (isKeyPairAlreadyHere) {
                sessionjs_logger_1.console.info('Dropping already saved keypair for group', groupId);
                await (0, cache_1.removeFromCache)(envelope);
                return;
            }
            sessionjs_logger_1.console.info(`Received the encryptionKeyPair for new group ${groupId}`);
            await (0, cache_1.removeFromCache)(envelope);
            sessionjs_logger_1.console.warn('Closed group message of type NEW: the conversation already exists, but we saved the new encryption keypair');
            return;
        }
        groupConvo.set({
            left: false,
            isKickedFromGroup: false,
            lastJoinedTimestamp: (0, lodash_1.toNumber)(envelope.timestamp),
            zombies: [],
        });
    }
    const convo = groupConvo ||
        (await (0, conversations_1.getConversationController)().getOrCreateAndWait(groupId, conversationAttributes_1.ConversationTypeEnum.GROUP));
    sessionjs_logger_1.console.info('Received a new ClosedGroup of id:', groupId);
    const groupDetails = {
        id: groupId,
        name,
        members,
        admins,
        activeAt: envelopeTimestamp,
    };
    await ClosedGroup.updateOrCreateClosedGroup(groupDetails);
    convo.set('lastJoinedTimestamp', envelopeTimestamp);
    await convo.updateExpireTimer(expireTimer, sender, envelopeTimestamp);
    convo.updateLastMessage();
    await convo.commit();
    const ecKeyPair = new keypairs_1.ECKeyPair(encryptionKeyPair.publicKey, encryptionKeyPair.privateKey);
    sessionjs_logger_1.console.info(`Received the encryptionKeyPair for new group ${groupId}`);
    await addKeyPairToCacheAndDBIfNeeded(groupId, ecKeyPair.toHexKeyPair());
    (0, snode_api_1.getSwarmPollingInstance)().addGroupId(types_1.PubKey.cast(groupId));
    await (0, cache_1.removeFromCache)(envelope);
    await (0, receiver_1.queueAllCachedFromSource)(groupId);
}
exports.handleNewClosedGroup = handleNewClosedGroup;
async function handleClosedGroupEncryptionKeyPair(envelope, groupUpdate, isComingFromGroupPubkey) {
    if (groupUpdate.type !==
        protobuf_1.SignalService.DataMessage.ClosedGroupControlMessage.Type.ENCRYPTION_KEY_PAIR) {
        return;
    }
    const ourNumber = utils_1.UserUtils.getOurPubKeyFromCache();
    const groupPublicKey = (0, String_1.toHex)(groupUpdate.publicKey) || envelope.source;
    const sender = isComingFromGroupPubkey ? envelope.senderIdentity : envelope.source;
    sessionjs_logger_1.console.info(`Got a group update for group ${groupPublicKey}, type: ENCRYPTION_KEY_PAIR`);
    const ourKeyPair = await utils_1.UserUtils.getIdentityKeyPair();
    if (!ourKeyPair) {
        sessionjs_logger_1.console.warn("Couldn't find user X25519 key pair.");
        await (0, cache_1.removeFromCache)(envelope);
        return;
    }
    const groupConvo = (0, conversations_1.getConversationController)().get(groupPublicKey);
    if (!groupConvo) {
        sessionjs_logger_1.console.warn(`Ignoring closed group encryption key pair for nonexistent group. ${groupPublicKey}`);
        await (0, cache_1.removeFromCache)(envelope);
        return;
    }
    if (!groupConvo.isClosedGroup()) {
        sessionjs_logger_1.console.warn(`Ignoring closed group encryption key pair for nonexistent medium group. ${groupPublicKey}`);
        await (0, cache_1.removeFromCache)(envelope);
        return;
    }
    if (!groupConvo.get('groupAdmins')?.includes(sender)) {
        sessionjs_logger_1.console.warn(`Ignoring closed group encryption key pair from non-admin. ${groupPublicKey}`);
        await (0, cache_1.removeFromCache)(envelope);
        return;
    }
    const ourWrapper = groupUpdate.wrappers.find(w => (0, String_1.toHex)(w.publicKey) === ourNumber.key);
    if (!ourWrapper) {
        sessionjs_logger_1.console.warn(`Couldn't find our wrapper in the encryption keypairs wrappers for group ${groupPublicKey}`);
        await (0, cache_1.removeFromCache)(envelope);
        return;
    }
    let plaintext;
    try {
        (0, Performance_1.perfStart)(`encryptionKeyPair-${envelope.id}`);
        const buffer = await (0, contentMessage_1.decryptWithSessionProtocol)(envelope, ourWrapper.encryptedKeyPair, keypairs_1.ECKeyPair.fromKeyPair(ourKeyPair));
        (0, Performance_1.perfEnd)(`encryptionKeyPair-${envelope.id}`, 'encryptionKeyPair');
        if (!buffer || buffer.byteLength === 0) {
            throw new Error();
        }
        plaintext = new Uint8Array(buffer);
    }
    catch (e) {
        sessionjs_logger_1.console.warn("Couldn't decrypt closed group encryption key pair.", e);
        await (0, cache_1.removeFromCache)(envelope);
        return;
    }
    let proto;
    try {
        proto = protobuf_1.SignalService.KeyPair.decode(plaintext);
        if (!proto || proto.privateKey.length === 0 || proto.publicKey.length === 0) {
            throw new Error();
        }
    }
    catch (e) {
        sessionjs_logger_1.console.warn("Couldn't parse closed group encryption key pair.");
        await (0, cache_1.removeFromCache)(envelope);
        return;
    }
    let keyPair;
    try {
        keyPair = new keypairs_1.ECKeyPair(proto.publicKey, proto.privateKey);
    }
    catch (e) {
        sessionjs_logger_1.console.warn("Couldn't parse closed group encryption key pair.");
        await (0, cache_1.removeFromCache)(envelope);
        return;
    }
    sessionjs_logger_1.console.info(`Received a new encryptionKeyPair for group ${groupPublicKey}`);
    const newKeyPairInHex = keyPair.toHexKeyPair();
    const isKeyPairAlreadyHere = await addKeyPairToCacheAndDBIfNeeded(groupPublicKey, newKeyPairInHex);
    if (isKeyPairAlreadyHere) {
        sessionjs_logger_1.console.info('Dropping already saved keypair for group', groupPublicKey);
        await (0, cache_1.removeFromCache)(envelope);
        return;
    }
    sessionjs_logger_1.console.info('Got a new encryption keypair for group', groupPublicKey);
    await (0, cache_1.removeFromCache)(envelope);
    await (0, receiver_1.queueAllCachedFromSource)(groupPublicKey);
}
async function performIfValid(envelope, groupUpdate) {
    const { Type } = protobuf_1.SignalService.DataMessage.ClosedGroupControlMessage;
    const groupPublicKey = envelope.source;
    const sender = envelope.senderIdentity;
    if (types_1.PubKey.isClosedGroupV3(groupPublicKey)) {
        sessionjs_logger_1.console.warn('Message ignored; closed group v3 updates cannot come from SignalService.DataMessage.ClosedGroupControlMessage ');
        await (0, cache_1.removeFromCache)(envelope);
        return;
    }
    const convo = (0, conversations_1.getConversationController)().get(groupPublicKey);
    if (!convo) {
        sessionjs_logger_1.console.warn('dropping message for nonexistent group');
        await (0, cache_1.removeFromCache)(envelope);
        return;
    }
    if (!convo) {
        sessionjs_logger_1.console.warn('Ignoring a closed group update message (INFO) for a non-existing group');
        await (0, cache_1.removeFromCache)(envelope);
        return;
    }
    let lastJoinedTimestamp = convo.get('lastJoinedTimestamp');
    if (!lastJoinedTimestamp) {
        const aYearAgo = Date.now() - 1000 * 60 * 24 * 365;
        convo.set({
            lastJoinedTimestamp: aYearAgo,
        });
        lastJoinedTimestamp = aYearAgo;
    }
    const envelopeTimestamp = (0, lodash_1.toNumber)(envelope.timestamp);
    if (envelopeTimestamp <= lastJoinedTimestamp) {
        sessionjs_logger_1.console.warn('Got a group update with an older timestamp than when we joined this group last time. Dropping it.');
        await (0, cache_1.removeFromCache)(envelope);
        return;
    }
    const oldMembers = convo.get('members') || [];
    if (!oldMembers.includes(sender)) {
        sessionjs_logger_1.console.error(`Error: closed group: ignoring closed group update message from non-member. ${sender} is not a current member.`);
        await (0, cache_1.removeFromCache)(envelope);
        return;
    }
    await (0, conversations_1.getConversationController)().getOrCreateAndWait(sender, conversationAttributes_1.ConversationTypeEnum.PRIVATE);
    const moreRecentOrNah = await sentAtMoreRecentThanWrapper(envelopeTimestamp, 'UserGroupsConfig');
    const shouldNotApplyGroupChange = moreRecentOrNah === 'wrapper_more_recent';
    if (groupUpdate.type === Type.NAME_CHANGE) {
        await handleClosedGroupNameChanged(envelope, groupUpdate, convo, shouldNotApplyGroupChange);
    }
    else if (groupUpdate.type === Type.MEMBERS_ADDED) {
        await handleClosedGroupMembersAdded(envelope, groupUpdate, convo, shouldNotApplyGroupChange);
    }
    else if (groupUpdate.type === Type.MEMBERS_REMOVED) {
        await handleClosedGroupMembersRemoved(envelope, groupUpdate, convo, shouldNotApplyGroupChange);
    }
    else if (groupUpdate.type === Type.MEMBER_LEFT) {
        await handleClosedGroupMemberLeft(envelope, convo, shouldNotApplyGroupChange);
    }
    else if (groupUpdate.type === Type.ENCRYPTION_KEY_PAIR_REQUEST) {
        await (0, cache_1.removeFromCache)(envelope);
    }
}
async function handleClosedGroupNameChanged(envelope, groupUpdate, convo, shouldOnlyAddUpdateMessage) {
    const newName = groupUpdate.name;
    sessionjs_logger_1.console.info(`Got a group update for group ${envelope.source}, type: NAME_CHANGED`);
    if (newName !== convo.get('displayNameInProfile')) {
        const groupDiff = {
            newName,
        };
        await ClosedGroup.addUpdateMessage(convo, groupDiff, envelope.senderIdentity, (0, lodash_1.toNumber)(envelope.timestamp));
        if (!shouldOnlyAddUpdateMessage) {
            convo.set({ displayNameInProfile: newName });
        }
        convo.updateLastMessage();
        await convo.commit();
    }
    await (0, cache_1.removeFromCache)(envelope);
}
async function handleClosedGroupMembersAdded(envelope, groupUpdate, convo, shouldOnlyAddUpdateMessage) {
    const { members: addedMembersBinary } = groupUpdate;
    const addedMembers = (addedMembersBinary || []).map(String_1.toHex);
    const oldMembers = convo.get('members') || [];
    const membersNotAlreadyPresent = addedMembers.filter(m => !oldMembers.includes(m));
    sessionjs_logger_1.console.info(`Got a group update for group ${envelope.source}, type: MEMBERS_ADDED`);
    addedMembers.forEach(added => removeMemberFromZombies(envelope, types_1.PubKey.cast(added), convo));
    if (membersNotAlreadyPresent.length === 0) {
        sessionjs_logger_1.console.info('no new members in this group update compared to what we have already. Skipping update');
        await convo.commit();
        await (0, cache_1.removeFromCache)(envelope);
        return;
    }
    if (await areWeAdmin(convo)) {
        await sendLatestKeyPairToUsers(convo, convo.id, membersNotAlreadyPresent);
    }
    const members = [...oldMembers, ...membersNotAlreadyPresent];
    await Promise.all(members.map(async (m) => (0, conversations_1.getConversationController)().getOrCreateAndWait(m, conversationAttributes_1.ConversationTypeEnum.PRIVATE)));
    const groupDiff = {
        joiningMembers: membersNotAlreadyPresent,
    };
    await ClosedGroup.addUpdateMessage(convo, groupDiff, envelope.senderIdentity, (0, lodash_1.toNumber)(envelope.timestamp));
    if (!shouldOnlyAddUpdateMessage) {
        convo.set({ members });
    }
    convo.updateLastMessage();
    await convo.commit();
    await (0, cache_1.removeFromCache)(envelope);
}
async function areWeAdmin(groupConvo) {
    if (!groupConvo) {
        throw new Error('areWeAdmin needs a convo');
    }
    const groupAdmins = groupConvo.get('groupAdmins');
    const ourNumber = utils_1.UserUtils.getOurPubKeyStrFromCache();
    return groupAdmins?.includes(ourNumber) || false;
}
async function handleClosedGroupMembersRemoved(envelope, groupUpdate, convo, shouldOnlyAddUpdateMessage) {
    const currentMembers = convo.get('members');
    const removedMembers = groupUpdate.members.map(String_1.toHex);
    const effectivelyRemovedMembers = removedMembers.filter(m => currentMembers.includes(m));
    const groupPubKey = envelope.source;
    sessionjs_logger_1.console.info(`Got a group update for group ${envelope.source}, type: MEMBERS_REMOVED`);
    const membersAfterUpdate = lodash_1.default.difference(currentMembers, removedMembers);
    const groupAdmins = convo.get('groupAdmins');
    if (!groupAdmins?.length) {
        throw new Error('No admins found for closed group member removed update.');
    }
    const firstAdmin = groupAdmins[0];
    if (removedMembers.includes(firstAdmin)) {
        sessionjs_logger_1.console.warn('Ignoring invalid closed group update: trying to remove the admin.');
        await (0, cache_1.removeFromCache)(envelope);
        throw new Error('Admins cannot be removed. They can only leave');
    }
    if (!groupAdmins.includes(envelope.senderIdentity)) {
        sessionjs_logger_1.console.warn('Ignoring invalid closed group update. Only admins can remove members.');
        await (0, cache_1.removeFromCache)(envelope);
        throw new Error('Only admins can remove members.');
    }
    const ourPubKey = utils_1.UserUtils.getOurPubKeyFromCache();
    const wasCurrentUserKicked = !membersAfterUpdate.includes(ourPubKey.key);
    if (wasCurrentUserKicked) {
        await (0, conversations_1.getConversationController)().deleteClosedGroup(groupPubKey, {
            fromSyncMessage: false,
            sendLeaveMessage: false,
        });
    }
    else {
        if (membersAfterUpdate.length !== currentMembers.length) {
            const groupDiff = {
                kickedMembers: effectivelyRemovedMembers,
            };
            await ClosedGroup.addUpdateMessage(convo, groupDiff, envelope.senderIdentity, (0, lodash_1.toNumber)(envelope.timestamp));
            convo.updateLastMessage();
        }
        const zombies = convo.get('zombies').filter(z => membersAfterUpdate.includes(z));
        if (!shouldOnlyAddUpdateMessage) {
            convo.set({ members: membersAfterUpdate });
            convo.set({ zombies });
        }
        await convo.commit();
    }
    await (0, cache_1.removeFromCache)(envelope);
}
function isUserAZombie(convo, user) {
    return convo.get('zombies').includes(user.key);
}
function addMemberToZombies(_envelope, userToAdd, convo) {
    const zombies = convo.get('zombies');
    const isAlreadyZombie = isUserAZombie(convo, userToAdd);
    if (isAlreadyZombie) {
        return false;
    }
    convo.set('zombies', [...zombies, userToAdd.key]);
    return true;
}
function removeMemberFromZombies(_envelope, userToAdd, convo) {
    const zombies = convo.get('zombies');
    const isAlreadyAZombie = isUserAZombie(convo, userToAdd);
    if (!isAlreadyAZombie) {
        return false;
    }
    convo.set('zombies', zombies.filter(z => z !== userToAdd.key));
    return true;
}
async function handleClosedGroupAdminMemberLeft(groupPublicKey, envelope) {
    await (0, conversations_1.getConversationController)().deleteClosedGroup(groupPublicKey, {
        fromSyncMessage: false,
        sendLeaveMessage: false,
    });
    await (0, cache_1.removeFromCache)(envelope);
}
async function handleClosedGroupLeftOurself(groupId, envelope) {
    await (0, conversations_1.getConversationController)().deleteClosedGroup(groupId, {
        fromSyncMessage: false,
        sendLeaveMessage: false,
    });
    await (0, cache_1.removeFromCache)(envelope);
}
async function handleClosedGroupMemberLeft(envelope, convo, shouldOnlyAddUpdateMessage) {
    const sender = envelope.senderIdentity;
    const groupPublicKey = envelope.source;
    const didAdminLeave = convo.get('groupAdmins')?.includes(sender) || false;
    const oldMembers = convo.get('members') || [];
    const newMembers = oldMembers.filter(s => s !== sender);
    sessionjs_logger_1.console.info(`Got a group update for group ${envelope.source}, type: MEMBER_LEFT`);
    if (utils_1.UserUtils.isUsFromCache(sender)) {
        sessionjs_logger_1.console.info('Got self-sent group update member left...');
    }
    const ourPubkey = utils_1.UserUtils.getOurPubKeyStrFromCache();
    if (didAdminLeave) {
        await handleClosedGroupAdminMemberLeft(groupPublicKey, envelope);
        return;
    }
    if (!newMembers.includes(ourPubkey)) {
        await handleClosedGroupLeftOurself(groupPublicKey, envelope);
        return;
    }
    const groupDiff = {
        leavingMembers: [sender],
    };
    await ClosedGroup.addUpdateMessage(convo, groupDiff, envelope.senderIdentity, (0, lodash_1.toNumber)(envelope.timestamp));
    convo.updateLastMessage();
    if (oldMembers.includes(sender)) {
        addMemberToZombies(envelope, types_1.PubKey.cast(sender), convo);
    }
    if (!shouldOnlyAddUpdateMessage) {
        convo.set('members', newMembers);
    }
    await convo.commit();
    await (0, cache_1.removeFromCache)(envelope);
}
async function sendLatestKeyPairToUsers(_groupConvo, groupPubKey, targetUsers) {
    const inMemoryKeyPair = exports.distributingClosedGroupEncryptionKeyPairs.get(groupPubKey);
    const latestKeyPair = await data_1.Data.getLatestClosedGroupEncryptionKeyPair(groupPubKey);
    if (!inMemoryKeyPair && !latestKeyPair) {
        sessionjs_logger_1.console.info('We do not have the keypair ourself, so dropping this message.');
        return;
    }
    const keyPairToUse = inMemoryKeyPair || keypairs_1.ECKeyPair.fromHexKeyPair(latestKeyPair);
    await Promise.all(targetUsers.map(async (member) => {
        sessionjs_logger_1.console.info(`Sending latest closed group encryption key pair to: ${member}`);
        await (0, conversations_1.getConversationController)().getOrCreateAndWait(member, conversationAttributes_1.ConversationTypeEnum.PRIVATE);
        const wrappers = await ClosedGroup.buildEncryptionKeyPairWrappers([member], keyPairToUse);
        const keypairsMessage = new ClosedGroupEncryptionPairReplyMessage_1.ClosedGroupEncryptionPairReplyMessage({
            groupId: groupPubKey,
            timestamp: Date.now(),
            encryptedKeyPairs: wrappers,
        });
        await (0, session_1.getMessageQueue)().sendToPubKey(types_1.PubKey.cast(member), keypairsMessage, namespaces_1.SnodeNamespaces.UserMessages);
    }));
}
