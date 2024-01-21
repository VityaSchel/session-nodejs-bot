"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleDataExtractionNotification = exports.innerHandleSwarmContentMessage = exports.decryptEnvelopeWithOurKey = exports.decryptWithSessionProtocol = exports.handleSwarmContentMessage = void 0;
const lodash_1 = require("lodash");
const dataMessage_1 = require("./dataMessage");
const protobuf_1 = require("../protobuf");
const types_1 = require("../session/types");
const cache_1 = require("./cache");
const data_1 = require("../data/data");
const settings_key_1 = require("../data/settings-key");
const conversationAttributes_1 = require("../models/conversationAttributes");
const knownBlindedkeys_1 = require("../session/apis/open_group_api/sogsv3/knownBlindedkeys");
const conversations_1 = require("../session/conversations");
const crypto_1 = require("../session/crypto");
const BufferPadding_1 = require("../session/crypto/BufferPadding");
const ProfileManager_1 = require("../session/profile_manager/ProfileManager");
const utils_1 = require("../session/utils");
const Performance_1 = require("../session/utils/Performance");
const String_1 = require("../session/utils/String");
const sqlSharedTypes_1 = require("../types/sqlSharedTypes");
const util_1 = require("../util");
const readReceipts_1 = require("../util/readReceipts");
const storage_1 = require("../util/storage");
const callMessage_1 = require("./callMessage");
const closedGroups_1 = require("./closedGroups");
const configMessage_1 = require("./configMessage");
const keypairs_1 = require("./keypairs");
const libsession_worker_interface_1 = require("../webworker/workers/browser/libsession_worker_interface");
const User_1 = require("../session/utils/User");
const events_1 = require("../../src/events");
const sessionjs_logger_1 = require("../sessionjs-logger");
async function handleSwarmContentMessage(envelope, messageHash) {
    try {
        const plaintext = await decrypt(envelope);
        if (!plaintext) {
            return;
        }
        if (plaintext instanceof ArrayBuffer && plaintext.byteLength === 0) {
            return;
        }
        const sentAtTimestamp = (0, lodash_1.toNumber)(envelope.timestamp);
        await innerHandleSwarmContentMessage(envelope, sentAtTimestamp, plaintext, messageHash);
    }
    catch (e) {
        sessionjs_logger_1.console.warn(e.message);
    }
}
exports.handleSwarmContentMessage = handleSwarmContentMessage;
async function decryptForClosedGroup(envelope) {
    sessionjs_logger_1.console.info('received closed group message');
    try {
        const hexEncodedGroupPublicKey = envelope.source;
        if (!utils_1.GroupUtils.isClosedGroup(types_1.PubKey.cast(hexEncodedGroupPublicKey))) {
            sessionjs_logger_1.console.warn('received medium group message but not for an existing medium group');
            throw new Error('Invalid group public key');
        }
        const encryptionKeyPairs = await (0, closedGroups_1.getAllCachedECKeyPair)(hexEncodedGroupPublicKey);
        const encryptionKeyPairsCount = encryptionKeyPairs?.length;
        if (!encryptionKeyPairs?.length) {
            throw new Error(`No group keypairs for group ${hexEncodedGroupPublicKey}`);
        }
        let decryptedContent;
        let keyIndex = 0;
        do {
            try {
                const hexEncryptionKeyPair = encryptionKeyPairs.pop();
                if (!hexEncryptionKeyPair) {
                    throw new Error('No more encryption keypairs to try for message.');
                }
                const encryptionKeyPair = keypairs_1.ECKeyPair.fromHexKeyPair(hexEncryptionKeyPair);
                decryptedContent = await decryptWithSessionProtocol(envelope, envelope.content, encryptionKeyPair, true);
                if (decryptedContent?.byteLength) {
                    break;
                }
                keyIndex++;
            }
            catch (e) {
                sessionjs_logger_1.console.info(`Failed to decrypt closed group with key index ${keyIndex}. We have ${encryptionKeyPairs.length} keys to try left.`);
            }
        } while (encryptionKeyPairs.length > 0);
        if (!decryptedContent?.byteLength) {
            throw new Error(`Could not decrypt message for closed group with any of the ${encryptionKeyPairsCount} keypairs.`);
        }
        if (keyIndex !== 0) {
            sessionjs_logger_1.console.warn('Decrypted a closed group message with not the latest encryptionkeypair we have');
        }
        sessionjs_logger_1.console.info('ClosedGroup Message decrypted successfully with keyIndex:', keyIndex);
        return (0, BufferPadding_1.removeMessagePadding)(decryptedContent);
    }
    catch (e) {
        sessionjs_logger_1.console.warn('decryptWithSessionProtocol for medium group message throw:', e.message);
        const groupPubKey = types_1.PubKey.cast(envelope.source);
        throw new Error(`Waiting for an encryption keypair to be received for group ${groupPubKey.key}`);
    }
}
async function decryptWithSessionProtocol(envelope, ciphertextObj, x25519KeyPair, isClosedGroup) {
    (0, Performance_1.perfStart)(`decryptWithSessionProtocol-${envelope.id}`);
    const recipientX25519PrivateKey = x25519KeyPair.privateKeyData;
    const hex = (0, String_1.toHex)(new Uint8Array(x25519KeyPair.publicKeyData));
    const recipientX25519PublicKey = types_1.PubKey.removePrefixIfNeeded(hex);
    const sodium = await (0, crypto_1.getSodiumRenderer)();
    const signatureSize = sodium.crypto_sign_BYTES;
    const ed25519PublicKeySize = sodium.crypto_sign_PUBLICKEYBYTES;
    const plaintextWithMetadata = sodium.crypto_box_seal_open(new Uint8Array(ciphertextObj), (0, String_1.fromHexToArray)(recipientX25519PublicKey), new Uint8Array(recipientX25519PrivateKey));
    if (plaintextWithMetadata.byteLength <= signatureSize + ed25519PublicKeySize) {
        (0, Performance_1.perfEnd)(`decryptWithSessionProtocol-${envelope.id}`, 'decryptWithSessionProtocol');
        throw new Error('Decryption failed.');
    }
    const signatureStart = plaintextWithMetadata.byteLength - signatureSize;
    const signature = plaintextWithMetadata.subarray(signatureStart);
    const pubkeyStart = plaintextWithMetadata.byteLength - (signatureSize + ed25519PublicKeySize);
    const pubkeyEnd = plaintextWithMetadata.byteLength - signatureSize;
    const senderED25519PublicKey = plaintextWithMetadata.subarray(pubkeyStart, pubkeyEnd);
    const plainTextEnd = plaintextWithMetadata.byteLength - (signatureSize + ed25519PublicKeySize);
    const plaintext = plaintextWithMetadata.subarray(0, plainTextEnd);
    const isValid = sodium.crypto_sign_verify_detached(signature, (0, crypto_1.concatUInt8Array)(plaintext, senderED25519PublicKey, (0, String_1.fromHexToArray)(recipientX25519PublicKey)), senderED25519PublicKey);
    if (!isValid) {
        (0, Performance_1.perfEnd)(`decryptWithSessionProtocol-${envelope.id}`, 'decryptWithSessionProtocol');
        throw new Error('Invalid message signature.');
    }
    const senderX25519PublicKey = sodium.crypto_sign_ed25519_pk_to_curve25519(senderED25519PublicKey);
    if (!senderX25519PublicKey) {
        (0, Performance_1.perfEnd)(`decryptWithSessionProtocol-${envelope.id}`, 'decryptWithSessionProtocol');
        throw new Error('Decryption failed.');
    }
    if (isClosedGroup) {
        envelope.senderIdentity = `${types_1.KeyPrefixType.standard}${(0, String_1.toHex)(senderX25519PublicKey)}`;
    }
    else {
        envelope.source = `${types_1.KeyPrefixType.standard}${(0, String_1.toHex)(senderX25519PublicKey)}`;
    }
    (0, Performance_1.perfEnd)(`decryptWithSessionProtocol-${envelope.id}`, 'decryptWithSessionProtocol');
    return plaintext;
}
exports.decryptWithSessionProtocol = decryptWithSessionProtocol;
async function decryptEnvelopeWithOurKey(envelope) {
    try {
        const userX25519KeyPair = await utils_1.UserUtils.getIdentityKeyPair();
        if (!userX25519KeyPair) {
            throw new Error('Failed to find User x25519 keypair from stage');
        }
        const ecKeyPair = keypairs_1.ECKeyPair.fromArrayBuffer(userX25519KeyPair.pubKey, userX25519KeyPair.privKey);
        (0, Performance_1.perfStart)(`decryptUnidentifiedSender-${envelope.id}`);
        const retSessionProtocol = await decryptWithSessionProtocol(envelope, envelope.content, ecKeyPair);
        const ret = (0, BufferPadding_1.removeMessagePadding)(retSessionProtocol);
        (0, Performance_1.perfEnd)(`decryptUnidentifiedSender-${envelope.id}`, 'decryptUnidentifiedSender');
        return ret;
    }
    catch (e) {
        sessionjs_logger_1.console.warn('decryptWithSessionProtocol for unidentified message throw:', e);
        return null;
    }
}
exports.decryptEnvelopeWithOurKey = decryptEnvelopeWithOurKey;
async function decrypt(envelope) {
    if (envelope.content.byteLength === 0) {
        throw new Error('Received an empty envelope.');
    }
    let plaintext = null;
    switch (envelope.type) {
        case protobuf_1.SignalService.Envelope.Type.SESSION_MESSAGE:
            plaintext = await decryptEnvelopeWithOurKey(envelope);
            break;
        case protobuf_1.SignalService.Envelope.Type.CLOSED_GROUP_MESSAGE:
            plaintext = await decryptForClosedGroup(envelope);
            break;
        default:
            (0, sqlSharedTypes_1.assertUnreachable)(envelope.type, `Unknown message type:${envelope.type}`);
    }
    if (!plaintext) {
        await (0, cache_1.removeFromCache)(envelope);
        return null;
    }
    (0, Performance_1.perfStart)(`updateCacheWithDecryptedContent-${envelope.id}`);
    await (0, cache_1.updateCacheWithDecryptedContent)(envelope, plaintext).catch((error) => {
        sessionjs_logger_1.console.error('decrypt failed to save decrypted message contents to cache:', error && error.stack ? error.stack : error);
    });
    (0, Performance_1.perfEnd)(`updateCacheWithDecryptedContent-${envelope.id}`, 'updateCacheWithDecryptedContent');
    return plaintext;
}
async function shouldDropIncomingPrivateMessage(sentAtTimestamp, envelope, content) {
    const moreRecentOrNah = await (0, closedGroups_1.sentAtMoreRecentThanWrapper)(sentAtTimestamp, 'ContactsConfig');
    const isSyncedMessage = (0, User_1.isUsFromCache)(envelope.source);
    if (moreRecentOrNah === 'wrapper_more_recent') {
        try {
            const syncTargetOrSource = isSyncedMessage
                ? content.dataMessage?.syncTarget || undefined
                : envelope.source;
            if (!syncTargetOrSource) {
                return false;
            }
            const privateConvoInWrapper = await libsession_worker_interface_1.ContactsWrapperActions.get(syncTargetOrSource);
            if (!privateConvoInWrapper ||
                privateConvoInWrapper.priority <= conversationAttributes_1.CONVERSATION_PRIORITIES.hidden) {
                sessionjs_logger_1.console.info(`received message on conversation ${syncTargetOrSource} which appears to be hidden/removed in our most recent libsession contactconfig, sentAt: ${sentAtTimestamp}. Dropping it`);
                return true;
            }
            sessionjs_logger_1.console.info(`received message on conversation ${syncTargetOrSource} which appears to NOT be hidden/removed in our most recent libsession contactconfig, sentAt: ${sentAtTimestamp}. `);
        }
        catch (e) {
            sessionjs_logger_1.console.warn('ContactsWrapperActions.get in handleSwarmDataMessage failed with', e.message);
        }
    }
    return false;
}
function shouldDropBlockedUserMessage(content, groupPubkey) {
    if (!groupPubkey) {
        return true;
    }
    const groupConvo = (0, conversations_1.getConversationController)().get(groupPubkey);
    if (!groupConvo || !groupConvo.isClosedGroup()) {
        return true;
    }
    if (groupConvo.isBlocked()) {
        return true;
    }
    let msgWithoutDataMessage = (0, lodash_1.pickBy)(content, (_value, key) => key !== 'dataMessage' && key !== 'toJSON');
    msgWithoutDataMessage = (0, lodash_1.pickBy)(msgWithoutDataMessage, lodash_1.identity);
    const isMessageDataMessageOnly = (0, lodash_1.isEmpty)(msgWithoutDataMessage);
    if (!isMessageDataMessageOnly) {
        return true;
    }
    const data = content.dataMessage;
    const isControlDataMessageOnly = !data.body &&
        !data.preview?.length &&
        !data.attachments?.length &&
        !data.openGroupInvitation &&
        !data.quote;
    return !isControlDataMessageOnly;
}
async function innerHandleSwarmContentMessage(envelope, sentAtTimestamp, plaintext, messageHash) {
    try {
        (0, Performance_1.perfStart)(`SignalService.Content.decode-${envelope.id}`);
        (0, Performance_1.perfStart)(`isBlocked-${envelope.id}`);
        const content = protobuf_1.SignalService.Content.decode(new Uint8Array(plaintext));
        (0, Performance_1.perfEnd)(`SignalService.Content.decode-${envelope.id}`, 'SignalService.Content.decode');
        const blocked = util_1.BlockedNumberController.isBlocked(envelope.senderIdentity || envelope.source);
        (0, Performance_1.perfEnd)(`isBlocked-${envelope.id}`, 'isBlocked');
        if (blocked) {
            const envelopeSource = envelope.source;
            if (shouldDropBlockedUserMessage(content, envelopeSource)) {
                sessionjs_logger_1.console.info('Dropping blocked user message');
                return;
            }
            sessionjs_logger_1.console.info('Allowing group-control message only from blocked user');
        }
        const isPrivateConversationMessage = !envelope.senderIdentity;
        if (isPrivateConversationMessage) {
            if (await shouldDropIncomingPrivateMessage(sentAtTimestamp, envelope, content)) {
                await (0, cache_1.removeFromCache)(envelope);
                return;
            }
        }
        const senderConversationModel = await (0, conversations_1.getConversationController)().getOrCreateAndWait(isPrivateConversationMessage ? envelope.source : envelope.senderIdentity, conversationAttributes_1.ConversationTypeEnum.PRIVATE);
        if (!isPrivateConversationMessage) {
            await (0, conversations_1.getConversationController)().getOrCreateAndWait(envelope.source, conversationAttributes_1.ConversationTypeEnum.GROUP);
        }
        events_1.EventEmitter.emitToAllInstances('message', content, senderConversationModel);
        if (content.dataMessage) {
            if ((0, lodash_1.isEmpty)(content.dataMessage.profileKey)) {
                content.dataMessage.profileKey = null;
            }
            (0, Performance_1.perfStart)(`handleSwarmDataMessage-${envelope.id}`);
            await (0, dataMessage_1.handleSwarmDataMessage)(envelope, sentAtTimestamp, content.dataMessage, messageHash, senderConversationModel);
            (0, Performance_1.perfEnd)(`handleSwarmDataMessage-${envelope.id}`, 'handleSwarmDataMessage');
            return;
        }
        if (content.receiptMessage) {
            (0, Performance_1.perfStart)(`handleReceiptMessage-${envelope.id}`);
            await handleReceiptMessage(envelope, content.receiptMessage);
            (0, Performance_1.perfEnd)(`handleReceiptMessage-${envelope.id}`, 'handleReceiptMessage');
            return;
        }
        if (content.typingMessage) {
            (0, Performance_1.perfStart)(`handleTypingMessage-${envelope.id}`);
            await handleTypingMessage(envelope, content.typingMessage);
            (0, Performance_1.perfEnd)(`handleTypingMessage-${envelope.id}`, 'handleTypingMessage');
            return;
        }
        if (content.configurationMessage) {
            void configMessage_1.ConfigMessageHandler.handleConfigurationMessageLegacy(envelope, content.configurationMessage);
            return;
        }
        if (content.sharedConfigMessage) {
            sessionjs_logger_1.console.warn('content.sharedConfigMessage are handled outside of the receiving pipeline');
            await (0, cache_1.removeFromCache)(envelope);
            return;
        }
        if (content.dataExtractionNotification) {
            (0, Performance_1.perfStart)(`handleDataExtractionNotification-${envelope.id}`);
            await handleDataExtractionNotification(envelope, content.dataExtractionNotification);
            (0, Performance_1.perfEnd)(`handleDataExtractionNotification-${envelope.id}`, 'handleDataExtractionNotification');
            return;
        }
        if (content.unsendMessage) {
            await handleUnsendMessage(envelope, content.unsendMessage);
        }
        if (content.callMessage) {
            await (0, callMessage_1.handleCallMessage)(envelope, content.callMessage);
        }
        if (content.messageRequestResponse) {
            await handleMessageRequestResponse(envelope, content.messageRequestResponse);
        }
    }
    catch (e) {
        sessionjs_logger_1.console.warn(e.message);
    }
}
exports.innerHandleSwarmContentMessage = innerHandleSwarmContentMessage;
async function onReadReceipt(readAt, timestamp, source) {
    sessionjs_logger_1.console.info('read receipt', source, timestamp);
    if (!storage_1.Storage.get(settings_key_1.SettingsKey.settingsReadReceipt)) {
        return;
    }
    await readReceipts_1.ReadReceipts.onReadReceipt({
        source,
        timestamp,
        readAt,
    });
}
async function handleReceiptMessage(envelope, receiptMessage) {
    const receipt = receiptMessage;
    const { type, timestamp } = receipt;
    const results = [];
    if (type === protobuf_1.SignalService.ReceiptMessage.Type.READ) {
        for (const ts of timestamp) {
            const promise = onReadReceipt((0, lodash_1.toNumber)(envelope.timestamp), (0, lodash_1.toNumber)(ts), envelope.source);
            results.push(promise);
        }
    }
    await Promise.all(results);
    await (0, cache_1.removeFromCache)(envelope);
}
async function handleTypingMessage(envelope, typingMessage) {
    const { timestamp, action } = typingMessage;
    const { source } = envelope;
    await (0, cache_1.removeFromCache)(envelope);
    if (!storage_1.Storage.get(settings_key_1.SettingsKey.settingsTypingIndicator)) {
        return;
    }
    if (envelope.timestamp && timestamp) {
        const envelopeTimestamp = (0, lodash_1.toNumber)(envelope.timestamp);
        const typingTimestamp = (0, lodash_1.toNumber)(timestamp);
        if (typingTimestamp !== envelopeTimestamp) {
            sessionjs_logger_1.console.warn(`Typing message envelope timestamp (${envelopeTimestamp}) did not match typing timestamp (${typingTimestamp})`);
            return;
        }
    }
    const conversation = (0, conversations_1.getConversationController)().get(source);
    const started = action === protobuf_1.SignalService.TypingMessage.Action.STARTED;
    if (conversation) {
        await conversation.notifyTypingNoCommit({
            isTyping: started,
            sender: source,
        });
        await conversation.commit();
    }
}
async function handleUnsendMessage(envelope, unsendMessage) {
    const { author: messageAuthor, timestamp } = unsendMessage;
    sessionjs_logger_1.console.info(`handleUnsendMessage from ${messageAuthor}: of timestamp: ${timestamp}`);
    if (messageAuthor !== (envelope.senderIdentity || envelope.source)) {
        sessionjs_logger_1.console.error('handleUnsendMessage: Dropping request as the author and the sender differs.');
        await (0, cache_1.removeFromCache)(envelope);
        return;
    }
    if (!unsendMessage) {
        sessionjs_logger_1.console.error('handleUnsendMessage: Invalid parameters -- dropping message.');
        await (0, cache_1.removeFromCache)(envelope);
        return;
    }
    if (!timestamp) {
        sessionjs_logger_1.console.error('handleUnsendMessage: Invalid timestamp -- dropping message');
        await (0, cache_1.removeFromCache)(envelope);
        return;
    }
    const messageToDelete = (await data_1.Data.getMessagesBySenderAndSentAt([
        {
            source: messageAuthor,
            timestamp: (0, lodash_1.toNumber)(timestamp),
        },
    ]))?.models?.[0];
    const messageHash = messageToDelete?.get('messageHash');
    if (messageHash && messageToDelete) {
        sessionjs_logger_1.console.info('handleUnsendMessage: got a request to delete ', messageHash);
        const conversation = (0, conversations_1.getConversationController)().get(messageToDelete.get('conversationId'));
        if (!conversation) {
            await (0, cache_1.removeFromCache)(envelope);
            return;
        }
        if (messageToDelete.getSource() === utils_1.UserUtils.getOurPubKeyStrFromCache()) {
        }
        else {
        }
    }
    else {
        sessionjs_logger_1.console.info('handleUnsendMessage: got a request to delete an unknown messageHash:', messageHash, ' and found messageToDelete:', messageToDelete?.id);
    }
    await (0, cache_1.removeFromCache)(envelope);
}
async function handleMessageRequestResponse(envelope, messageRequestResponse) {
    const { isApproved } = messageRequestResponse;
    if (!isApproved) {
        await (0, cache_1.removeFromCache)(envelope);
        return;
    }
    if (!messageRequestResponse) {
        sessionjs_logger_1.console.error('handleMessageRequestResponse: Invalid parameters -- dropping message.');
        await (0, cache_1.removeFromCache)(envelope);
        return;
    }
    const sodium = await (0, crypto_1.getSodiumRenderer)();
    const convosToMerge = (0, knownBlindedkeys_1.findCachedBlindedMatchOrLookupOnAllServers)(envelope.source, sodium);
    const unblindedConvoId = envelope.source;
    const conversationToApprove = await (0, conversations_1.getConversationController)().getOrCreateAndWait(unblindedConvoId, conversationAttributes_1.ConversationTypeEnum.PRIVATE);
    let mostRecentActiveAt = Math.max(...(0, lodash_1.compact)(convosToMerge.map(m => m.get('active_at'))));
    if (!(0, lodash_1.isFinite)(mostRecentActiveAt) || mostRecentActiveAt <= 0) {
        mostRecentActiveAt = (0, lodash_1.toNumber)(envelope.timestamp);
    }
    conversationToApprove.set({
        active_at: mostRecentActiveAt,
        isApproved: true,
        didApproveMe: true,
    });
    await conversationToApprove.unhideIfNeeded(false);
    if (convosToMerge.length) {
        conversationToApprove.set({
            profileKey: convosToMerge[0].get('profileKey'),
            displayNameInProfile: convosToMerge[0].get('displayNameInProfile'),
            avatarInProfile: convosToMerge[0].get('avatarInProfile'),
            avatarPointer: convosToMerge[0].get('avatarPointer'),
        });
        sessionjs_logger_1.console.info(`We just found out ${unblindedConvoId} matches some blinded conversations. Merging them together:`, convosToMerge.map(m => m.id));
        const allMessagesCollections = await Promise.all(convosToMerge.map(async (convoToMerge) => data_1.Data.getMessagesByConversation(convoToMerge.id, {
            skipTimerInit: undefined,
            messageId: null,
        })));
        const allMessageModels = (0, lodash_1.flatten)(allMessagesCollections.map(m => m.messages.models));
        allMessageModels.forEach(messageModel => {
            messageModel.set({ conversationId: unblindedConvoId });
            if (messageModel.get('source') !== utils_1.UserUtils.getOurPubKeyStrFromCache()) {
                messageModel.set({ source: unblindedConvoId });
            }
        });
        await data_1.Data.saveMessages(allMessageModels.map(m => m.attributes));
        for (let index = 0; index < convosToMerge.length; index++) {
            const element = convosToMerge[index];
            await (0, conversations_1.getConversationController)().deleteBlindedContact(element.id);
        }
    }
    if (messageRequestResponse.profile && !(0, lodash_1.isEmpty)(messageRequestResponse.profile)) {
        await ProfileManager_1.ProfileManager.updateProfileOfContact(conversationToApprove.id, messageRequestResponse.profile.displayName, messageRequestResponse.profile.profilePicture, messageRequestResponse.profileKey);
    }
    if (!conversationToApprove || conversationToApprove.didApproveMe()) {
        await conversationToApprove?.commit();
        sessionjs_logger_1.console.info('Conversation already contains the correct value for the didApproveMe field.');
        await (0, cache_1.removeFromCache)(envelope);
        return;
    }
    await conversationToApprove.setDidApproveMe(true, true);
    await conversationToApprove.addIncomingApprovalMessage((0, lodash_1.toNumber)(envelope.timestamp), unblindedConvoId);
    await (0, cache_1.removeFromCache)(envelope);
}
async function handleDataExtractionNotification(envelope, dataNotificationMessage) {
    const { type, timestamp: referencedAttachment } = dataNotificationMessage;
    const { source, timestamp } = envelope;
    await (0, cache_1.removeFromCache)(envelope);
    const convo = (0, conversations_1.getConversationController)().get(source);
    if (!convo || !convo.isPrivate() || !storage_1.Storage.get(settings_key_1.SettingsKey.settingsReadReceipt)) {
        sessionjs_logger_1.console.info('Got DataNotification for unknown or non private convo or read receipt not enabled');
        return;
    }
    if (!type || !source) {
        sessionjs_logger_1.console.info('DataNotification pre check failed');
        return;
    }
    if (timestamp) {
        const envelopeTimestamp = (0, lodash_1.toNumber)(timestamp);
        const referencedAttachmentTimestamp = (0, lodash_1.toNumber)(referencedAttachment);
        await convo.addSingleIncomingMessage({
            source,
            sent_at: envelopeTimestamp,
            dataExtractionNotification: {
                type,
                referencedAttachmentTimestamp,
                source,
            },
            unread: conversationAttributes_1.READ_MESSAGE_STATE.unread,
            expireTimer: 0,
        });
        convo.updateLastMessage();
    }
}
exports.handleDataExtractionNotification = handleDataExtractionNotification;
