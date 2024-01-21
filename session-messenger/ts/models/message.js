"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processQuoteAttachment = exports.findAndFormatContact = exports.MessageCollection = exports.MessageModel = exports.arrayContainsOneItemOnly = exports.arrayContainsUsOnly = void 0;
const backbone_1 = __importDefault(require("backbone"));
const auto_bind_1 = __importDefault(require("auto-bind"));
const lodash_1 = require("lodash");
const filesize_1 = __importDefault(require("filesize"));
const protobuf_1 = require("../protobuf");
const session_1 = require("../session");
const conversations_1 = require("../session/conversations");
const outgoing_1 = require("../session/messages/outgoing");
const types_1 = require("../session/types");
const utils_1 = require("../session/utils");
const ClosedGroupVisibleMessage_1 = require("../session/messages/outgoing/visibleMessage/ClosedGroupVisibleMessage");
const messageType_1 = require("./messageType");
const data_1 = require("../data/data");
const opengroups_1 = require("../data/opengroups");
const settings_key_1 = require("../data/settings-key");
const knownBlindedkeys_1 = require("../session/apis/open_group_api/sogsv3/knownBlindedkeys");
const getNetworkTime_1 = require("../session/apis/snode_api/getNetworkTime");
const namespaces_1 = require("../session/apis/snode_api/namespaces");
const OpenGroupVisibleMessage_1 = require("../session/messages/outgoing/visibleMessage/OpenGroupVisibleMessage");
const VisibleMessage_1 = require("../session/messages/outgoing/visibleMessage/VisibleMessage");
const AttachmentsV2_1 = require("../session/utils/AttachmentsV2");
const Performance_1 = require("../session/utils/Performance");
const syncUtils_1 = require("../session/utils/sync/syncUtils");
const User_1 = require("../session/utils/User");
const Attachment_1 = require("../types/Attachment");
const initializeAttachmentMetadata_1 = require("../types/message/initializeAttachmentMetadata");
const MessageAttachment_1 = require("../types/MessageAttachment");
const sqlSharedTypes_1 = require("../types/sqlSharedTypes");
const expiringMessages_1 = require("../util/expiringMessages");
const linkPreviews_1 = require("../util/linkPreviews");
const storage_1 = require("../util/storage");
const conversationAttributes_1 = require("./conversationAttributes");
const sessionjs_logger_1 = require("../sessionjs-logger");
function arrayContainsUsOnly(arrayToCheck) {
    return (arrayToCheck &&
        arrayToCheck.length === 1 &&
        (arrayToCheck[0] === utils_1.UserUtils.getOurPubKeyStrFromCache() ||
            arrayToCheck[0].toLowerCase() === 'you'));
}
exports.arrayContainsUsOnly = arrayContainsUsOnly;
function arrayContainsOneItemOnly(arrayToCheck) {
    return arrayToCheck && arrayToCheck.length === 1;
}
exports.arrayContainsOneItemOnly = arrayContainsOneItemOnly;
class MessageModel extends backbone_1.default.Model {
    constructor(attributes) {
        const filledAttrs = (0, messageType_1.fillMessageAttributesWithDefaults)(attributes);
        super(filledAttrs);
        if (!this.id) {
            throw new Error('A message always needs to have an id.');
        }
        if (!this.get('conversationId')) {
            throw new Error('A message always needs to have an conversationId.');
        }
        if (!attributes.skipTimerInit) {
            void this.setToExpire();
        }
        (0, auto_bind_1.default)(this);
        this.getMessageModelProps();
    }
    getMessageModelProps() {
        (0, Performance_1.perfStart)(`getPropsMessage-${this.id}`);
        const propsForDataExtractionNotification = this.getPropsForDataExtractionNotification();
        const propsForGroupInvitation = this.getPropsForGroupInvitation();
        const propsForGroupUpdateMessage = this.getPropsForGroupUpdateMessage();
        const propsForTimerNotification = this.getPropsForTimerNotification();
        const propsForMessageRequestResponse = this.getPropsForMessageRequestResponse();
        const propsForQuote = this.getPropsForQuote();
        const callNotificationType = this.get('callNotificationType');
        const messageProps = {
            propsForMessage: this.getPropsForMessage(),
        };
        if (propsForDataExtractionNotification) {
            messageProps.propsForDataExtractionNotification = propsForDataExtractionNotification;
        }
        if (propsForMessageRequestResponse) {
            messageProps.propsForMessageRequestResponse = propsForMessageRequestResponse;
        }
        if (propsForGroupInvitation) {
            messageProps.propsForGroupInvitation = propsForGroupInvitation;
        }
        if (propsForGroupUpdateMessage) {
            messageProps.propsForGroupUpdateMessage = propsForGroupUpdateMessage;
        }
        if (propsForTimerNotification) {
            messageProps.propsForTimerNotification = propsForTimerNotification;
        }
        if (propsForQuote) {
            messageProps.propsForQuote = propsForQuote;
        }
        if (callNotificationType) {
            messageProps.propsForCallNotification = {
                notificationType: callNotificationType,
                messageId: this.id,
                receivedAt: this.get('received_at') || Date.now(),
                isUnread: this.isUnread(),
            };
        }
        (0, Performance_1.perfEnd)(`getPropsMessage-${this.id}`, 'getPropsMessage');
        return messageProps;
    }
    idForLogging() {
        return `${this.get('source')} ${this.get('sent_at')}`;
    }
    isExpirationTimerUpdate() {
        const expirationTimerFlag = protobuf_1.SignalService.DataMessage.Flags.EXPIRATION_TIMER_UPDATE;
        const flags = this.get('flags') || 0;
        const expirationTimerUpdate = this.get('expirationTimerUpdate');
        return Boolean(flags & expirationTimerFlag) || !(0, lodash_1.isEmpty)(expirationTimerUpdate);
    }
    isIncoming() {
        return this.get('type') === 'incoming';
    }
    isUnread() {
        return !!this.get('unread');
    }
    merge(model) {
        const attributes = model.attributes || model;
        const { unread } = attributes;
        if (unread === undefined) {
            this.set({ unread: conversationAttributes_1.READ_MESSAGE_STATE.read });
        }
        this.set(attributes);
    }
    isGroupInvitation() {
        return !!this.get('groupInvitation');
    }
    isMessageRequestResponse() {
        return !!this.get('messageRequestResponse');
    }
    isDataExtractionNotification() {
        return !!this.get('dataExtractionNotification');
    }
    getNotificationText() {
        let description = this.getDescription();
        if (description) {
            const regex = new RegExp(`@${types_1.PubKey.regexForPubkeys}`, 'g');
            const pubkeysInDesc = description.match(regex);
            (pubkeysInDesc || []).forEach((pubkeyWithAt) => {
                const pubkey = pubkeyWithAt.slice(1);
                const isUS = (0, knownBlindedkeys_1.isUsAnySogsFromCache)(pubkey);
                const displayName = (0, conversations_1.getConversationController)().getContactProfileNameOrShortenedPubKey(pubkey);
                if (isUS) {
                    description = description?.replace(pubkeyWithAt, `@${('you')}`);
                }
                else if (displayName && displayName.length) {
                    description = description?.replace(pubkeyWithAt, `@${displayName}`);
                }
            });
            return description;
        }
        if ((this.get('attachments') || []).length > 0) {
            return ('mediaMessage');
        }
        if (this.isExpirationTimerUpdate()) {
            const expireTimerUpdate = this.get('expirationTimerUpdate');
            if (!expireTimerUpdate || !expireTimerUpdate.expireTimer) {
                return ('disappearingMessagesDisabled');
            }
            return 'timerSetTo';
        }
        return '';
    }
    onDestroy() {
        void this.cleanup();
    }
    async cleanup() {
        await (0, MessageAttachment_1.deleteExternalMessageFiles)(this.attributes);
    }
    getPropsForTimerNotification() {
        if (!this.isExpirationTimerUpdate()) {
            return null;
        }
        const timerUpdate = this.get('expirationTimerUpdate');
        if (!timerUpdate || !timerUpdate.source) {
            return null;
        }
        const { expireTimer, fromSync, source } = timerUpdate;
        const timespan = expiringMessages_1.ExpirationTimerOptions.getName(expireTimer || 0);
        const disabled = !expireTimer;
        const basicProps = {
            ...findAndFormatContact(source),
            timespan,
            disabled,
            type: fromSync ? 'fromSync' : utils_1.UserUtils.isUsFromCache(source) ? 'fromMe' : 'fromOther',
            messageId: this.id,
            receivedAt: this.get('received_at'),
            isUnread: this.isUnread(),
        };
        return basicProps;
    }
    getPropsForGroupInvitation() {
        if (!this.isGroupInvitation()) {
            return null;
        }
        const invitation = this.get('groupInvitation');
        let direction = this.get('direction');
        if (!direction) {
            direction = this.get('type') === 'outgoing' ? 'outgoing' : 'incoming';
        }
        let serverAddress = '';
        try {
            const url = new URL(invitation.url);
            serverAddress = url.origin;
        }
        catch (e) {
            sessionjs_logger_1.console.warn('failed to get hostname from opengroupv2 invitation', invitation);
        }
        return {
            serverName: invitation.name,
            url: serverAddress,
            direction,
            acceptUrl: invitation.url,
            messageId: this.id,
            receivedAt: this.get('received_at'),
            isUnread: this.isUnread(),
        };
    }
    getPropsForDataExtractionNotification() {
        if (!this.isDataExtractionNotification()) {
            return null;
        }
        const dataExtractionNotification = this.get('dataExtractionNotification');
        if (!dataExtractionNotification) {
            sessionjs_logger_1.console.warn('dataExtractionNotification should not happen');
            return null;
        }
        const contact = findAndFormatContact(dataExtractionNotification.source);
        return {
            ...dataExtractionNotification,
            name: contact.profileName || contact.name || dataExtractionNotification.source,
            messageId: this.id,
            receivedAt: this.get('received_at'),
            isUnread: this.isUnread(),
        };
    }
    getPropsForMessageRequestResponse() {
        if (!this.isMessageRequestResponse()) {
            return null;
        }
        const messageRequestResponse = this.get('messageRequestResponse');
        if (!messageRequestResponse) {
            sessionjs_logger_1.console.warn('messageRequestResponse should not happen');
            return null;
        }
        const contact = findAndFormatContact(messageRequestResponse.source);
        return {
            ...messageRequestResponse,
            name: contact.profileName || contact.name || messageRequestResponse.source,
            messageId: this.id,
            receivedAt: this.get('received_at'),
            isUnread: this.isUnread(),
            conversationId: this.get('conversationId'),
            source: this.get('source'),
        };
    }
    getPropsForGroupUpdateMessage() {
        const groupUpdate = this.getGroupUpdateAsArray();
        if (!groupUpdate || (0, lodash_1.isEmpty)(groupUpdate)) {
            return null;
        }
        const sharedProps = {
            messageId: this.id,
            isUnread: this.isUnread(),
            receivedAt: this.get('received_at'),
        };
        if (groupUpdate.joined?.length) {
            const change = {
                type: 'add',
                added: groupUpdate.joined,
            };
            return { change, ...sharedProps };
        }
        if (groupUpdate.kicked?.length) {
            const change = {
                type: 'kicked',
                kicked: groupUpdate.kicked,
            };
            return { change, ...sharedProps };
        }
        if (groupUpdate.left?.length) {
            const change = {
                type: 'left',
                left: groupUpdate.left,
            };
            return { change, ...sharedProps };
        }
        if (groupUpdate.name) {
            const change = {
                type: 'name',
                newName: groupUpdate.name,
            };
            return { change, ...sharedProps };
        }
        const changeGeneral = {
            type: 'general',
        };
        return { change: changeGeneral, ...sharedProps };
    }
    getMessagePropStatus() {
        if (this.hasErrors()) {
            return 'error';
        }
        if (!this.isOutgoing()) {
            return undefined;
        }
        if (this.isDataExtractionNotification() || this.get('callNotificationType')) {
            return undefined;
        }
        if (this.getConversation()?.get('left')) {
            return 'sent';
        }
        const readBy = this.get('read_by') || [];
        if (storage_1.Storage.get(settings_key_1.SettingsKey.settingsReadReceipt) && readBy.length > 0) {
            return 'read';
        }
        const sent = this.get('sent');
        const sentTo = this.get('sent_to') || [];
        if (sent || sentTo.length > 0) {
            return 'sent';
        }
        return 'sending';
    }
    getPropsForMessage() {
        const sender = this.getSource();
        const expirationLength = this.get('expireTimer') * 1000;
        const expireTimerStart = this.get('expirationStartTimestamp');
        const expirationTimestamp = expirationLength && expireTimerStart ? expireTimerStart + expirationLength : null;
        const attachments = this.get('attachments') || [];
        const isTrustedForAttachmentDownload = this.isTrustedForAttachmentDownload();
        const body = this.get('body');
        const props = {
            id: this.id,
            direction: (this.isIncoming() ? 'incoming' : 'outgoing'),
            timestamp: this.get('sent_at') || 0,
            sender,
            convoId: this.get('conversationId'),
        };
        if (body) {
            props.text = body;
        }
        if (this.get('isDeleted')) {
            props.isDeleted = this.get('isDeleted');
        }
        if (this.get('messageHash')) {
            props.messageHash = this.get('messageHash');
        }
        if (this.get('received_at')) {
            props.receivedAt = this.get('received_at');
        }
        if (this.get('serverTimestamp')) {
            props.serverTimestamp = this.get('serverTimestamp');
        }
        if (this.get('serverId')) {
            props.serverId = this.get('serverId');
        }
        if (expirationLength) {
            props.expirationLength = expirationLength;
        }
        if (expirationTimestamp) {
            props.expirationTimestamp = expirationTimestamp;
        }
        if (isTrustedForAttachmentDownload) {
            props.isTrustedForAttachmentDownload = isTrustedForAttachmentDownload;
        }
        const isUnread = this.isUnread();
        if (isUnread) {
            props.isUnread = isUnread;
        }
        const isExpired = this.isExpired();
        if (isExpired) {
            props.isExpired = isExpired;
        }
        const previews = this.getPropsForPreview();
        if (previews && previews.length) {
            props.previews = previews;
        }
        const reacts = this.getPropsForReacts();
        if (reacts && Object.keys(reacts).length) {
            props.reacts = reacts;
        }
        const quote = this.getPropsForQuote();
        if (quote) {
            props.quote = quote;
        }
        const status = this.getMessagePropStatus();
        if (status) {
            props.status = status;
        }
        const attachmentsProps = attachments.map(this.getPropsForAttachment);
        if (attachmentsProps && attachmentsProps.length) {
            props.attachments = attachmentsProps;
        }
        return props;
    }
    getPropsForPreview() {
        const previews = this.get('preview') || null;
        if (!previews || previews.length === 0) {
            return null;
        }
        return previews.map((preview) => {
            let image = null;
            try {
                if (preview.image) {
                    image = this.getPropsForAttachment(preview.image);
                }
            }
            catch (e) {
                sessionjs_logger_1.console.info('Failed to show preview');
            }
            return {
                ...preview,
                domain: linkPreviews_1.LinkPreviews.getDomain(preview.url),
                image,
            };
        });
    }
    getPropsForReacts() {
        return this.get('reacts') || null;
    }
    getPropsForQuote() {
        return this.get('quote') || null;
    }
    getPropsForAttachment(attachment) {
        if (!attachment) {
            return null;
        }
        const { id, path, contentType, width, height, pending, flags, size, screenshot, thumbnail, fileName, caption, } = attachment;
        const isVoiceMessageBool = Boolean(flags && flags & protobuf_1.SignalService.AttachmentPointer.Flags.VOICE_MESSAGE) || false;
        return {
            id,
            contentType,
            caption,
            size: size || 0,
            width: width || 0,
            height: height || 0,
            path,
            fileName,
            fileSize: size ? (0, filesize_1.default)(size, { base: 10 }) : null,
            isVoiceMessage: isVoiceMessageBool,
            pending: Boolean(pending),
            url: path ? (0, MessageAttachment_1.getAbsoluteAttachmentPath)(path) : '',
            screenshot: screenshot
                ? {
                    ...screenshot,
                    url: (0, MessageAttachment_1.getAbsoluteAttachmentPath)(screenshot.path),
                }
                : null,
            thumbnail: thumbnail
                ? {
                    ...thumbnail,
                    url: (0, MessageAttachment_1.getAbsoluteAttachmentPath)(thumbnail.path),
                }
                : null,
        };
    }
    async getPropsForMessageDetail() {
        const contacts = this.isIncoming()
            ? [this.get('source')]
            : this.get('sent_to') || [];
        const allErrors = (this.get('errors') || []).map((error) => {
            return error;
        });
        const errors = (0, lodash_1.reject)(allErrors, error => Boolean(error.number));
        const errorsGroupedById = (0, lodash_1.groupBy)(allErrors, 'number');
        const finalContacts = await Promise.all((contacts || []).map(async (id) => {
            const errorsForContact = errorsGroupedById[id];
            const contact = findAndFormatContact(id);
            return {
                ...contact,
                status: this.getMessagePropStatus(),
                errors: errorsForContact,
                profileName: contact.profileName,
            };
        }));
        const sortedContacts = (0, lodash_1.sortBy)(finalContacts, contact => contact.pubkey);
        const toRet = {
            sentAt: this.get('sent_at') || 0,
            receivedAt: this.get('received_at') || 0,
            convoId: this.get('conversationId'),
            messageId: this.get('id'),
            errors,
            direction: this.get('direction'),
            contacts: sortedContacts || [],
        };
        return toRet;
    }
    async uploadData() {
        const finalAttachments = await Promise.all((this.get('attachments') || []).map(MessageAttachment_1.loadAttachmentData));
        const body = this.get('body');
        const quoteWithData = await (0, MessageAttachment_1.loadQuoteData)(this.get('quote'));
        const previewWithData = await (0, MessageAttachment_1.loadPreviewData)(this.get('preview'));
        const { hasAttachments, hasVisualMediaAttachments, hasFileAttachments } = (0, initializeAttachmentMetadata_1.getAttachmentMetadata)(this);
        this.set({ hasAttachments, hasVisualMediaAttachments, hasFileAttachments });
        await this.commit();
        const conversation = this.getConversation();
        let attachmentPromise;
        let linkPreviewPromise;
        let quotePromise;
        const fileIdsToLink = [];
        const firstPreviewWithData = previewWithData?.[0] || null;
        if (conversation?.isPublic()) {
            const openGroupV2 = conversation.toOpenGroupV2();
            attachmentPromise = (0, AttachmentsV2_1.uploadAttachmentsV3)(finalAttachments, openGroupV2);
            linkPreviewPromise = (0, AttachmentsV2_1.uploadLinkPreviewsV3)(firstPreviewWithData, openGroupV2);
            quotePromise = (0, AttachmentsV2_1.uploadQuoteThumbnailsV3)(openGroupV2, quoteWithData);
        }
        else {
            attachmentPromise = (0, utils_1.uploadAttachmentsToFileServer)(finalAttachments);
            linkPreviewPromise = (0, utils_1.uploadLinkPreviewToFileServer)(firstPreviewWithData);
            quotePromise = (0, utils_1.uploadQuoteThumbnailsToFileServer)(quoteWithData);
        }
        const [attachments, preview, quote] = await Promise.all([
            attachmentPromise,
            linkPreviewPromise,
            quotePromise,
        ]);
        fileIdsToLink.push(...attachments.map(m => m.id));
        if (preview) {
            fileIdsToLink.push(preview.id);
        }
        if (quote && quote.attachments?.length) {
            const firstQuoteAttachmentId = quote.attachments[0].thumbnail?.id;
            if (firstQuoteAttachmentId) {
                fileIdsToLink.push(firstQuoteAttachmentId);
            }
        }
        const isFirstAttachmentVoiceMessage = finalAttachments?.[0]?.isVoiceMessage;
        if (isFirstAttachmentVoiceMessage) {
            attachments[0].flags = protobuf_1.SignalService.AttachmentPointer.Flags.VOICE_MESSAGE;
        }
        sessionjs_logger_1.console.info(`Upload of message data for message ${this.idForLogging()} is finished.`);
        return {
            body,
            attachments,
            preview,
            quote,
            fileIdsToLink: (0, lodash_1.uniq)(fileIdsToLink),
        };
    }
    async markAsDeleted() {
        this.set({
            isDeleted: true,
            body: ('messageDeletedPlaceholder'),
            quote: undefined,
            groupInvitation: undefined,
            dataExtractionNotification: undefined,
            hasAttachments: 0,
            hasFileAttachments: 0,
            hasVisualMediaAttachments: 0,
            attachments: undefined,
            preview: undefined,
            reacts: undefined,
            reactsIndex: undefined,
        });
        await this.markMessageAsRead(Date.now());
        await this.commit();
    }
    async retrySend() {
        this.set({ errors: null, sent: false, sent_to: [] });
        await this.commit();
        try {
            const conversation = this.getConversation();
            if (!conversation) {
                sessionjs_logger_1.console.info('cannot retry send message, the corresponding conversation was not found.');
                return null;
            }
            const { body, attachments, preview, quote, fileIdsToLink } = await this.uploadData();
            if (conversation.isPublic()) {
                const openGroupParams = {
                    identifier: this.id,
                    timestamp: getNetworkTime_1.GetNetworkTime.getNowWithNetworkOffset(),
                    lokiProfile: utils_1.UserUtils.getOurProfile(),
                    body,
                    attachments,
                    preview: preview ? [preview] : [],
                    quote,
                };
                const roomInfos = opengroups_1.OpenGroupData.getV2OpenGroupRoom(conversation.id);
                if (!roomInfos) {
                    throw new Error('Could not find roomInfos for this conversation');
                }
                const openGroupMessage = new OpenGroupVisibleMessage_1.OpenGroupVisibleMessage(openGroupParams);
                const openGroup = opengroups_1.OpenGroupData.getV2OpenGroupRoom(conversation.id);
                return (0, session_1.getMessageQueue)().sendToOpenGroupV2({
                    message: openGroupMessage,
                    roomInfos,
                    blinded: (0, sqlSharedTypes_1.roomHasBlindEnabled)(openGroup),
                    filesToLink: fileIdsToLink,
                });
            }
            const chatParams = {
                identifier: this.id,
                body,
                timestamp: Date.now(),
                expireTimer: this.get('expireTimer'),
                attachments,
                preview: preview ? [preview] : [],
                reacts: this.get('reacts'),
                quote,
                lokiProfile: utils_1.UserUtils.getOurProfile(),
            };
            if (!chatParams.lokiProfile) {
                delete chatParams.lokiProfile;
            }
            const chatMessage = new VisibleMessage_1.VisibleMessage(chatParams);
            if (conversation.isMe()) {
                return this.sendSyncMessageOnly(chatMessage);
            }
            if (conversation.isPrivate()) {
                return (0, session_1.getMessageQueue)().sendToPubKey(types_1.PubKey.cast(conversation.id), chatMessage, namespaces_1.SnodeNamespaces.UserMessages);
            }
            if (!conversation.isClosedGroup()) {
                throw new Error('We should only end up with a closed group here. Anything else is an error');
            }
            const closedGroupVisibleMessage = new ClosedGroupVisibleMessage_1.ClosedGroupVisibleMessage({
                identifier: this.id,
                chatMessage,
                groupId: this.get('conversationId'),
            });
            return (0, session_1.getMessageQueue)().sendToGroup({
                message: closedGroupVisibleMessage,
                namespace: namespaces_1.SnodeNamespaces.ClosedGroupMessage,
            });
        }
        catch (e) {
            await this.saveErrors(e);
            return null;
        }
    }
    removeOutgoingErrors(number) {
        const errors = (0, lodash_1.partition)(this.get('errors'), e => e.number === number && e.name === 'SendMessageNetworkError');
        this.set({ errors: errors[1] });
        return errors[0][0];
    }
    getConversation() {
        return (0, conversations_1.getConversationController)().getUnsafe(this.get('conversationId'));
    }
    getQuoteContact() {
        const quote = this.get('quote');
        if (!quote) {
            return null;
        }
        const { author } = quote;
        if (!author) {
            return null;
        }
        return (0, conversations_1.getConversationController)().get(author);
    }
    getSource() {
        if (this.isIncoming()) {
            return this.get('source');
        }
        return utils_1.UserUtils.getOurPubKeyStrFromCache();
    }
    isOutgoing() {
        return this.get('type') === 'outgoing';
    }
    hasErrors() {
        return (0, lodash_1.size)(this.get('errors')) > 0;
    }
    async updateMessageHash(messageHash) {
        if (!messageHash) {
            sessionjs_logger_1.console.error('Message hash not provided to update message hash');
        }
        this.set({
            messageHash,
        });
        await this.commit();
    }
    async sendSyncMessageOnly(dataMessage) {
        const now = Date.now();
        this.set({
            sent_to: [utils_1.UserUtils.getOurPubKeyStrFromCache()],
            sent: true,
            expirationStartTimestamp: now,
        });
        await this.commit();
        const data = dataMessage instanceof outgoing_1.DataMessage ? dataMessage.dataProto() : dataMessage;
        await this.sendSyncMessage(data, now);
    }
    async sendSyncMessage(dataMessage, sentTimestamp) {
        if (this.get('synced') || this.get('sentSync')) {
            return;
        }
        if (dataMessage.body?.length ||
            dataMessage.attachments.length ||
            dataMessage.flags === protobuf_1.SignalService.DataMessage.Flags.EXPIRATION_TIMER_UPDATE) {
            const conversation = this.getConversation();
            if (!conversation) {
                throw new Error('Cannot trigger syncMessage with unknown convo.');
            }
            const syncMessage = (0, syncUtils_1.buildSyncMessage)(this.id, dataMessage, conversation.id, sentTimestamp);
            await (0, session_1.getMessageQueue)().sendSyncMessage({
                namespace: namespaces_1.SnodeNamespaces.UserMessages,
                message: syncMessage,
            });
        }
        this.set({ sentSync: true });
        await this.commit();
    }
    async saveErrors(providedErrors) {
        let errors = providedErrors;
        if (!(errors instanceof Array)) {
            errors = [errors];
        }
        errors.forEach((e) => {
            sessionjs_logger_1.console.error('Message.saveErrors:', e && e.reason ? e.reason : null, e && e.stack ? e.stack : e);
        });
        errors = errors.map((e) => {
            if (e.constructor === Error ||
                e.constructor === TypeError ||
                e.constructor === ReferenceError) {
                return (0, lodash_1.pick)(e, 'name', 'message', 'code', 'number', 'reason');
            }
            return e;
        });
        errors = errors.concat(this.get('errors') || []);
        this.set({ errors });
        await this.commit();
    }
    async commit(triggerUIUpdate = true) {
        if (!this.id) {
            throw new Error('A message always needs an id');
        }
        (0, Performance_1.perfStart)(`messageCommit-${this.id}`);
        const id = await data_1.Data.saveMessage((0, lodash_1.cloneDeep)(this.attributes));
        if (triggerUIUpdate) {
            this.dispatchMessageUpdate();
        }
        (0, Performance_1.perfEnd)(`messageCommit-${this.id}`, 'messageCommit');
        return id;
    }
    async markMessageAsRead(readAt) {
        this.markMessageReadNoCommit(readAt);
        await this.commit();
        await this.setToExpire();
        await this.getConversation()?.refreshInMemoryDetails();
    }
    markMessageReadNoCommit(readAt) {
        this.set({ unread: conversationAttributes_1.READ_MESSAGE_STATE.read });
        if (this.get('expireTimer') &&
            !this.get('expirationStartTimestamp') &&
            !this.get('expires_at')) {
            const expirationStartTimestamp = Math.min(Date.now(), readAt || Date.now());
            this.set({ expirationStartTimestamp });
            const start = this.get('expirationStartTimestamp');
            const delta = this.get('expireTimer') * 1000;
            if (!start) {
                return;
            }
            const expiresAt = start + delta;
            this.set({ expires_at: expiresAt });
        }
    }
    isExpiring() {
        return this.get('expireTimer') && this.get('expirationStartTimestamp');
    }
    isExpired() {
        return this.msTilExpire() <= 0;
    }
    msTilExpire() {
        if (!this.isExpiring()) {
            return Infinity;
        }
        const now = Date.now();
        const start = this.get('expirationStartTimestamp');
        if (!start) {
            return Infinity;
        }
        const delta = this.get('expireTimer') * 1000;
        let msFromNow = start + delta - now;
        if (msFromNow < 0) {
            msFromNow = 0;
        }
        return msFromNow;
    }
    async setToExpire() {
        if (this.isExpiring() && !this.get('expires_at')) {
            const start = this.get('expirationStartTimestamp');
            const delta = this.get('expireTimer') * 1000;
            if (!start) {
                return;
            }
            const expiresAt = start + delta;
            this.set({ expires_at: expiresAt });
            const id = this.get('id');
            if (id) {
                await this.commit();
            }
            sessionjs_logger_1.console.info('Set message expiration', {
                expiresAt,
                sentAt: this.get('sent_at'),
            });
        }
    }
    isTrustedForAttachmentDownload() {
        try {
            const senderConvoId = this.getSource();
            const isClosedGroup = this.getConversation()?.isClosedGroup() || false;
            const isOpengroup = this.getConversation()?.isOpenGroupV2() || false;
            if (isOpengroup || isClosedGroup || (0, User_1.isUsFromCache)(senderConvoId)) {
                return true;
            }
            const senderConvo = (0, conversations_1.getConversationController)().get(senderConvoId);
            if (!senderConvo) {
                return false;
            }
            return senderConvo.get('isTrustedForAttachmentDownload') || false;
        }
        catch (e) {
            sessionjs_logger_1.console.warn('isTrustedForAttachmentDownload: error; ', e.message);
            return false;
        }
    }
    dispatchMessageUpdate() {
        updatesToDispatch.set(this.id, this.getMessageModelProps());
        throttledAllMessagesDispatch();
    }
    getGroupUpdateAsArray() {
        const groupUpdate = this.get('group_update');
        if (!groupUpdate || (0, lodash_1.isEmpty)(groupUpdate)) {
            return undefined;
        }
        const left = Array.isArray(groupUpdate.left)
            ? groupUpdate.left
            : groupUpdate.left
                ? [groupUpdate.left]
                : undefined;
        const kicked = Array.isArray(groupUpdate.kicked)
            ? groupUpdate.kicked
            : groupUpdate.kicked
                ? [groupUpdate.kicked]
                : undefined;
        const joined = Array.isArray(groupUpdate.joined)
            ? groupUpdate.joined
            : groupUpdate.joined
                ? [groupUpdate.joined]
                : undefined;
        const forcedArrayUpdate = {};
        if (left) {
            forcedArrayUpdate.left = left;
        }
        if (joined) {
            forcedArrayUpdate.joined = joined;
        }
        if (kicked) {
            forcedArrayUpdate.kicked = kicked;
        }
        if (groupUpdate.name) {
            forcedArrayUpdate.name = groupUpdate.name;
        }
        return forcedArrayUpdate;
    }
    getDescription() {
        const groupUpdate = this.getGroupUpdateAsArray();
        if (groupUpdate) {
            if (arrayContainsUsOnly(groupUpdate.kicked)) {
                return ('youGotKickedFromGroup');
            }
            if (arrayContainsUsOnly(groupUpdate.left)) {
                return ('youLeftTheGroup');
            }
            if (groupUpdate.left && groupUpdate.left.length === 1) {
                return 'leftTheGroup';
            }
            const messages = [];
            if (!groupUpdate.name && !groupUpdate.joined && !groupUpdate.kicked && !groupUpdate.kicked) {
                return ('updatedTheGroup');
            }
            if (groupUpdate.name) {
                return 'titleIsNow';
            }
            if (groupUpdate.joined && groupUpdate.joined.length) {
                const names = groupUpdate.joined.map((0, conversations_1.getConversationController)().getContactProfileNameOrShortenedPubKey);
                if (names.length > 1) {
                    messages.push('multipleJoinedTheGroup ' + names.join(', '));
                }
                else {
                    messages.push('joinedTheGroup ' + names.join(', '));
                }
                return messages.join(' ');
            }
            if (groupUpdate.kicked && groupUpdate.kicked.length) {
                const names = (0, lodash_1.map)(groupUpdate.kicked, (0, conversations_1.getConversationController)().getContactProfileNameOrShortenedPubKey);
                if (names.length > 1) {
                    messages.push('multipleKickedFromTheGroup');
                }
                else {
                    messages.push('kickedFromTheGroup');
                }
            }
            return messages.join(' ');
        }
        if (this.isIncoming() && this.hasErrors()) {
            return ('incomingError');
        }
        if (this.isGroupInvitation()) {
            return `😎 ${('openGroupInvitation')}`;
        }
        if (this.isDataExtractionNotification()) {
            const dataExtraction = this.get('dataExtractionNotification');
            if (dataExtraction.type === protobuf_1.SignalService.DataExtractionNotification.Type.SCREENSHOT) {
                return 'tookAScreenshot' + [
                    (0, conversations_1.getConversationController)().getContactProfileNameOrShortenedPubKey(dataExtraction.source),
                ].join(', ');
            }
            return 'savedTheFile' + [
                (0, conversations_1.getConversationController)().getContactProfileNameOrShortenedPubKey(dataExtraction.source),
            ].join(', ');
        }
        if (this.get('callNotificationType')) {
            const displayName = (0, conversations_1.getConversationController)().getContactProfileNameOrShortenedPubKey(this.get('conversationId'));
            const callNotificationType = this.get('callNotificationType');
            if (callNotificationType === 'missed-call') {
                return 'callMissed ' + displayName;
            }
            if (callNotificationType === 'started-call') {
                return 'startedACall ' + displayName;
            }
            if (callNotificationType === 'answered-a-call') {
                return 'answeredACall ' + displayName;
            }
        }
        if (this.get('reaction')) {
            const reaction = this.get('reaction');
            if (reaction && reaction.emoji && reaction.emoji !== '') {
                return 'reactionNotification ' + reaction.emoji;
            }
        }
        return this.get('body');
    }
}
exports.MessageModel = MessageModel;
const throttledAllMessagesDispatch = (0, lodash_1.debounce)(() => {
    if (updatesToDispatch.size === 0) {
        return;
    }
    sessionjs_logger_1.console.log('[SBOT/redux] messagesChanged');
    updatesToDispatch.clear();
}, 500, { trailing: true, leading: true, maxWait: 1000 });
const updatesToDispatch = new Map();
class MessageCollection extends backbone_1.default.Collection {
}
exports.MessageCollection = MessageCollection;
MessageCollection.prototype.model = MessageModel;
function findAndFormatContact(pubkey) {
    const contactModel = (0, conversations_1.getConversationController)().get(pubkey);
    let profileName = null;
    let isMe = false;
    if (pubkey === utils_1.UserUtils.getOurPubKeyStrFromCache() ||
        (pubkey && types_1.PubKey.isBlinded(pubkey) && (0, knownBlindedkeys_1.isUsAnySogsFromCache)(pubkey))) {
        profileName = ('you');
        isMe = true;
    }
    else {
        profileName = contactModel?.getNicknameOrRealUsername() || null;
    }
    return {
        pubkey,
        avatarPath: contactModel ? contactModel.getAvatarPath() : null,
        name: contactModel?.getRealSessionUsername() || null,
        profileName,
        isMe,
    };
}
exports.findAndFormatContact = findAndFormatContact;
function processQuoteAttachment(attachment) {
    const { thumbnail } = attachment;
    const path = thumbnail && thumbnail.path && (0, MessageAttachment_1.getAbsoluteAttachmentPath)(thumbnail.path);
    const objectUrl = thumbnail && thumbnail.objectUrl;
    const thumbnailWithObjectUrl = !path && !objectUrl ? null : { ...(attachment.thumbnail || {}), objectUrl: path || objectUrl };
    return {
        ...attachment,
        isVoiceMessage: (0, Attachment_1.isVoiceMessage)(attachment),
        thumbnail: thumbnailWithObjectUrl,
    };
}
exports.processQuoteAttachment = processQuoteAttachment;
