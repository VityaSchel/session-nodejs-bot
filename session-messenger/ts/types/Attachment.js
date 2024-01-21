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
exports.getFileExtension = exports.getSuggestedFilename = exports.save = exports.isVoiceMessage = exports.isFile = exports.isVisualMedia = exports.getAlt = exports.areAllAttachmentsVisual = exports.getImageDimensionsInAttachment = exports.arrayBufferFromFile = exports.hasVideoScreenshot = exports.isVideoAttachment = exports.isVideo = exports.hasImage = exports.isImageAttachment = exports.isImage = exports.getUrl = exports.getThumbnailUrl = exports.canDisplayImage = exports.isAudio = exports.getExtensionForDisplay = void 0;
const moment_1 = __importDefault(require("moment"));
const lodash_1 = require("lodash");
const MIME = __importStar(require("./MIME"));
const saveURLAsFile_1 = require("../util/saveURLAsFile");
const protobuf_1 = require("../protobuf");
const GoogleChrome_1 = require("../util/GoogleChrome");
const attachmentsUtil_1 = require("../util/attachmentsUtil");
const VisualAttachment_1 = require("./attachments/VisualAttachment");
const MAX_WIDTH = VisualAttachment_1.THUMBNAIL_SIDE;
const MAX_HEIGHT = VisualAttachment_1.THUMBNAIL_SIDE;
const MIN_WIDTH = VisualAttachment_1.THUMBNAIL_SIDE;
const MIN_HEIGHT = VisualAttachment_1.THUMBNAIL_SIDE;
function getExtensionForDisplay({ fileName, contentType, }) {
    if (fileName && fileName.indexOf('.') >= 0) {
        const lastPeriod = fileName.lastIndexOf('.');
        const extension = fileName.slice(lastPeriod + 1);
        if (extension.length) {
            return extension;
        }
    }
    if (!contentType) {
        return undefined;
    }
    const slash = contentType.indexOf('/');
    if (slash >= 0) {
        return contentType.slice(slash + 1);
    }
    return undefined;
}
exports.getExtensionForDisplay = getExtensionForDisplay;
function isAudio(attachments) {
    return (attachments &&
        attachments[0] &&
        attachments[0].contentType &&
        MIME.isAudio(attachments[0].contentType));
}
exports.isAudio = isAudio;
function canDisplayImage(attachments) {
    const { height, width } = attachments && attachments[0] ? attachments[0] : { height: 0, width: 0 };
    return Boolean(height &&
        height > 0 &&
        height <= attachmentsUtil_1.ATTACHMENT_DEFAULT_MAX_SIDE &&
        width &&
        width > 0 &&
        width <= attachmentsUtil_1.ATTACHMENT_DEFAULT_MAX_SIDE);
}
exports.canDisplayImage = canDisplayImage;
function getThumbnailUrl(attachment) {
    if (attachment.thumbnail && attachment.thumbnail.url) {
        return attachment.thumbnail.url;
    }
    return getUrl(attachment);
}
exports.getThumbnailUrl = getThumbnailUrl;
function getUrl(attachment) {
    if (attachment.screenshot && attachment.screenshot.url) {
        return attachment.screenshot.url;
    }
    return attachment.url;
}
exports.getUrl = getUrl;
function isImage(attachments) {
    return (attachments &&
        attachments[0] &&
        attachments[0].contentType &&
        (0, GoogleChrome_1.isImageTypeSupported)(attachments[0].contentType));
}
exports.isImage = isImage;
function isImageAttachment(attachment) {
    return Boolean(attachment && attachment.contentType && (0, GoogleChrome_1.isImageTypeSupported)(attachment.contentType));
}
exports.isImageAttachment = isImageAttachment;
function hasImage(attachments) {
    return Boolean(attachments && attachments[0] && (attachments[0].url || attachments[0].pending));
}
exports.hasImage = hasImage;
function isVideo(attachments) {
    return Boolean(attachments && isVideoAttachment(attachments[0]));
}
exports.isVideo = isVideo;
function isVideoAttachment(attachment) {
    return Boolean(!!attachment && !!attachment.contentType && (0, GoogleChrome_1.isVideoTypeSupported)(attachment.contentType));
}
exports.isVideoAttachment = isVideoAttachment;
function hasVideoScreenshot(attachments) {
    const firstAttachment = attachments ? attachments[0] : null;
    return Boolean(firstAttachment?.screenshot?.url);
}
exports.hasVideoScreenshot = hasVideoScreenshot;
async function arrayBufferFromFile(file) {
    return new Promise((resolve, reject) => {
        const FR = new FileReader();
        FR.onload = (e) => {
            resolve(e.target.result);
        };
        FR.onerror = reject;
        FR.onabort = reject;
        FR.readAsArrayBuffer(file);
    });
}
exports.arrayBufferFromFile = arrayBufferFromFile;
function getImageDimensionsInAttachment(attachment) {
    const { height, width } = attachment;
    if (!height || !width) {
        return {
            height: MIN_HEIGHT,
            width: MIN_WIDTH,
        };
    }
    const aspectRatio = height / width;
    const targetWidth = Math.max(Math.min(MAX_WIDTH, width), MIN_WIDTH);
    const candidateHeight = Math.round(targetWidth * aspectRatio);
    return {
        width: targetWidth,
        height: Math.max(Math.min(MAX_HEIGHT, candidateHeight), MIN_HEIGHT),
    };
}
exports.getImageDimensionsInAttachment = getImageDimensionsInAttachment;
function areAllAttachmentsVisual(attachments) {
    if (!attachments) {
        return false;
    }
    const max = attachments.length;
    for (let i = 0; i < max; i += 1) {
        const attachment = attachments[i];
        if (!isImageAttachment(attachment) && !isVideoAttachment(attachment)) {
            return false;
        }
    }
    return true;
}
exports.areAllAttachmentsVisual = areAllAttachmentsVisual;
function getAlt(attachment) {
    return isVideoAttachment(attachment)
        ? window.i18n('videoAttachmentAlt')
        : window.i18n('imageAttachmentAlt');
}
exports.getAlt = getAlt;
const isVisualMedia = (attachment) => {
    const { contentType } = attachment;
    if ((0, lodash_1.isUndefined)(contentType)) {
        return false;
    }
    if ((0, exports.isVoiceMessage)(attachment)) {
        return false;
    }
    return MIME.isImage(contentType) || MIME.isVideo(contentType);
};
exports.isVisualMedia = isVisualMedia;
const isFile = (attachment) => {
    const { contentType } = attachment;
    if ((0, lodash_1.isUndefined)(contentType)) {
        return false;
    }
    if ((0, exports.isVisualMedia)(attachment)) {
        return false;
    }
    if ((0, exports.isVoiceMessage)(attachment)) {
        return false;
    }
    return true;
};
exports.isFile = isFile;
const isVoiceMessage = (attachment) => {
    const flag = protobuf_1.SignalService.AttachmentPointer.Flags.VOICE_MESSAGE;
    const hasFlag = !(0, lodash_1.isUndefined)(attachment.flags) && (attachment.flags & flag) === flag;
    if (hasFlag) {
        return true;
    }
    const isLegacyAndroidVoiceMessage = !(0, lodash_1.isUndefined)(attachment.contentType) &&
        MIME.isAudio(attachment.contentType) &&
        !attachment.fileName;
    if (isLegacyAndroidVoiceMessage) {
        return true;
    }
    return false;
};
exports.isVoiceMessage = isVoiceMessage;
const save = ({ attachment, document, index, timestamp, }) => {
    const isObjectURLRequired = (0, lodash_1.isUndefined)(attachment.fileName);
    const filename = (0, exports.getSuggestedFilename)({ attachment, timestamp, index });
    (0, saveURLAsFile_1.saveURLAsFile)({ url: attachment.url, filename, document });
    if (isObjectURLRequired) {
        URL.revokeObjectURL(attachment.url);
    }
};
exports.save = save;
const getSuggestedFilename = ({ attachment, timestamp, index, }) => {
    if (attachment.fileName?.length > 3) {
        return attachment.fileName;
    }
    const prefix = 'session-attachment';
    const suffix = timestamp ? (0, moment_1.default)(timestamp).format('-YYYY-MM-DD-HHmmss') : '';
    const fileType = (0, exports.getFileExtension)(attachment);
    const extension = fileType ? `.${fileType}` : '';
    const indexSuffix = index ? `_${(0, lodash_1.padStart)(index.toString(), 3, '0')}` : '';
    return `${prefix}${suffix}${indexSuffix}${extension}`;
};
exports.getSuggestedFilename = getSuggestedFilename;
const getFileExtension = (attachment) => {
    if (!attachment.contentType ||
        attachment.contentType === 'text/plain' ||
        attachment.contentType.startsWith('application')) {
        if (attachment.fileName?.length) {
            const dotLastIndex = attachment.fileName.lastIndexOf('.');
            if (dotLastIndex !== -1) {
                return attachment.fileName.substring(dotLastIndex + 1);
            }
            return undefined;
        }
        return undefined;
    }
    switch (attachment.contentType) {
        case 'video/quicktime':
            return 'mov';
        default:
            return attachment.contentType.split('/')[1];
    }
};
exports.getFileExtension = getFileExtension;
