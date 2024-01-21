"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConversationController = exports.getConversationController = void 0;
const lodash_1 = require("lodash");
const data_1 = require("../../data/data");
const opengroups_1 = require("../../data/opengroups");
const conversation_1 = require("../../models/conversation");
const util_1 = require("../../util");
const OpenGroupManagerV2_1 = require("../apis/open_group_api/opengroupV2/OpenGroupManagerV2");
const snodePool_1 = require("../apis/snode_api/snodePool");
const types_1 = require("../types");
const conversationInteractions_1 = require("../../interactions/conversationInteractions");
const conversationAttributes_1 = require("../../models/conversationAttributes");
const sqlSharedTypes_1 = require("../../types/sqlSharedTypes");
const libsession_worker_interface_1 = require("../../webworker/workers/browser/libsession_worker_interface");
const ConfigurationSyncJob_1 = require("../utils/job_runners/jobs/ConfigurationSyncJob");
const libsession_utils_1 = require("../utils/libsession/libsession_utils");
const libsession_utils_contacts_1 = require("../utils/libsession/libsession_utils_contacts");
const libsession_utils_convo_info_volatile_1 = require("../utils/libsession/libsession_utils_convo_info_volatile");
const libsession_utils_user_groups_1 = require("../utils/libsession/libsession_utils_user_groups");
const getNetworkTime_1 = require("../apis/snode_api/getNetworkTime");
const __1 = require("..");
const snode_api_1 = require("../apis/snode_api");
const namespaces_1 = require("../apis/snode_api/namespaces");
const ClosedGroupMemberLeftMessage_1 = require("../messages/outgoing/controlMessage/group/ClosedGroupMemberLeftMessage");
const utils_1 = require("../utils");
const closedGroups_1 = require("../../receiver/closedGroups");
const utils_2 = require("../apis/open_group_api/utils");
const sessionjs_logger_1 = require("../../sessionjs-logger");
let instance;
const getConversationController = () => {
    if (instance) {
        return instance;
    }
    instance = new ConversationController();
    return instance;
};
exports.getConversationController = getConversationController;
class ConversationController {
    conversations;
    _initialFetchComplete = false;
    _initialPromise;
    constructor() {
        this.conversations = new conversation_1.ConversationCollection();
    }
    get(id) {
        if (!this._initialFetchComplete) {
            throw new Error('getConversationController().get() needs complete initial fetch');
        }
        return this.conversations.get(id);
    }
    getOrThrow(id) {
        if (!this._initialFetchComplete) {
            throw new Error('getConversationController().get() needs complete initial fetch');
        }
        const convo = this.conversations.get(id);
        if (convo) {
            return convo;
        }
        throw new Error(`Conversation ${id} does not exist on getConversationController().get()`);
    }
    getUnsafe(id) {
        return this.conversations.get(id);
    }
    getOrCreate(id, type) {
        if (typeof id !== 'string') {
            throw new TypeError("'id' must be a string");
        }
        if (type !== conversationAttributes_1.ConversationTypeEnum.PRIVATE &&
            type !== conversationAttributes_1.ConversationTypeEnum.GROUP &&
            type !== conversationAttributes_1.ConversationTypeEnum.GROUPV3) {
            throw new TypeError(`'type' must be 'private' or 'group' or 'groupv3' but got: '${type}'`);
        }
        if (type === conversationAttributes_1.ConversationTypeEnum.GROUPV3 && !types_1.PubKey.isClosedGroupV3(id)) {
            throw new Error('required v3 closed group` ` but the pubkey does not match the 03 prefix for them');
        }
        if (!this._initialFetchComplete) {
            throw new Error('getConversationController().get() needs complete initial fetch');
        }
        if (this.conversations.get(id)) {
            return this.conversations.get(id);
        }
        const conversation = this.conversations.add({
            id,
            type,
        });
        const create = async () => {
            try {
                await conversation.commit();
            }
            catch (error) {
                sessionjs_logger_1.console.error('Conversation save failed! ', id, type, 'Error:', error && error.stack ? error.stack : error);
                throw error;
            }
            sessionjs_logger_1.console.log('[SBOT/redux] conversationActions');
            if (!conversation.isPublic() && conversation.isActive()) {
                void (0, snodePool_1.getSwarmFor)(id);
            }
            return conversation;
        };
        conversation.initialPromise = create();
        return conversation;
    }
    getContactProfileNameOrShortenedPubKey(pubKey) {
        const conversation = (0, exports.getConversationController)().get(pubKey);
        if (!conversation) {
            return pubKey;
        }
        return conversation.getContactProfileNameOrShortenedPubKey();
    }
    async getOrCreateAndWait(id, type) {
        const initialPromise = this._initialPromise !== undefined ? this._initialPromise : Promise.resolve();
        return initialPromise.then(() => {
            if (!id) {
                return Promise.reject(new Error('getOrCreateAndWait: invalid id passed.'));
            }
            const pubkey = id && id.key ? id.key : id;
            const conversation = this.getOrCreate(pubkey, type);
            if (conversation) {
                return conversation.initialPromise.then(() => conversation);
            }
            return Promise.reject(new Error('getOrCreateAndWait: did not get conversation'));
        });
    }
    async deleteBlindedContact(blindedId) {
        if (!this._initialFetchComplete) {
            throw new Error('getConversationController().deleteBlindedContact() needs complete initial fetch');
        }
        if (!types_1.PubKey.isBlinded(blindedId)) {
            throw new Error('deleteBlindedContact allow accepts blinded id');
        }
        sessionjs_logger_1.console.info(`deleteBlindedContact with ${blindedId}`);
        const conversation = this.conversations.get(blindedId);
        if (!conversation) {
            sessionjs_logger_1.console.warn(`deleteBlindedContact no such convo ${blindedId}`);
            return;
        }
        await (0, conversationInteractions_1.deleteAllMessagesByConvoIdNoConfirmation)(conversation.id);
        await conversation.setIsApproved(false, false);
        await conversation.setDidApproveMe(false, false);
        await conversation.commit();
    }
    async deleteClosedGroup(groupId, options) {
        const conversation = await this.deleteConvoInitialChecks(groupId, 'LegacyGroup');
        if (!conversation || !conversation.isClosedGroup()) {
            return;
        }
        sessionjs_logger_1.console.info(`deleteClosedGroup: ${groupId}, sendLeaveMessage?:${options.sendLeaveMessage}`);
        (0, snode_api_1.getSwarmPollingInstance)().removePubkey(groupId);
        if (options.sendLeaveMessage) {
            await leaveClosedGroup(groupId, options.fromSyncMessage);
        }
        await this.removeGroupOrCommunityFromDBAndRedux(groupId);
        await removeLegacyGroupFromWrappers(groupId);
        if (!options.fromSyncMessage) {
            await ConfigurationSyncJob_1.ConfigurationSync.queueNewJobIfNeeded();
        }
    }
    async deleteCommunity(convoId, options) {
        const conversation = await this.deleteConvoInitialChecks(convoId, 'Community');
        if (!conversation || !conversation.isPublic()) {
            return;
        }
        sessionjs_logger_1.console.info('leaving community: ', conversation.id);
        const roomInfos = opengroups_1.OpenGroupData.getV2OpenGroupRoom(conversation.id);
        if (roomInfos) {
            (0, OpenGroupManagerV2_1.getOpenGroupManager)().removeRoomFromPolledRooms(roomInfos);
        }
        await removeCommunityFromWrappers(conversation.id);
        await this.removeGroupOrCommunityFromDBAndRedux(conversation.id);
        if (!options.fromSyncMessage) {
            await ConfigurationSyncJob_1.ConfigurationSync.queueNewJobIfNeeded();
        }
    }
    async delete1o1(id, options) {
        const conversation = await this.deleteConvoInitialChecks(id, '1o1');
        if (!conversation || !conversation.isPrivate()) {
            return;
        }
        if (options.justHidePrivate || (0, lodash_1.isNil)(options.justHidePrivate) || conversation.isMe()) {
            sessionjs_logger_1.console.info(`deleteContact isPrivate, marking as hidden: ${id}`);
            conversation.set({
                priority: conversationAttributes_1.CONVERSATION_PRIORITIES.hidden,
            });
            await conversation.commit();
        }
        else {
            sessionjs_logger_1.console.info(`deleteContact isPrivate, reset fields and removing from wrapper: ${id}`);
            await conversation.setIsApproved(false, false);
            await conversation.setDidApproveMe(false, false);
            conversation.set('active_at', 0);
            await util_1.BlockedNumberController.unblockAll([conversation.id]);
            await conversation.commit();
            if (libsession_utils_contacts_1.SessionUtilContact.isContactToStoreInWrapper(conversation)) {
                sessionjs_logger_1.console.warn('isContactToStoreInWrapper still true for ', conversation.attributes);
            }
            if (conversation.id.startsWith('05')) {
                await libsession_utils_contacts_1.SessionUtilContact.removeContactFromWrapper(conversation.id);
                await libsession_utils_convo_info_volatile_1.SessionUtilConvoInfoVolatile.removeContactFromWrapper(conversation.id);
            }
        }
        if (!options.fromSyncMessage) {
            await ConfigurationSyncJob_1.ConfigurationSync.queueNewJobIfNeeded();
        }
    }
    getConversations() {
        return this.conversations.models;
    }
    async load() {
        if (this.conversations.length) {
            throw new Error('ConversationController: Already loaded!');
        }
        const load = async () => {
            try {
                const startLoad = Date.now();
                const convoModels = await data_1.Data.getAllConversations();
                this.conversations.add(convoModels);
                const start = Date.now();
                const numberOfVariants = libsession_utils_1.LibSessionUtil.requiredUserVariants.length;
                for (let index = 0; index < convoModels.length; index++) {
                    const convo = convoModels[index];
                    for (let wrapperIndex = 0; wrapperIndex < numberOfVariants; wrapperIndex++) {
                        const variant = libsession_utils_1.LibSessionUtil.requiredUserVariants[wrapperIndex];
                        switch (variant) {
                            case 'UserConfig':
                            case 'UserGroupsConfig':
                                break;
                            case 'ContactsConfig':
                                if (libsession_utils_contacts_1.SessionUtilContact.isContactToStoreInWrapper(convo)) {
                                    await libsession_utils_contacts_1.SessionUtilContact.refreshMappedValue(convo.id, true);
                                }
                                break;
                            case 'ConvoInfoVolatileConfig':
                                if (libsession_utils_convo_info_volatile_1.SessionUtilConvoInfoVolatile.isConvoToStoreInWrapper(convo)) {
                                    await libsession_utils_convo_info_volatile_1.SessionUtilConvoInfoVolatile.refreshConvoVolatileCached(convo.id, Boolean(convo.isClosedGroup() && convo.id.startsWith('05')), true);
                                    await convo.refreshInMemoryDetails();
                                }
                                break;
                            default:
                                (0, sqlSharedTypes_1.assertUnreachable)(variant, `ConversationController: load() unhandled case "${variant}"`);
                        }
                    }
                }
                sessionjs_logger_1.console.info(`refreshAllWrappersMappedValues took ${Date.now() - start}ms`);
                this._initialFetchComplete = true;
                sessionjs_logger_1.console.info(`ConversationController: done with initial fetch in ${Date.now() - startLoad}ms.`);
            }
            catch (error) {
                sessionjs_logger_1.console.error('ConversationController: initial fetch failed', error && error.stack ? error.stack : error);
                throw error;
            }
        };
        await util_1.BlockedNumberController.load();
        this._initialPromise = load();
        return this._initialPromise;
    }
    loadPromise() {
        return this._initialPromise;
    }
    reset() {
        this._initialPromise = Promise.resolve();
        this._initialFetchComplete = false;
        this.conversations.reset([]);
    }
    async deleteConvoInitialChecks(convoId, deleteType) {
        if (!this._initialFetchComplete) {
            throw new Error(`getConversationController.${deleteType}  needs complete initial fetch`);
        }
        sessionjs_logger_1.console.info(`${deleteType} with ${convoId}`);
        const conversation = this.conversations.get(convoId);
        if (!conversation) {
            sessionjs_logger_1.console.warn(`${deleteType} no such convo ${convoId}`);
            return null;
        }
        sessionjs_logger_1.console.info(`${deleteType} destroyingMessages: ${convoId}`);
        await (0, conversationInteractions_1.deleteAllMessagesByConvoIdNoConfirmation)(convoId);
        sessionjs_logger_1.console.info(`${deleteType} messages destroyed: ${convoId}`);
        return conversation;
    }
    async removeGroupOrCommunityFromDBAndRedux(convoId) {
        sessionjs_logger_1.console.info(`cleanUpGroupConversation, removing convo from DB: ${convoId}`);
        await data_1.Data.removeConversation(convoId);
        if (convoId && utils_2.OpenGroupUtils.isOpenGroupV2(convoId)) {
            try {
                await opengroups_1.OpenGroupData.removeV2OpenGroupRoom(convoId);
            }
            catch (e) {
                sessionjs_logger_1.console.info('removeV2OpenGroupRoom failed:', e);
            }
        }
        sessionjs_logger_1.console.info(`cleanUpGroupConversation, convo removed from DB: ${convoId}`);
        const conversation = this.conversations.get(convoId);
        if (conversation) {
            this.conversations.remove(conversation);
            sessionjs_logger_1.console.log('[SBOT/redux] conversationActions');
        }
        sessionjs_logger_1.console.log('[SBOT/redux] conversationActions');
        sessionjs_logger_1.console.info(`cleanUpGroupConversation, convo removed from store: ${convoId}`);
    }
}
exports.ConversationController = ConversationController;
async function leaveClosedGroup(groupId, fromSyncMessage) {
    const convo = (0, exports.getConversationController)().get(groupId);
    if (!convo || !convo.isClosedGroup()) {
        sessionjs_logger_1.console.error('Cannot leave non-existing group');
        return;
    }
    const ourNumber = utils_1.UserUtils.getOurPubKeyStrFromCache();
    const isCurrentUserAdmin = convo.get('groupAdmins')?.includes(ourNumber);
    let members = [];
    let admins = [];
    if (isCurrentUserAdmin) {
        sessionjs_logger_1.console.info('Admin left a closed group. We need to destroy it');
        convo.set({ left: true });
        members = [];
        admins = [];
    }
    else {
        convo.set({ left: true });
        members = (convo.get('members') || []).filter((m) => m !== ourNumber);
        admins = convo.get('groupAdmins') || [];
    }
    convo.set({ members });
    await convo.updateGroupAdmins(admins, false);
    await convo.commit();
    const networkTimestamp = getNetworkTime_1.GetNetworkTime.getNowWithNetworkOffset();
    (0, snode_api_1.getSwarmPollingInstance)().removePubkey(groupId);
    if (fromSyncMessage) {
        return;
    }
    const keypair = await data_1.Data.getLatestClosedGroupEncryptionKeyPair(groupId);
    if (!keypair || (0, lodash_1.isEmpty)(keypair) || (0, lodash_1.isEmpty)(keypair.publicHex) || (0, lodash_1.isEmpty)(keypair.privateHex)) {
        return;
    }
    const ourLeavingMessage = new ClosedGroupMemberLeftMessage_1.ClosedGroupMemberLeftMessage({
        timestamp: networkTimestamp,
        groupId,
    });
    sessionjs_logger_1.console.info(`We are leaving the group ${groupId}. Sending our leaving message.`);
    const wasSent = await (0, __1.getMessageQueue)().sendToPubKeyNonDurably({
        message: ourLeavingMessage,
        namespace: namespaces_1.SnodeNamespaces.ClosedGroupMessage,
        pubkey: types_1.PubKey.cast(groupId),
    });
    if (wasSent) {
        sessionjs_logger_1.console.info(`Leaving message sent ${groupId}. Removing everything related to this group.`);
    }
    else {
        sessionjs_logger_1.console.info(`Leaving message failed to be sent for ${groupId}. But still removing everything related to this group....`);
    }
}
async function removeLegacyGroupFromWrappers(groupId) {
    (0, snode_api_1.getSwarmPollingInstance)().removePubkey(groupId);
    await libsession_worker_interface_1.UserGroupsWrapperActions.eraseLegacyGroup(groupId);
    await libsession_utils_convo_info_volatile_1.SessionUtilConvoInfoVolatile.removeLegacyGroupFromWrapper(groupId);
    await (0, closedGroups_1.removeAllClosedGroupEncryptionKeyPairs)(groupId);
}
async function removeCommunityFromWrappers(conversationId) {
    if (!conversationId || !utils_2.OpenGroupUtils.isOpenGroupV2(conversationId)) {
        return;
    }
    try {
        const fromWrapper = await libsession_worker_interface_1.UserGroupsWrapperActions.getCommunityByFullUrl(conversationId);
        if (fromWrapper?.fullUrlWithPubkey) {
            await libsession_utils_convo_info_volatile_1.SessionUtilConvoInfoVolatile.removeCommunityFromWrapper(conversationId, fromWrapper.fullUrlWithPubkey);
        }
    }
    catch (e) {
        sessionjs_logger_1.console.info('SessionUtilConvoInfoVolatile.removeCommunityFromWrapper failed:', e.message);
    }
    try {
        await libsession_utils_user_groups_1.SessionUtilUserGroups.removeCommunityFromWrapper(conversationId, conversationId);
    }
    catch (e) {
        sessionjs_logger_1.console.info('SessionUtilUserGroups.removeCommunityFromWrapper failed:', e.message);
    }
}
