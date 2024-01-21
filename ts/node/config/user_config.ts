import path from 'path';
import process from 'process';

import { start } from './base_config';
import { console } from '../../sessionjs-logger';

let storageProfile;

// Node makes sure all environment variables are strings
const { NODE_ENV: environment, NODE_APP_INSTANCE: instance } = process.env;

// We need to make sure instance is not empty
const isValidInstance = typeof instance === 'string' && instance.length > 0;
const isProduction = environment === 'production' && !isValidInstance;

// Use separate data directories for each different environment and app instances
if (!isProduction) {
  storageProfile = environment;
  if (isValidInstance) {
    storageProfile = (storageProfile || '').concat(`-${instance}`);
  }
}

const userData = global.SBOT.profileDataPath

console.log(`userData: ${userData}`);

const userDataPath = userData;
const targetPath = path.join(userDataPath, 'config.json');

export const userConfig = start('user', targetPath);

export type UserConfig = typeof userConfig;
