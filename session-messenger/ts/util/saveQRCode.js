"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveQRCode = void 0;
const sessionjs_logger_1 = require("../sessionjs-logger");
const saveURLAsFile_1 = require("./saveURLAsFile");
function saveQRCode(filename, width, height, backgroundColor, foregroundColor) {
    const qrSVG = document.querySelector('.qr-image svg');
    if (qrSVG) {
        qrSVG.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        qrSVG.setAttribute('width', width);
        qrSVG.setAttribute('height', height);
        let content = qrSVG.outerHTML;
        content = content.replaceAll(backgroundColor, 'white');
        content = content.replaceAll(foregroundColor, 'black');
        const file = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(file);
        (0, saveURLAsFile_1.saveURLAsFile)({
            filename: `${filename}-${new Date().toISOString()}.svg`,
            url,
            document,
        });
    }
    else {
        sessionjs_logger_1.console.info('[saveQRCode] QR code not found');
    }
}
exports.saveQRCode = saveQRCode;
