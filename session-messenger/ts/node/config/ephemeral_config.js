"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ephemeralConfig = void 0;
const path_1 = __importDefault(require("path"));
const base_config_1 = require("./base_config");
const targetPath = path_1.default.join(global.SBOT.profileDataPath, 'ephemeral.json');
exports.ephemeralConfig = (0, base_config_1.start)('ephemeral', targetPath, {
    allowMalformedOnStartup: true,
});
