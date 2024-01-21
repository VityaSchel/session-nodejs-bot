"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasValidIncomingRequestValues = exports.hasValidOutgoingRequestValues = exports.ConversationCollection = exports.commitConversationAndRefreshWrapper = exports.ConversationModel = void 0;
const auto_bind_1 = __importDefault(require("auto-bind"));
const backbone_1 = __importDefault(require("backbone"));
const lodash_1 = require("lodash");
const libsodium_wrappers_sumo_1 = require("libsodium-wrappers-sumo");
const sessionjs_logger_1 = require("../sessionjs-logger");
const protobuf_1 = require("../protobuf");
const session_1 = require("../session");
const conversations_1 = require("../session/conversations");
const ClosedGroupVisibleMessage_1 = require("../session/messages/outgoing/visibleMessage/ClosedGroupVisibleMessage");
const types_1 = require("../session/types");
const utils_1 = require("../session/utils");
const util_1 = require("../util");
const message_1 = require("./message");
const messageType_1 = require("./messageType");
const data_1 = require("../data/data");
const utils_2 = require("../session/apis/open_group_api/utils");
const OpenGroupUtils_1 = require("../session/apis/open_group_api/utils/OpenGroupUtils");
const ExpirationTimerUpdateMessage_1 = require("../session/messages/outgoing/controlMessage/ExpirationTimerUpdateMessage");
const ReadReceiptMessage_1 = require("../session/messages/outgoing/controlMessage/receipt/ReadReceiptMessage");
const TypingMessage_1 = require("../session/messages/outgoing/controlMessage/TypingMessage");
const GroupInvitationMessage_1 = require("../session/messages/outgoing/visibleMessage/GroupInvitationMessage");
const OpenGroupVisibleMessage_1 = require("../session/messages/outgoing/visibleMessage/OpenGroupVisibleMessage");
const VisibleMessage_1 = require("../session/messages/outgoing/visibleMessage/VisibleMessage");
const Performance_1 = require("../session/utils/Performance");
const String_1 = require("../session/utils/String");
const TaskWithTimeout_1 = require("../session/utils/TaskWithTimeout");
const opengroups_1 = require("../data/opengroups");
const settings_key_1 = require("../data/settings-key");
const knownBlindedkeys_1 = require("../session/apis/open_group_api/sogsv3/knownBlindedkeys");
const sogsBlinding_1 = require("../session/apis/open_group_api/sogsv3/sogsBlinding");
const sogsV3FetchFile_1 = require("../session/apis/open_group_api/sogsv3/sogsV3FetchFile");
const getNetworkTime_1 = require("../session/apis/snode_api/getNetworkTime");
const namespaces_1 = require("../session/apis/snode_api/namespaces");
const crypto_1 = require("../session/crypto");
const BufferPadding_1 = require("../session/crypto/BufferPadding");
const DecryptedAttachmentsManager_1 = require("../session/crypto/DecryptedAttachmentsManager");
const MessageRequestResponse_1 = require("../session/messages/outgoing/controlMessage/MessageRequestResponse");
const onionPath_1 = require("../session/onions/onionPath");
const ConfigurationSyncJob_1 = require("../session/utils/job_runners/jobs/ConfigurationSyncJob");
const libsession_utils_contacts_1 = require("../session/utils/libsession/libsession_utils_contacts");
const libsession_utils_convo_info_volatile_1 = require("../session/utils/libsession/libsession_utils_convo_info_volatile");
const libsession_utils_user_groups_1 = require("../session/utils/libsession/libsession_utils_user_groups");
const syncUtils_1 = require("../session/utils/sync/syncUtils");
const User_1 = require("../session/utils/User");
const MessageAttachment_1 = require("../types/MessageAttachment");
const MIME_1 = require("../types/MIME");
const sqlSharedTypes_1 = require("../types/sqlSharedTypes");
const reactions_1 = require("../util/reactions");
const registration_1 = require("../util/registration");
const storage_1 = require("../util/storage");
const conversationAttributes_1 = require("./conversationAttributes");
const libsession_utils_1 = require("../session/utils/libsession/libsession_utils");
const libsession_utils_user_profile_1 = require("../session/utils/libsession/libsession_utils_user_profile");
const messageFactory_1 = require("./messageFactory");
const inMemoryConvoInfos = new Map();
class ConversationModel extends backbone_1.default.Model {
    updateLastMessage;
    throttledBumpTyping;
    throttledNotify;
    markConversationRead;
    initialPromise;
    typingRefreshTimer;
    typingPauseTimer;
    typingTimer;
    pending;
    constructor(attributes) {
        super((0, conversationAttributes_1.fillConvoAttributesWithDefaults)(attributes));
        this.initialPromise = Promise.resolve();
        (0, auto_bind_1.default)(this);
        this.throttledBumpTyping = (0, lodash_1.throttle)(this.bumpTyping, 300);
        this.updateLastMessage = (0, lodash_1.throttle)(this.bouncyUpdateLastMessage.bind(this), 1000, {
            trailing: true,
            leading: true,
        });
        this.throttledNotify = (0, lodash_1.debounce)(this.notify, 2000, { maxWait: 2000, trailing: true });
        this.markConversationRead = (0, lodash_1.debounce)(this.markConversationReadBouncy, 1000, {
            leading: true,
            trailing: true,
        });
        this.typingRefreshTimer = null;
        this.typingPauseTimer = null;
    }
    idForLogging() {
        if (this.isPrivate()) {
            return this.id;
        }
        if (this.isPublic()) {
            return this.id;
        }
        return `group(${(0, onionPath_1.ed25519Str)(this.id)})`;
    }
    isMe() {
        return utils_1.UserUtils.isUsFromCache(this.id);
    }
    isPublic() {
        return this.isOpenGroupV2();
    }
    isOpenGroupV2() {
        return utils_2.OpenGroupUtils.isOpenGroupV2(this.id);
    }
    isClosedGroup() {
        return Boolean((this.get('type') === conversationAttributes_1.ConversationTypeEnum.GROUP && this.id.startsWith('05')) ||
            (this.get('type') === conversationAttributes_1.ConversationTypeEnum.GROUPV3 && this.id.startsWith('03')));
    }
    isPrivate() {
        return (0, conversationAttributes_1.isDirectConversation)(this.get('type'));
    }
    isGroup() {
        return (0, conversationAttributes_1.isOpenOrClosedGroup)(this.get('type'));
    }
    isBlocked() {
        if (!this.id || this.isMe()) {
            return false;
        }
        if (this.isPrivate() || this.isClosedGroup()) {
            return util_1.BlockedNumberController.isBlocked(this.id);
        }
        return false;
    }
    isActive() {
        return Boolean(this.get('active_at'));
    }
    isHidden() {
        const priority = this.get('priority') || conversationAttributes_1.CONVERSATION_PRIORITIES.default;
        return this.isPrivate() && priority === conversationAttributes_1.CONVERSATION_PRIORITIES.hidden;
    }
    async cleanup() {
        await (0, MessageAttachment_1.deleteExternalFilesOfConversation)(this.attributes);
    }
    getGroupAdmins() {
        const groupAdmins = this.get('groupAdmins');
        return groupAdmins && groupAdmins.length > 0 ? groupAdmins : [];
    }
    getConversationModelProps() {
        const isPublic = this.isPublic();
        const ourNumber = utils_1.UserUtils.getOurPubKeyStrFromCache();
        const avatarPath = this.getAvatarPath();
        const isPrivate = this.isPrivate();
        const weAreAdmin = this.isAdmin(ourNumber);
        const currentNotificationSetting = this.get('triggerNotificationsFor');
        const priorityFromDb = this.get('priority');
        const toRet = {
            id: this.id,
            activeAt: this.get('active_at'),
            type: this.get('type'),
        };
        if ((0, lodash_1.isFinite)(priorityFromDb) && priorityFromDb !== conversationAttributes_1.CONVERSATION_PRIORITIES.default) {
            toRet.priority = priorityFromDb;
        }
        if (this.get('markedAsUnread')) {
            toRet.isMarkedUnread = !!this.get('markedAsUnread');
        }
        const blocksSogsMsgReqsTimestamp = this.get('blocksSogsMsgReqsTimestamp');
        if (blocksSogsMsgReqsTimestamp) {
            toRet.blocksSogsMsgReqsTimestamp = blocksSogsMsgReqsTimestamp;
        }
        if (isPrivate) {
            toRet.isPrivate = true;
            if (this.typingTimer) {
                toRet.isTyping = true;
            }
            if (this.isMe()) {
                toRet.isMe = true;
            }
            const foundContact = libsession_utils_contacts_1.SessionUtilContact.getContactCached(this.id);
            if (!toRet.activeAt && foundContact && (0, lodash_1.isFinite)(foundContact.createdAtSeconds)) {
                toRet.activeAt = foundContact.createdAtSeconds * 1000;
            }
        }
        if (weAreAdmin) {
            toRet.weAreAdmin = true;
        }
        if (isPublic) {
            toRet.isPublic = true;
        }
        if (avatarPath) {
            toRet.avatarPath = avatarPath;
        }
        if (currentNotificationSetting &&
            currentNotificationSetting !== conversationAttributes_1.ConversationNotificationSetting[0]) {
            toRet.currentNotificationSetting = currentNotificationSetting;
        }
        if (this.get('displayNameInProfile')) {
            toRet.displayNameInProfile = this.get('displayNameInProfile');
        }
        if (this.get('nickname')) {
            toRet.nickname = this.get('nickname');
        }
        if (util_1.BlockedNumberController.isBlocked(this.id)) {
            toRet.isBlocked = true;
        }
        if (this.get('didApproveMe')) {
            toRet.didApproveMe = this.get('didApproveMe');
        }
        if (this.get('isApproved')) {
            toRet.isApproved = this.get('isApproved');
        }
        if (this.get('expireTimer')) {
            toRet.expireTimer = this.get('expireTimer');
        }
        if (this.isClosedGroup()) {
            toRet.members = this.get('members') || [];
        }
        if (this.isClosedGroup() || this.isPublic()) {
            toRet.groupAdmins = this.getGroupAdmins();
        }
        if (this.isClosedGroup()) {
            if (this.get('isKickedFromGroup')) {
                toRet.isKickedFromGroup = this.get('isKickedFromGroup');
            }
            if (this.get('left')) {
                toRet.left = this.get('left');
            }
            const zombies = this.get('zombies') || [];
            if (zombies?.length) {
                toRet.zombies = (0, lodash_1.uniq)(zombies);
            }
        }
        const inMemoryConvoInfo = inMemoryConvoInfos.get(this.id);
        if (inMemoryConvoInfo) {
            if (inMemoryConvoInfo.unreadCount) {
                toRet.unreadCount = inMemoryConvoInfo.unreadCount;
            }
            if (inMemoryConvoInfo.mentionedUs) {
                toRet.mentionedUs = inMemoryConvoInfo.mentionedUs;
            }
        }
        const lastMessageText = this.get('lastMessage');
        if (lastMessageText && lastMessageText.length) {
            const lastMessageStatus = this.get('lastMessageStatus');
            toRet.lastMessage = {
                status: lastMessageStatus,
                text: lastMessageText,
            };
        }
        return toRet;
    }
    async updateGroupAdmins(groupAdmins, shouldCommit) {
        const sortedNewAdmins = (0, lodash_1.uniq)((0, lodash_1.sortBy)(groupAdmins));
        if (!(0, lodash_1.xor)(this.getGroupAdmins(), groupAdmins).length) {
            return false;
        }
        this.set({ groupAdmins: sortedNewAdmins });
        if (shouldCommit) {
            await this.commit();
        }
        return true;
    }
    async refreshInMemoryDetails(providedMemoryDetails) {
        if (!libsession_utils_convo_info_volatile_1.SessionUtilConvoInfoVolatile.isConvoToStoreInWrapper(this)) {
            return;
        }
        const memoryDetails = providedMemoryDetails || (await data_1.Data.fetchConvoMemoryDetails(this.id));
        if (!memoryDetails) {
            inMemoryConvoInfos.delete(this.id);
            return;
        }
        if (!inMemoryConvoInfos.get(this.id)) {
            inMemoryConvoInfos.set(this.id, {
                mentionedUs: false,
                unreadCount: 0,
            });
        }
        const existing = inMemoryConvoInfos.get(this.id);
        if (!existing) {
            return;
        }
        let changes = false;
        if (existing.unreadCount !== memoryDetails.unreadCount) {
            existing.unreadCount = memoryDetails.unreadCount;
            changes = true;
        }
        if (existing.mentionedUs !== memoryDetails.mentionedUs) {
            existing.mentionedUs = memoryDetails.mentionedUs;
            changes = true;
        }
        if (changes) {
            this.triggerUIRefresh();
        }
    }
    async queueJob(callback) {
        const previous = this.pending || Promise.resolve();
        const taskWithTimeout = (0, TaskWithTimeout_1.createTaskWithTimeout)(callback, `conversation ${this.idForLogging()}`);
        this.pending = previous.then(taskWithTimeout, taskWithTimeout);
        const current = this.pending;
        void current.then(() => {
            if (this.pending === current) {
                delete this.pending;
            }
        });
        return current;
    }
    async makeQuote(quotedMessage) {
        const attachments = quotedMessage.get('attachments');
        const preview = quotedMessage.get('preview');
        const body = quotedMessage.get('body');
        const quotedAttachments = await this.getQuoteAttachment(attachments, preview);
        if (!quotedMessage.get('sent_at')) {
            sessionjs_logger_1.console.warn('tried to make a quote without a sent_at timestamp');
            return null;
        }
        let msgSource = quotedMessage.getSource();
        if (this.isPublic()) {
            const room = opengroups_1.OpenGroupData.getV2OpenGroupRoom(this.id);
            if (room && (0, sqlSharedTypes_1.roomHasBlindEnabled)(room) && msgSource === utils_1.UserUtils.getOurPubKeyStrFromCache()) {
                const sodium = await (0, crypto_1.getSodiumRenderer)();
                msgSource = await (0, knownBlindedkeys_1.findCachedOurBlindedPubkeyOrLookItUp)(room.serverPublicKey, sodium);
            }
        }
        return {
            author: msgSource,
            id: `${quotedMessage.get('sent_at')}` || '',
            text: body,
            attachments: quotedAttachments,
            timestamp: quotedMessage.get('sent_at') || 0,
            convoId: this.id,
        };
    }
    toOpenGroupV2() {
        if (!this.isOpenGroupV2()) {
            throw new Error('tried to run toOpenGroup for not public group v2');
        }
        return (0, OpenGroupUtils_1.getOpenGroupV2FromConversationId)(this.id);
    }
    async sendReactionJob(sourceMessage, reaction) {
        try {
            const destination = this.id;
            const sentAt = sourceMessage.get('sent_at');
            if (!sentAt) {
                throw new Error('sendReactMessageJob() sent_at must be set.');
            }
            const chatMessageParams = {
                body: '',
                timestamp: getNetworkTime_1.GetNetworkTime.getNowWithNetworkOffset(),
                reaction,
                lokiProfile: utils_1.UserUtils.getOurProfile(),
            };
            const shouldApprove = !this.isApproved() && this.isPrivate();
            const incomingMessageCount = await data_1.Data.getMessageCountByType(this.id, messageType_1.MessageDirection.incoming);
            const hasIncomingMessages = incomingMessageCount > 0;
            if (types_1.PubKey.isBlinded(this.id)) {
                sessionjs_logger_1.console.info('Sending a blinded message react to this user: ', this.id);
                await this.sendBlindedMessageRequest(chatMessageParams);
                return;
            }
            if (shouldApprove) {
                await this.setIsApproved(true);
                if (hasIncomingMessages) {
                    await this.addOutgoingApprovalMessage(Date.now());
                    if (!this.didApproveMe()) {
                        await this.setDidApproveMe(true);
                    }
                    await this.sendMessageRequestResponse();
                    void (0, syncUtils_1.forceSyncConfigurationNowIfNeeded)();
                }
            }
            if (this.isOpenGroupV2()) {
                const chatMessageOpenGroupV2 = new OpenGroupVisibleMessage_1.OpenGroupVisibleMessage(chatMessageParams);
                const roomInfos = this.toOpenGroupV2();
                if (!roomInfos) {
                    throw new Error('Could not find this room in db');
                }
                const openGroup = opengroups_1.OpenGroupData.getV2OpenGroupRoom(this.id);
                const blinded = Boolean((0, sqlSharedTypes_1.roomHasBlindEnabled)(openGroup));
                await (0, session_1.getMessageQueue)().sendToOpenGroupV2({
                    message: chatMessageOpenGroupV2,
                    roomInfos,
                    blinded,
                    filesToLink: [],
                });
                return;
            }
            const destinationPubkey = new types_1.PubKey(destination);
            if (this.isPrivate()) {
                const chatMessageMe = new VisibleMessage_1.VisibleMessage({
                    ...chatMessageParams,
                    syncTarget: this.id,
                });
                await (0, session_1.getMessageQueue)().sendSyncMessage({
                    namespace: namespaces_1.SnodeNamespaces.UserMessages,
                    message: chatMessageMe,
                });
                const chatMessagePrivate = new VisibleMessage_1.VisibleMessage(chatMessageParams);
                await (0, session_1.getMessageQueue)().sendToPubKey(destinationPubkey, chatMessagePrivate, namespaces_1.SnodeNamespaces.UserMessages);
                await reactions_1.Reactions.handleMessageReaction({
                    reaction,
                    sender: utils_1.UserUtils.getOurPubKeyStrFromCache(),
                    you: true,
                });
                return;
            }
            if (this.isClosedGroup()) {
                const chatMessageMediumGroup = new VisibleMessage_1.VisibleMessage(chatMessageParams);
                const closedGroupVisibleMessage = new ClosedGroupVisibleMessage_1.ClosedGroupVisibleMessage({
                    chatMessage: chatMessageMediumGroup,
                    groupId: destination,
                });
                await (0, session_1.getMessageQueue)().sendToGroup({
                    message: closedGroupVisibleMessage,
                    namespace: namespaces_1.SnodeNamespaces.ClosedGroupMessage,
                });
                await reactions_1.Reactions.handleMessageReaction({
                    reaction,
                    sender: utils_1.UserUtils.getOurPubKeyStrFromCache(),
                    you: true,
                });
                return;
            }
            throw new TypeError(`Invalid conversation type: '${this.get('type')}'`);
        }
        catch (e) {
            sessionjs_logger_1.console.error(`Reaction job failed id:${reaction.id} error:`, e);
        }
    }
    isIncomingRequest() {
        return hasValidIncomingRequestValues({
            isMe: this.isMe(),
            isApproved: this.isApproved(),
            isBlocked: this.isBlocked(),
            isPrivate: this.isPrivate(),
            activeAt: this.get('active_at'),
            didApproveMe: this.didApproveMe(),
        });
    }
    isOutgoingRequest() {
        return hasValidOutgoingRequestValues({
            isMe: this.isMe() || false,
            isApproved: this.isApproved() || false,
            didApproveMe: this.didApproveMe() || false,
            isBlocked: this.isBlocked() || false,
            isPrivate: this.isPrivate() || false,
            activeAt: this.get('active_at') || 0,
        });
    }
    async addOutgoingApprovalMessage(timestamp) {
        await this.addSingleOutgoingMessage({
            sent_at: timestamp,
            messageRequestResponse: {
                isApproved: 1,
            },
            expireTimer: 0,
        });
        this.updateLastMessage();
    }
    async addIncomingApprovalMessage(timestamp, source) {
        await this.addSingleIncomingMessage({
            sent_at: timestamp,
            source,
            messageRequestResponse: {
                isApproved: 1,
            },
            unread: conversationAttributes_1.READ_MESSAGE_STATE.unread,
            expireTimer: 0,
        });
        this.updateLastMessage();
    }
    async sendMessageRequestResponse() {
        if (!this.isPrivate()) {
            return;
        }
        const timestamp = Date.now();
        const messageRequestResponseParams = {
            timestamp,
            lokiProfile: utils_1.UserUtils.getOurProfile(),
        };
        const messageRequestResponse = new MessageRequestResponse_1.MessageRequestResponse(messageRequestResponseParams);
        const pubkeyForSending = new types_1.PubKey(this.id);
        await (0, session_1.getMessageQueue)()
            .sendToPubKey(pubkeyForSending, messageRequestResponse, namespaces_1.SnodeNamespaces.UserMessages)
            .catch(sessionjs_logger_1.console.error);
    }
    async sendMessage(msg) {
        const { attachments, body, groupInvitation, preview, quote } = msg;
        this.clearTypingTimers();
        const expireTimer = this.get('expireTimer');
        const networkTimestamp = getNetworkTime_1.GetNetworkTime.getNowWithNetworkOffset();
        sessionjs_logger_1.console.info('Sending message to conversation', this.idForLogging(), 'with networkTimestamp: ', networkTimestamp);
        const messageModel = await this.addSingleOutgoingMessage({
            body,
            quote: (0, lodash_1.isEmpty)(quote) ? undefined : quote,
            preview,
            attachments,
            sent_at: networkTimestamp,
            expireTimer,
            serverTimestamp: this.isPublic() ? networkTimestamp : undefined,
            groupInvitation,
        });
        this.set({
            lastMessage: messageModel.getNotificationText(),
            lastMessageStatus: 'sending',
            active_at: networkTimestamp,
        });
        await this.commit();
        void this.queueJob(async () => {
            await this.sendMessageJob(messageModel, expireTimer);
        });
    }
    async sendReaction(sourceId, reaction) {
        const sourceMessage = await data_1.Data.getMessageById(sourceId);
        if (!sourceMessage) {
            return;
        }
        void this.queueJob(async () => {
            await this.sendReactionJob(sourceMessage, reaction);
        });
    }
    async updateExpireTimer(providedExpireTimer, providedSource, receivedAt, options = {}, shouldCommit = true) {
        let expireTimer = providedExpireTimer;
        let source = providedSource;
        (0, lodash_1.defaults)(options, { fromSync: false });
        if (!expireTimer) {
            expireTimer = 0;
        }
        if (this.get('expireTimer') === expireTimer || (!expireTimer && !this.get('expireTimer'))) {
            return;
        }
        sessionjs_logger_1.console.info("Update conversation 'expireTimer'", {
            id: this.idForLogging(),
            expireTimer,
            source,
        });
        const isOutgoing = Boolean(!receivedAt);
        source = source || utils_1.UserUtils.getOurPubKeyStrFromCache();
        const timestamp = (receivedAt || Date.now()) - 1;
        this.set({ expireTimer });
        const commonAttributes = {
            flags: protobuf_1.SignalService.DataMessage.Flags.EXPIRATION_TIMER_UPDATE,
            expirationTimerUpdate: {
                expireTimer,
                source,
                fromSync: options.fromSync,
            },
            expireTimer: 0,
        };
        let message;
        if (isOutgoing) {
            message = await this.addSingleOutgoingMessage({
                ...commonAttributes,
                sent_at: timestamp,
            });
        }
        else {
            message = await this.addSingleIncomingMessage({
                ...commonAttributes,
                unread: conversationAttributes_1.READ_MESSAGE_STATE.unread,
                source,
                sent_at: timestamp,
                received_at: timestamp,
            });
        }
        if (this.isActive()) {
            this.set('active_at', timestamp);
        }
        if (shouldCommit) {
            await this.commit();
        }
        if (receivedAt) {
            return;
        }
        const expireUpdate = {
            identifier: message.id,
            timestamp,
            expireTimer: expireTimer || null,
        };
        if (this.isMe()) {
            const expirationTimerMessage = new ExpirationTimerUpdateMessage_1.ExpirationTimerUpdateMessage(expireUpdate);
            await message.sendSyncMessageOnly(expirationTimerMessage);
            return;
        }
        if (this.isPrivate()) {
            const expirationTimerMessage = new ExpirationTimerUpdateMessage_1.ExpirationTimerUpdateMessage(expireUpdate);
            const pubkey = new types_1.PubKey(this.get('id'));
            await (0, session_1.getMessageQueue)().sendToPubKey(pubkey, expirationTimerMessage, namespaces_1.SnodeNamespaces.UserMessages);
        }
        else {
            sessionjs_logger_1.console.warn('TODO: Expiration update for closed groups are to be updated');
            const expireUpdateForGroup = {
                ...expireUpdate,
                groupId: this.get('id'),
            };
            const expirationTimerMessage = new ExpirationTimerUpdateMessage_1.ExpirationTimerUpdateMessage(expireUpdateForGroup);
            await (0, session_1.getMessageQueue)().sendToGroup({
                message: expirationTimerMessage,
                namespace: namespaces_1.SnodeNamespaces.ClosedGroupMessage,
            });
        }
    }
    triggerUIRefresh() {
        updatesToDispatch.set(this.id, this.getConversationModelProps());
        throttledAllConversationsDispatch();
    }
    async commit() {
        (0, Performance_1.perfStart)(`conversationCommit-${this.id}`);
        await commitConversationAndRefreshWrapper(this.id);
        (0, Performance_1.perfEnd)(`conversationCommit-${this.id}`, 'conversationCommit');
    }
    async addSingleOutgoingMessage(messageAttributes) {
        let sender = utils_1.UserUtils.getOurPubKeyStrFromCache();
        if (this.isPublic()) {
            const openGroup = opengroups_1.OpenGroupData.getV2OpenGroupRoom(this.id);
            if (openGroup && openGroup.serverPublicKey && (0, sqlSharedTypes_1.roomHasBlindEnabled)(openGroup)) {
                const signingKeys = await utils_1.UserUtils.getUserED25519KeyPairBytes();
                if (!signingKeys) {
                    throw new Error('addSingleOutgoingMessage: getUserED25519KeyPairBytes returned nothing');
                }
                const sodium = await (0, crypto_1.getSodiumRenderer)();
                const ourBlindedPubkeyForCurrentSogs = await (0, knownBlindedkeys_1.findCachedOurBlindedPubkeyOrLookItUp)(openGroup.serverPublicKey, sodium);
                if (ourBlindedPubkeyForCurrentSogs) {
                    sender = ourBlindedPubkeyForCurrentSogs;
                }
            }
        }
        return this.addSingleMessage({
            ...messageAttributes,
            conversationId: this.id,
            source: sender,
            type: 'outgoing',
            direction: 'outgoing',
            unread: conversationAttributes_1.READ_MESSAGE_STATE.read,
            received_at: messageAttributes.sent_at,
        });
    }
    async addSingleIncomingMessage(messageAttributes) {
        if (this.isPrivate()) {
            await this.setDidApproveMe(true);
        }
        const toBeAddedAttributes = {
            ...messageAttributes,
            conversationId: this.id,
            type: 'incoming',
            direction: 'outgoing',
        };
        (0, messageFactory_1.markAttributesAsReadIfNeeded)(toBeAddedAttributes);
        return this.addSingleMessage(toBeAddedAttributes);
    }
    async markAllAsRead() {
        const expireTimerSet = !!this.get('expireTimer');
        const isOpenGroup = this.isOpenGroupV2();
        if (isOpenGroup || !expireTimerSet) {
            const allReadMessagesIds = await data_1.Data.markAllAsReadByConversationNoExpiration(this.id, !isOpenGroup);
            await this.markAsUnread(false, false);
            await this.commit();
            if (allReadMessagesIds.length) {
                await this.sendReadReceiptsIfNeeded((0, lodash_1.uniq)(allReadMessagesIds));
            }
            sessionjs_logger_1.console.log('[SBOT/redux] markConversationFullyRead');
            return;
        }
        await this.markConversationReadBouncy(Date.now());
    }
    getUsInThatConversation() {
        const usInThatConversation = (0, knownBlindedkeys_1.getUsBlindedInThatServer)(this) || utils_1.UserUtils.getOurPubKeyStrFromCache();
        return usInThatConversation;
    }
    async sendReadReceiptsIfNeeded(timestamps) {
        if (!this.isPrivate() || !timestamps.length) {
            return;
        }
        const settingsReadReceiptEnabled = storage_1.Storage.get(settings_key_1.SettingsKey.settingsReadReceipt) || false;
        const sendReceipt = settingsReadReceiptEnabled && !this.isBlocked() && !this.isIncomingRequest();
        if (sendReceipt) {
            sessionjs_logger_1.console.info(`Sending ${timestamps.length} read receipts.`);
            const receiptMessage = new ReadReceiptMessage_1.ReadReceiptMessage({
                timestamp: Date.now(),
                timestamps,
            });
            const device = new types_1.PubKey(this.id);
            await (0, session_1.getMessageQueue)().sendToPubKey(device, receiptMessage, namespaces_1.SnodeNamespaces.UserMessages);
        }
    }
    async setNickname(nickname, shouldCommit = false) {
        if (!this.isPrivate()) {
            sessionjs_logger_1.console.info('cannot setNickname to a non private conversation.');
            return;
        }
        const trimmed = nickname && nickname.trim();
        if (this.get('nickname') === trimmed) {
            return;
        }
        const realUserName = this.getRealSessionUsername();
        if (!trimmed || !trimmed.length) {
            this.set({ nickname: undefined, displayNameInProfile: realUserName });
        }
        else {
            this.set({ nickname: trimmed, displayNameInProfile: realUserName });
        }
        if (shouldCommit) {
            await this.commit();
        }
    }
    async setSessionProfile(newProfile) {
        let changes = false;
        const existingSessionName = this.getRealSessionUsername();
        if (newProfile.displayName !== existingSessionName && newProfile.displayName) {
            this.set({
                displayNameInProfile: newProfile.displayName,
            });
            changes = true;
        }
        if (newProfile.avatarPath) {
            const originalAvatar = this.get('avatarInProfile');
            if (!(0, lodash_1.isEqual)(originalAvatar, newProfile.avatarPath)) {
                this.set({ avatarInProfile: newProfile.avatarPath });
                changes = true;
            }
            const existingImageId = this.get('avatarImageId');
            if (existingImageId !== newProfile.avatarImageId) {
                this.set({ avatarImageId: newProfile.avatarImageId });
                changes = true;
            }
        }
        if (changes) {
            await this.commit();
        }
    }
    setSessionDisplayNameNoCommit(newDisplayName) {
        const existingSessionName = this.getRealSessionUsername();
        if (newDisplayName !== existingSessionName && newDisplayName) {
            this.set({ displayNameInProfile: newDisplayName });
        }
    }
    getRealSessionUsername() {
        return this.get('displayNameInProfile');
    }
    getNickname() {
        return this.isPrivate() ? this.get('nickname') || undefined : undefined;
    }
    getNicknameOrRealUsername() {
        return this.getNickname() || this.getRealSessionUsername();
    }
    getNicknameOrRealUsernameOrPlaceholder() {
        const nickOrReal = this.getNickname() || this.getRealSessionUsername();
        if (nickOrReal) {
            return nickOrReal;
        }
        if (this.isPrivate()) {
            return 'anonymous';
        }
        return 'unknown';
    }
    isAdmin(pubKey) {
        if (!this.isPublic() && !this.isGroup()) {
            return false;
        }
        if (!pubKey) {
            throw new Error('isAdmin() pubKey is falsy');
        }
        const groupAdmins = this.getGroupAdmins();
        return Array.isArray(groupAdmins) && groupAdmins.includes(pubKey);
    }
    isModerator(pubKey) {
        if (!pubKey) {
            throw new Error('isModerator() pubKey is falsy');
        }
        if (!this.isPublic()) {
            return false;
        }
        return false;
    }
    async setPriorityFromWrapper(priority, shouldCommit = true) {
        if (priority !== this.get('priority')) {
            this.set({
                priority,
            });
            if (shouldCommit) {
                await this.commit();
            }
            return true;
        }
        return false;
    }
    async togglePinned(shouldCommit = true) {
        this.set({ priority: this.isPinned() ? 0 : 1 });
        if (shouldCommit) {
            await this.commit();
        }
        return true;
    }
    async setHidden(shouldCommit = true) {
        if (!this.isPrivate()) {
            return;
        }
        const priority = this.get('priority');
        if (priority >= conversationAttributes_1.CONVERSATION_PRIORITIES.default) {
            this.set({ priority: conversationAttributes_1.CONVERSATION_PRIORITIES.hidden });
            if (shouldCommit) {
                await this.commit();
            }
        }
    }
    async unhideIfNeeded(shouldCommit = true) {
        const priority = this.get('priority');
        if ((0, lodash_1.isFinite)(priority) && priority < conversationAttributes_1.CONVERSATION_PRIORITIES.default) {
            this.set({ priority: conversationAttributes_1.CONVERSATION_PRIORITIES.default });
            if (shouldCommit) {
                await this.commit();
            }
        }
    }
    async markAsUnread(forcedValue, shouldCommit = true) {
        if (!!forcedValue !== this.isMarkedUnread()) {
            this.set({
                markedAsUnread: !!forcedValue,
            });
            if (shouldCommit) {
                await this.commit();
            }
        }
    }
    isMarkedUnread() {
        return !!this.get('markedAsUnread');
    }
    async updateBlocksSogsMsgReqsTimestamp(blocksSogsMsgReqsTimestamp, shouldCommit = true) {
        if (!types_1.PubKey.isBlinded(this.id)) {
            return;
        }
        if (((0, lodash_1.isNil)(this.get('blocksSogsMsgReqsTimestamp')) && !(0, lodash_1.isNil)(blocksSogsMsgReqsTimestamp)) ||
            (blocksSogsMsgReqsTimestamp === 0 && this.get('blocksSogsMsgReqsTimestamp') !== 0) ||
            blocksSogsMsgReqsTimestamp > this.get('blocksSogsMsgReqsTimestamp')) {
            this.set({
                blocksSogsMsgReqsTimestamp,
            });
            if (shouldCommit) {
                await this.commit();
            }
        }
    }
    blocksSogsMsgReqsTimestamp() {
        if (!types_1.PubKey.isBlinded(this.id)) {
            return 0;
        }
        return this.get('blocksSogsMsgReqsTimestamp') || 0;
    }
    async setIsApproved(value, shouldCommit = true) {
        const valueForced = Boolean(value);
        if (!this.isPrivate()) {
            return;
        }
        if (valueForced !== Boolean(this.isApproved())) {
            sessionjs_logger_1.console.info(`Setting ${(0, onionPath_1.ed25519Str)(this.id)} isApproved to: ${value}`);
            this.set({
                isApproved: valueForced,
            });
            if (shouldCommit) {
                await this.commit();
            }
        }
    }
    async setDidApproveMe(value, shouldCommit = true) {
        if (!this.isPrivate()) {
            return;
        }
        const valueForced = Boolean(value);
        if (valueForced !== Boolean(this.didApproveMe())) {
            sessionjs_logger_1.console.info(`Setting ${(0, onionPath_1.ed25519Str)(this.id)} didApproveMe to: ${value}`);
            this.set({
                didApproveMe: valueForced,
            });
            if (shouldCommit) {
                await this.commit();
            }
        }
    }
    async setOriginConversationID(conversationIdOrigin) {
        if (conversationIdOrigin === this.get('conversationIdOrigin')) {
            return;
        }
        this.set({
            conversationIdOrigin,
        });
        await this.commit();
    }
    async setPollInfo(infos) {
        if (!this.isPublic()) {
            return;
        }
        if (!infos || (0, lodash_1.isEmpty)(infos)) {
            return;
        }
        const { write, active_users, details } = infos;
        if ((0, lodash_1.isFinite)(infos.active_users) &&
            infos.active_users !== 0) {
        }
        let hasChange = await this.handleSogsModsOrAdminsChanges({
            modsOrAdmins: details.admins,
            hiddenModsOrAdmins: details.hidden_admins,
            type: 'admins',
        });
        const modsChanged = await this.handleSogsModsOrAdminsChanges({
            modsOrAdmins: details.moderators,
            hiddenModsOrAdmins: details.hidden_moderators,
            type: 'mods',
        });
        if (details.name && details.name !== this.getRealSessionUsername()) {
            hasChange = hasChange || true;
            this.setSessionDisplayNameNoCommit(details.name);
        }
        hasChange = hasChange || modsChanged;
        if (this.isPublic() && details.image_id && (0, lodash_1.isNumber)(details.image_id)) {
            const roomInfos = opengroups_1.OpenGroupData.getV2OpenGroupRoom(this.id);
            if (roomInfos) {
                void (0, sogsV3FetchFile_1.sogsV3FetchPreviewAndSaveIt)({ ...roomInfos, imageID: `${details.image_id}` });
            }
        }
        if (hasChange) {
            await this.commit();
        }
    }
    async setProfileKey(profileKey, shouldCommit = true) {
        if (!profileKey) {
            return;
        }
        const profileKeyHex = (0, String_1.toHex)(profileKey);
        if (this.get('profileKey') !== profileKeyHex) {
            this.set({
                profileKey: profileKeyHex,
            });
            if (shouldCommit) {
                await this.commit();
            }
        }
    }
    hasMember(pubkey) {
        return (0, lodash_1.includes)(this.get('members'), pubkey);
    }
    hasReactions() {
        if (this.isPrivate() && !this.isApproved()) {
            return false;
        }
        if (this.isOpenGroupV2()) {
            const openGroup = opengroups_1.OpenGroupData.getV2OpenGroupRoom(this.id);
            return (0, sqlSharedTypes_1.roomHasReactionsEnabled)(openGroup);
        }
        return true;
    }
    async removeMessage(messageId) {
        await data_1.Data.removeMessage(messageId);
        this.updateLastMessage();
        sessionjs_logger_1.console.log('[SBOT/redux] messagesDeleted');
    }
    isPinned() {
        const priority = this.get('priority');
        return (0, lodash_1.isFinite)(priority) && priority > conversationAttributes_1.CONVERSATION_PRIORITIES.default;
    }
    didApproveMe() {
        return Boolean(this.get('didApproveMe'));
    }
    isApproved() {
        return Boolean(this.get('isApproved'));
    }
    getContactProfileNameOrShortenedPubKey() {
        if (!this.isPrivate()) {
            throw new Error('getContactProfileNameOrShortenedPubKey() cannot be called with a non private convo.');
        }
        const pubkey = this.id;
        if (utils_1.UserUtils.isUsFromCache(pubkey)) {
            return 'you';
        }
        const profileName = this.get('displayNameInProfile');
        return profileName || types_1.PubKey.shorten(pubkey);
    }
    getAvatarPath() {
        const avatar = this.get('avatarInProfile');
        if ((0, lodash_1.isString)(avatar)) {
            return avatar;
        }
        if (avatar) {
            throw new Error('avatarInProfile must be a string as we do not allow the {path: xxx} syntax');
        }
        return null;
    }
    async getNotificationIcon() {
        const avatarUrl = this.getAvatarPath();
        const noIconUrl = 'images/session/session_icon_32.png';
        if (!avatarUrl) {
            return noIconUrl;
        }
        const decryptedAvatarUrl = await (0, DecryptedAttachmentsManager_1.getDecryptedMediaUrl)(avatarUrl, MIME_1.IMAGE_JPEG, true);
        if (!decryptedAvatarUrl) {
            sessionjs_logger_1.console.warn('Could not decrypt avatar stored locally for getNotificationIcon..');
            return noIconUrl;
        }
        return decryptedAvatarUrl;
    }
    async notify(message) {
        if (!message.isIncoming()) {
            return;
        }
        const conversationId = this.id;
        let friendRequestText;
        if (!this.isApproved()) {
            sessionjs_logger_1.console.info('notification cancelled for unapproved convo', this.idForLogging());
            const hadNoRequestsPrior = (0, conversations_1.getConversationController)()
                .getConversations()
                .filter(conversation => {
                return (!conversation.isApproved() &&
                    !conversation.isBlocked() &&
                    conversation.isPrivate() &&
                    !conversation.isMe());
            }).length === 1;
            const isFirstMessageOfConvo = (await data_1.Data.getMessagesByConversation(this.id, { messageId: null })).messages.length === 1;
            if (hadNoRequestsPrior && isFirstMessageOfConvo) {
                friendRequestText = 'youHaveANewFriendRequest';
            }
            else {
                sessionjs_logger_1.console.info('notification cancelled for as pending requests already exist', this.idForLogging());
                return;
            }
        }
        const convNotif = this.get('triggerNotificationsFor');
        if (convNotif === 'disabled') {
            sessionjs_logger_1.console.info('notifications disabled for convo', this.idForLogging());
            return;
        }
        if (convNotif === 'mentions_only') {
            const regex = new RegExp(`@${types_1.PubKey.regexForPubkeys}`, 'g');
            const text = message.get('body');
            const mentions = text?.match(regex) || [];
            const mentionMe = mentions && mentions.some(m => (0, knownBlindedkeys_1.isUsAnySogsFromCache)(m.slice(1)));
            const quotedMessageAuthor = message.get('quote')?.author;
            const isReplyToOurMessage = quotedMessageAuthor && utils_1.UserUtils.isUsFromCache(quotedMessageAuthor);
            if (!mentionMe && !isReplyToOurMessage) {
                sessionjs_logger_1.console.info('notifications disabled for non mentions or reply for convo', conversationId);
                return;
            }
        }
        const convo = await (0, conversations_1.getConversationController)().getOrCreateAndWait(message.get('source'), conversationAttributes_1.ConversationTypeEnum.PRIVATE);
        const iconUrl = await this.getNotificationIcon();
        const messageJSON = message.toJSON();
        const messageSentAt = messageJSON.sent_at;
        const messageId = message.id;
        const isExpiringMessage = this.isExpiringMessage(messageJSON);
        sessionjs_logger_1.console.log('[SBOT/redux] addNotification');
    }
    async notifyIncomingCall() {
        if (!this.isPrivate()) {
            sessionjs_logger_1.console.info('notifyIncomingCall: not a private convo', this.idForLogging());
            return;
        }
        const conversationId = this.id;
        const convNotif = this.get('triggerNotificationsFor');
        if (convNotif === 'disabled') {
            sessionjs_logger_1.console.info('notifyIncomingCall: notifications disabled for convo', this.idForLogging());
            return;
        }
        const now = Date.now();
        const iconUrl = await this.getNotificationIcon();
        sessionjs_logger_1.console.log('[SBOT/redux] addNotification');
    }
    async notifyTypingNoCommit({ isTyping, sender }) {
        if (utils_1.UserUtils.isUsFromCache(sender)) {
            return;
        }
        if (!this.isPrivate()) {
            return;
        }
        if (this.typingTimer) {
            global.clearTimeout(this.typingTimer);
            this.typingTimer = null;
        }
        this.typingTimer = isTyping
            ?
                global.setTimeout(this.clearContactTypingTimer.bind(this, sender), 15 * 1000)
            : null;
    }
    async markReadFromConfigMessage(newestUnreadDate) {
        return this.markConversationReadBouncy(newestUnreadDate);
    }
    async sendMessageJob(message, expireTimer) {
        try {
            const { body, attachments, preview, quote, fileIdsToLink } = await message.uploadData();
            const { id } = message;
            const destination = this.id;
            const sentAt = message.get('sent_at');
            if (!sentAt) {
                throw new Error('sendMessageJob() sent_at must be set.');
            }
            await this.unhideIfNeeded(true);
            const chatMessageParams = {
                body,
                identifier: id,
                timestamp: sentAt,
                attachments,
                expireTimer,
                preview: preview ? [preview] : [],
                quote,
                lokiProfile: utils_1.UserUtils.getOurProfile(),
            };
            const shouldApprove = !this.isApproved() && this.isPrivate();
            const incomingMessageCount = await data_1.Data.getMessageCountByType(this.id, messageType_1.MessageDirection.incoming);
            const hasIncomingMessages = incomingMessageCount > 0;
            if (types_1.PubKey.isBlinded(this.id)) {
                sessionjs_logger_1.console.info('Sending a blinded message to this user: ', this.id);
                await this.sendBlindedMessageRequest(chatMessageParams);
                return;
            }
            if (shouldApprove) {
                await this.setIsApproved(true);
                if (hasIncomingMessages) {
                    await this.addOutgoingApprovalMessage(Date.now());
                    if (!this.didApproveMe()) {
                        await this.setDidApproveMe(true);
                    }
                    await this.sendMessageRequestResponse();
                    void (0, syncUtils_1.forceSyncConfigurationNowIfNeeded)();
                }
            }
            if (this.isOpenGroupV2()) {
                const chatMessageOpenGroupV2 = new OpenGroupVisibleMessage_1.OpenGroupVisibleMessage(chatMessageParams);
                const roomInfos = this.toOpenGroupV2();
                if (!roomInfos) {
                    throw new Error('Could not find this room in db');
                }
                const openGroup = opengroups_1.OpenGroupData.getV2OpenGroupRoom(this.id);
                await (0, session_1.getMessageQueue)().sendToOpenGroupV2({
                    message: chatMessageOpenGroupV2,
                    roomInfos,
                    blinded: Boolean((0, sqlSharedTypes_1.roomHasBlindEnabled)(openGroup)),
                    filesToLink: fileIdsToLink,
                });
                return;
            }
            const destinationPubkey = new types_1.PubKey(destination);
            if (this.isPrivate()) {
                if (this.isMe()) {
                    chatMessageParams.syncTarget = this.id;
                    const chatMessageMe = new VisibleMessage_1.VisibleMessage(chatMessageParams);
                    await (0, session_1.getMessageQueue)().sendSyncMessage({
                        namespace: namespaces_1.SnodeNamespaces.UserMessages,
                        message: chatMessageMe,
                    });
                    return;
                }
                if (message.get('groupInvitation')) {
                    const groupInvitation = message.get('groupInvitation');
                    const groupInvitMessage = new GroupInvitationMessage_1.GroupInvitationMessage({
                        identifier: id,
                        timestamp: sentAt,
                        name: groupInvitation.name,
                        url: groupInvitation.url,
                        expireTimer: this.get('expireTimer'),
                    });
                    await (0, session_1.getMessageQueue)().sendToPubKey(destinationPubkey, groupInvitMessage, namespaces_1.SnodeNamespaces.UserMessages);
                    return;
                }
                const chatMessagePrivate = new VisibleMessage_1.VisibleMessage(chatMessageParams);
                await (0, session_1.getMessageQueue)().sendToPubKey(destinationPubkey, chatMessagePrivate, namespaces_1.SnodeNamespaces.UserMessages);
                return;
            }
            if (this.isClosedGroup()) {
                const chatMessageMediumGroup = new VisibleMessage_1.VisibleMessage(chatMessageParams);
                const closedGroupVisibleMessage = new ClosedGroupVisibleMessage_1.ClosedGroupVisibleMessage({
                    chatMessage: chatMessageMediumGroup,
                    groupId: destination,
                });
                await (0, session_1.getMessageQueue)().sendToGroup({
                    message: closedGroupVisibleMessage,
                    namespace: namespaces_1.SnodeNamespaces.ClosedGroupMessage,
                });
                return;
            }
            throw new TypeError(`Invalid conversation type: '${this.get('type')}'`);
        }
        catch (e) {
            await message.saveErrors(e);
        }
    }
    async sendBlindedMessageRequest(messageParams) {
        const ourSignKeyBytes = await utils_1.UserUtils.getUserED25519KeyPairBytes();
        const groupUrl = this.getSogsOriginMessage();
        if (!types_1.PubKey.isBlinded(this.id)) {
            sessionjs_logger_1.console.warn('sendBlindedMessageRequest - convo is not a blinded one');
            return;
        }
        if (!messageParams.body) {
            sessionjs_logger_1.console.warn('sendBlindedMessageRequest - needs a body');
            return;
        }
        messageParams.lokiProfile = (0, User_1.getOurProfile)();
        if (!ourSignKeyBytes || !groupUrl) {
            sessionjs_logger_1.console.error('sendBlindedMessageRequest - Cannot get required information for encrypting blinded message.');
            return;
        }
        const roomInfo = opengroups_1.OpenGroupData.getV2OpenGroupRoom(groupUrl);
        if (!roomInfo || !roomInfo.serverPublicKey) {
            sessionjs_logger_1.console.error('Could not find room with matching server url', groupUrl);
            throw new Error(`Could not find room with matching server url: ${groupUrl}`);
        }
        const sogsVisibleMessage = new OpenGroupVisibleMessage_1.OpenGroupVisibleMessage(messageParams);
        const paddedBody = (0, BufferPadding_1.addMessagePadding)(sogsVisibleMessage.plainTextBuffer());
        const serverPubKey = roomInfo.serverPublicKey;
        const encryptedMsg = await sogsBlinding_1.SogsBlinding.encryptBlindedMessage({
            rawData: paddedBody,
            senderSigningKey: ourSignKeyBytes,
            serverPubKey: (0, libsodium_wrappers_sumo_1.from_hex)(serverPubKey),
            recipientBlindedPublicKey: (0, libsodium_wrappers_sumo_1.from_hex)(this.id.slice(2)),
        });
        if (!encryptedMsg) {
            throw new Error('encryptBlindedMessage failed');
        }
        if (!messageParams.identifier) {
            throw new Error('encryptBlindedMessage messageParams needs an identifier');
        }
        this.set({ active_at: Date.now(), isApproved: true });
        await (0, session_1.getMessageQueue)().sendToOpenGroupV2BlindedRequest({
            encryptedContent: encryptedMsg,
            roomInfos: roomInfo,
            message: sogsVisibleMessage,
            recipientBlindedId: this.id,
        });
    }
    async bouncyUpdateLastMessage() {
        if (!this.id || !this.get('active_at') || this.isHidden()) {
            return;
        }
        const messages = await data_1.Data.getLastMessagesByConversation(this.id, 1, true);
        if (!messages || !messages.length) {
            return;
        }
        const lastMessageModel = messages.at(0);
        const lastMessageStatus = lastMessageModel.getMessagePropStatus() || undefined;
        const lastMessageNotificationText = lastMessageModel.getNotificationText() || undefined;
        const lastMessageUpdate = !!lastMessageNotificationText && !(0, lodash_1.isEmpty)(lastMessageNotificationText)
            ? {
                lastMessage: lastMessageNotificationText || '',
                lastMessageStatus,
            }
            : { lastMessage: '', lastMessageStatus: undefined };
        const existingLastMessageAttribute = this.get('lastMessage');
        const existingLastMessageStatus = this.get('lastMessageStatus');
        if (lastMessageUpdate.lastMessage !== existingLastMessageAttribute ||
            lastMessageUpdate.lastMessageStatus !== existingLastMessageStatus) {
            if (lastMessageUpdate.lastMessageStatus === existingLastMessageStatus &&
                lastMessageUpdate.lastMessage &&
                lastMessageUpdate.lastMessage.length > 40 &&
                existingLastMessageAttribute &&
                existingLastMessageAttribute.length > 40 &&
                lastMessageUpdate.lastMessage.startsWith(existingLastMessageAttribute)) {
                return;
            }
            this.set({
                ...lastMessageUpdate,
            });
            await this.commit();
        }
    }
    async markConversationReadBouncy(newestUnreadDate, readAt = Date.now()) {
        const conversationId = this.id;
        const oldUnreadNowRead = (await this.getUnreadByConversation(newestUnreadDate)).models;
        if (!oldUnreadNowRead.length) {
            return;
        }
        const readDetails = [];
        for (const nowRead of oldUnreadNowRead) {
            nowRead.markMessageReadNoCommit(readAt);
            const validTimestamp = nowRead.get('sent_at') || nowRead.get('serverTimestamp');
            if (nowRead.get('source') && validTimestamp && (0, lodash_1.isFinite)(validTimestamp)) {
                readDetails.push({
                    sender: nowRead.get('source'),
                    timestamp: validTimestamp,
                });
            }
        }
        const oldUnreadNowReadAttrs = oldUnreadNowRead.map(m => m.attributes);
        if (oldUnreadNowReadAttrs?.length) {
            await data_1.Data.saveMessages(oldUnreadNowReadAttrs);
        }
        const allProps = [];
        for (const nowRead of oldUnreadNowRead) {
            allProps.push(nowRead.getMessageModelProps());
        }
        if (allProps.length) {
            sessionjs_logger_1.console.log('[SBOT/redux] conversationActions');
        }
        await this.commit();
        if (readDetails.length) {
            const us = utils_1.UserUtils.getOurPubKeyStrFromCache();
            const timestamps = readDetails.filter(m => m.sender !== us).map(m => m.timestamp);
            await this.sendReadReceiptsIfNeeded(timestamps);
        }
    }
    async getUnreadByConversation(sentBeforeTs) {
        return data_1.Data.getUnreadByConversation(this.id, sentBeforeTs);
    }
    getSogsOriginMessage() {
        return this.get('conversationIdOrigin');
    }
    async addSingleMessage(messageAttributes) {
        const voiceMessageFlags = messageAttributes.attachments?.[0]?.isVoiceMessage
            ? protobuf_1.SignalService.AttachmentPointer.Flags.VOICE_MESSAGE
            : undefined;
        const model = new message_1.MessageModel({ ...messageAttributes, flags: voiceMessageFlags });
        const messageId = await model.commit(false);
        model.set({ id: messageId });
        await model.setToExpire();
        const messageModelProps = model.getMessageModelProps();
        sessionjs_logger_1.console.log('[SBOT/redux] conversationActions');
        this.updateLastMessage();
        await this.commit();
        return model;
    }
    async clearContactTypingTimer(_sender) {
        if (this.typingTimer) {
            global.clearTimeout(this.typingTimer);
            this.typingTimer = null;
            await this.commit();
        }
    }
    isExpiringMessage(json) {
        if (json.type === 'incoming') {
            return false;
        }
        const { expireTimer } = json;
        return (0, lodash_1.isFinite)(expireTimer) && expireTimer > 0;
    }
    shouldDoTyping() {
        if (!this.isActive() ||
            !storage_1.Storage.get(settings_key_1.SettingsKey.settingsTypingIndicator) ||
            this.isBlocked() ||
            !this.isPrivate()) {
            return false;
        }
        return Boolean(this.get('isApproved'));
    }
    async bumpTyping() {
        if (!this.shouldDoTyping()) {
            return;
        }
        if (!this.typingRefreshTimer) {
            const isTyping = true;
            this.setTypingRefreshTimer();
            this.sendTypingMessage(isTyping);
        }
        this.setTypingPauseTimer();
    }
    setTypingRefreshTimer() {
        if (this.typingRefreshTimer) {
            global.clearTimeout(this.typingRefreshTimer);
        }
        this.typingRefreshTimer = global.setTimeout(this.onTypingRefreshTimeout.bind(this), 10 * 1000);
    }
    onTypingRefreshTimeout() {
        const isTyping = true;
        this.sendTypingMessage(isTyping);
        this.setTypingRefreshTimer();
    }
    setTypingPauseTimer() {
        if (this.typingPauseTimer) {
            global.clearTimeout(this.typingPauseTimer);
        }
        this.typingPauseTimer = global.setTimeout(this.onTypingPauseTimeout.bind(this), 10 * 1000);
    }
    onTypingPauseTimeout() {
        const isTyping = false;
        this.sendTypingMessage(isTyping);
        this.clearTypingTimers();
    }
    clearTypingTimers() {
        if (this.typingPauseTimer) {
            global.clearTimeout(this.typingPauseTimer);
            this.typingPauseTimer = null;
        }
        if (this.typingRefreshTimer) {
            global.clearTimeout(this.typingRefreshTimer);
            this.typingRefreshTimer = null;
        }
    }
    sendTypingMessage(isTyping) {
        if (!this.isPrivate() || this.isMe() || !this.isApproved()) {
            return;
        }
        const recipientId = this.id;
        if ((0, lodash_1.isEmpty)(recipientId)) {
            throw new Error('Need to provide either recipientId');
        }
        const typingParams = {
            timestamp: getNetworkTime_1.GetNetworkTime.getNowWithNetworkOffset(),
            isTyping,
            typingTimestamp: getNetworkTime_1.GetNetworkTime.getNowWithNetworkOffset(),
        };
        const typingMessage = new TypingMessage_1.TypingMessage(typingParams);
        const device = new types_1.PubKey(recipientId);
        void (0, session_1.getMessageQueue)()
            .sendToPubKey(device, typingMessage, namespaces_1.SnodeNamespaces.UserMessages)
            .catch(sessionjs_logger_1.console.error);
    }
    async replaceWithOurRealSessionId(toReplace) {
        const roomInfos = opengroups_1.OpenGroupData.getV2OpenGroupRoom(this.id);
        const sodium = await (0, crypto_1.getSodiumRenderer)();
        const ourBlindedPubkeyForThisSogs = roomInfos && (0, sqlSharedTypes_1.roomHasBlindEnabled)(roomInfos)
            ? await (0, knownBlindedkeys_1.findCachedOurBlindedPubkeyOrLookItUp)(roomInfos?.serverPublicKey, sodium)
            : utils_1.UserUtils.getOurPubKeyStrFromCache();
        const replacedWithOurRealSessionId = toReplace.map(m => m === ourBlindedPubkeyForThisSogs ? utils_1.UserUtils.getOurPubKeyStrFromCache() : m);
        return replacedWithOurRealSessionId;
    }
    async handleSogsModsOrAdminsChanges({ modsOrAdmins, hiddenModsOrAdmins, type, }) {
        if (modsOrAdmins && (0, lodash_1.isArray)(modsOrAdmins)) {
            const localModsOrAdmins = [...modsOrAdmins];
            if (hiddenModsOrAdmins && (0, lodash_1.isArray)(hiddenModsOrAdmins)) {
                localModsOrAdmins.push(...hiddenModsOrAdmins);
            }
            const replacedWithOurRealSessionId = await this.replaceWithOurRealSessionId((0, lodash_1.uniq)(localModsOrAdmins));
            switch (type) {
                case 'admins':
                    return this.updateGroupAdmins(replacedWithOurRealSessionId, false);
                case 'mods':
                    return false;
                default:
                    (0, sqlSharedTypes_1.assertUnreachable)(type, `handleSogsModsOrAdminsChanges: unhandled switch case: ${type}`);
            }
        }
        return false;
    }
    async getQuoteAttachment(attachments, preview) {
        if (attachments?.length) {
            return Promise.all(attachments
                .filter((attachment) => attachment && attachment.contentType && !attachment.pending && !attachment.error)
                .slice(0, 1)
                .map(async (attachment) => {
                const { fileName, thumbnail, contentType } = attachment;
                return {
                    contentType,
                    fileName: fileName || null,
                    thumbnail: attachment?.thumbnail?.path
                        ? {
                            ...(await (0, MessageAttachment_1.loadAttachmentData)(thumbnail)),
                            objectUrl: (0, MessageAttachment_1.getAbsoluteAttachmentPath)(thumbnail.path),
                        }
                        : null,
                };
            }));
        }
        if (preview?.length) {
            return Promise.all(preview
                .filter((attachment) => attachment?.image?.path)
                .slice(0, 1)
                .map(async (attachment) => {
                const { image } = attachment;
                const { contentType } = image;
                return {
                    contentType,
                    fileName: null,
                    thumbnail: image
                        ? {
                            ...(await (0, MessageAttachment_1.loadAttachmentData)(image)),
                            objectUrl: (0, MessageAttachment_1.getAbsoluteAttachmentPath)(image.path),
                        }
                        : null,
                };
            }));
        }
        return [];
    }
}
exports.ConversationModel = ConversationModel;
async function commitConversationAndRefreshWrapper(id) {
    const convo = (0, conversations_1.getConversationController)().get(id);
    if (!convo) {
        return;
    }
    const savedDetails = await data_1.Data.saveConversation(convo.attributes);
    await convo.refreshInMemoryDetails(savedDetails);
    for (let index = 0; index < libsession_utils_1.LibSessionUtil.requiredUserVariants.length; index++) {
        const variant = libsession_utils_1.LibSessionUtil.requiredUserVariants[index];
        switch (variant) {
            case 'UserConfig':
                if (libsession_utils_user_profile_1.SessionUtilUserProfile.isUserProfileToStoreInWrapper(convo.id)) {
                    await libsession_utils_user_profile_1.SessionUtilUserProfile.insertUserProfileIntoWrapper(convo.id);
                }
                break;
            case 'ContactsConfig':
                if (libsession_utils_contacts_1.SessionUtilContact.isContactToStoreInWrapper(convo)) {
                    await libsession_utils_contacts_1.SessionUtilContact.insertContactFromDBIntoWrapperAndRefresh(convo.id);
                }
                break;
            case 'UserGroupsConfig':
                if (libsession_utils_user_groups_1.SessionUtilUserGroups.isUserGroupToStoreInWrapper(convo)) {
                    await libsession_utils_user_groups_1.SessionUtilUserGroups.insertGroupsFromDBIntoWrapperAndRefresh(convo.id);
                }
                break;
            case 'ConvoInfoVolatileConfig':
                if (libsession_utils_convo_info_volatile_1.SessionUtilConvoInfoVolatile.isConvoToStoreInWrapper(convo)) {
                    await libsession_utils_convo_info_volatile_1.SessionUtilConvoInfoVolatile.insertConvoFromDBIntoWrapperAndRefresh(convo.id);
                }
                break;
            default:
                (0, sqlSharedTypes_1.assertUnreachable)(variant, `commitConversationAndRefreshWrapper unhandled case "${variant}"`);
        }
    }
    if (registration_1.Registration.isDone()) {
        await ConfigurationSyncJob_1.ConfigurationSync.queueNewJobIfNeeded();
    }
    convo.triggerUIRefresh();
}
exports.commitConversationAndRefreshWrapper = commitConversationAndRefreshWrapper;
const throttledAllConversationsDispatch = (0, lodash_1.debounce)(() => {
    if (updatesToDispatch.size === 0) {
        return;
    }
    updatesToDispatch.clear();
}, 500, { trailing: true, leading: true, maxWait: 1000 });
const updatesToDispatch = new Map();
class ConversationCollection extends backbone_1.default.Collection {
    constructor(models) {
        super(models);
        this.comparator = (m) => {
            return -(m.get('active_at') || 0);
        };
    }
}
exports.ConversationCollection = ConversationCollection;
ConversationCollection.prototype.model = ConversationModel;
function hasValidOutgoingRequestValues({ isMe, didApproveMe, isApproved, isBlocked, isPrivate, activeAt, }) {
    const isActive = activeAt && (0, lodash_1.isFinite)(activeAt) && activeAt > 0;
    return Boolean(!isMe && isApproved && isPrivate && !isBlocked && !didApproveMe && isActive);
}
exports.hasValidOutgoingRequestValues = hasValidOutgoingRequestValues;
function hasValidIncomingRequestValues({ isMe, isApproved, isBlocked, isPrivate, activeAt, didApproveMe, }) {
    const isActive = activeAt && (0, lodash_1.isFinite)(activeAt) && activeAt > 0;
    return Boolean(isPrivate && !isMe && !isApproved && !isBlocked && isActive && didApproveMe);
}
exports.hasValidIncomingRequestValues = hasValidIncomingRequestValues;
