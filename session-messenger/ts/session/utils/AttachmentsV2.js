"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadQuoteThumbnailsV3 = exports.uploadLinkPreviewsV3 = exports.uploadAttachmentsV3 = void 0;
const lodash_1 = require("lodash");
const sogsV3SendFile_1 = require("../apis/open_group_api/sogsv3/sogsV3SendFile");
const BufferPadding_1 = require("../crypto/BufferPadding");
const sessionjs_logger_1 = require("../../sessionjs-logger");
async function uploadV3(params) {
    const { attachment, openGroup } = params;
    if (typeof attachment !== 'object' || attachment == null) {
        throw new Error('Invalid attachment passed.');
    }
    if (!(attachment.data instanceof ArrayBuffer)) {
        throw new TypeError(`attachment.data must be an ArrayBuffer but got: ${typeof attachment.data}`);
    }
    const pointer = {
        contentType: attachment.contentType || undefined,
        size: attachment.size,
        fileName: attachment.fileName,
        flags: attachment.flags,
        caption: attachment.caption,
        width: attachment.width && (0, lodash_1.isFinite)(attachment.width) ? attachment.width : undefined,
        height: attachment.height && (0, lodash_1.isFinite)(attachment.height) ? attachment.height : undefined,
    };
    const paddedAttachment = !openGroup
        ? (0, BufferPadding_1.addAttachmentPadding)(attachment.data)
        : attachment.data;
    const fileDetails = await (0, sogsV3SendFile_1.uploadFileToRoomSogs3)(new Uint8Array(paddedAttachment), openGroup);
    if (!fileDetails) {
        throw new Error(`upload to fileopengroupv3 of ${attachment.fileName} failed`);
    }
    return {
        ...pointer,
        id: fileDetails.fileId,
        url: fileDetails.fileUrl,
    };
}
async function uploadAttachmentsV3(attachments, openGroup) {
    const promises = (attachments || []).map(async (attachment) => uploadV3({
        attachment,
        openGroup,
    }));
    return Promise.all(promises);
}
exports.uploadAttachmentsV3 = uploadAttachmentsV3;
async function uploadLinkPreviewsV3(preview, openGroup) {
    if (!preview?.image) {
        sessionjs_logger_1.console.warn('tried to upload preview to opengroupv2 without image.. skipping');
        return undefined;
    }
    const image = await uploadV3({
        attachment: preview.image,
        openGroup,
    });
    return {
        ...preview,
        image,
        url: preview.url || image.url,
        id: image.id,
    };
}
exports.uploadLinkPreviewsV3 = uploadLinkPreviewsV3;
async function uploadQuoteThumbnailsV3(openGroup, quote) {
    if (!quote) {
        return undefined;
    }
    const promises = (quote.attachments ?? []).map(async (attachment) => {
        let thumbnail;
        if (attachment.thumbnail) {
            thumbnail = (await uploadV3({
                attachment: attachment.thumbnail,
                openGroup,
            }));
        }
        return {
            ...attachment,
            thumbnail,
        };
    });
    const attachments = await Promise.all(promises);
    return {
        ...quote,
        attachments,
    };
}
exports.uploadQuoteThumbnailsV3 = uploadQuoteThumbnailsV3;
