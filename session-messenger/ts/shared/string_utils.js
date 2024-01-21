"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uniqFromListOfList = void 0;
const lodash_1 = require("lodash");
function uniqFromListOfList(list) {
    return (0, lodash_1.uniq)((0, lodash_1.compact)(list.flat()));
}
exports.uniqFromListOfList = uniqFromListOfList;
