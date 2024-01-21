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
exports.uploadQuoteThumbnailsToFileServer = exports.uploadLinkPreviewToFileServer = exports.uploadAttachmentsToFileServer = void 0;
const crypto = __importStar(require("crypto"));
const lodash_1 = __importDefault(require("lodash"));
const BufferPadding_1 = require("../crypto/BufferPadding");
const attachmentsEncrypter_1 = require("../../util/crypto/attachmentsEncrypter");
const FileServerApi_1 = require("../apis/file_server_api/FileServerApi");
const sessionjs_logger_1 = require("../../sessionjs-logger");
async function uploadToFileServer(params) {
    const { attachment, isRaw = false, shouldPad = false } = params;
    if (typeof attachment !== 'object' || attachment == null) {
        throw new Error('Invalid attachment passed.');
    }
    if (!(attachment.data instanceof ArrayBuffer)) {
        throw new TypeError(`\`attachment.data\` must be an \`ArrayBuffer\`; got: ${typeof attachment.data}`);
    }
    const pointer = {
        contentType: attachment.contentType || undefined,
        size: attachment.size,
        fileName: attachment.fileName,
        flags: attachment.flags,
        caption: attachment.caption,
        width: attachment.width,
        height: attachment.height,
    };
    let attachmentData;
    if (isRaw) {
        attachmentData = attachment.data;
    }
    else {
        pointer.key = new Uint8Array(crypto.randomBytes(64));
        const iv = new Uint8Array(crypto.randomBytes(16));
        const dataToEncrypt = !shouldPad ? attachment.data : (0, BufferPadding_1.addAttachmentPadding)(attachment.data);
        const data = await (0, attachmentsEncrypter_1.encryptAttachment)(dataToEncrypt, pointer.key.buffer, iv.buffer);
        pointer.digest = new Uint8Array(data.digest);
        attachmentData = data.ciphertext;
    }
    const uploadToV2Result = await (0, FileServerApi_1.uploadFileToFsWithOnionV4)(attachmentData);
    if (uploadToV2Result) {
        const pointerWithUrl = {
            ...pointer,
            id: uploadToV2Result.fileId,
            url: uploadToV2Result.fileUrl,
        };
        return pointerWithUrl;
    }
    sessionjs_logger_1.console.warn('upload to file server v2 failed');
    throw new Error(`upload to file server v2 of ${attachment.fileName} failed`);
}
async function uploadAttachmentsToFileServer(attachments) {
    const promises = (attachments || []).map(async (attachment) => uploadToFileServer({
        attachment,
        shouldPad: true,
    }));
    return Promise.all(promises);
}
exports.uploadAttachmentsToFileServer = uploadAttachmentsToFileServer;
async function uploadLinkPreviewToFileServer(preview) {
    if (!preview?.image) {
        sessionjs_logger_1.console.warn('tried to upload file to FileServer without image.. skipping');
        return preview;
    }
    const image = await uploadToFileServer({
        attachment: preview.image,
    });
    return {
        ...preview,
        image,
        id: image.id,
    };
}
exports.uploadLinkPreviewToFileServer = uploadLinkPreviewToFileServer;
async function uploadQuoteThumbnailsToFileServer(quote) {
    if (!quote) {
        return undefined;
    }
    const promises = (quote.attachments ?? []).map(async (attachment) => {
        let thumbnail;
        if (attachment.thumbnail) {
            thumbnail = await uploadToFileServer({
                attachment: attachment.thumbnail,
            });
        }
        if (!thumbnail) {
            return attachment;
        }
        return {
            ...attachment,
            thumbnail,
            url: thumbnail.url,
            id: thumbnail.id,
        };
    });
    const attachments = lodash_1.default.compact(await Promise.all(promises));
    return {
        ...quote,
        attachments,
    };
}
exports.uploadQuoteThumbnailsToFileServer = uploadQuoteThumbnailsToFileServer;
