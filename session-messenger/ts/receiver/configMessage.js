"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigMessageHandler = exports.getSettingsKeyFromLibsessionWrapper = void 0;
const lodash_1 = require("lodash");
const configDump_1 = require("../data/configDump/configDump");
const data_1 = require("../data/data");
const settings_key_1 = require("../data/settings-key");
const interactions_1 = require("../interactions");
const conversationAttributes_1 = require("../models/conversationAttributes");
const protobuf_1 = require("../protobuf");
const session_1 = require("../session");
const JoinOpenGroupV2_1 = require("../session/apis/open_group_api/opengroupV2/JoinOpenGroupV2");
const OpenGroupManagerV2_1 = require("../session/apis/open_group_api/opengroupV2/OpenGroupManagerV2");
const utils_1 = require("../session/apis/open_group_api/utils");
const OpenGroupUtils_1 = require("../session/apis/open_group_api/utils/OpenGroupUtils");
const snode_api_1 = require("../session/apis/snode_api");
const conversations_1 = require("../session/conversations");
const ProfileManager_1 = require("../session/profile_manager/ProfileManager");
const types_1 = require("../session/types");
const utils_2 = require("../session/utils");
const String_1 = require("../session/utils/String");
const ConfigurationSyncJob_1 = require("../session/utils/job_runners/jobs/ConfigurationSyncJob");
const libsession_utils_1 = require("../session/utils/libsession/libsession_utils");
const libsession_utils_contacts_1 = require("../session/utils/libsession/libsession_utils_contacts");
const libsession_utils_convo_info_volatile_1 = require("../session/utils/libsession/libsession_utils_convo_info_volatile");
const libsession_utils_user_groups_1 = require("../session/utils/libsession/libsession_utils_user_groups");
const events_1 = require("../shims/events");
const sqlSharedTypes_1 = require("../types/sqlSharedTypes");
const util_1 = require("../util");
const registration_1 = require("../util/registration");
const releaseFeature_1 = require("../util/releaseFeature");
const storage_1 = require("../util/storage");
const conversationInteractions_1 = require("../interactions/conversationInteractions");
const libsession_worker_interface_1 = require("../webworker/workers/browser/libsession_worker_interface");
const cache_1 = require("./cache");
const closedGroups_1 = require("./closedGroups");
const receiver_1 = require("./receiver");
const sessionjs_logger_1 = require("../sessionjs-logger");
function groupByVariant(incomingConfigs) {
    const groupedByVariant = new Map();
    incomingConfigs.forEach(incomingConfig => {
        const { kind } = incomingConfig.message;
        const wrapperId = libsession_utils_1.LibSessionUtil.kindToVariant(kind);
        if (!groupedByVariant.has(wrapperId)) {
            groupedByVariant.set(wrapperId, []);
        }
        groupedByVariant.get(wrapperId)?.push(incomingConfig);
    });
    return groupedByVariant;
}
async function mergeConfigsWithIncomingUpdates(incomingConfigs) {
    const groupedByVariant = groupByVariant(incomingConfigs);
    const groupedResults = new Map();
    const publicKey = utils_2.UserUtils.getOurPubKeyStrFromCache();
    try {
        for (let index = 0; index < groupedByVariant.size; index++) {
            const variant = [...groupedByVariant.keys()][index];
            const sameVariant = groupedByVariant.get(variant);
            if (!sameVariant?.length) {
                continue;
            }
            const toMerge = sameVariant.map(msg => ({
                data: msg.message.data,
                hash: msg.messageHash,
            }));
            const mergedCount = await libsession_worker_interface_1.GenericWrapperActions.merge(variant, toMerge);
            const needsPush = await libsession_worker_interface_1.GenericWrapperActions.needsPush(variant);
            const needsDump = await libsession_worker_interface_1.GenericWrapperActions.needsDump(variant);
            const latestEnvelopeTimestamp = Math.max(...sameVariant.map(m => m.envelopeTimestamp));
            sessionjs_logger_1.console.debug(`${variant}: "${publicKey}" needsPush:${needsPush} needsDump:${needsDump}; mergedCount:${mergedCount} `);
            const incomingConfResult = {
                needsDump,
                needsPush,
                kind: libsession_utils_1.LibSessionUtil.variantToKind(variant),
                publicKey,
                latestEnvelopeTimestamp: latestEnvelopeTimestamp || Date.now(),
            };
            groupedResults.set(variant, incomingConfResult);
        }
        return groupedResults;
    }
    catch (e) {
        sessionjs_logger_1.console.error('mergeConfigsWithIncomingUpdates failed with', e);
        throw e;
    }
}
function getSettingsKeyFromLibsessionWrapper(wrapperType) {
    switch (wrapperType) {
        case 'UserConfig':
            return settings_key_1.SettingsKey.latestUserProfileEnvelopeTimestamp;
        case 'ContactsConfig':
            return settings_key_1.SettingsKey.latestUserContactsEnvelopeTimestamp;
        case 'UserGroupsConfig':
            return settings_key_1.SettingsKey.latestUserGroupEnvelopeTimestamp;
        case 'ConvoInfoVolatileConfig':
            return null;
        default:
            try {
                (0, sqlSharedTypes_1.assertUnreachable)(wrapperType, `getSettingsKeyFromLibsessionWrapper unknown type: ${wrapperType}`);
            }
            catch (e) {
                sessionjs_logger_1.console.warn('assertUnreachable:', e.message);
            }
            return null;
    }
}
exports.getSettingsKeyFromLibsessionWrapper = getSettingsKeyFromLibsessionWrapper;
async function updateLibsessionLatestProcessedUserTimestamp(wrapperType, latestEnvelopeTimestamp) {
    const settingsKey = getSettingsKeyFromLibsessionWrapper(wrapperType);
    if (!settingsKey) {
        return;
    }
    const currentLatestEnvelopeProcessed = storage_1.Storage.get(settingsKey) || 0;
    const newLatestProcessed = Math.max(latestEnvelopeTimestamp, (0, lodash_1.isNumber)(currentLatestEnvelopeProcessed) ? currentLatestEnvelopeProcessed : 0);
    if (newLatestProcessed !== currentLatestEnvelopeProcessed || currentLatestEnvelopeProcessed) {
        await storage_1.Storage.put(settingsKey, newLatestProcessed);
    }
}
async function handleUserProfileUpdate(result) {
    const updateUserInfo = await libsession_worker_interface_1.UserConfigWrapperActions.getUserInfo();
    if (!updateUserInfo) {
        return result;
    }
    const currentBlindedMsgRequest = storage_1.Storage.get(settings_key_1.SettingsKey.hasBlindedMsgRequestsEnabled);
    const newBlindedMsgRequest = await libsession_worker_interface_1.UserConfigWrapperActions.getEnableBlindedMsgRequest();
    if (!(0, lodash_1.isNil)(newBlindedMsgRequest) && newBlindedMsgRequest !== currentBlindedMsgRequest) {
    }
    const picUpdate = !(0, lodash_1.isEmpty)(updateUserInfo.key) && !(0, lodash_1.isEmpty)(updateUserInfo.url);
    await updateOurProfileLegacyOrViaLibSession(result.latestEnvelopeTimestamp, updateUserInfo.name, picUpdate ? updateUserInfo.url : null, picUpdate ? updateUserInfo.key : null, updateUserInfo.priority);
    const settingsKey = settings_key_1.SettingsKey.latestUserProfileEnvelopeTimestamp;
    const currentLatestEnvelopeProcessed = storage_1.Storage.get(settingsKey) || 0;
    const newLatestProcessed = Math.max(result.latestEnvelopeTimestamp, (0, lodash_1.isNumber)(currentLatestEnvelopeProcessed) ? currentLatestEnvelopeProcessed : 0);
    if (newLatestProcessed !== currentLatestEnvelopeProcessed) {
        await storage_1.Storage.put(settingsKey, newLatestProcessed);
    }
    return result;
}
function getContactsToRemoveFromDB(contactsInWrapper) {
    const allContactsInDBWhichShouldBeInWrapperIds = (0, conversations_1.getConversationController)()
        .getConversations()
        .filter(libsession_utils_contacts_1.SessionUtilContact.isContactToStoreInWrapper)
        .map(m => m.id);
    const currentlySelectedConversationId = undefined;
    const currentlySelectedConvo = undefined;
    const convoIdsInDbButNotWrapper = (0, lodash_1.difference)(allContactsInDBWhichShouldBeInWrapperIds, contactsInWrapper.map(m => m.id));
    if (currentlySelectedConversationId &&
        currentlySelectedConvo &&
        convoIdsInDbButNotWrapper.includes(currentlySelectedConversationId)) {
        if (false) {
            const foundIndex = convoIdsInDbButNotWrapper.findIndex(m => m === currentlySelectedConversationId);
            if (foundIndex !== -1) {
                convoIdsInDbButNotWrapper.splice(foundIndex, 1);
            }
        }
    }
    return convoIdsInDbButNotWrapper;
}
async function deleteContactsFromDB(contactsToRemove) {
    sessionjs_logger_1.console.debug('contacts to fully remove after wrapper merge', contactsToRemove);
    for (let index = 0; index < contactsToRemove.length; index++) {
        const contactToRemove = contactsToRemove[index];
        try {
            await (0, conversations_1.getConversationController)().delete1o1(contactToRemove, {
                fromSyncMessage: true,
                justHidePrivate: false,
            });
        }
        catch (e) {
            sessionjs_logger_1.console.warn(`after merge: deleteContactsFromDB ${contactToRemove} failed with `, e.message);
        }
    }
}
async function handleContactsUpdate(result) {
    const us = utils_2.UserUtils.getOurPubKeyStrFromCache();
    const allContactsInWrapper = await libsession_worker_interface_1.ContactsWrapperActions.getAll();
    const contactsToRemoveFromDB = getContactsToRemoveFromDB(allContactsInWrapper);
    await deleteContactsFromDB(contactsToRemoveFromDB);
    for (let index = 0; index < allContactsInWrapper.length; index++) {
        const wrapperConvo = allContactsInWrapper[index];
        if (wrapperConvo.id === us) {
            continue;
        }
        const contactConvo = await (0, conversations_1.getConversationController)().getOrCreateAndWait(wrapperConvo.id, conversationAttributes_1.ConversationTypeEnum.PRIVATE);
        if (wrapperConvo.id && contactConvo) {
            let changes = false;
            if (wrapperConvo.nickname !== contactConvo.getNickname()) {
                await contactConvo.setNickname(wrapperConvo.nickname || null, false);
                changes = true;
            }
            const currentPriority = contactConvo.get('priority');
            if (wrapperConvo.priority !== currentPriority) {
                if (wrapperConvo.priority === conversationAttributes_1.CONVERSATION_PRIORITIES.hidden) {
                    sessionjs_logger_1.console.info('contact marked as hidden and was not before. Deleting all messages from that user');
                    await (0, conversationInteractions_1.deleteAllMessagesByConvoIdNoConfirmation)(wrapperConvo.id);
                }
                await contactConvo.setPriorityFromWrapper(wrapperConvo.priority);
                changes = true;
            }
            if (Boolean(wrapperConvo.approved) !== contactConvo.isApproved()) {
                await contactConvo.setIsApproved(Boolean(wrapperConvo.approved), false);
                changes = true;
            }
            if (Boolean(wrapperConvo.approvedMe) !== contactConvo.didApproveMe()) {
                await contactConvo.setDidApproveMe(Boolean(wrapperConvo.approvedMe), false);
                changes = true;
            }
            if (!contactConvo.get('active_at') && wrapperConvo.createdAtSeconds) {
                contactConvo.set({ active_at: wrapperConvo.createdAtSeconds * 1000 });
                changes = true;
            }
            const convoBlocked = wrapperConvo.blocked || false;
            await util_1.BlockedNumberController.setBlocked(wrapperConvo.id, convoBlocked);
            if (changes) {
                await contactConvo.commit();
            }
            await ProfileManager_1.ProfileManager.updateProfileOfContact(contactConvo.id, wrapperConvo.name, wrapperConvo.profilePicture?.url || null, wrapperConvo.profilePicture?.key || null);
        }
    }
    return result;
}
async function handleCommunitiesUpdate() {
    const allCommunitiesInWrapper = await libsession_worker_interface_1.UserGroupsWrapperActions.getAllCommunities();
    sessionjs_logger_1.console.debug('allCommunitiesInWrapper', allCommunitiesInWrapper.map(m => m.fullUrlWithPubkey));
    const allCommunitiesConversation = (0, conversations_1.getConversationController)()
        .getConversations()
        .filter(libsession_utils_user_groups_1.SessionUtilUserGroups.isCommunityToStoreInWrapper);
    const allCommunitiesIdsInDB = allCommunitiesConversation.map(m => m.id);
    sessionjs_logger_1.console.debug('allCommunitiesIdsInDB', allCommunitiesIdsInDB);
    const communitiesIdsInWrapper = (0, lodash_1.compact)(allCommunitiesInWrapper.map(m => {
        try {
            const builtConvoId = utils_1.OpenGroupUtils.getOpenGroupV2ConversationId(m.baseUrl, m.roomCasePreserved);
            return builtConvoId;
        }
        catch (e) {
            return null;
        }
    }));
    const communitiesToJoinInDB = (0, lodash_1.compact)(allCommunitiesInWrapper.map(m => {
        try {
            const builtConvoId = utils_1.OpenGroupUtils.getOpenGroupV2ConversationId(m.baseUrl, m.roomCasePreserved);
            return allCommunitiesIdsInDB.includes(builtConvoId) ? null : m;
        }
        catch (e) {
            return null;
        }
    }));
    const communitiesToLeaveInDB = (0, lodash_1.compact)(allCommunitiesConversation.map(m => {
        return communitiesIdsInWrapper.includes(m.id) ? null : m;
    }));
    for (let index = 0; index < communitiesToLeaveInDB.length; index++) {
        const toLeave = communitiesToLeaveInDB[index];
        sessionjs_logger_1.console.info('leaving community with convoId ', toLeave.id);
        await (0, conversations_1.getConversationController)().deleteCommunity(toLeave.id, {
            fromSyncMessage: true,
        });
    }
    try {
        await Promise.all(communitiesToJoinInDB.map(async (toJoin) => {
            sessionjs_logger_1.console.info('joining community with convoId ', toJoin.fullUrlWithPubkey);
            return (0, OpenGroupManagerV2_1.getOpenGroupManager)().attemptConnectionV2OneAtATime(toJoin.baseUrl, toJoin.roomCasePreserved, toJoin.pubkeyHex);
        }));
    }
    catch (e) {
        sessionjs_logger_1.console.warn(`joining community with failed with one of ${communitiesToJoinInDB}`, e.message);
    }
    for (let index = 0; index < allCommunitiesInWrapper.length; index++) {
        const fromWrapper = allCommunitiesInWrapper[index];
        const convoId = utils_1.OpenGroupUtils.getOpenGroupV2ConversationId(fromWrapper.baseUrl, fromWrapper.roomCasePreserved);
        const communityConvo = (0, conversations_1.getConversationController)().get(convoId);
        if (fromWrapper && communityConvo) {
            let changes = false;
            changes =
                (await communityConvo.setPriorityFromWrapper(fromWrapper.priority, false)) || changes;
            if (changes) {
                await communityConvo.commit();
            }
        }
    }
}
async function handleLegacyGroupUpdate(latestEnvelopeTimestamp) {
    const allLegacyGroupsInWrapper = await libsession_worker_interface_1.UserGroupsWrapperActions.getAllLegacyGroups();
    const allLegacyGroupsInDb = (0, conversations_1.getConversationController)()
        .getConversations()
        .filter(libsession_utils_user_groups_1.SessionUtilUserGroups.isLegacyGroupToRemoveFromDBIfNotInWrapper);
    const allLegacyGroupsIdsInDB = allLegacyGroupsInDb.map(m => m.id);
    const allLegacyGroupsIdsInWrapper = allLegacyGroupsInWrapper.map(m => m.pubkeyHex);
    const legacyGroupsToJoinInDB = allLegacyGroupsInWrapper.filter(m => {
        return !allLegacyGroupsIdsInDB.includes(m.pubkeyHex);
    });
    sessionjs_logger_1.console.debug(`allLegacyGroupsInWrapper: ${allLegacyGroupsInWrapper.map(m => m.pubkeyHex)} `);
    sessionjs_logger_1.console.debug(`allLegacyGroupsIdsInDB: ${allLegacyGroupsIdsInDB} `);
    const legacyGroupsToLeaveInDB = allLegacyGroupsInDb.filter(m => {
        return !allLegacyGroupsIdsInWrapper.includes(m.id);
    });
    sessionjs_logger_1.console.info(`we have to join ${legacyGroupsToJoinInDB.length} legacy groups in DB compared to what is in the wrapper`);
    sessionjs_logger_1.console.info(`we have to leave ${legacyGroupsToLeaveInDB.length} legacy groups in DB compared to what is in the wrapper`);
    for (let index = 0; index < legacyGroupsToLeaveInDB.length; index++) {
        const toLeave = legacyGroupsToLeaveInDB[index];
        sessionjs_logger_1.console.info('leaving legacy group from configuration sync message with convoId ', toLeave.id);
        const toLeaveFromDb = (0, conversations_1.getConversationController)().get(toLeave.id);
        await (0, conversations_1.getConversationController)().deleteClosedGroup(toLeaveFromDb.id, {
            fromSyncMessage: true,
            sendLeaveMessage: false,
        });
    }
    for (let index = 0; index < legacyGroupsToJoinInDB.length; index++) {
        const toJoin = legacyGroupsToJoinInDB[index];
        sessionjs_logger_1.console.info('joining legacy group from configuration sync message with convoId ', toJoin.pubkeyHex);
        await (0, conversations_1.getConversationController)().getOrCreateAndWait(toJoin.pubkeyHex, conversationAttributes_1.ConversationTypeEnum.GROUP);
    }
    for (let index = 0; index < allLegacyGroupsInWrapper.length; index++) {
        const fromWrapper = allLegacyGroupsInWrapper[index];
        const legacyGroupConvo = (0, conversations_1.getConversationController)().get(fromWrapper.pubkeyHex);
        if (!legacyGroupConvo) {
            sessionjs_logger_1.console.warn('could not find legacy group which should already be there:', fromWrapper.pubkeyHex);
            continue;
        }
        const members = fromWrapper.members.map(m => m.pubkeyHex);
        const admins = fromWrapper.members.filter(m => m.isAdmin).map(m => m.pubkeyHex);
        const groupDetails = {
            id: fromWrapper.pubkeyHex,
            name: fromWrapper.name,
            members,
            admins,
            activeAt: !!legacyGroupConvo.get('active_at') &&
                legacyGroupConvo.get('active_at') < latestEnvelopeTimestamp
                ? legacyGroupConvo.get('active_at')
                : latestEnvelopeTimestamp,
        };
        await session_1.ClosedGroup.updateOrCreateClosedGroup(groupDetails);
        let changes = await legacyGroupConvo.setPriorityFromWrapper(fromWrapper.priority, false);
        const existingTimestampMs = legacyGroupConvo.get('lastJoinedTimestamp');
        const existingJoinedAtSeconds = Math.floor(existingTimestampMs / 1000);
        if (existingJoinedAtSeconds !== fromWrapper.joinedAtSeconds) {
            legacyGroupConvo.set({
                lastJoinedTimestamp: fromWrapper.joinedAtSeconds * 1000,
            });
            changes = true;
        }
        if (!legacyGroupConvo.get('isKickedFromGroup') && !legacyGroupConvo.get('left')) {
            (0, snode_api_1.getSwarmPollingInstance)().addGroupId(types_1.PubKey.cast(fromWrapper.pubkeyHex));
            if (!(0, lodash_1.isEmpty)(fromWrapper.encPubkey) && !(0, lodash_1.isEmpty)(fromWrapper.encSeckey)) {
                try {
                    const inWrapperKeypair = {
                        publicHex: (0, String_1.toHex)(fromWrapper.encPubkey),
                        privateHex: (0, String_1.toHex)(fromWrapper.encSeckey),
                    };
                    await (0, closedGroups_1.addKeyPairToCacheAndDBIfNeeded)(fromWrapper.pubkeyHex, inWrapperKeypair);
                }
                catch (e) {
                    sessionjs_logger_1.console.warn('failed to save keypair for legacugroup', fromWrapper.pubkeyHex);
                }
            }
        }
        if (changes) {
            await legacyGroupConvo.commit();
        }
        await (0, receiver_1.queueAllCachedFromSource)(fromWrapper.pubkeyHex);
    }
}
async function handleUserGroupsUpdate(result) {
    const toHandle = libsession_utils_user_groups_1.SessionUtilUserGroups.getUserGroupTypes();
    for (let index = 0; index < toHandle.length; index++) {
        const typeToHandle = toHandle[index];
        switch (typeToHandle) {
            case 'Community':
                await handleCommunitiesUpdate();
                break;
            case 'LegacyGroup':
                await handleLegacyGroupUpdate(result.latestEnvelopeTimestamp);
                break;
            default:
                (0, sqlSharedTypes_1.assertUnreachable)(typeToHandle, `handleUserGroupsUpdate unhandled type "${typeToHandle}"`);
        }
    }
    return result;
}
async function applyConvoVolatileUpdateFromWrapper(convoId, forcedUnread, lastReadMessageTimestamp) {
    const foundConvo = (0, conversations_1.getConversationController)().get(convoId);
    if (!foundConvo) {
        return;
    }
    try {
        await foundConvo.markReadFromConfigMessage(lastReadMessageTimestamp);
        await foundConvo.markAsUnread(forcedUnread, true);
        if (libsession_utils_convo_info_volatile_1.SessionUtilConvoInfoVolatile.isConvoToStoreInWrapper(foundConvo)) {
            await libsession_utils_convo_info_volatile_1.SessionUtilConvoInfoVolatile.refreshConvoVolatileCached(foundConvo.id, foundConvo.isClosedGroup(), false);
            await foundConvo.refreshInMemoryDetails();
        }
    }
    catch (e) {
        sessionjs_logger_1.console.warn(`applyConvoVolatileUpdateFromWrapper of "${convoId}" failed with error ${e.message}`);
    }
}
async function handleConvoInfoVolatileUpdate(result) {
    const types = libsession_utils_convo_info_volatile_1.SessionUtilConvoInfoVolatile.getConvoInfoVolatileTypes();
    for (let typeIndex = 0; typeIndex < types.length; typeIndex++) {
        const type = types[typeIndex];
        switch (type) {
            case '1o1':
                try {
                    const wrapper1o1s = await libsession_worker_interface_1.ConvoInfoVolatileWrapperActions.getAll1o1();
                    for (let index = 0; index < wrapper1o1s.length; index++) {
                        const fromWrapper = wrapper1o1s[index];
                        await applyConvoVolatileUpdateFromWrapper(fromWrapper.pubkeyHex, fromWrapper.unread, fromWrapper.lastRead);
                    }
                }
                catch (e) {
                    sessionjs_logger_1.console.warn('handleConvoInfoVolatileUpdate of "1o1" failed with error: ', e.message);
                }
                break;
            case 'Community':
                try {
                    const wrapperComms = await libsession_worker_interface_1.ConvoInfoVolatileWrapperActions.getAllCommunities();
                    for (let index = 0; index < wrapperComms.length; index++) {
                        const fromWrapper = wrapperComms[index];
                        const convoId = (0, OpenGroupUtils_1.getOpenGroupV2ConversationId)(fromWrapper.baseUrl, fromWrapper.roomCasePreserved);
                        await applyConvoVolatileUpdateFromWrapper(convoId, fromWrapper.unread, fromWrapper.lastRead);
                    }
                }
                catch (e) {
                    sessionjs_logger_1.console.warn('handleConvoInfoVolatileUpdate of "Community" failed with error: ', e.message);
                }
                break;
            case 'LegacyGroup':
                try {
                    const legacyGroups = await libsession_worker_interface_1.ConvoInfoVolatileWrapperActions.getAllLegacyGroups();
                    for (let index = 0; index < legacyGroups.length; index++) {
                        const fromWrapper = legacyGroups[index];
                        await applyConvoVolatileUpdateFromWrapper(fromWrapper.pubkeyHex, fromWrapper.unread, fromWrapper.lastRead);
                    }
                }
                catch (e) {
                    sessionjs_logger_1.console.warn('handleConvoInfoVolatileUpdate of "LegacyGroup" failed with error: ', e.message);
                }
                break;
            default:
                (0, sqlSharedTypes_1.assertUnreachable)(type, `handleConvoInfoVolatileUpdate: unhandeld switch case: ${type}`);
        }
    }
    return result;
}
async function processMergingResults(results) {
    if (!results || !results.size) {
        return;
    }
    const keys = [...results.keys()];
    let anyNeedsPush = false;
    for (let index = 0; index < keys.length; index++) {
        const wrapperType = keys[index];
        const incomingResult = results.get(wrapperType);
        if (!incomingResult) {
            continue;
        }
        try {
            const { kind } = incomingResult;
            switch (kind) {
                case protobuf_1.SignalService.SharedConfigMessage.Kind.USER_PROFILE:
                    await handleUserProfileUpdate(incomingResult);
                    break;
                case protobuf_1.SignalService.SharedConfigMessage.Kind.CONTACTS:
                    await handleContactsUpdate(incomingResult);
                    break;
                case protobuf_1.SignalService.SharedConfigMessage.Kind.USER_GROUPS:
                    await handleUserGroupsUpdate(incomingResult);
                    break;
                case protobuf_1.SignalService.SharedConfigMessage.Kind.CONVO_INFO_VOLATILE:
                    await handleConvoInfoVolatileUpdate(incomingResult);
                    break;
                default:
                    try {
                        (0, sqlSharedTypes_1.assertUnreachable)(kind, `processMergingResults unsupported kind: "${kind}"`);
                    }
                    catch (e) {
                        sessionjs_logger_1.console.warn('assertUnreachable failed', e.message);
                    }
            }
            const variant = libsession_utils_1.LibSessionUtil.kindToVariant(kind);
            try {
                await updateLibsessionLatestProcessedUserTimestamp(variant, incomingResult.latestEnvelopeTimestamp);
            }
            catch (e) {
                sessionjs_logger_1.console.error(`updateLibsessionLatestProcessedUserTimestamp failed with "${e.message}"`);
            }
            if (incomingResult.needsDump) {
                const dump = await libsession_worker_interface_1.GenericWrapperActions.dump(variant);
                await configDump_1.ConfigDumpData.saveConfigDump({
                    data: dump,
                    publicKey: incomingResult.publicKey,
                    variant,
                });
            }
            if (incomingResult.needsPush) {
                anyNeedsPush = true;
            }
        }
        catch (e) {
            sessionjs_logger_1.console.error(`processMergingResults failed with ${e.message}`);
            return;
        }
    }
    if (anyNeedsPush) {
        await ConfigurationSyncJob_1.ConfigurationSync.queueNewJobIfNeeded();
    }
}
async function handleConfigMessagesViaLibSession(configMessages) {
    const userConfigLibsession = await releaseFeature_1.ReleasedFeatures.checkIsUserConfigFeatureReleased();
    if (!userConfigLibsession) {
        return;
    }
    if ((0, lodash_1.isEmpty)(configMessages)) {
        return;
    }
    sessionjs_logger_1.console.debug(`Handling our sharedConfig message via libsession_util ${JSON.stringify(configMessages.map(m => ({
        variant: libsession_utils_1.LibSessionUtil.kindToVariant(m.message.kind),
        hash: m.messageHash,
        seqno: m.message.seqno.toNumber(),
    })))}`);
    const incomingMergeResult = await mergeConfigsWithIncomingUpdates(configMessages);
    await processMergingResults(incomingMergeResult);
}
async function updateOurProfileLegacyOrViaLibSession(sentAt, displayName, profileUrl, profileKey, priority) {
    await ProfileManager_1.ProfileManager.updateOurProfileSync(displayName, profileUrl, profileKey, priority);
    await (0, storage_1.setLastProfileUpdateTimestamp)((0, lodash_1.toNumber)(sentAt));
    if (!(0, lodash_1.isEmpty)(displayName)) {
        (0, events_1.trigger)(events_1.configurationMessageReceived, displayName);
    }
    else {
        sessionjs_logger_1.console.warn('Got a configuration message but the display name is empty');
    }
}
async function handleOurProfileUpdateLegacy(sentAt, configMessage) {
    const userConfigLibsession = await releaseFeature_1.ReleasedFeatures.checkIsUserConfigFeatureReleased();
    if (userConfigLibsession && !(0, storage_1.isSignInByLinking)()) {
        return;
    }
    const latestProfileUpdateTimestamp = (0, storage_1.getLastProfileUpdateTimestamp)();
    if (!latestProfileUpdateTimestamp || sentAt > latestProfileUpdateTimestamp) {
        sessionjs_logger_1.console.info(`Handling our profileUdpate ourLastUpdate:${latestProfileUpdateTimestamp}, envelope sent at: ${sentAt}`);
        const { profileKey, profilePicture, displayName } = configMessage;
        await updateOurProfileLegacyOrViaLibSession((0, lodash_1.toNumber)(sentAt), displayName, profilePicture, profileKey, null);
    }
}
async function handleGroupsAndContactsFromConfigMessageLegacy(envelope, configMessage) {
    const userConfigLibsession = await releaseFeature_1.ReleasedFeatures.checkIsUserConfigFeatureReleased();
    if (userConfigLibsession && registration_1.Registration.isDone()) {
        return;
    }
    const envelopeTimestamp = (0, lodash_1.toNumber)(envelope.timestamp);
    const lastConfigUpdate = await data_1.Data.getItemById(settings_key_1.SettingsKey.hasSyncedInitialConfigurationItem);
    let lastConfigTimestamp;
    if ((0, lodash_1.isNumber)(lastConfigUpdate?.value)) {
        lastConfigTimestamp = lastConfigUpdate?.value;
    }
    else if ((0, lodash_1.isNumber)(lastConfigUpdate?.timestamp)) {
        lastConfigTimestamp = lastConfigUpdate?.timestamp;
    }
    const isNewerConfig = !lastConfigTimestamp || (lastConfigTimestamp && lastConfigTimestamp < envelopeTimestamp);
    if (!isNewerConfig) {
        sessionjs_logger_1.console.info('Received outdated configuration message... Dropping message.');
        return;
    }
    await storage_1.Storage.put(settings_key_1.SettingsKey.hasSyncedInitialConfigurationItem, envelopeTimestamp);
    if (!lastConfigTimestamp) {
        await handleClosedGroupsFromConfigLegacy(configMessage.closedGroups, envelope);
    }
    void handleOpenGroupsFromConfigLegacy(configMessage.openGroups);
    if (configMessage.contacts?.length) {
        await Promise.all(configMessage.contacts.map(async (c) => handleContactFromConfigLegacy(c, envelope)));
    }
}
const handleOpenGroupsFromConfigLegacy = async (openGroups) => {
    const userConfigLibsession = await releaseFeature_1.ReleasedFeatures.checkIsUserConfigFeatureReleased();
    if (userConfigLibsession && registration_1.Registration.isDone()) {
        return;
    }
    const numberOpenGroup = openGroups?.length || 0;
    for (let i = 0; i < numberOpenGroup; i++) {
        const currentOpenGroupUrl = openGroups[i];
        const parsedRoom = (0, JoinOpenGroupV2_1.parseOpenGroupV2)(currentOpenGroupUrl);
        if (!parsedRoom) {
            continue;
        }
        const roomConvoId = (0, OpenGroupUtils_1.getOpenGroupV2ConversationId)(parsedRoom.serverUrl, parsedRoom.roomId);
        if (!(0, conversations_1.getConversationController)().get(roomConvoId)) {
            sessionjs_logger_1.console.info(`triggering join of public chat '${currentOpenGroupUrl}' from ConfigurationMessage`);
            void (0, JoinOpenGroupV2_1.joinOpenGroupV2WithUIEvents)(currentOpenGroupUrl, false, true);
        }
    }
};
const handleClosedGroupsFromConfigLegacy = async (closedGroups, envelope) => {
    const userConfigLibsession = await releaseFeature_1.ReleasedFeatures.checkIsUserConfigFeatureReleased();
    if (userConfigLibsession && registration_1.Registration.isDone()) {
        return;
    }
    const numberClosedGroup = closedGroups?.length || 0;
    sessionjs_logger_1.console.info(`Received ${numberClosedGroup} closed group on configuration. Creating them... `);
    await Promise.all(closedGroups.map(async (c) => {
        const groupUpdate = new protobuf_1.SignalService.DataMessage.ClosedGroupControlMessage({
            type: protobuf_1.SignalService.DataMessage.ClosedGroupControlMessage.Type.NEW,
            encryptionKeyPair: c.encryptionKeyPair,
            name: c.name,
            admins: c.admins,
            members: c.members,
            publicKey: c.publicKey,
        });
        try {
            await (0, closedGroups_1.handleNewClosedGroup)(envelope, groupUpdate, true);
        }
        catch (e) {
            sessionjs_logger_1.console.warn('failed to handle a new closed group from configuration message');
        }
    }));
};
const handleContactFromConfigLegacy = async (contactReceived, envelope) => {
    const userConfigLibsession = await releaseFeature_1.ReleasedFeatures.checkIsUserConfigFeatureReleased();
    if (userConfigLibsession && registration_1.Registration.isDone()) {
        return;
    }
    try {
        if (!contactReceived.publicKey?.length) {
            return;
        }
        const contactConvo = await (0, conversations_1.getConversationController)().getOrCreateAndWait((0, String_1.toHex)(contactReceived.publicKey), conversationAttributes_1.ConversationTypeEnum.PRIVATE);
        const profileInDataMessage = {
            displayName: contactReceived.name,
            profilePicture: contactReceived.profilePicture,
        };
        const existingActiveAt = contactConvo.get('active_at');
        if (!existingActiveAt || existingActiveAt === 0) {
            contactConvo.set('active_at', (0, lodash_1.toNumber)(envelope.timestamp));
        }
        if (contactReceived.isApproved === true) {
            if (!contactConvo.isApproved()) {
                await contactConvo.setIsApproved(Boolean(contactReceived.isApproved));
                await contactConvo.addOutgoingApprovalMessage((0, lodash_1.toNumber)(envelope.timestamp));
            }
            if (contactReceived.didApproveMe === true) {
                await contactConvo.setDidApproveMe(Boolean(contactReceived.didApproveMe));
            }
        }
        if (contactReceived.isBlocked === true) {
            if (contactConvo.isIncomingRequest()) {
                await interactions_1.ConversationInteraction.deleteAllMessagesByConvoIdNoConfirmation(contactConvo.id);
            }
            await util_1.BlockedNumberController.block(contactConvo.id);
        }
        else if (contactReceived.isBlocked === false) {
            await util_1.BlockedNumberController.unblockAll([contactConvo.id]);
        }
        await ProfileManager_1.ProfileManager.updateProfileOfContact(contactConvo.id, profileInDataMessage.displayName || undefined, profileInDataMessage.profilePicture || null, contactReceived.profileKey || null);
    }
    catch (e) {
        sessionjs_logger_1.console.warn('failed to handle  a new closed group from configuration message');
    }
};
async function handleConfigurationMessageLegacy(envelope, configurationMessage) {
    const userConfigLibsession = await releaseFeature_1.ReleasedFeatures.checkIsUserConfigFeatureReleased();
    if (userConfigLibsession && !(0, storage_1.isSignInByLinking)()) {
        sessionjs_logger_1.console.info('useSharedUtilForUserConfig is set, not handling config messages with "handleConfigurationMessageLegacy()"');
        await (0, cache_1.removeFromCache)(envelope);
        return;
    }
    sessionjs_logger_1.console.info('Handling legacy configuration message');
    const ourPubkey = utils_2.UserUtils.getOurPubKeyStrFromCache();
    if (!ourPubkey) {
        return;
    }
    if (envelope.source !== ourPubkey) {
        sessionjs_logger_1.console.info('Dropping configuration change from someone else than us.');
        await (0, cache_1.removeFromCache)(envelope);
        return;
    }
    await handleOurProfileUpdateLegacy(envelope.timestamp, configurationMessage);
    await handleGroupsAndContactsFromConfigMessageLegacy(envelope, configurationMessage);
    await (0, cache_1.removeFromCache)(envelope);
}
exports.ConfigMessageHandler = {
    handleConfigurationMessageLegacy,
    handleConfigMessagesViaLibSession,
};
