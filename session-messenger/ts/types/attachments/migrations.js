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
exports.captureDimensionsAndScreenshot = exports.deleteData = exports.loadData = exports.hasData = exports.replaceUnicodeV2 = exports._replaceUnicodeOrderOverridesSync = exports.autoOrientJPEGAttachment = exports.isValid = void 0;
const blob_util_1 = require("blob-util");
const lodash_1 = require("lodash");
const MIME = __importStar(require("../MIME"));
const GoogleChrome = __importStar(require("../../util/GoogleChrome"));
const Errors_1 = require("./Errors");
const MessageAttachment_1 = require("../MessageAttachment");
const VisualAttachment_1 = require("./VisualAttachment");
const sessionjs_logger_1 = require("../../sessionjs-logger");
const isValid = (rawAttachment) => {
    if (!rawAttachment) {
        return false;
    }
    return true;
};
exports.isValid = isValid;
const UNICODE_LEFT_TO_RIGHT_OVERRIDE = '\u202D';
const UNICODE_RIGHT_TO_LEFT_OVERRIDE = '\u202E';
const UNICODE_REPLACEMENT_CHARACTER = '\uFFFD';
const INVALID_CHARACTERS_PATTERN = new RegExp(`[${UNICODE_LEFT_TO_RIGHT_OVERRIDE}${UNICODE_RIGHT_TO_LEFT_OVERRIDE}]`, 'g');
const autoOrientJPEGAttachment = async (attachment) => {
    if (!attachment.contentType || !MIME.isJPEG(attachment.contentType)) {
        return { ...attachment, shouldDeleteDigest: false };
    }
    if (!attachment.data) {
        return { ...attachment, shouldDeleteDigest: false };
    }
    const dataBlob = (0, blob_util_1.arrayBufferToBlob)(attachment.data, attachment.contentType);
    const newDataArrayBuffer = await (0, blob_util_1.blobToArrayBuffer)(dataBlob);
    return {
        contentType: attachment.contentType,
        shouldDeleteDigest: true,
        data: newDataArrayBuffer,
    };
};
exports.autoOrientJPEGAttachment = autoOrientJPEGAttachment;
const _replaceUnicodeOrderOverridesSync = (attachment) => {
    if (!(0, lodash_1.isString)(attachment.fileName)) {
        return attachment;
    }
    const normalizedFilename = attachment.fileName.replace(INVALID_CHARACTERS_PATTERN, UNICODE_REPLACEMENT_CHARACTER);
    const newAttachment = { ...attachment, fileName: normalizedFilename };
    return newAttachment;
};
exports._replaceUnicodeOrderOverridesSync = _replaceUnicodeOrderOverridesSync;
const V2_UNWANTED_UNICODE = /[\u202A-\u202E\u2066-\u2069\u200E\u200F\u061C]/g;
const replaceUnicodeV2 = (fileName) => {
    if (!(0, lodash_1.isString)(fileName)) {
        throw new Error('replaceUnicodeV2 should not be called without a filename');
    }
    return fileName.replace(V2_UNWANTED_UNICODE, UNICODE_REPLACEMENT_CHARACTER);
};
exports.replaceUnicodeV2 = replaceUnicodeV2;
const hasData = (attachment) => attachment.data instanceof ArrayBuffer || ArrayBuffer.isView(attachment.data);
exports.hasData = hasData;
const loadData = async (attachment) => {
    if (!(0, exports.isValid)(attachment)) {
        throw new TypeError("'attachment' is not valid");
    }
    const isAlreadyLoaded = (0, exports.hasData)(attachment);
    if (isAlreadyLoaded) {
        return attachment;
    }
    if (!(0, lodash_1.isString)(attachment.path)) {
        throw new TypeError("'attachment.path' is required");
    }
    const data = await (0, MessageAttachment_1.readAttachmentData)(attachment.path);
    return { ...attachment, data };
};
exports.loadData = loadData;
const deleteData = () => {
    return async (attachment) => {
        if (!(0, exports.isValid)(attachment)) {
            throw new TypeError('deleteData: attachment is not valid');
        }
        const { path, thumbnail, screenshot } = attachment;
        if ((0, lodash_1.isString)(path)) {
            await (0, MessageAttachment_1.deleteOnDisk)(path);
        }
        if (thumbnail && (0, lodash_1.isString)(thumbnail.path)) {
            await (0, MessageAttachment_1.deleteOnDisk)(thumbnail.path);
        }
        if (screenshot && (0, lodash_1.isString)(screenshot.path)) {
            await (0, MessageAttachment_1.deleteOnDisk)(screenshot.path);
        }
    };
};
exports.deleteData = deleteData;
const captureDimensionsAndScreenshot = async (attachment) => {
    const { contentType } = attachment;
    if (!contentType ||
        (!GoogleChrome.isImageTypeSupported(contentType) &&
            !GoogleChrome.isVideoTypeSupported(contentType))) {
        return { ...attachment, screenshot: null, thumbnail: null };
    }
    if (!attachment.path) {
        return { ...attachment, screenshot: null, thumbnail: null };
    }
    const absolutePath = (0, MessageAttachment_1.getAbsoluteAttachmentPath)(attachment.path);
    if (GoogleChrome.isImageTypeSupported(contentType)) {
        try {
            const { width, height } = await (0, VisualAttachment_1.getImageDimensions)({
                objectUrl: absolutePath,
            });
            const thumbnailBuffer = await (0, VisualAttachment_1.makeImageThumbnailBuffer)({
                objectUrl: absolutePath,
                contentType,
            });
            const thumbnailPath = await (0, MessageAttachment_1.writeNewAttachmentData)(thumbnailBuffer);
            return {
                ...attachment,
                width,
                height,
                thumbnail: {
                    path: thumbnailPath,
                    contentType: VisualAttachment_1.THUMBNAIL_CONTENT_TYPE,
                    width: VisualAttachment_1.THUMBNAIL_SIDE,
                    height: VisualAttachment_1.THUMBNAIL_SIDE,
                },
                screenshot: null,
            };
        }
        catch (error) {
            sessionjs_logger_1.console.error('captureDimensionsAndScreenshot:', 'error processing image; skipping screenshot generation', (0, Errors_1.toLogFormat)(error));
            return { ...attachment, screenshot: null, thumbnail: null };
        }
    }
    let screenshotObjectUrl;
    try {
        const screenshotBuffer = await (0, blob_util_1.blobToArrayBuffer)(await (0, VisualAttachment_1.makeVideoScreenshot)({
            objectUrl: absolutePath,
            contentType: VisualAttachment_1.THUMBNAIL_CONTENT_TYPE,
        }));
        screenshotObjectUrl = (0, VisualAttachment_1.makeObjectUrl)(screenshotBuffer, VisualAttachment_1.THUMBNAIL_CONTENT_TYPE);
        const { width, height } = await (0, VisualAttachment_1.getImageDimensions)({
            objectUrl: screenshotObjectUrl,
        });
        const screenshotPath = await (0, MessageAttachment_1.writeNewAttachmentData)(screenshotBuffer);
        const thumbnailBuffer = await (0, VisualAttachment_1.makeImageThumbnailBuffer)({
            objectUrl: screenshotObjectUrl,
            contentType: VisualAttachment_1.THUMBNAIL_CONTENT_TYPE,
        });
        const thumbnailPath = await (0, MessageAttachment_1.writeNewAttachmentData)(thumbnailBuffer);
        return {
            ...attachment,
            screenshot: {
                contentType: VisualAttachment_1.THUMBNAIL_CONTENT_TYPE,
                path: screenshotPath,
                width,
                height,
            },
            thumbnail: {
                path: thumbnailPath,
                contentType: VisualAttachment_1.THUMBNAIL_CONTENT_TYPE,
                width: VisualAttachment_1.THUMBNAIL_SIDE,
                height: VisualAttachment_1.THUMBNAIL_SIDE,
            },
            width,
            height,
        };
    }
    catch (error) {
        sessionjs_logger_1.console.error('captureDimensionsAndScreenshot: error processing video; skipping screenshot generation', (0, Errors_1.toLogFormat)(error));
        return { ...attachment, screenshot: null, thumbnail: null };
    }
    finally {
        if (screenshotObjectUrl) {
            (0, VisualAttachment_1.revokeObjectUrl)(screenshotObjectUrl);
        }
    }
};
exports.captureDimensionsAndScreenshot = captureDimensionsAndScreenshot;
