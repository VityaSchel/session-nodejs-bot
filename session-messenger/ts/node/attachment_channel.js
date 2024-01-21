"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initAttachmentsChannel = void 0;
const path_1 = __importDefault(require("path"));
const lodash_1 = require("lodash");
const rimraf_1 = __importDefault(require("rimraf"));
const fs_extra_1 = __importDefault(require("fs-extra"));
const pify_1 = __importDefault(require("pify"));
const glob_1 = __importDefault(require("glob"));
const sql_1 = require("./sql");
const shared_attachments_1 = require("../shared/attachments/shared_attachments");
const sessionjs_logger_1 = require("../sessionjs-logger");
let initialized = false;
const ERASE_ATTACHMENTS_KEY = 'erase-attachments';
const CLEANUP_ORPHANED_ATTACHMENTS_KEY = 'cleanup-orphaned-attachments';
const ensureDirectory = async (userDataPath) => {
    if (!(0, lodash_1.isString)(userDataPath)) {
        throw new TypeError("'userDataPath' must be a string");
    }
    await fs_extra_1.default.ensureDir((0, shared_attachments_1.getAttachmentsPath)(userDataPath));
};
const deleteAll = async ({ userDataPath, attachments, }) => {
    const deleteFromDisk = (0, shared_attachments_1.createDeleter)((0, shared_attachments_1.getAttachmentsPath)(userDataPath));
    for (let index = 0, max = attachments.length; index < max; index += 1) {
        const file = attachments[index];
        await deleteFromDisk(file);
    }
    sessionjs_logger_1.console.log(`deleteAll: deleted ${attachments.length} files`);
};
const getAllAttachments = async (userDataPath) => {
    const dir = (0, shared_attachments_1.getAttachmentsPath)(userDataPath);
    const pattern = path_1.default.join(dir, '**', '*');
    const files = await (0, pify_1.default)(glob_1.default)(pattern, { nodir: true });
    return (0, lodash_1.map)(files, file => path_1.default.relative(dir, file));
};
async function cleanupOrphanedAttachments(userDataPath) {
    const allAttachments = await getAllAttachments(userDataPath);
    const orphanedAttachments = sql_1.sqlNode.removeKnownAttachments(allAttachments);
    await deleteAll({
        userDataPath,
        attachments: orphanedAttachments,
    });
}
async function initAttachmentsChannel({ userDataPath }) {
    if (initialized) {
        throw new Error('initialze: Already initialized!');
    }
    initialized = true;
    sessionjs_logger_1.console.log('Ensure attachments directory exists');
    await ensureDirectory(userDataPath);
    const attachmentsDir = (0, shared_attachments_1.getAttachmentsPath)(userDataPath);
    global.SBOT.ERASE_ATTACHMENTS_KEY = event => {
        try {
            rimraf_1.default.sync(attachmentsDir);
            event.sender.send(`${ERASE_ATTACHMENTS_KEY}-done`);
        }
        catch (error) {
            const errorForDisplay = error && error.stack ? error.stack : error;
            sessionjs_logger_1.console.log(`erase attachments error: ${errorForDisplay}`);
            event.sender.send(`${ERASE_ATTACHMENTS_KEY}-done`, error);
        }
    };
    global.SBOT.CLEANUP_ORPHANED_ATTACHMENTS_KEY = async (event) => {
        try {
            await cleanupOrphanedAttachments(userDataPath);
            event.sender.send(`${CLEANUP_ORPHANED_ATTACHMENTS_KEY}-done`);
        }
        catch (error) {
            const errorForDisplay = error && error.stack ? error.stack : error;
            sessionjs_logger_1.console.log(`cleanup orphaned attachments error: ${errorForDisplay}`);
            event.sender.send(`${CLEANUP_ORPHANED_ATTACHMENTS_KEY}-done`, error);
        }
    };
}
exports.initAttachmentsChannel = initAttachmentsChannel;
