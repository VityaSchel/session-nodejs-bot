"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkerInterface = void 0;
const web_worker_1 = __importDefault(require("web-worker"));
const sessionjs_logger_1 = require("../sessionjs-logger");
const WORKER_TIMEOUT = 60 * 1000;
class TimedOutError extends Error {
    constructor(message) {
        super(message);
        this.name = this.constructor.name;
        if (typeof Error.captureStackTrace === 'function') {
            Error.captureStackTrace(this, this.constructor);
        }
        else {
            this.stack = new Error(message).stack;
        }
    }
}
class WorkerInterface {
    timeout;
    _DEBUG;
    _jobCounter;
    _jobs;
    _worker;
    constructor(path, timeout = WORKER_TIMEOUT) {
        process.dlopen = () => {
            throw new Error('Load native module is not safe');
        };
        this._worker = new web_worker_1.default(path);
        this.timeout = timeout;
        this._jobs = Object.create(null);
        this._DEBUG = false;
        this._jobCounter = 0;
        this._worker.onmessage = (e) => {
            const [jobId, errorForDisplay, result] = e.data;
            const job = this._getJob(jobId);
            if (!job) {
                throw new Error(`Received worker reply to job ${jobId}, but did not have it in our registry!`);
            }
            const { resolve, reject, fnName } = job;
            if (errorForDisplay) {
                sessionjs_logger_1.console.error(`Error received from worker job ${jobId} (${fnName}):`, errorForDisplay);
                return reject(new Error(`Error received from worker job ${jobId} (${fnName}): ${errorForDisplay}`));
            }
            return resolve(result);
        };
    }
    async callWorker(fnName, ...args) {
        const jobId = this._makeJob(fnName);
        return new Promise((resolve, reject) => {
            this._worker.postMessage([jobId, fnName, ...args]);
            this._updateJob(jobId, {
                resolve,
                reject,
                args: this._DEBUG ? args : null,
            });
            setTimeout(() => {
                reject(new TimedOutError(`Worker job ${jobId} (${fnName}) timed out`));
            }, this.timeout);
        });
    }
    _makeJob(fnName) {
        this._jobCounter += 1;
        const id = this._jobCounter;
        if (this._DEBUG) {
            sessionjs_logger_1.console.info(`Worker job ${id} (${fnName}) started`);
        }
        this._jobs[id] = {
            fnName,
            start: Date.now(),
        };
        return id;
    }
    _updateJob(id, data) {
        const { resolve, reject } = data;
        const { fnName, start } = this._jobs[id];
        this._jobs[id] = {
            ...this._jobs[id],
            ...data,
            resolve: (value) => {
                this._removeJob(id);
                const end = Date.now();
                if (this._DEBUG) {
                    sessionjs_logger_1.console.info(`Worker job ${id} (${fnName}) succeeded in ${end - start}ms`);
                }
                return resolve(value);
            },
            reject: (error) => {
                this._removeJob(id);
                const end = Date.now();
                sessionjs_logger_1.console.info(`Worker job ${id} (${fnName}) failed in ${end - start}ms with ${error.message}`);
                return reject(error);
            },
        };
    }
    _removeJob(id) {
        if (this._DEBUG) {
            this._jobs[id].complete = true;
        }
        else {
            delete this._jobs[id];
        }
    }
    _getJob(id) {
        return this._jobs[id];
    }
}
exports.WorkerInterface = WorkerInterface;
