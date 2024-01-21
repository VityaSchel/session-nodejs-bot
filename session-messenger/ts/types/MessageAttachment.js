"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteExternalFilesOfConversation = exports.migrateDataToFileSystem = exports.writeNewAttachmentData = exports.deleteOnDisk = exports.getAbsoluteAttachmentPath = exports.readAttachmentData = exports.processNewAttachment = exports.loadQuoteData = exports.loadPreviewData = exports.loadAttachmentData = exports.getAttachmentPath = exports.initializeAttachmentLogic = exports.deleteExternalMessageFiles = void 0;
const lodash_1 = require("lodash");
const attachments_files_1 = require("../util/attachments_files");
const shared_attachments_1 = require("../shared/attachments/shared_attachments");
const migrations_1 = require("./attachments/migrations");
const deleteExternalMessageFiles = async (message) => {
    const { attachments, quote, preview } = message;
    if (attachments && attachments.length) {
        await Promise.all(attachments.map(migrations_1.deleteData));
    }
    if (quote && quote.attachments && quote.attachments.length) {
        await Promise.all(quote.attachments.map(async (attachment) => {
            const { thumbnail } = attachment;
            if (thumbnail && thumbnail.path && !thumbnail.copied) {
                await (0, exports.deleteOnDisk)(thumbnail.path);
            }
        }));
    }
    if (preview && preview.length) {
        await Promise.all(preview.map(async (item) => {
            const { image } = item;
            if (image && image.path) {
                await (0, exports.deleteOnDisk)(image.path);
            }
        }));
    }
};
exports.deleteExternalMessageFiles = deleteExternalMessageFiles;
let attachmentsPath;
let internalReadAttachmentData;
let internalGetAbsoluteAttachmentPath;
let internalDeleteOnDisk;
let internalWriteNewAttachmentData;
async function initializeAttachmentLogic() {
    const userDataPath = global.SBOT.profileDataPath;
    if (attachmentsPath) {
        throw new Error('attachmentsPath already initialized');
    }
    if (!userDataPath || userDataPath.length <= 10) {
        throw new Error('userDataPath cannot have length <= 10');
    }
    attachmentsPath = (0, shared_attachments_1.getAttachmentsPath)(userDataPath);
    internalReadAttachmentData = (0, attachments_files_1.createReader)(attachmentsPath);
    internalGetAbsoluteAttachmentPath = (0, attachments_files_1.createAbsolutePathGetter)(attachmentsPath);
    internalDeleteOnDisk = (0, shared_attachments_1.createDeleter)(attachmentsPath);
    internalWriteNewAttachmentData = (0, attachments_files_1.createWriterForNew)(attachmentsPath);
}
exports.initializeAttachmentLogic = initializeAttachmentLogic;
const getAttachmentPath = () => {
    if (!attachmentsPath) {
        throw new Error('attachmentsPath not init');
    }
    return attachmentsPath;
};
exports.getAttachmentPath = getAttachmentPath;
exports.loadAttachmentData = migrations_1.loadData;
const loadPreviewData = async (preview) => {
    if (!preview || !preview.length || (0, lodash_1.isEmpty)(preview[0])) {
        return [];
    }
    const firstPreview = preview[0];
    if (!firstPreview.image) {
        return [firstPreview];
    }
    return [
        {
            ...firstPreview,
            image: await (0, exports.loadAttachmentData)(firstPreview.image),
        },
    ];
};
exports.loadPreviewData = loadPreviewData;
const loadQuoteData = async (quote) => {
    if (!quote) {
        return null;
    }
    if (!quote.attachments?.length || (0, lodash_1.isEmpty)(quote.attachments[0])) {
        return quote;
    }
    const quotedFirstAttachment = await quote.attachments[0];
    const { thumbnail } = quotedFirstAttachment;
    if (!thumbnail || !thumbnail.path) {
        return {
            ...quote,
            attachments: [quotedFirstAttachment],
        };
    }
    const quotedAttachmentWithThumbnail = {
        ...quotedFirstAttachment,
        thumbnail: await (0, exports.loadAttachmentData)(thumbnail),
    };
    return {
        ...quote,
        attachments: [quotedAttachmentWithThumbnail],
    };
};
exports.loadQuoteData = loadQuoteData;
const processNewAttachment = async (attachment) => {
    const fileName = attachment.fileName ? (0, migrations_1.replaceUnicodeV2)(attachment.fileName) : '';
    const rotatedData = await (0, migrations_1.autoOrientJPEGAttachment)(attachment);
    const onDiskAttachmentPath = await (0, exports.migrateDataToFileSystem)(rotatedData.data);
    const attachmentWithoutData = (0, lodash_1.omit)({ ...attachment, fileName, path: onDiskAttachmentPath }, [
        'data',
    ]);
    if (rotatedData.shouldDeleteDigest) {
        delete attachmentWithoutData.digest;
    }
    const finalAttachment = await (0, migrations_1.captureDimensionsAndScreenshot)(attachmentWithoutData);
    return { ...finalAttachment, fileName, size: rotatedData.data.byteLength };
};
exports.processNewAttachment = processNewAttachment;
const readAttachmentData = async (relativePath) => {
    if (!internalReadAttachmentData) {
        throw new Error('attachment logic not initialized');
    }
    return internalReadAttachmentData(relativePath);
};
exports.readAttachmentData = readAttachmentData;
const getAbsoluteAttachmentPath = (relativePath) => {
    if (!internalGetAbsoluteAttachmentPath) {
        throw new Error('attachment logic not initialized');
    }
    return internalGetAbsoluteAttachmentPath(relativePath || '');
};
exports.getAbsoluteAttachmentPath = getAbsoluteAttachmentPath;
const deleteOnDisk = async (relativePath) => {
    if (!internalDeleteOnDisk) {
        throw new Error('attachment logic not initialized');
    }
    return internalDeleteOnDisk(relativePath);
};
exports.deleteOnDisk = deleteOnDisk;
const writeNewAttachmentData = async (arrayBuffer) => {
    if (!internalWriteNewAttachmentData) {
        throw new Error('attachment logic not initialized');
    }
    return internalWriteNewAttachmentData(arrayBuffer);
};
exports.writeNewAttachmentData = writeNewAttachmentData;
const migrateDataToFileSystem = async (data) => {
    const hasDataField = !(0, lodash_1.isUndefined)(data);
    if (!hasDataField) {
        throw new Error('attachment has no data in migrateDataToFileSystem');
    }
    const isValidData = (0, lodash_1.isArrayBuffer)(data);
    if (!isValidData) {
        throw new TypeError(`Expected ${data} to be an array buffer got: ${typeof data}`);
    }
    const path = await (0, exports.writeNewAttachmentData)(data);
    return path;
};
exports.migrateDataToFileSystem = migrateDataToFileSystem;
async function deleteExternalFilesOfConversation(conversationAttributes) {
    if (!conversationAttributes) {
        return;
    }
    const { avatarInProfile } = conversationAttributes;
    if ((0, lodash_1.isString)(avatarInProfile) && avatarInProfile.length) {
        await (0, exports.deleteOnDisk)(avatarInProfile);
    }
}
exports.deleteExternalFilesOfConversation = deleteExternalFilesOfConversation;
