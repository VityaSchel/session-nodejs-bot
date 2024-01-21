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
exports.resetDecryptedUrlForTesting = exports.getDecryptedBlob = exports.getAlreadyDecryptedMediaUrl = exports.getDecryptedMediaUrl = exports.readFileContent = exports.getAbsoluteAttachmentPath = exports.getLocalAttachmentPath = exports.cleanUpOldDecryptedMedias = exports.urlToDecryptingPromise = exports.urlToDecryptedBlobMap = void 0;
const path_1 = __importDefault(require("path"));
const lodash_1 = require("lodash");
const fse = __importStar(require("fs-extra"));
const constants_1 = require("../constants");
const VisualAttachment_1 = require("../../types/attachments/VisualAttachment");
const MessageAttachment_1 = require("../../types/MessageAttachment");
const local_attachments_encrypter_1 = require("../../util/local_attachments_encrypter");
const sessionjs_logger_1 = require("../../sessionjs-logger");
exports.urlToDecryptedBlobMap = new Map();
exports.urlToDecryptingPromise = new Map();
const cleanUpOldDecryptedMedias = () => {
    const currentTimestamp = Date.now();
    let countCleaned = 0;
    let countKept = 0;
    let keptAsAvatars = 0;
    sessionjs_logger_1.console.info('Starting cleaning of medias blobs...');
    for (const iterator of exports.urlToDecryptedBlobMap) {
        if (iterator[1].forceRetain &&
            iterator[1].lastAccessTimestamp < currentTimestamp - constants_1.DURATION.DAYS * 7) {
            keptAsAvatars++;
        }
        else if (iterator[1].lastAccessTimestamp < currentTimestamp - constants_1.DURATION.HOURS * 1) {
            URL.revokeObjectURL(iterator[1].decrypted);
            exports.urlToDecryptedBlobMap.delete(iterator[0]);
            countCleaned++;
        }
        else {
            countKept++;
        }
    }
    sessionjs_logger_1.console.info(`Clean medias blobs: cleaned/kept/keptAsAvatars: ${countCleaned}:${countKept}:${keptAsAvatars}`);
};
exports.cleanUpOldDecryptedMedias = cleanUpOldDecryptedMedias;
const getLocalAttachmentPath = () => {
    return (0, MessageAttachment_1.getAttachmentPath)();
};
exports.getLocalAttachmentPath = getLocalAttachmentPath;
const getAbsoluteAttachmentPath = (url) => {
    return (0, MessageAttachment_1.getAbsoluteAttachmentPath)(url);
};
exports.getAbsoluteAttachmentPath = getAbsoluteAttachmentPath;
const readFileContent = async (url) => {
    return fse.readFile(url);
};
exports.readFileContent = readFileContent;
const getDecryptedMediaUrl = async (url, contentType, isAvatar) => {
    if (!url) {
        return url;
    }
    if (url.startsWith('blob:')) {
        return url;
    }
    const isAbsolute = path_1.default.isAbsolute(url);
    if ((isAbsolute &&
        exports.getLocalAttachmentPath &&
        url.startsWith(exports.getLocalAttachmentPath())) ||
        fse.pathExistsSync(exports.getAbsoluteAttachmentPath(url))) {
        if (exports.urlToDecryptedBlobMap.has(url)) {
            const existing = exports.urlToDecryptedBlobMap.get(url);
            const existingObjUrl = existing?.decrypted;
            exports.urlToDecryptedBlobMap.set(url, {
                decrypted: existingObjUrl,
                lastAccessTimestamp: Date.now(),
                forceRetain: existing?.forceRetain || false,
            });
            return existingObjUrl;
        }
        if (exports.urlToDecryptingPromise.has(url)) {
            return exports.urlToDecryptingPromise.get(url);
        }
        exports.urlToDecryptingPromise.set(url, new Promise(async (resolve) => {
            try {
                const absUrl = path_1.default.isAbsolute(url) ? url : (0, exports.getAbsoluteAttachmentPath)(url);
                const encryptedFileContent = await (0, exports.readFileContent)(absUrl);
                const decryptedContent = await (0, local_attachments_encrypter_1.decryptAttachmentBufferRenderer)(encryptedFileContent.buffer);
                if (decryptedContent?.length) {
                    const arrayBuffer = decryptedContent.buffer;
                    const obj = (0, VisualAttachment_1.makeObjectUrl)(arrayBuffer, contentType);
                    if (!exports.urlToDecryptedBlobMap.has(url)) {
                        exports.urlToDecryptedBlobMap.set(url, {
                            decrypted: obj,
                            lastAccessTimestamp: Date.now(),
                            forceRetain: isAvatar,
                        });
                    }
                    exports.urlToDecryptingPromise.delete(url);
                    resolve(obj);
                    return;
                }
                exports.urlToDecryptingPromise.delete(url);
                sessionjs_logger_1.console.info('error decrypting file :', url);
                resolve(url);
            }
            catch (e) {
                sessionjs_logger_1.console.warn(e);
                (0, lodash_1.reject)(e.message);
            }
        }));
        return exports.urlToDecryptingPromise.get(url);
    }
    return url;
};
exports.getDecryptedMediaUrl = getDecryptedMediaUrl;
const getAlreadyDecryptedMediaUrl = (url) => {
    if (!url) {
        return null;
    }
    if (url.startsWith('blob:')) {
        return url;
    }
    if (exports.getLocalAttachmentPath() && url.startsWith(exports.getLocalAttachmentPath())) {
        if (exports.urlToDecryptedBlobMap.has(url)) {
            const existing = exports.urlToDecryptedBlobMap.get(url);
            const existingObjUrl = existing?.decrypted;
            exports.urlToDecryptedBlobMap.set(url, {
                decrypted: existingObjUrl,
                lastAccessTimestamp: Date.now(),
                forceRetain: existing?.forceRetain || false,
            });
            return existingObjUrl;
        }
    }
    return null;
};
exports.getAlreadyDecryptedMediaUrl = getAlreadyDecryptedMediaUrl;
const getDecryptedBlob = async (url, contentType) => {
    const decryptedUrl = await (0, exports.getDecryptedMediaUrl)(url, contentType, false);
    return (0, VisualAttachment_1.urlToBlob)(decryptedUrl);
};
exports.getDecryptedBlob = getDecryptedBlob;
const resetDecryptedUrlForTesting = () => {
    exports.urlToDecryptedBlobMap.clear();
    exports.urlToDecryptingPromise.clear();
};
exports.resetDecryptedUrlForTesting = resetDecryptedUrlForTesting;
