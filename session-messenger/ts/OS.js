"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isWindows = exports.isLinux = exports.isMacOS = void 0;
const os_1 = __importDefault(require("os"));
const lodash_1 = __importDefault(require("lodash"));
const semver_1 = __importDefault(require("semver"));
const isMacOS = () => process.platform === 'darwin';
exports.isMacOS = isMacOS;
const isLinux = () => process.platform === 'linux';
exports.isLinux = isLinux;
const isWindows = (minVersion) => {
    const osRelease = os_1.default.release();
    if (process.platform !== 'win32') {
        return false;
    }
    return lodash_1.default.isUndefined(minVersion) ? true : semver_1.default.gte(osRelease, minVersion);
};
exports.isWindows = isWindows;
