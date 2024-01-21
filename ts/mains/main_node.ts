/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable no-void */
/* eslint-disable import/first */
/* eslint-disable import/order */
/* eslint-disable no-console */

// @ts-ignore
global.SBOT ??= {};
global.SBOT.profileDataPath ||= __dirname + '../../session-data/'

import fs from 'fs';
import crypto from 'crypto';
import { console } from '../sessionjs-logger';

import _ from 'lodash';
import pify from 'pify';

const getRealPath = pify(fs.realpath);

import { userConfig } from '../node/config/user_config';
import * as PasswordUtil from '../util/passwordUtils';

import { initAttachmentsChannel } from '../node/attachment_channel';

import { ephemeralConfig } from '../node/config/ephemeral_config';
import { initializeLogger } from '../node/logging';
import { sqlNode } from '../node/sql';
import * as sqlChannels from '../node/sql_channel';

let isReady = false;

sqlChannels.initializeSqlChannel()

const windowFromUserConfig = userConfig.get('window');
const windowFromEphemeral = ephemeralConfig.get('window');
let windowConfig = windowFromEphemeral || windowFromUserConfig;
if (windowFromUserConfig) {
  userConfig.set('window', null);
  ephemeralConfig.set('window', windowConfig);
}

import { getConversationController } from '../session/conversations';
import { BlockedNumberController } from '../util';
import { Registration } from '../util/registration';
import { LibSessionUtil } from '../session/utils/libsession/libsession_utils';
import { initData } from '../data/dataInit';
import { Storage } from '../util/storage';
import { runners } from '../session/utils/job_runners/JobRunner';
import { queueAllCached } from '../receiver/receiver';
import { AttachmentDownloads } from '../session/utils';
import { getSwarmPollingInstance } from '../session/apis/snode_api';


global.SBOT.ready = async () => {
  await initializeLogger();

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
  const userDir = await getRealPath(global.SBOT.profileDataPath);
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
  const userDataPath = await getRealPath(global.SBOT.profileDataPath);

  await sqlNode.initializeSql({
    configDir: userDataPath,
    key: sqlKey,
    messages: [],
    passwordAttempt,
  });

  await initAttachmentsChannel({
    userDataPath,
  });


  initData()

  await Storage.fetch()

  await runners.avatarDownloadRunner.loadJobsFromDb();
  runners.avatarDownloadRunner.startProcessing();
  await runners.configurationSyncRunner.loadJobsFromDb();
  runners.configurationSyncRunner.startProcessing();

  if (Registration.isDone()) {
    try {
      await LibSessionUtil.initializeLibSessionUtilWrappers();
    } catch (e) {
      console.warn('LibSessionUtil.initializeLibSessionUtilWrappers failed with', e.message);
      // I don't think there is anything we can do if this happens
      throw e;
    }
  } else {
    console.log('Registration is not done, not initializing LibSessionUtil');
  }

  await getConversationController().load()
  await BlockedNumberController.load()
  await getConversationController().loadPromise()

  Registration.markDone()
  // console.log('result', result)

  setTimeout(() => {
    void queueAllCached();
  }, 10 * 1000); // 10 sec

  await AttachmentDownloads.start({
    logger: console,
  });

  await new Promise(resolve => setTimeout(resolve, 1000))

  runners.configurationSyncRunner.startProcessing();

  await getSwarmPollingInstance().start()

  isReady = true
  console.log('isReady')

  while(true) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
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

export const getIsReady = () => isReady