"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initAttachmentPaths = exports.addJob = exports.stop = exports.start = void 0;
const lodash_1 = require("lodash");
const uuid_1 = require("uuid");
const Constants = __importStar(require("../constants"));
const data_1 = require("../../data/data");
const attachments_1 = require("../../receiver/attachments");
const MessageAttachment_1 = require("../../types/MessageAttachment");
const initializeAttachmentMetadata_1 = require("../../types/message/initializeAttachmentMetadata");
const onions_1 = require("../apis/snode_api/onions");
const sessionjs_logger_1 = require("../../sessionjs-logger");
const MAX_ATTACHMENT_JOB_PARALLELISM = 3;
const TICK_INTERVAL = Constants.DURATION.MINUTES;
const RETRY_BACKOFF = {
    1: Constants.DURATION.SECONDS * 30,
    2: Constants.DURATION.MINUTES * 30,
    3: Constants.DURATION.HOURS * 6,
};
let enabled = false;
let timeout;
let logger;
const _activeAttachmentDownloadJobs = {};
async function start(options = {}) {
    ({ logger } = options);
    if (!logger) {
        throw new Error('attachment_downloads/start: logger must be provided!');
    }
    enabled = true;
    await data_1.Data.resetAttachmentDownloadPending();
    void _tick();
}
exports.start = start;
function stop() {
    enabled = false;
    if (timeout) {
        global.clearTimeout(timeout);
        timeout = null;
    }
}
exports.stop = stop;
async function addJob(attachment, job) {
    if (!attachment) {
        throw new Error('attachments_download/addJob: attachment is required');
    }
    const { messageId, type, index } = job;
    if (!messageId) {
        throw new Error('attachments_download/addJob: job.messageId is required');
    }
    if (!type) {
        throw new Error('attachments_download/addJob: job.type is required');
    }
    if (!(0, lodash_1.isNumber)(index)) {
        throw new Error('attachments_download/addJob: index must be a number');
    }
    const id = (0, uuid_1.v4)();
    const timestamp = Date.now();
    const toSave = {
        ...job,
        id,
        attachment: (0, lodash_1.omit)(attachment, ['toJSON']),
        timestamp,
        pending: 0,
        attempts: 0,
    };
    await data_1.Data.saveAttachmentDownloadJob(toSave);
    void _maybeStartJob();
    return {
        ...attachment,
        pending: true,
        downloadJobId: id,
    };
}
exports.addJob = addJob;
async function _tick() {
    await _maybeStartJob();
    timeout = setTimeout(_tick, TICK_INTERVAL);
}
async function _maybeStartJob() {
    if (!enabled) {
        return;
    }
    const jobCount = getActiveJobCount();
    const limit = MAX_ATTACHMENT_JOB_PARALLELISM - jobCount;
    if (limit <= 0) {
        return;
    }
    const nextJobs = await data_1.Data.getNextAttachmentDownloadJobs(limit);
    if (nextJobs.length <= 0) {
        return;
    }
    const nextJobsWithoutCurrentlyRunning = (0, lodash_1.filter)(nextJobs, j => _activeAttachmentDownloadJobs[j.id] === undefined);
    if (nextJobsWithoutCurrentlyRunning.length <= 0) {
        return;
    }
    const secondJobCount = getActiveJobCount();
    const needed = MAX_ATTACHMENT_JOB_PARALLELISM - secondJobCount;
    if (needed <= 0) {
        return;
    }
    const jobs = nextJobsWithoutCurrentlyRunning.slice(0, Math.min(needed, nextJobsWithoutCurrentlyRunning.length));
    for (let i = 0, max = jobs.length; i < max; i += 1) {
        const job = jobs[i];
        _activeAttachmentDownloadJobs[job.id] = _runJob(job);
    }
}
async function _runJob(job) {
    const { id, messageId, attachment, type, index, attempts, isOpenGroupV2, openGroupV2Details } = job || {};
    let found;
    try {
        if (!job || !attachment || !messageId) {
            throw new Error(`_runJob: Key information required for job was missing. Job id: ${id}`);
        }
        found = await data_1.Data.getMessageById(messageId);
        if (!found) {
            logger.error('_runJob: Source message not found, deleting job');
            await _finishJob(null, id);
            return;
        }
        const isTrusted = found.isTrustedForAttachmentDownload();
        if (!isTrusted) {
            logger.info('_runJob: sender conversation not trusted yet, deleting job');
            await _finishJob(null, id);
            return;
        }
        if (isOpenGroupV2 && (!openGroupV2Details?.serverUrl || !openGroupV2Details.roomId)) {
            sessionjs_logger_1.console.warn('isOpenGroupV2 download attachment, but no valid openGroupV2Details given:', openGroupV2Details);
            await _finishJob(null, id);
            return;
        }
        const pending = true;
        await data_1.Data.setAttachmentDownloadJobPending(id, pending);
        let downloaded;
        try {
            if (isOpenGroupV2) {
                downloaded = await (0, attachments_1.downloadAttachmentSogsV3)(attachment, openGroupV2Details);
            }
            else {
                downloaded = await (0, attachments_1.downloadAttachment)(attachment);
            }
        }
        catch (error) {
            if (error && error.code === 404) {
                logger.warn(`_runJob: Got 404 from server, marking attachment ${attachment.id} from message ${found.idForLogging()} as permanent error`);
                found = await data_1.Data.getMessageById(messageId);
                _addAttachmentToMessage(found, _markAttachmentAsError(attachment), { type, index });
                await _finishJob(found, id);
                return;
            }
            throw error;
        }
        if (!attachment.contentType) {
            sessionjs_logger_1.console.warn('incoming attachment has no contentType');
        }
        const upgradedAttachment = await (0, MessageAttachment_1.processNewAttachment)({
            ...downloaded,
            fileName: attachment.fileName,
            contentType: attachment.contentType,
        });
        found = await data_1.Data.getMessageById(messageId);
        if (found) {
            const { hasAttachments, hasVisualMediaAttachments, hasFileAttachments, } = (0, initializeAttachmentMetadata_1.getAttachmentMetadata)(found);
            found.set({ hasAttachments, hasVisualMediaAttachments, hasFileAttachments });
        }
        _addAttachmentToMessage(found, upgradedAttachment, { type, index });
        await _finishJob(found, id);
    }
    catch (error) {
        const currentAttempt = (attempts || 0) + 1;
        if (currentAttempt >= 3 || (0, onions_1.was404Error)(error)) {
            logger.error(`_runJob: ${currentAttempt} failed attempts, marking attachment ${id} from message ${found?.idForLogging()} as permanent error:`, error && error.message ? error.message : error);
            found = await data_1.Data.getMessageById(messageId);
            try {
                _addAttachmentToMessage(found, _markAttachmentAsError(attachment), { type, index });
            }
            catch (e) {
            }
            await _finishJob(found || null, id);
            return;
        }
        logger.error(`_runJob: Failed to download attachment type ${type} for message ${found?.idForLogging()}, attempt ${currentAttempt}:`, error && error.message ? error.message : error);
        const failedJob = {
            ...job,
            pending: 0,
            attempts: currentAttempt,
            timestamp: Date.now() + RETRY_BACKOFF[currentAttempt],
        };
        await data_1.Data.saveAttachmentDownloadJob(failedJob);
        delete _activeAttachmentDownloadJobs[id];
        void _maybeStartJob();
    }
}
async function _finishJob(message, id) {
    if (message) {
        const conversation = message.getConversation();
        if (conversation) {
            await message.commit();
        }
    }
    await data_1.Data.removeAttachmentDownloadJob(id);
    delete _activeAttachmentDownloadJobs[id];
    await _maybeStartJob();
}
function getActiveJobCount() {
    return Object.keys(_activeAttachmentDownloadJobs).length;
}
function _markAttachmentAsError(attachment) {
    return {
        ...(0, lodash_1.omit)(attachment, ['key', 'digest', 'id']),
        error: true,
        pending: false,
    };
}
function _addAttachmentToMessage(message, attachment, { type, index }) {
    if (!message) {
        return;
    }
    const logPrefix = `${message.idForLogging()} (type: ${type}, index: ${index})`;
    if (type === 'attachment') {
        const attachments = message.get('attachments');
        if (!attachments || attachments.length <= index) {
            throw new Error(`_addAttachmentToMessage: attachments didn't exist or ${index} was too large`);
        }
        _replaceAttachment(attachments, index, attachment, logPrefix);
        return;
    }
    if (type === 'preview' || type === 'quote') {
        if (type === 'quote') {
            const quote = message.get('quote');
            if (!quote) {
                throw new Error("_addAttachmentToMessage: quote didn't exist");
            }
            delete message.attributes.quote.attachments;
            return;
        }
        const preview = message.get('preview');
        if (!preview || preview.length <= index) {
            throw new Error(`_addAttachmentToMessage: preview didn't exist or ${index} was too large`);
        }
        delete message.attributes.preview[0].image;
        return;
    }
    throw new Error(`_addAttachmentToMessage: Unknown job type ${type} for message ${message.idForLogging()}`);
}
function _replaceAttachment(object, key, newAttachment, logPrefix) {
    const oldAttachment = object[key];
    if (oldAttachment && oldAttachment.path) {
        logger.warn(`_replaceAttachment: ${logPrefix} - old attachment already had path, not replacing`);
    }
    object[key] = newAttachment;
}
exports.initAttachmentPaths = MessageAttachment_1.initializeAttachmentLogic;
