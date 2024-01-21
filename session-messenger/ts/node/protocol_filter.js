"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.installWebHandler = exports.installFileHandler = void 0;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const sessionjs_logger_1 = require("../sessionjs-logger");
function eliminateAllAfterCharacter(str, character) {
    const index = str.indexOf(character);
    if (index < 0) {
        return str;
    }
    return str.slice(0, index);
}
function urlToPath(targetUrl, options = {}) {
    const { isWindows } = options;
    const decoded = decodeURIComponent(targetUrl);
    const withoutScheme = decoded.slice(isWindows ? 8 : 7);
    const withoutQuerystring = eliminateAllAfterCharacter(withoutScheme, '?');
    const withoutHash = eliminateAllAfterCharacter(withoutQuerystring, '#');
    return withoutHash;
}
function createFileHandler({ userDataPath, installPath, isWindows, }) {
    return (request, callback) => {
        const target = path_1.default.normalize(urlToPath(request.url, { isWindows }));
        const realPath = fs_1.default.existsSync(target) ? fs_1.default.realpathSync(target) : target;
        const properCasing = isWindows ? realPath.toLowerCase() : realPath;
        if (!path_1.default.isAbsolute(realPath)) {
            sessionjs_logger_1.console.log(`Warning: denying request to non-absolute path '${realPath}'`);
            return callback();
        }
        if (!properCasing.startsWith(isWindows ? userDataPath.toLowerCase() : userDataPath) &&
            !properCasing.startsWith(isWindows ? installPath.toLowerCase() : installPath)) {
            sessionjs_logger_1.console.log(`Warning: denying request to path '${realPath}' (userDataPath: '${userDataPath}', installPath: '${installPath}')`);
            return callback();
        }
        return callback({
            path: realPath,
        });
    };
}
function installFileHandler({ protocol, userDataPath, installPath, isWindows, }) {
    protocol.interceptFileProtocol('file', createFileHandler({ userDataPath, installPath, isWindows }));
}
exports.installFileHandler = installFileHandler;
function disabledHandler(_request, callback) {
    return callback();
}
function installWebHandler({ protocol }) {
    protocol.interceptFileProtocol('about', disabledHandler);
    protocol.interceptFileProtocol('content', disabledHandler);
    protocol.interceptFileProtocol('chrome', disabledHandler);
    protocol.interceptFileProtocol('cid', disabledHandler);
    protocol.interceptFileProtocol('data', disabledHandler);
    protocol.interceptFileProtocol('filesystem', disabledHandler);
    protocol.interceptFileProtocol('ftp', disabledHandler);
    protocol.interceptFileProtocol('gopher', disabledHandler);
    protocol.interceptFileProtocol('http', disabledHandler);
    protocol.interceptFileProtocol('https', disabledHandler);
    protocol.interceptFileProtocol('javascript', disabledHandler);
    protocol.interceptFileProtocol('mailto', disabledHandler);
    protocol.interceptFileProtocol('ws', disabledHandler);
    protocol.interceptFileProtocol('wss', disabledHandler);
}
exports.installWebHandler = installWebHandler;
