"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.arrayBufferToObjectURL = void 0;
const lodash_1 = require("lodash");
const arrayBufferToObjectURL = ({ data, type, }) => {
    if (!(0, lodash_1.isArrayBuffer)(data)) {
        throw new TypeError('`data` must be an ArrayBuffer');
    }
    const blob = new Blob([data], { type });
    return URL.createObjectURL(blob);
};
exports.arrayBufferToObjectURL = arrayBufferToObjectURL;
