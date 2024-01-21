"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AvatarDownload = exports.shouldAddAvatarDownloadJob = void 0;
const lodash_1 = require("lodash");
const uuid_1 = require("uuid");
const __1 = require("../..");
const attachments_1 = require("../../../../receiver/attachments");
const types_1 = require("../../../../types");
const MessageAttachment_1 = require("../../../../types/MessageAttachment");
const attachmentsUtil_1 = require("../../../../util/attachmentsUtil");
const profileEncrypter_1 = require("../../../../util/crypto/profileEncrypter");
const conversations_1 = require("../../../conversations");
const String_1 = require("../../String");
const JobRunner_1 = require("../JobRunner");
const PersistedJob_1 = require("../PersistedJob");
const sessionjs_logger_1 = require("../../../../sessionjs-logger");
const defaultMsBetweenRetries = 10000;
const defaultMaxAttemps = 3;
function shouldAddAvatarDownloadJob({ conversationId }) {
    const conversation = (0, conversations_1.getConversationController)().get(conversationId);
    if (!conversation) {
        sessionjs_logger_1.console.warn('shouldAddAvatarDownloadJob did not corresponding conversation');
        return false;
    }
    if (!conversation.isPrivate()) {
        sessionjs_logger_1.console.warn('shouldAddAvatarDownloadJob can only be used for private convos currently');
        return false;
    }
    const prevPointer = conversation.get('avatarPointer');
    const profileKey = conversation.get('profileKey');
    const hasNoAvatar = (0, lodash_1.isEmpty)(prevPointer) || (0, lodash_1.isEmpty)(profileKey);
    if (hasNoAvatar) {
        return false;
    }
    return true;
}
exports.shouldAddAvatarDownloadJob = shouldAddAvatarDownloadJob;
async function addAvatarDownloadJob({ conversationId }) {
    if (shouldAddAvatarDownloadJob({ conversationId })) {
        const avatarDownloadJob = new AvatarDownloadJob({
            conversationId,
            nextAttemptTimestamp: Date.now(),
        });
        sessionjs_logger_1.console.debug(`addAvatarDownloadJobIfNeeded: adding job download for ${conversationId} `);
        await JobRunner_1.runners.avatarDownloadRunner.addJob(avatarDownloadJob);
    }
}
class AvatarDownloadJob extends PersistedJob_1.PersistedJob {
    constructor({ conversationId, nextAttemptTimestamp, maxAttempts, currentRetry, identifier, }) {
        super({
            jobType: 'AvatarDownloadJobType',
            identifier: identifier || (0, uuid_1.v4)(),
            conversationId,
            delayBetweenRetries: defaultMsBetweenRetries,
            maxAttempts: (0, lodash_1.isNumber)(maxAttempts) ? maxAttempts : defaultMaxAttemps,
            nextAttemptTimestamp: nextAttemptTimestamp || Date.now() + defaultMsBetweenRetries,
            currentRetry: (0, lodash_1.isNumber)(currentRetry) ? currentRetry : 0,
        });
    }
    async run() {
        const convoId = this.persistedData.conversationId;
        sessionjs_logger_1.console.warn(`running job ${this.persistedData.jobType} with conversationId:"${convoId}" id:"${this.persistedData.identifier}" `);
        if (!this.persistedData.identifier || !convoId) {
            return PersistedJob_1.RunJobResult.PermanentFailure;
        }
        let conversation = (0, conversations_1.getConversationController)().get(convoId);
        if (!conversation) {
            sessionjs_logger_1.console.warn('AvatarDownloadJob did not corresponding conversation');
            return PersistedJob_1.RunJobResult.PermanentFailure;
        }
        if (!conversation.isPrivate()) {
            sessionjs_logger_1.console.warn('AvatarDownloadJob can only be used for private convos currently');
            return PersistedJob_1.RunJobResult.PermanentFailure;
        }
        let changes = false;
        const toDownloadPointer = conversation.get('avatarPointer');
        const toDownloadProfileKey = conversation.get('profileKey');
        if (toDownloadPointer && toDownloadProfileKey) {
            try {
                sessionjs_logger_1.console.debug(`[profileupdate] starting downloading task for  ${conversation.id}`);
                const downloaded = await (0, attachments_1.downloadAttachment)({
                    url: toDownloadPointer,
                    isRaw: true,
                });
                conversation = (0, conversations_1.getConversationController)().getOrThrow(convoId);
                if (!downloaded.data.byteLength) {
                    sessionjs_logger_1.console.debug(`[profileupdate] downloaded data is empty for  ${conversation.id}`);
                    return PersistedJob_1.RunJobResult.RetryJobIfPossible;
                }
                let path = null;
                try {
                    const profileKeyArrayBuffer = (0, String_1.fromHexToArray)(toDownloadProfileKey);
                    let decryptedData;
                    try {
                        decryptedData = await (0, profileEncrypter_1.decryptProfile)(downloaded.data, profileKeyArrayBuffer);
                    }
                    catch (decryptError) {
                        sessionjs_logger_1.console.info(`[profileupdate] failed to decrypt downloaded data ${conversation.id} with provided profileKey`);
                        return PersistedJob_1.RunJobResult.PermanentFailure;
                    }
                    sessionjs_logger_1.console.info(`[profileupdate] about to auto scale avatar for convo ${conversation.id}`);
                    const scaledData = await (0, attachmentsUtil_1.autoScaleForIncomingAvatar)(decryptedData);
                    const upgraded = await (0, MessageAttachment_1.processNewAttachment)({
                        data: await scaledData.blob.arrayBuffer(),
                        contentType: types_1.MIME.IMAGE_UNKNOWN,
                    });
                    conversation = (0, conversations_1.getConversationController)().getOrThrow(convoId);
                    ({ path } = upgraded);
                }
                catch (e) {
                    sessionjs_logger_1.console.error(`[profileupdate] Could not decrypt profile image: ${e}`);
                    return PersistedJob_1.RunJobResult.RetryJobIfPossible;
                }
                conversation.set({ avatarInProfile: path || undefined });
                changes = true;
            }
            catch (e) {
                if ((0, lodash_1.isString)(e.message) && e.message.includes('404')) {
                    sessionjs_logger_1.console.warn(`[profileupdate] Failed to download attachment at ${toDownloadPointer}. We got 404 error: "${e.message}"`);
                    return PersistedJob_1.RunJobResult.PermanentFailure;
                }
                sessionjs_logger_1.console.warn(`[profileupdate] Failed to download attachment at ${toDownloadPointer}. Maybe it expired? ${e.message}`);
                return PersistedJob_1.RunJobResult.RetryJobIfPossible;
            }
        }
        else if (conversation.get('avatarInProfile')) {
            conversation.set({
                avatarInProfile: undefined,
            });
            changes = true;
        }
        if (conversation.id === __1.UserUtils.getOurPubKeyStrFromCache()) {
            if (!conversation.get('isTrustedForAttachmentDownload') ||
                !conversation.isApproved() ||
                !conversation.didApproveMe()) {
                conversation.set({
                    isTrustedForAttachmentDownload: true,
                });
                await conversation.setDidApproveMe(true, false);
                await conversation.setIsApproved(true, false);
                changes = true;
            }
        }
        if (changes) {
            await conversation.commit();
        }
        return PersistedJob_1.RunJobResult.Success;
    }
    serializeJob() {
        return super.serializeBase();
    }
    nonRunningJobsToRemove(_jobs) {
        return [];
    }
    addJobCheck(jobs) {
        const hasSameJob = jobs.some(j => {
            return j.conversationId === this.persistedData.conversationId;
        });
        if (hasSameJob) {
            return 'skipAddSameJobPresent';
        }
        return null;
    }
    getJobTimeoutMs() {
        return 10000;
    }
}
exports.AvatarDownload = {
    AvatarDownloadJob,
    addAvatarDownloadJob,
};
