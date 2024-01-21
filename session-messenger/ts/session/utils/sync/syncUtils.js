"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildSyncMessage = exports.getCurrentConfigurationMessage = exports.forceSyncConfigurationNowIfNeeded = exports.syncConfigurationIfNeeded = void 0;
const lodash_1 = __importDefault(require("lodash"));
const uuid_1 = require("uuid");
const __1 = require("..");
const __2 = require("../..");
const data_1 = require("../../../data/data");
const opengroups_1 = require("../../../data/opengroups");
const protobuf_1 = require("../../../protobuf");
const keypairs_1 = require("../../../receiver/keypairs");
const namespaces_1 = require("../../apis/snode_api/namespaces");
const constants_1 = require("../../constants");
const conversations_1 = require("../../conversations");
const ConfigurationMessage_1 = require("../../messages/outgoing/controlMessage/ConfigurationMessage");
const ExpirationTimerUpdateMessage_1 = require("../../messages/outgoing/controlMessage/ExpirationTimerUpdateMessage");
const VisibleMessage_1 = require("../../messages/outgoing/visibleMessage/VisibleMessage");
const types_1 = require("../../types");
const ConfigurationSyncJob_1 = require("../job_runners/jobs/ConfigurationSyncJob");
const String_1 = require("../String");
const OpenGroupUtils_1 = require("../../apis/open_group_api/utils/OpenGroupUtils");
const storage_1 = require("../../../util/storage");
const releaseFeature_1 = require("../../../util/releaseFeature");
const sessionjs_logger_1 = require("../../../sessionjs-logger");
const ITEM_ID_LAST_SYNC_TIMESTAMP = 'lastSyncedTimestamp';
const getLastSyncTimestampFromDb = async () => (await data_1.Data.getItemById(ITEM_ID_LAST_SYNC_TIMESTAMP))?.value;
const writeLastSyncTimestampToDb = async (timestamp) => storage_1.Storage.put(ITEM_ID_LAST_SYNC_TIMESTAMP, timestamp);
const syncConfigurationIfNeeded = async () => {
    await ConfigurationSyncJob_1.ConfigurationSync.queueNewJobIfNeeded();
    const userConfigLibsession = await releaseFeature_1.ReleasedFeatures.checkIsUserConfigFeatureReleased();
    if (!userConfigLibsession) {
        const lastSyncedTimestamp = (await getLastSyncTimestampFromDb()) || 0;
        const now = Date.now();
        if (Math.abs(now - lastSyncedTimestamp) < constants_1.DURATION.DAYS * 2) {
            return;
        }
        const allConvos = (0, conversations_1.getConversationController)().getConversations();
        const configMessage = await (0, exports.getCurrentConfigurationMessage)(allConvos);
        try {
            await (0, __2.getMessageQueue)().sendSyncMessage({
                namespace: namespaces_1.SnodeNamespaces.UserMessages,
                message: configMessage,
            });
        }
        catch (e) {
            sessionjs_logger_1.console.warn('Caught an error while sending our ConfigurationMessage:', e);
            return;
        }
        await writeLastSyncTimestampToDb(now);
    }
};
exports.syncConfigurationIfNeeded = syncConfigurationIfNeeded;
const forceSyncConfigurationNowIfNeeded = async (waitForMessageSent = false) => {
    await releaseFeature_1.ReleasedFeatures.checkIsUserConfigFeatureReleased();
    return new Promise(resolve => {
        setTimeout(() => {
            resolve(false);
        }, 20000);
        void ConfigurationSyncJob_1.ConfigurationSync.queueNewJobIfNeeded().catch(e => {
            sessionjs_logger_1.console.warn('forceSyncConfigurationNowIfNeeded scheduling of jobs ConfigurationSync.queueNewJobIfNeeded failed with: ', e.message);
        });
        if (releaseFeature_1.ReleasedFeatures.isUserConfigFeatureReleasedCached()) {
            if (waitForMessageSent) {
                global.SBOT.ConfigurationSyncJobDone = () => {
                    resolve(true);
                };
                return;
            }
            resolve(true);
            return;
        }
        const allConvos = (0, conversations_1.getConversationController)().getConversations();
        void (0, exports.getCurrentConfigurationMessage)(allConvos)
            .then(configMessage => {
            const callback = waitForMessageSent
                ? () => {
                    resolve(true);
                }
                : undefined;
            void (0, __2.getMessageQueue)().sendSyncMessage({
                namespace: namespaces_1.SnodeNamespaces.UserMessages,
                message: configMessage,
                sentCb: callback,
            });
            if (!waitForMessageSent) {
                resolve(true);
            }
        })
            .catch(e => {
            sessionjs_logger_1.console.warn('Caught an error while building our ConfigurationMessage:', e);
            resolve(false);
        });
    });
};
exports.forceSyncConfigurationNowIfNeeded = forceSyncConfigurationNowIfNeeded;
const getActiveOpenGroupV2CompleteUrls = async (convos) => {
    const openGroupsV2ConvoIds = convos
        .filter(c => !!c.get('active_at') && c.isOpenGroupV2() && !c.get('left'))
        .map(c => c.id);
    const urls = await Promise.all(openGroupsV2ConvoIds.map(async (opengroupConvoId) => {
        const roomInfos = opengroups_1.OpenGroupData.getV2OpenGroupRoom(opengroupConvoId);
        if (roomInfos) {
            return (0, OpenGroupUtils_1.getCompleteUrlFromRoom)(roomInfos);
        }
        return null;
    }));
    return lodash_1.default.compact(urls) || [];
};
const getValidClosedGroups = async (convos) => {
    const ourPubKey = __1.UserUtils.getOurPubKeyStrFromCache();
    const closedGroupModels = convos.filter(c => !!c.get('active_at') &&
        c.isClosedGroup() &&
        c.get('members')?.includes(ourPubKey) &&
        !c.get('left') &&
        !c.get('isKickedFromGroup') &&
        !c.isBlocked() &&
        c.get('displayNameInProfile'));
    const closedGroups = await Promise.all(closedGroupModels.map(async (c) => {
        const groupPubKey = c.get('id');
        const fetchEncryptionKeyPair = await data_1.Data.getLatestClosedGroupEncryptionKeyPair(groupPubKey);
        if (!fetchEncryptionKeyPair) {
            return null;
        }
        return new ConfigurationMessage_1.ConfigurationMessageClosedGroup({
            publicKey: groupPubKey,
            name: c.get('displayNameInProfile') || '',
            members: c.get('members') || [],
            admins: c.get('groupAdmins') || [],
            encryptionKeyPair: keypairs_1.ECKeyPair.fromHexKeyPair(fetchEncryptionKeyPair),
        });
    }));
    const onlyValidClosedGroup = closedGroups.filter(m => m !== null);
    return onlyValidClosedGroup;
};
const getValidContacts = (convos) => {
    const contactsModels = convos.filter(c => !!c.get('active_at') &&
        c.getRealSessionUsername() &&
        c.isPrivate() &&
        c.isApproved() &&
        !types_1.PubKey.isBlinded(c.get('id')));
    const contacts = contactsModels.map(c => {
        try {
            const profileKey = c.get('profileKey');
            let profileKeyForContact = null;
            if (typeof profileKey === 'string') {
                try {
                    if (!/^[0-9a-fA-F]+$/.test(profileKey)) {
                        throw new Error('Not Hex');
                    }
                    profileKeyForContact = (0, String_1.fromHexToArray)(profileKey);
                }
                catch (e) {
                    profileKeyForContact = (0, String_1.fromBase64ToArray)(profileKey);
                    void c.setProfileKey(profileKeyForContact);
                }
            }
            else if (profileKey) {
                sessionjs_logger_1.console.warn('Got a profileKey for a contact in another format than string. Contact: ', c.id);
                return null;
            }
            return new ConfigurationMessage_1.ConfigurationMessageContact({
                publicKey: c.id,
                displayName: c.getRealSessionUsername() || 'Anonymous',
                profilePictureURL: c.get('avatarPointer'),
                profileKey: !profileKeyForContact?.length ? undefined : profileKeyForContact,
                isApproved: c.isApproved(),
                isBlocked: c.isBlocked(),
                didApproveMe: c.didApproveMe(),
            });
        }
        catch (e) {
            sessionjs_logger_1.console.warn('getValidContacts', e);
            return null;
        }
    });
    return lodash_1.default.compact(contacts);
};
const getCurrentConfigurationMessage = async (convos) => {
    const ourPubKey = __1.UserUtils.getOurPubKeyStrFromCache();
    const ourConvo = convos.find(convo => convo.id === ourPubKey);
    const opengroupV2CompleteUrls = await getActiveOpenGroupV2CompleteUrls(convos);
    const onlyValidClosedGroup = await getValidClosedGroups(convos);
    const validContacts = getValidContacts(convos);
    if (!ourConvo) {
        sessionjs_logger_1.console.error('Could not find our convo while building a configuration message.');
    }
    const ourProfileKeyHex = (0, conversations_1.getConversationController)()
        .get(__1.UserUtils.getOurPubKeyStrFromCache())
        ?.get('profileKey') || null;
    const profileKey = ourProfileKeyHex ? (0, String_1.fromHexToArray)(ourProfileKeyHex) : undefined;
    const profilePicture = ourConvo?.get('avatarPointer') || undefined;
    const displayName = ourConvo?.getRealSessionUsername() || 'Anonymous';
    const activeOpenGroups = [...opengroupV2CompleteUrls];
    return new ConfigurationMessage_1.ConfigurationMessage({
        identifier: (0, uuid_1.v4)(),
        timestamp: Date.now(),
        activeOpenGroups,
        activeClosedGroups: onlyValidClosedGroup,
        displayName,
        profilePicture,
        profileKey,
        contacts: validContacts,
    });
};
exports.getCurrentConfigurationMessage = getCurrentConfigurationMessage;
const buildSyncVisibleMessage = (identifier, dataMessage, timestamp, syncTarget) => {
    const body = dataMessage.body || undefined;
    const wrapToUInt8Array = (buffer) => {
        if (!buffer) {
            return undefined;
        }
        if (buffer instanceof Uint8Array) {
            return buffer;
        }
        return new Uint8Array(buffer.toArrayBuffer());
    };
    const attachments = (dataMessage.attachments || []).map(attachment => {
        const key = wrapToUInt8Array(attachment.key);
        const digest = wrapToUInt8Array(attachment.digest);
        return {
            ...attachment,
            key,
            digest,
        };
    });
    const quote = dataMessage.quote || undefined;
    const preview = dataMessage.preview || [];
    const expireTimer = dataMessage.expireTimer;
    return new VisibleMessage_1.VisibleMessage({
        identifier,
        timestamp,
        attachments,
        body,
        quote,
        preview,
        syncTarget,
        expireTimer,
    });
};
const buildSyncExpireTimerMessage = (identifier, dataMessage, timestamp, syncTarget) => {
    const expireTimer = dataMessage.expireTimer;
    return new ExpirationTimerUpdateMessage_1.ExpirationTimerUpdateMessage({
        identifier,
        timestamp,
        expireTimer,
        syncTarget,
    });
};
const buildSyncMessage = (identifier, dataMessage, syncTarget, sentTimestamp) => {
    if (dataMessage.constructor.name !== 'DataMessage' &&
        !(dataMessage instanceof protobuf_1.SignalService.DataMessage)) {
        sessionjs_logger_1.console.warn('buildSyncMessage with something else than a DataMessage');
    }
    if (!sentTimestamp || !lodash_1.default.isNumber(sentTimestamp)) {
        throw new Error('Tried to build a sync message without a sentTimestamp');
    }
    const timestamp = lodash_1.default.toNumber(sentTimestamp);
    if (dataMessage.flags === protobuf_1.SignalService.DataMessage.Flags.EXPIRATION_TIMER_UPDATE) {
        return buildSyncExpireTimerMessage(identifier, dataMessage, timestamp, syncTarget);
    }
    return buildSyncVisibleMessage(identifier, dataMessage, timestamp, syncTarget);
};
exports.buildSyncMessage = buildSyncMessage;
