"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleOutboxMessageModel = exports.isSwarmMessageDuplicate = exports.handleSwarmDataMessage = exports.cleanIncomingDataMessage = exports.messageHasVisibleContent = void 0;
const lodash_1 = require("lodash");
const protobuf_1 = require("../protobuf");
const cache_1 = require("./cache");
const common_1 = require("./common");
const data_1 = require("../data/data");
const conversations_1 = require("../session/conversations");
const types_1 = require("../session/types");
const utils_1 = require("../session/utils");
const closedGroups_1 = require("./closedGroups");
const queuedJob_1 = require("./queuedJob");
const conversationAttributes_1 = require("../models/conversationAttributes");
const messageFactory_1 = require("../models/messageFactory");
const ProfileManager_1 = require("../session/profile_manager/ProfileManager");
const User_1 = require("../session/utils/User");
const Reaction_1 = require("../types/Reaction");
const Errors_1 = require("../types/attachments/Errors");
const reactions_1 = require("../util/reactions");
const sessionjs_logger_1 = require("../sessionjs-logger");
function cleanAttachment(attachment) {
    return {
        ...(0, lodash_1.omit)(attachment, 'thumbnail'),
        id: attachment.id.toString(),
        key: attachment.key ? utils_1.StringUtils.decode(attachment.key, 'base64') : null,
        digest: attachment.digest && attachment.digest.length > 0
            ? utils_1.StringUtils.decode(attachment.digest, 'base64')
            : null,
    };
}
function cleanAttachments(decrypted) {
    const { quote } = decrypted;
    decrypted.group = null;
    decrypted.attachments = (decrypted.attachments || []).map(cleanAttachment);
    decrypted.preview = (decrypted.preview || []).map((item) => {
        const { image } = item;
        if (!image) {
            return item;
        }
        return {
            ...item,
            image: cleanAttachment(image),
        };
    });
    if (quote) {
        if (quote.id) {
            quote.id = (0, lodash_1.toNumber)(quote.id);
        }
        quote.attachments = (quote.attachments || []).map((item) => {
            const { thumbnail } = item;
            if (!thumbnail || thumbnail.length === 0) {
                return item;
            }
            return {
                ...item,
                thumbnail: cleanAttachment(item.thumbnail),
            };
        });
    }
}
function messageHasVisibleContent(message) {
    const { flags, body, attachments, quote, preview, openGroupInvitation, reaction } = message;
    return (!!flags ||
        !(0, lodash_1.isEmpty)(body) ||
        !(0, lodash_1.isEmpty)(attachments) ||
        !(0, lodash_1.isEmpty)(quote) ||
        !(0, lodash_1.isEmpty)(preview) ||
        !(0, lodash_1.isEmpty)(openGroupInvitation) ||
        !(0, lodash_1.isEmpty)(reaction));
}
exports.messageHasVisibleContent = messageHasVisibleContent;
function cleanIncomingDataMessage(rawDataMessage, envelope) {
    const FLAGS = protobuf_1.SignalService.DataMessage.Flags;
    if (rawDataMessage.flags == null) {
        rawDataMessage.flags = 0;
    }
    if (rawDataMessage.expireTimer == null) {
        rawDataMessage.expireTimer = 0;
    }
    if (rawDataMessage.flags & FLAGS.EXPIRATION_TIMER_UPDATE) {
        rawDataMessage.body = '';
        rawDataMessage.attachments = [];
    }
    else if (rawDataMessage.flags !== 0) {
        throw new Error('Unknown flags in message');
    }
    const attachmentCount = rawDataMessage?.attachments?.length || 0;
    const ATTACHMENT_MAX = 32;
    if (attachmentCount > ATTACHMENT_MAX) {
        throw new Error(`Too many attachments: ${attachmentCount} included in one message, max is ${ATTACHMENT_MAX}`);
    }
    cleanAttachments(rawDataMessage);
    if (!(0, lodash_1.isFinite)(rawDataMessage?.timestamp) && envelope) {
        rawDataMessage.timestamp = envelope.timestamp;
    }
    return rawDataMessage;
}
exports.cleanIncomingDataMessage = cleanIncomingDataMessage;
async function handleSwarmDataMessage(envelope, sentAtTimestamp, rawDataMessage, messageHash, senderConversationModel) {
    const cleanDataMessage = cleanIncomingDataMessage(rawDataMessage, envelope);
    if (cleanDataMessage.closedGroupControlMessage) {
        await (0, closedGroups_1.handleClosedGroupControlMessage)(envelope, cleanDataMessage.closedGroupControlMessage);
        return;
    }
    const isSyncedMessage = Boolean(cleanDataMessage.syncTarget?.length);
    const convoIdOfSender = envelope.senderIdentity || envelope.source;
    const isMe = utils_1.UserUtils.isUsFromCache(convoIdOfSender);
    if (isSyncedMessage && !isMe) {
        sessionjs_logger_1.console.warn('Got a sync message from someone else than me. Dropping it.');
        await (0, cache_1.removeFromCache)(envelope);
        return;
    }
    const convoIdToAddTheMessageTo = types_1.PubKey.removeTextSecurePrefixIfNeeded(isSyncedMessage ? cleanDataMessage.syncTarget : envelope.source);
    const isGroupMessage = !!envelope.senderIdentity;
    const isGroupV3Message = isGroupMessage && types_1.PubKey.isClosedGroupV3(envelope.source);
    let typeOfConvo = conversationAttributes_1.ConversationTypeEnum.PRIVATE;
    if (isGroupV3Message) {
        typeOfConvo = conversationAttributes_1.ConversationTypeEnum.GROUPV3;
    }
    else if (isGroupMessage) {
        typeOfConvo = conversationAttributes_1.ConversationTypeEnum.GROUP;
    }
    sessionjs_logger_1.console.info(`Handle dataMessage about convo ${convoIdToAddTheMessageTo} from user: ${convoIdOfSender}`);
    const convoToAddMessageTo = await (0, conversations_1.getConversationController)().getOrCreateAndWait(convoIdToAddTheMessageTo, typeOfConvo);
    if (!isMe &&
        senderConversationModel &&
        cleanDataMessage.profile &&
        cleanDataMessage.profileKey?.length) {
        await ProfileManager_1.ProfileManager.updateProfileOfContact(senderConversationModel.id, cleanDataMessage.profile.displayName, cleanDataMessage.profile.profilePicture, cleanDataMessage.profileKey);
    }
    if (!messageHasVisibleContent(cleanDataMessage)) {
        sessionjs_logger_1.console.warn(`Message ${(0, common_1.getEnvelopeId)(envelope)} ignored; it was empty`);
        await (0, cache_1.removeFromCache)(envelope);
        return;
    }
    if (!convoIdToAddTheMessageTo) {
        sessionjs_logger_1.console.error('We cannot handle a message without a conversationId');
        await (0, cache_1.removeFromCache)(envelope);
        return;
    }
    const msgModel = isSyncedMessage || (envelope.senderIdentity && (0, User_1.isUsFromCache)(envelope.senderIdentity))
        ? (0, messageFactory_1.createSwarmMessageSentFromUs)({
            conversationId: convoIdToAddTheMessageTo,
            messageHash,
            sentAt: sentAtTimestamp,
        })
        : (0, messageFactory_1.createSwarmMessageSentFromNotUs)({
            conversationId: convoIdToAddTheMessageTo,
            messageHash,
            sender: senderConversationModel.id,
            sentAt: sentAtTimestamp,
        });
    await handleSwarmMessage(msgModel, messageHash, sentAtTimestamp, cleanDataMessage, convoToAddMessageTo, () => (0, cache_1.removeFromCache)(envelope));
}
exports.handleSwarmDataMessage = handleSwarmDataMessage;
async function isSwarmMessageDuplicate({ source, sentAt, }) {
    try {
        const result = (await data_1.Data.getMessagesBySenderAndSentAt([
            {
                source,
                timestamp: sentAt,
            },
        ]))?.models?.length;
        return Boolean(result);
    }
    catch (error) {
        sessionjs_logger_1.console.error('isSwarmMessageDuplicate error:', (0, Errors_1.toLogFormat)(error));
        return false;
    }
}
exports.isSwarmMessageDuplicate = isSwarmMessageDuplicate;
async function handleOutboxMessageModel(msgModel, messageHash, sentAt, rawDataMessage, convoToAddMessageTo) {
    return handleSwarmMessage(msgModel, messageHash, sentAt, rawDataMessage, convoToAddMessageTo, lodash_1.noop);
}
exports.handleOutboxMessageModel = handleOutboxMessageModel;
async function handleSwarmMessage(msgModel, messageHash, sentAt, rawDataMessage, convoToAddMessageTo, confirm) {
    if (!rawDataMessage || !msgModel) {
        sessionjs_logger_1.console.warn('Invalid data passed to handleSwarmMessage.');
        confirm();
        return;
    }
    void convoToAddMessageTo.queueJob(async () => {
        if (!msgModel.get('isPublic') && rawDataMessage.reaction) {
            await reactions_1.Reactions.handleMessageReaction({
                reaction: rawDataMessage.reaction,
                sender: msgModel.get('source'),
                you: (0, User_1.isUsFromCache)(msgModel.get('source')),
            });
            if (convoToAddMessageTo.isPrivate() &&
                msgModel.get('unread') &&
                rawDataMessage.reaction.action === Reaction_1.Action.REACT) {
                msgModel.set('reaction', rawDataMessage.reaction);
                convoToAddMessageTo.throttledNotify(msgModel);
            }
            confirm();
            return;
        }
        const isDuplicate = await isSwarmMessageDuplicate({
            source: msgModel.get('source'),
            sentAt,
        });
        if (isDuplicate) {
            sessionjs_logger_1.console.info('Received duplicate message. Dropping it.');
            confirm();
            return;
        }
        await (0, queuedJob_1.handleMessageJob)(msgModel, convoToAddMessageTo, (0, queuedJob_1.toRegularMessage)(rawDataMessage), confirm, msgModel.get('source'), messageHash);
    });
}
