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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getIsReady = void 0;
global.SBOT ??= {};
global.SBOT.profileDataPath ||= __dirname + '/../../session-data/';
const fs_1 = __importDefault(require("fs"));
const crypto_1 = __importDefault(require("crypto"));
const sessionjs_logger_1 = require("../sessionjs-logger");
const lodash_1 = __importDefault(require("lodash"));
const pify_1 = __importDefault(require("pify"));
const getRealPath = (0, pify_1.default)(fs_1.default.realpath);
const user_config_1 = require("../node/config/user_config");
const PasswordUtil = __importStar(require("../util/passwordUtils"));
const attachment_channel_1 = require("../node/attachment_channel");
const ephemeral_config_1 = require("../node/config/ephemeral_config");
const logging_1 = require("../node/logging");
const sql_1 = require("../node/sql");
const sqlChannels = __importStar(require("../node/sql_channel"));
let isReady = false;
sqlChannels.initializeSqlChannel();
const windowFromUserConfig = user_config_1.userConfig.get('window');
const windowFromEphemeral = ephemeral_config_1.ephemeralConfig.get('window');
let windowConfig = windowFromEphemeral || windowFromUserConfig;
if (windowFromUserConfig) {
    user_config_1.userConfig.set('window', null);
    ephemeral_config_1.ephemeralConfig.set('window', windowConfig);
}
const conversations_1 = require("../session/conversations");
const util_1 = require("../util");
const registration_1 = require("../util/registration");
const libsession_utils_1 = require("../session/utils/libsession/libsession_utils");
const dataInit_1 = require("../data/dataInit");
const storage_1 = require("../util/storage");
const JobRunner_1 = require("../session/utils/job_runners/JobRunner");
const receiver_1 = require("../receiver/receiver");
const utils_1 = require("../session/utils");
const snode_api_1 = require("../session/apis/snode_api");
global.SBOT.ready = async () => {
    await (0, logging_1.initializeLogger)();
    const key = getDefaultSQLKey();
    const dbHasPassword = user_config_1.userConfig.get('dbHasPassword');
    if (dbHasPassword) {
        sessionjs_logger_1.console.log('[SBOT] db has no password');
    }
    else {
        sessionjs_logger_1.console.log('[SBOT] db has password', key);
        await showMainWindow(key);
    }
};
function getDefaultSQLKey() {
    let key = user_config_1.userConfig.get('key');
    if (!key) {
        sessionjs_logger_1.console.log('key/initialize: Generating new encryption key, since we did not find it on disk');
        key = crypto_1.default.randomBytes(32).toString('hex');
        user_config_1.userConfig.set('key', key);
    }
    return key;
}
async function removeDB() {
    const userDir = await getRealPath(global.SBOT.profileDataPath);
    sql_1.sqlNode.removeDB(userDir);
    try {
        sessionjs_logger_1.console.error('Remove DB: removing.', userDir);
        user_config_1.userConfig.remove();
        ephemeral_config_1.ephemeralConfig.remove();
    }
    catch (e) {
        sessionjs_logger_1.console.error('Remove DB: Failed to remove configs.', e);
    }
}
async function showMainWindow(sqlKey, passwordAttempt = false) {
    const userDataPath = await getRealPath(global.SBOT.profileDataPath);
    await sql_1.sqlNode.initializeSql({
        configDir: userDataPath,
        key: sqlKey,
        messages: [],
        passwordAttempt,
    });
    await (0, attachment_channel_1.initAttachmentsChannel)({
        userDataPath,
    });
    (0, dataInit_1.initData)();
    await storage_1.Storage.fetch();
    await JobRunner_1.runners.avatarDownloadRunner.loadJobsFromDb();
    JobRunner_1.runners.avatarDownloadRunner.startProcessing();
    await JobRunner_1.runners.configurationSyncRunner.loadJobsFromDb();
    JobRunner_1.runners.configurationSyncRunner.startProcessing();
    if (registration_1.Registration.isDone()) {
        try {
            await libsession_utils_1.LibSessionUtil.initializeLibSessionUtilWrappers();
        }
        catch (e) {
            sessionjs_logger_1.console.warn('LibSessionUtil.initializeLibSessionUtilWrappers failed with', e.message);
            throw e;
        }
    }
    else {
        sessionjs_logger_1.console.log('Registration is not done, not initializing LibSessionUtil');
    }
    await (0, conversations_1.getConversationController)().load();
    await util_1.BlockedNumberController.load();
    await (0, conversations_1.getConversationController)().loadPromise();
    registration_1.Registration.markDone();
    setTimeout(() => {
        void (0, receiver_1.queueAllCached)();
    }, 10 * 1000);
    await utils_1.AttachmentDownloads.start({
        logger: sessionjs_logger_1.console,
    });
    await new Promise(resolve => setTimeout(resolve, 1000));
    JobRunner_1.runners.configurationSyncRunner.startProcessing();
    await (0, snode_api_1.getSwarmPollingInstance)().start();
    isReady = true;
    while (true) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
    }
}
global.SBOT.resetDatabase = async () => {
    await removeDB();
};
global.SBOT.passwordLogin = async (passPhrase) => {
    const sendResponse = (e) => {
        sessionjs_logger_1.console.log('password-window-login-response', e);
    };
    try {
        const passwordAttempt = true;
        await showMainWindow(passPhrase, passwordAttempt);
        sendResponse(undefined);
    }
    catch (e) {
        sendResponse('removePasswordInvalid error');
    }
};
global.SBOT.setPassword = async (passPhrase, oldPhrase) => {
    const sendResponse = (response) => {
        sessionjs_logger_1.console.log('set-password-response', response);
    };
    try {
        const hash = sql_1.sqlNode.getPasswordHash();
        const hashMatches = oldPhrase && PasswordUtil.matchesHash(oldPhrase, hash);
        if (hash && !hashMatches) {
            sendResponse('Failed to set password: Old password provided is invalid');
            return;
        }
        if (lodash_1.default.isEmpty(passPhrase)) {
            const defaultKey = getDefaultSQLKey();
            sql_1.sqlNode.setSQLPassword(defaultKey);
            sql_1.sqlNode.removePasswordHash();
            user_config_1.userConfig.set('dbHasPassword', false);
        }
        else {
            sql_1.sqlNode.setSQLPassword(passPhrase);
            const newHash = PasswordUtil.generateHash(passPhrase);
            sql_1.sqlNode.savePasswordHash(newHash);
            user_config_1.userConfig.set('dbHasPassword', true);
        }
        sendResponse(undefined);
    }
    catch (e) {
        sendResponse('Failed to set password');
    }
};
global.SBOT.ready();
const getIsReady = () => isReady;
exports.getIsReady = getIsReady;
