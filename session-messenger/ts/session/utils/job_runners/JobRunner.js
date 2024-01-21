"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runners = exports.PersistedJobRunner = void 0;
const lodash_1 = require("lodash");
const data_1 = require("../../../data/data");
const Promise_1 = require("../Promise");
const JobDeserialization_1 = require("./JobDeserialization");
const PersistedJob_1 = require("./PersistedJob");
const storage_1 = require("../../../util/storage");
const sessionjs_logger_1 = require("../../../sessionjs-logger");
function jobToLogId(jobRunner, job) {
    return `id: "${job.persistedData.identifier}" (type: "${jobRunner}")`;
}
class PersistedJobRunner {
    isInit = false;
    jobsScheduled = [];
    isStarted = false;
    jobRunnerType;
    nextJobStartTimer = null;
    currentJob = null;
    constructor(jobRunnerType, _jobEventsListener) {
        this.jobRunnerType = jobRunnerType;
        sessionjs_logger_1.console.warn(`new runner of type ${jobRunnerType} built`);
    }
    async loadJobsFromDb() {
        if (this.isInit) {
            return;
        }
        let jobsArray = [];
        const found = await data_1.Data.getItemById(this.getJobRunnerItemId());
        if (found && found.value && (0, lodash_1.isString)(found.value)) {
            const asStr = found.value;
            try {
                const parsed = JSON.parse(asStr);
                if (!(0, lodash_1.isArray)(parsed)) {
                    jobsArray = [];
                }
                else {
                    jobsArray = parsed;
                }
            }
            catch (e) {
                sessionjs_logger_1.console.warn(`Failed to parse jobs of type ${this.jobRunnerType} from DB`);
                jobsArray = [];
            }
        }
        const jobs = (0, lodash_1.compact)(jobsArray.map(JobDeserialization_1.persistedJobFromData));
        this.jobsScheduled = (0, lodash_1.cloneDeep)(jobs);
        this.sortJobsList();
        this.isInit = true;
    }
    async addJob(job) {
        this.assertIsInitialized();
        if (this.jobsScheduled.find(j => j.persistedData.identifier === job.persistedData.identifier)) {
            sessionjs_logger_1.console.info(`job runner (${this.jobRunnerType}) has already a job with id:"${job.persistedData.identifier}" planned so not adding another one`);
            return 'identifier_exists';
        }
        const serializedNonRunningJobs = this.jobsScheduled
            .filter(j => j !== this.currentJob)
            .map(k => k.serializeJob());
        const addJobChecks = job.addJobCheck(serializedNonRunningJobs);
        if (addJobChecks === 'skipAddSameJobPresent') {
            return 'type_exists';
        }
        sessionjs_logger_1.console.info(`job runner adding type :"${job.persistedData.jobType}" `);
        return this.addJobUnchecked(job);
    }
    getJobList() {
        return this.getSerializedJobs();
    }
    resetForTesting() {
        this.jobsScheduled = [];
        this.isInit = false;
        if (this.nextJobStartTimer) {
            clearTimeout(this.nextJobStartTimer);
            this.nextJobStartTimer = null;
        }
        this.currentJob = null;
    }
    getCurrentJobIdentifier() {
        return this.currentJob?.persistedData?.identifier || null;
    }
    async stopAndWaitCurrentJob() {
        if (!this.isStarted || !this.currentJob) {
            return 'no_await';
        }
        this.isStarted = false;
        await this.currentJob.waitForCurrentTry();
        return 'await';
    }
    async waitCurrentJob() {
        if (!this.isStarted || !this.currentJob) {
            return 'no_await';
        }
        await this.currentJob.waitForCurrentTry();
        return 'await';
    }
    startProcessing() {
        if (this.isStarted) {
            return this.planNextJob();
        }
        this.isStarted = true;
        return this.planNextJob();
    }
    sortJobsList() {
        this.jobsScheduled.sort((a, b) => a.persistedData.nextAttemptTimestamp - b.persistedData.nextAttemptTimestamp);
    }
    async writeJobsToDB() {
        const serialized = this.getSerializedJobs();
        sessionjs_logger_1.console.debug(`writing to db for "${this.jobRunnerType}": `, serialized);
        await storage_1.Storage.put(this.getJobRunnerItemId(), JSON.stringify(serialized));
    }
    async addJobUnchecked(job) {
        this.jobsScheduled.push((0, lodash_1.cloneDeep)(job));
        this.sortJobsList();
        await this.writeJobsToDB();
        const result = this.planNextJob();
        if (result === 'no_job') {
            throw new Error('We just pushed a job, there cannot be no job');
        }
        if (result === 'job_in_progress') {
            return 'job_deferred';
        }
        return result;
    }
    getSerializedJobs() {
        return this.jobsScheduled.map(m => m.serializeJob());
    }
    getJobRunnerItemId() {
        return `jobRunner-${this.jobRunnerType}`;
    }
    planNextJob() {
        if (!this.isStarted) {
            if (this.jobsScheduled.length) {
                return 'job_deferred';
            }
            return 'no_job';
        }
        if (this.currentJob) {
            return 'job_in_progress';
        }
        const nextJob = this.jobsScheduled?.[0];
        if (!nextJob) {
            return 'no_job';
        }
        if (nextJob.persistedData.nextAttemptTimestamp <= Date.now()) {
            if (this.nextJobStartTimer) {
                global.clearTimeout(this.nextJobStartTimer);
                this.nextJobStartTimer = null;
            }
            void this.runNextJob();
            return 'job_started';
        }
        if (this.nextJobStartTimer) {
            global.clearTimeout(this.nextJobStartTimer);
        }
        this.nextJobStartTimer = global.setTimeout(() => {
            if (this.nextJobStartTimer) {
                global.clearTimeout(this.nextJobStartTimer);
                this.nextJobStartTimer = null;
            }
            void this.runNextJob();
        }, Math.max(nextJob.persistedData.nextAttemptTimestamp - Date.now(), 1));
        return 'job_deferred';
    }
    deleteJobsByIdentifier(identifiers) {
        identifiers.forEach(identifier => {
            const jobIndex = this.jobsScheduled.findIndex(f => f.persistedData.identifier === identifier);
            sessionjs_logger_1.console.debug(`removing job ${jobToLogId(this.jobRunnerType, this.jobsScheduled[jobIndex])} at ${jobIndex}`);
            if (jobIndex >= 0) {
                this.jobsScheduled.splice(jobIndex, 1);
            }
        });
    }
    async runNextJob() {
        this.assertIsInitialized();
        if (this.currentJob || !this.isStarted || !this.jobsScheduled.length) {
            return;
        }
        const nextJob = this.jobsScheduled[0];
        if (nextJob.persistedData.nextAttemptTimestamp > Date.now()) {
            sessionjs_logger_1.console.warn('next job is not due to be run just yet. Going idle.', nextJob.persistedData.nextAttemptTimestamp - Date.now());
            this.planNextJob();
            return;
        }
        let success = null;
        try {
            if (this.currentJob) {
                return;
            }
            this.currentJob = nextJob;
            success = await (0, Promise_1.timeout)(this.currentJob.runJob(), this.currentJob.getJobTimeoutMs());
            if (success !== PersistedJob_1.RunJobResult.Success) {
                throw new Error('return result was not "Success"');
            }
            this.deleteJobsByIdentifier([this.currentJob.persistedData.identifier]);
            await this.writeJobsToDB();
        }
        catch (e) {
            sessionjs_logger_1.console.info(`${jobToLogId(this.jobRunnerType, nextJob)} failed with "${e.message}"`);
            if (success === PersistedJob_1.RunJobResult.PermanentFailure ||
                nextJob.persistedData.currentRetry >= nextJob.persistedData.maxAttempts - 1) {
                if (success === PersistedJob_1.RunJobResult.PermanentFailure) {
                    sessionjs_logger_1.console.info(`${jobToLogId(this.jobRunnerType, nextJob)}:${nextJob.persistedData.currentRetry} permament failure for job`);
                }
                else {
                    sessionjs_logger_1.console.info(`Too many failures for ${jobToLogId(this.jobRunnerType, nextJob)}: ${nextJob.persistedData.currentRetry} out of ${nextJob.persistedData.maxAttempts}`);
                }
                this.deleteJobsByIdentifier([nextJob.persistedData.identifier]);
            }
            else {
                sessionjs_logger_1.console.info(`Rescheduling ${jobToLogId(this.jobRunnerType, nextJob)} in ${nextJob.persistedData.delayBetweenRetries}...`);
                nextJob.persistedData.currentRetry += 1;
                nextJob.persistedData.nextAttemptTimestamp =
                    Date.now() + nextJob.persistedData.delayBetweenRetries;
            }
            this.sortJobsList();
            await this.writeJobsToDB();
        }
        finally {
            this.currentJob = null;
            this.planNextJob();
        }
    }
    assertIsInitialized() {
        if (!this.isInit) {
            throw new Error('persisted job runner was not initlized yet. Call loadJobsFromDb with what you have persisted first');
        }
    }
}
exports.PersistedJobRunner = PersistedJobRunner;
const configurationSyncRunner = new PersistedJobRunner('ConfigurationSyncJob', null);
const avatarDownloadRunner = new PersistedJobRunner('AvatarDownloadJob', null);
exports.runners = {
    configurationSyncRunner,
    avatarDownloadRunner,
};
