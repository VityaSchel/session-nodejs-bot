"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isLinkPreviewDateValid = void 0;
const ONE_DAY = 24 * 60 * 60 * 1000;
function isLinkPreviewDateValid(value) {
    const maximumLinkPreviewDate = Date.now() + ONE_DAY;
    return (typeof value === 'number' &&
        value !== 0 &&
        Number.isFinite(value) &&
        value < maximumLinkPreviewDate);
}
exports.isLinkPreviewDateValid = isLinkPreviewDateValid;
