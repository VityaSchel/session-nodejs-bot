/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable no-void */
/* eslint-disable import/first */
/* eslint-disable import/order */
/* eslint-disable no-console */

import path, { join } from 'path';
import { platform as osPlatform } from 'process';
import url from 'url';
import os from 'os';
import fs from 'fs';
import crypto from 'crypto';

// @ts-ignore
global.SBOT = {}

import _ from 'lodash';
import pify from 'pify';
import Logger from 'bunyan';

import packageJson from '../../package.json'; // checked - only node

const getRealPath = pify(fs.realpath);

let readyForShutdown: boolean = false;

import { config } from '../node/config'; // checked - only node

// Very important to put before the single instance check, since it is based on the
//   userData directory.
import { userConfig } from '../node/config/user_config'; // checked - only node
import * as PasswordUtil from '../util/passwordUtils'; // checked - only node

const development = (config as any).environment === 'development';
const appInstance = config.util.getEnv('NODE_APP_INSTANCE') || 0;

// We generally want to pull in our own modules after this point, after the user
//   data directory has been set.
import { initAttachmentsChannel } from '../node/attachment_channel';

import { ephemeralConfig } from '../node/config/ephemeral_config'; // checked - only node
import { getLogger, initializeLogger } from '../node/logging'; // checked - only node
import { sqlNode } from '../node/sql'; // checked - only node
// import * as sqlChannels from '../node/sql_channel'; // checked - only node
import { windowMarkShouldQuit, windowShouldQuit } from '../node/window_state'; // checked - only node
// import { createTemplate } from '../node/menu'; // checked - only node
// import { installFileHandler, installWebHandler } from '../node/protocol_filter'; // checked - only node
// import { installPermissionsHandler } from '../node/permissions'; // checked - only node

let appStartInitialSpellcheckSetting = true;

const enableTestIntegrationWiderWindow = false;
const isTestIntegration =
  enableTestIntegrationWiderWindow &&
  Boolean(
    process.env.NODE_APP_INSTANCE && process.env.NODE_APP_INSTANCE.includes('test-integration')
  );
async function getSpellCheckSetting() {
  const json = sqlNode.getItemById('spell-check');
  // Default to `true` if setting doesn't exist yet
  if (!json) {
    return true;
  }

  return json.value;
}

const windowFromUserConfig = userConfig.get('window');
const windowFromEphemeral = ephemeralConfig.get('window');
let windowConfig = windowFromEphemeral || windowFromUserConfig;
if (windowFromUserConfig) {
  userConfig.set('window', null);
  ephemeralConfig.set('window', windowConfig);
}

// import {load as loadLocale} from '../..'
import { setLastestRelease } from '../node/latest_desktop_release';
import { getAppRootPath } from '../node/getRootPath';

// Both of these will be set after app fires the 'ready' event
let logger: Logger | null = null;

function assertLogger(): Logger {
  if (!logger) {
    throw new Error('assertLogger: logger is not set');
  }
  return logger;
}

function prepareURL(pathSegments: Array<string>, moreKeys?: { theme: any }) {
  const urlObject: url.UrlObject = {
    pathname: join(...pathSegments),
    protocol: 'file:',
    slashes: true,
    query: {
      name: packageJson.productName,
      locale: 'ru',
      version: '1.11.5',
      commitHash: config.get('commitHash'),
      environment: (config as any).environment,
      node_version: process.versions.node,
      hostname: os.hostname(),
      appInstance: process.env.NODE_APP_INSTANCE,
      proxyUrl: process.env.HTTPS_PROXY || process.env.https_proxy,
      appStartInitialSpellcheckSetting,
      ...moreKeys,
    },
  };
  return url.format(urlObject);
}

// Use these for shutdown:
// windowShouldQuit()
// requestShutdown()

let ready = false;
global.SBOT.ready = async () => {
  await initializeLogger();
  logger = getLogger();
  assertLogger().info('app ready');
  assertLogger().info(`starting version ${packageJson.version}`);

  const key = getDefaultSQLKey();

  // Try to show the main window with the default key
  // If that fails then show the password window
  const dbHasPassword = userConfig.get('dbHasPassword');
  if (dbHasPassword) {
    console.log('[SBOT] db has no password')
  } else {
    console.log('[SBOT] db has password', key)
    await showMainWindow(key);
  }
}

function getDefaultSQLKey() {
  let key = userConfig.get('key');
  if (!key) {
    console.log('key/initialize: Generating new encryption key, since we did not find it on disk');
    // https://www.zetetic.net/sqlcipher/sqlcipher-api/#key
    key = crypto.randomBytes(32).toString('hex');
    userConfig.set('key', key);
  }

  return key as string;
}

async function removeDB() {
  // this don't remove attachments and stuff like that...
  const userData = __dirname + '/../../session-data/'; 
  const userDir = await getRealPath(userData);
  sqlNode.removeDB(userDir);

  try {
    console.error('Remove DB: removing.', userDir);

    userConfig.remove();
    ephemeralConfig.remove();
  } catch (e) {
    console.error('Remove DB: Failed to remove configs.', e);
  }
}

async function showMainWindow(sqlKey: string, passwordAttempt = false) {
  const userData = __dirname + '/../../session-data/'; 
  const userDataPath = await getRealPath(userData);

  await sqlNode.initializeSql({
    configDir: userDataPath,
    key: sqlKey,
    messages: [],
    passwordAttempt,
  });
  appStartInitialSpellcheckSetting = await getSpellCheckSetting();

  await initAttachmentsChannel({
    userDataPath,
  });

  ready = true;

  while(true) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

//windowMarkShouldQuit()

global.SBOT.resetDatabase = async () => {
  await removeDB();
}

// Password screen related IPC calls
global.SBOT.passwordLogin = async (passPhrase) => {
  const sendResponse = (e: string | undefined) => {
    console.log('password-window-login-response', e);
  };

  try {
    const passwordAttempt = true;
    await showMainWindow(passPhrase, passwordAttempt);
    sendResponse(undefined);
  } catch (e) {
    sendResponse('removePasswordInvalid error');
  }
}

global.SBOT.setPassword = async (passPhrase, oldPhrase) => {
  const sendResponse = (response: string | undefined) => {
    console.log('set-password-response', response);
  };

  try {
    // Check if the hash we have stored matches the hash of the old passphrase.
    const hash = sqlNode.getPasswordHash();

    const hashMatches = oldPhrase && PasswordUtil.matchesHash(oldPhrase, hash);
    if (hash && !hashMatches) {
      sendResponse(
        'Failed to set password: Old password provided is invalid'
      );
      return;
    }

    if (_.isEmpty(passPhrase)) {
      const defaultKey = getDefaultSQLKey();
      sqlNode.setSQLPassword(defaultKey);
      sqlNode.removePasswordHash();
      userConfig.set('dbHasPassword', false);
    } else {
      sqlNode.setSQLPassword(passPhrase);
      const newHash = PasswordUtil.generateHash(passPhrase);
      sqlNode.savePasswordHash(newHash);
      userConfig.set('dbHasPassword', true);
    }

    sendResponse(undefined);
  } catch (e) {
    sendResponse('Failed to set password');
  }
}
global.SBOT.ready()