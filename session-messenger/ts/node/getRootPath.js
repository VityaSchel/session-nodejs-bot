"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAppRootPath = void 0;
const path_1 = require("path");
function getAppRootPath() {
    return (0, path_1.join)(__dirname, '..', '..');
}
exports.getAppRootPath = getAppRootPath;
