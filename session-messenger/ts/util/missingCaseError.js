"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.missingCaseError = void 0;
const missingCaseError = (x) => new TypeError(`Unhandled case: ${x}`);
exports.missingCaseError = missingCaseError;
