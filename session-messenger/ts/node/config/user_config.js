"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.userConfig = void 0;
const path_1 = __importDefault(require("path"));
const process_1 = __importDefault(require("process"));
const base_config_1 = require("./base_config");
const sessionjs_logger_1 = require("../../sessionjs-logger");
let storageProfile;
const { NODE_ENV: environment, NODE_APP_INSTANCE: instance } = process_1.default.env;
const isValidInstance = typeof instance === 'string' && instance.length > 0;
const isProduction = environment === 'production' && !isValidInstance;
if (!isProduction) {
    storageProfile = environment;
    if (isValidInstance) {
        storageProfile = (storageProfile || '').concat(`-${instance}`);
    }
}
const userData = global.SBOT.profileDataPath;
sessionjs_logger_1.console.log(`userData: ${userData}`);
const userDataPath = userData;
const targetPath = path_1.default.join(userDataPath, 'config.json');
exports.userConfig = (0, base_config_1.start)('user', targetPath);
