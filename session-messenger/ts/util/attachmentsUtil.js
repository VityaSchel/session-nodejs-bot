"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveAttachmentToDisk = exports.readAvatarAttachment = exports.getFileAndStoreLocallyImageBuffer = exports.getFileAndStoreLocally = exports.autoScale = exports.autoScaleForThumbnail = exports.autoScaleForIncomingAvatar = exports.autoScaleForAvatar = exports.AVATAR_MAX_SIDE = exports.ATTACHMENT_DEFAULT_MAX_SIDE = void 0;
const image_type_1 = __importDefault(require("image-type"));
const blob_util_1 = require("blob-util");
const blueimp_load_image_1 = __importDefault(require("blueimp-load-image"));
const protobuf_1 = require("../protobuf");
const DecryptedAttachmentsManager_1 = require("../session/crypto/DecryptedAttachmentsManager");
const DataExtractionNotificationMessage_1 = require("../session/messages/outgoing/controlMessage/DataExtractionNotificationMessage");
const Attachment_1 = require("../types/Attachment");
const MIME_1 = require("../types/MIME");
const MessageAttachment_1 = require("../types/MessageAttachment");
const VisualAttachment_1 = require("../types/attachments/VisualAttachment");
const constants_1 = require("../session/constants");
const Performance_1 = require("../session/utils/Performance");
const sessionjs_logger_1 = require("../sessionjs-logger");
const DEBUG_ATTACHMENTS_SCALE = false;
exports.ATTACHMENT_DEFAULT_MAX_SIDE = 4096;
exports.AVATAR_MAX_SIDE = 640;
async function autoScaleForAvatar(attachment) {
    const maxMeasurements = {
        maxSide: exports.AVATAR_MAX_SIDE,
        maxSize: 1000 * 1024,
    };
    if (attachment.contentType !== MIME_1.IMAGE_PNG &&
        attachment.contentType !== MIME_1.IMAGE_GIF &&
        attachment.contentType !== MIME_1.IMAGE_JPEG) {
        throw new Error('Cannot autoScaleForAvatar another file than PNG, GIF or JPEG.');
    }
    if (DEBUG_ATTACHMENTS_SCALE) {
        sessionjs_logger_1.console.info('autoscale for avatar', maxMeasurements);
    }
    return autoScale(attachment, maxMeasurements);
}
exports.autoScaleForAvatar = autoScaleForAvatar;
async function autoScaleForIncomingAvatar(incomingAvatar) {
    const maxMeasurements = {
        maxSide: exports.AVATAR_MAX_SIDE,
        maxSize: 1000 * 1024,
    };
    const contentType = (0, image_type_1.default)(new Uint8Array(incomingAvatar))?.mime || MIME_1.IMAGE_UNKNOWN;
    const blob = (0, blob_util_1.arrayBufferToBlob)(incomingAvatar, contentType);
    if (contentType === MIME_1.IMAGE_GIF) {
        return {
            contentType,
            blob,
        };
    }
    if (DEBUG_ATTACHMENTS_SCALE) {
        sessionjs_logger_1.console.info('autoscale for incoming avatar', maxMeasurements);
    }
    return autoScale({
        blob,
        contentType,
    }, maxMeasurements);
}
exports.autoScaleForIncomingAvatar = autoScaleForIncomingAvatar;
async function autoScaleForThumbnail(attachment) {
    const maxMeasurements = {
        maxSide: VisualAttachment_1.THUMBNAIL_SIDE,
        maxSize: 200 * 1000,
    };
    if (DEBUG_ATTACHMENTS_SCALE) {
        sessionjs_logger_1.console.info('autoScaleForThumbnail', maxMeasurements);
    }
    return autoScale(attachment, maxMeasurements);
}
exports.autoScaleForThumbnail = autoScaleForThumbnail;
async function canvasToBlob(canvas, type, quality) {
    return new Promise(resolve => {
        canvas.toBlob(blob => {
            resolve(blob);
        }, type, quality);
    });
}
async function autoScale(attachment, maxMeasurements) {
    const start = Date.now();
    const { contentType, blob } = attachment;
    if (contentType.split('/')[0] !== 'image' || contentType === MIME_1.IMAGE_TIFF) {
        return attachment;
    }
    if (maxMeasurements?.maxSide && (maxMeasurements?.maxHeight || maxMeasurements?.maxWidth)) {
        throw new Error('Cannot have maxSide and another dimension set together');
    }
    const askedMaxSize = maxMeasurements?.maxSize || constants_1.MAX_ATTACHMENT_FILESIZE_BYTES;
    const maxSize = askedMaxSize > constants_1.MAX_ATTACHMENT_FILESIZE_BYTES ? constants_1.MAX_ATTACHMENT_FILESIZE_BYTES : askedMaxSize;
    const makeSquare = Boolean(maxMeasurements?.maxSide);
    const maxHeight = maxMeasurements?.maxHeight || maxMeasurements?.maxSide || exports.ATTACHMENT_DEFAULT_MAX_SIDE;
    const maxWidth = maxMeasurements?.maxWidth || maxMeasurements?.maxSide || exports.ATTACHMENT_DEFAULT_MAX_SIDE;
    if (blob.type === MIME_1.IMAGE_GIF && blob.size <= maxSize) {
        return attachment;
    }
    if (blob.type === MIME_1.IMAGE_GIF && blob.size > maxSize) {
        throw new Error(`GIF is too large, required size is ${maxSize}`);
    }
    const loadImgOpts = {
        maxWidth: makeSquare ? maxMeasurements?.maxSide : maxWidth,
        maxHeight: makeSquare ? maxMeasurements?.maxSide : maxHeight,
        crop: !!makeSquare,
        orientation: 1,
        aspectRatio: makeSquare ? 1 : undefined,
        canvas: true,
        imageSmoothingQuality: 'medium',
    };
    (0, Performance_1.perfStart)(`loadimage-*${blob.size}`);
    const canvas = await (0, blueimp_load_image_1.default)(blob, loadImgOpts);
    (0, Performance_1.perfEnd)(`loadimage-*${blob.size}`, `loadimage-*${blob.size}`);
    if (!canvas || !canvas.originalWidth || !canvas.originalHeight) {
        throw new Error('failed to scale image');
    }
    let readAndResizedBlob = blob;
    if (canvas.originalWidth <= maxWidth &&
        canvas.originalHeight <= maxHeight &&
        blob.size <= maxSize &&
        !makeSquare) {
        return {
            ...attachment,
            width: canvas.image.width,
            height: canvas.image.height,
            blob,
        };
    }
    if (DEBUG_ATTACHMENTS_SCALE) {
        sessionjs_logger_1.console.debug('canvas.originalWidth', {
            canvasOriginalWidth: canvas.originalWidth,
            canvasOriginalHeight: canvas.originalHeight,
            maxWidth,
            maxHeight,
            blobsize: blob.size,
            maxSize,
            makeSquare,
        });
    }
    let quality = 0.95;
    const startI = 4;
    let i = startI;
    do {
        i -= 1;
        if (DEBUG_ATTACHMENTS_SCALE) {
        }
        const tempBlob = await canvasToBlob(canvas.image, 'image/jpeg', quality);
        if (!tempBlob) {
            throw new Error('Failed to get blob during canvasToBlob.');
        }
        readAndResizedBlob = tempBlob;
        quality = (quality * maxSize) / (readAndResizedBlob.size * (i === 1 ? 2 : 1));
        if (quality > 1) {
            quality = 0.95;
        }
    } while (i > 0 && readAndResizedBlob.size > maxSize);
    if (readAndResizedBlob.size > maxSize) {
        throw new Error('Cannot add this attachment even after trying to scale it down.');
    }
    sessionjs_logger_1.console.debug(`[perf] autoscale took ${Date.now() - start}ms `);
    return {
        contentType: attachment.contentType,
        blob: readAndResizedBlob,
        width: canvas.image.width,
        height: canvas.image.height,
    };
}
exports.autoScale = autoScale;
async function getFileAndStoreLocally(attachment) {
    if (!attachment) {
        return null;
    }
    const maxMeasurements = {
        maxSize: constants_1.MAX_ATTACHMENT_FILESIZE_BYTES,
    };
    const attachmentFlags = attachment.isVoiceMessage
        ? protobuf_1.SignalService.AttachmentPointer.Flags.VOICE_MESSAGE
        : null;
    const blob = attachment.file;
    const scaled = await autoScale({
        ...attachment,
        blob,
    }, maxMeasurements);
    const attachmentSavedLocally = await (0, MessageAttachment_1.processNewAttachment)({
        data: await scaled.blob.arrayBuffer(),
        contentType: attachment.contentType,
        fileName: attachment.fileName,
    });
    return {
        caption: attachment.caption,
        contentType: attachment.contentType,
        fileName: attachmentSavedLocally.fileName,
        path: attachmentSavedLocally.path,
        width: attachmentSavedLocally.width,
        height: attachmentSavedLocally.height,
        screenshot: attachmentSavedLocally.screenshot,
        thumbnail: attachmentSavedLocally.thumbnail,
        size: attachmentSavedLocally.size,
        flags: attachmentFlags || undefined,
    };
}
exports.getFileAndStoreLocally = getFileAndStoreLocally;
async function getFileAndStoreLocallyImageBuffer(imageBuffer) {
    if (!imageBuffer || !imageBuffer.byteLength) {
        return null;
    }
    const contentType = (0, image_type_1.default)(new Uint8Array(imageBuffer))?.mime || MIME_1.IMAGE_UNKNOWN;
    const blob = new Blob([imageBuffer], { type: contentType });
    const scaled = await autoScaleForThumbnail({
        contentType,
        blob,
    });
    const attachmentSavedLocally = await (0, MessageAttachment_1.processNewAttachment)({
        data: await scaled.blob.arrayBuffer(),
        contentType: scaled.contentType,
    });
    return {
        contentType: scaled.contentType,
        path: attachmentSavedLocally.path,
        width: scaled.width,
        height: scaled.height,
        size: attachmentSavedLocally.size,
    };
}
exports.getFileAndStoreLocallyImageBuffer = getFileAndStoreLocallyImageBuffer;
async function readAvatarAttachment(attachment) {
    const dataReadFromBlob = await attachment.file.arrayBuffer();
    return { attachment, data: dataReadFromBlob, size: dataReadFromBlob.byteLength };
}
exports.readAvatarAttachment = readAvatarAttachment;
const saveAttachmentToDisk = async ({ attachment, messageTimestamp, messageSender, conversationId, index, }) => {
    const decryptedUrl = await (0, DecryptedAttachmentsManager_1.getDecryptedMediaUrl)(attachment.url, attachment.contentType, false);
    (0, Attachment_1.save)({
        attachment: { ...attachment, url: decryptedUrl },
        document,
        getAbsolutePath: MessageAttachment_1.getAbsoluteAttachmentPath,
        timestamp: messageTimestamp,
        index,
    });
    await (0, DataExtractionNotificationMessage_1.sendDataExtractionNotification)(conversationId, messageSender, messageTimestamp);
};
exports.saveAttachmentToDisk = saveAttachmentToDisk;
