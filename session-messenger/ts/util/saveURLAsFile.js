"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveURLAsFile = void 0;
const saveURLAsFile = ({ filename, url, document, }) => {
    const anchorElement = document.createElement('a');
    anchorElement.href = url;
    anchorElement.download = filename;
    anchorElement.click();
};
exports.saveURLAsFile = saveURLAsFile;
