"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isVideoTypeSupported = exports.isImageTypeSupported = void 0;
const SUPPORTED_IMAGE_MIME_TYPES = {
    'image/bmp': true,
    'image/gif': true,
    'image/jpeg': true,
    'image/svg+xml': false,
    'image/webp': true,
    'image/x-xbitmap': true,
    'image/vnd.microsoft.icon': true,
    'image/ico': true,
    'image/icon': true,
    'image/x-icon': true,
    'image/apng': true,
    'image/png': true,
};
const isImageTypeSupported = (mimeType) => SUPPORTED_IMAGE_MIME_TYPES[mimeType] === true;
exports.isImageTypeSupported = isImageTypeSupported;
const SUPPORTED_VIDEO_MIME_TYPES = {
    'video/mp4': true,
    'video/ogg': true,
    'video/webm': true,
};
const isVideoTypeSupported = (mimeType) => SUPPORTED_VIDEO_MIME_TYPES[mimeType] === true;
exports.isVideoTypeSupported = isVideoTypeSupported;
