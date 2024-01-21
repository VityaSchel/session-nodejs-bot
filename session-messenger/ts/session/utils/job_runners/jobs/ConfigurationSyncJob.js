"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigurationSync = void 0;
const lodash_1 = require("lodash");
const uuid_1 = require("uuid");
const __1 = require("../..");
const configDump_1 = require("../../../../data/configDump/configDump");
const libsession_worker_interface_1 = require("../../../../webworker/workers/browser/libsession_worker_interface");
const conversations_1 = require("../../../conversations");
const MessageSender_1 = require("../../../sending/MessageSender");
const libsession_utils_1 = require("../../libsession/libsession_utils");
const JobRunner_1 = require("../JobRunner");
const PersistedJob_1 = require("../PersistedJob");
const releaseFeature_1 = require("../../../../util/releaseFeature");
const Promise_1 = require("../../Promise");
const storage_1 = require("../../../../util/storage");
const sessionjs_logger_1 = require("../../../../sessionjs-logger");
const defaultMsBetweenRetries = 15000;
const defaultMaxAttempts = 2;
let lastRunConfigSyncJobTimestamp = null;
async function retrieveSingleDestinationChanges(destination) {
    const outgoingConfResults = await libsession_utils_1.LibSessionUtil.pendingChangesForPubkey(destination);
    const compactedHashes = (0, lodash_1.compact)(outgoingConfResults.map(m => m.oldMessageHashes)).flat();
    return { messages: outgoingConfResults, allOldHashes: compactedHashes };
}
function resultsToSuccessfulChange(result, request) {
    const successfulChanges = [];
    if (!result?.length) {
        return successfulChanges;
    }
    for (let j = 0; j < result.length; j++) {
        const batchResult = result[j];
        const messagePostedHashes = batchResult?.body?.hash;
        if (batchResult.code === 200 &&
            (0, lodash_1.isString)(messagePostedHashes) &&
            request.messages?.[j].message) {
            successfulChanges.push({
                updatedHash: messagePostedHashes,
                message: request.messages?.[j].message,
            });
        }
    }
    return successfulChanges;
}
async function buildAndSaveDumpsToDB(changes, destination) {
    for (let i = 0; i < changes.length; i++) {
        const change = changes[i];
        const variant = libsession_utils_1.LibSessionUtil.kindToVariant(change.message.kind);
        const needsDump = await libsession_utils_1.LibSessionUtil.markAsPushed(variant, destination, change.message.seqno.toNumber(), change.updatedHash);
        if (!needsDump) {
            continue;
        }
        const dump = await libsession_worker_interface_1.GenericWrapperActions.dump(variant);
        await configDump_1.ConfigDumpData.saveConfigDump({
            data: dump,
            publicKey: destination,
            variant,
        });
    }
}
async function saveDumpsNeededToDB(destination) {
    for (let i = 0; i < libsession_utils_1.LibSessionUtil.requiredUserVariants.length; i++) {
        const variant = libsession_utils_1.LibSessionUtil.requiredUserVariants[i];
        const needsDump = await libsession_worker_interface_1.GenericWrapperActions.needsDump(variant);
        if (!needsDump) {
            continue;
        }
        const dump = await libsession_worker_interface_1.GenericWrapperActions.dump(variant);
        await configDump_1.ConfigDumpData.saveConfigDump({
            data: dump,
            publicKey: destination,
            variant,
        });
    }
}
class ConfigurationSyncJob extends PersistedJob_1.PersistedJob {
    constructor({ identifier, nextAttemptTimestamp, maxAttempts, currentRetry, }) {
        super({
            jobType: 'ConfigurationSyncJobType',
            identifier: identifier || (0, uuid_1.v4)(),
            delayBetweenRetries: defaultMsBetweenRetries,
            maxAttempts: (0, lodash_1.isNumber)(maxAttempts) ? maxAttempts : defaultMaxAttempts,
            currentRetry: (0, lodash_1.isNumber)(currentRetry) ? currentRetry : 0,
            nextAttemptTimestamp: nextAttemptTimestamp || Date.now(),
        });
    }
    async run() {
        const start = Date.now();
        try {
            sessionjs_logger_1.console.debug(`ConfigurationSyncJob starting ${this.persistedData.identifier}`);
            const us = __1.UserUtils.getOurPubKeyStrFromCache();
            const ed25519Key = await __1.UserUtils.getUserED25519KeyPairBytes();
            const conversation = (0, conversations_1.getConversationController)().get(us);
            if (!us || !conversation || !ed25519Key) {
                sessionjs_logger_1.console.warn('did not find our own conversation');
                return PersistedJob_1.RunJobResult.PermanentFailure;
            }
            const thisJobDestination = us;
            await saveDumpsNeededToDB(thisJobDestination);
            const userConfigLibsession = await releaseFeature_1.ReleasedFeatures.checkIsUserConfigFeatureReleased();
            if (!userConfigLibsession) {
                this.triggerConfSyncJobDone();
                return PersistedJob_1.RunJobResult.Success;
            }
            const singleDestChanges = await retrieveSingleDestinationChanges(thisJobDestination);
            if ((0, lodash_1.isEmpty)(singleDestChanges?.messages)) {
                this.triggerConfSyncJobDone();
                return PersistedJob_1.RunJobResult.Success;
            }
            const oldHashesToDelete = new Set(singleDestChanges.allOldHashes);
            const msgs = singleDestChanges.messages.map(item => {
                return {
                    namespace: item.namespace,
                    pubkey: thisJobDestination,
                    timestamp: item.message.timestamp,
                    ttl: item.message.ttl(),
                    message: item.message,
                };
            });
            const result = await MessageSender_1.MessageSender.sendMessagesToSnode(msgs, thisJobDestination, oldHashesToDelete);
            const expectedReplyLength = singleDestChanges.messages.length + (oldHashesToDelete.size ? 1 : 0);
            if (!(0, lodash_1.isArray)(result) || result.length !== expectedReplyLength) {
                sessionjs_logger_1.console.info(`ConfigurationSyncJob: unexpected result length: expected ${expectedReplyLength} but got ${result?.length}`);
                return PersistedJob_1.RunJobResult.RetryJobIfPossible;
            }
            const changes = resultsToSuccessfulChange(result, singleDestChanges);
            if ((0, lodash_1.isEmpty)(changes)) {
                return PersistedJob_1.RunJobResult.RetryJobIfPossible;
            }
            await buildAndSaveDumpsToDB(changes, thisJobDestination);
            this.triggerConfSyncJobDone();
            return PersistedJob_1.RunJobResult.Success;
        }
        catch (e) {
            throw e;
        }
        finally {
            sessionjs_logger_1.console.debug(`ConfigurationSyncJob run() took ${Date.now() - start}ms`);
            this.updateLastTickTimestamp();
        }
    }
    serializeJob() {
        const fromParent = super.serializeBase();
        return fromParent;
    }
    addJobCheck(jobs) {
        return this.addJobCheckSameTypePresent(jobs);
    }
    nonRunningJobsToRemove(_jobs) {
        return [];
    }
    getJobTimeoutMs() {
        return 20000;
    }
    updateLastTickTimestamp() {
        lastRunConfigSyncJobTimestamp = Date.now();
    }
    triggerConfSyncJobDone() {
        global.SBOT.ConfigurationSyncJobDone?.();
    }
}
async function queueNewJobIfNeeded() {
    if ((0, storage_1.isSignInByLinking)()) {
        sessionjs_logger_1.console.info('NOT Scheduling ConfSyncJob: as we are linking a device');
        return;
    }
    if (!lastRunConfigSyncJobTimestamp ||
        lastRunConfigSyncJobTimestamp < Date.now() - defaultMsBetweenRetries) {
        await JobRunner_1.runners.configurationSyncRunner.addJob(new ConfigurationSyncJob({ nextAttemptTimestamp: Date.now() + 1000 }));
    }
    else {
        const diff = Math.max(Date.now() - lastRunConfigSyncJobTimestamp, 0);
        const leftBeforeNextTick = Math.max(defaultMsBetweenRetries - diff, 1000);
        await JobRunner_1.runners.configurationSyncRunner.addJob(new ConfigurationSyncJob({ nextAttemptTimestamp: Date.now() + leftBeforeNextTick }));
    }
}
exports.ConfigurationSync = {
    ConfigurationSyncJob,
    queueNewJobIfNeeded: () => (0, Promise_1.allowOnlyOneAtATime)('ConfigurationSyncJob-oneAtAtTime', queueNewJobIfNeeded),
};
