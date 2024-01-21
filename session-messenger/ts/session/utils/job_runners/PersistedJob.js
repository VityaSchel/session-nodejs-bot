"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PersistedJob = exports.RunJobResult = void 0;
const lodash_1 = require("lodash");
const sessionjs_logger_1 = require("../../../sessionjs-logger");
var RunJobResult;
(function (RunJobResult) {
    RunJobResult[RunJobResult["Success"] = 1] = "Success";
    RunJobResult[RunJobResult["RetryJobIfPossible"] = 2] = "RetryJobIfPossible";
    RunJobResult[RunJobResult["PermanentFailure"] = 3] = "PermanentFailure";
})(RunJobResult || (exports.RunJobResult = RunJobResult = {}));
class PersistedJob {
    persistedData;
    runningPromise = null;
    constructor(data) {
        if (data.maxAttempts < 1) {
            throw new Error('maxAttempts must be >= 1');
        }
        if ((0, lodash_1.isEmpty)(data.identifier)) {
            throw new Error('identifier must be not empty');
        }
        if ((0, lodash_1.isEmpty)(data.jobType)) {
            throw new Error('jobType must be not empty');
        }
        if (data.delayBetweenRetries <= 0) {
            throw new Error('delayBetweenRetries must be at least > 0');
        }
        if (data.nextAttemptTimestamp <= 0) {
            throw new Error('nextAttemptTimestamp must be set and > 0');
        }
        this.persistedData = data;
    }
    async runJob() {
        if (!this.runningPromise) {
            this.runningPromise = this.run();
        }
        return this.runningPromise;
    }
    async waitForCurrentTry() {
        try {
            return this.runningPromise || Promise.resolve(true);
        }
        catch (e) {
            sessionjs_logger_1.console.warn('waitForCurrentTry got an error: ', e.message);
            return Promise.resolve(true);
        }
    }
    addJobCheckSameTypePresent(jobs) {
        return jobs.some(j => j.jobType === this.persistedData.jobType)
            ? 'skipAddSameJobPresent'
            : null;
    }
    serializeBase() {
        return (0, lodash_1.cloneDeep)(this.persistedData);
    }
}
exports.PersistedJob = PersistedJob;
