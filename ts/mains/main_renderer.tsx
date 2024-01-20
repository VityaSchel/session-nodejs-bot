import _ from 'lodash';
import ReactDOM from 'react-dom';
import Backbone from 'backbone';
import React from 'react';
import nativeEmojiData from '@emoji-mart/data';

import { MessageModel } from '../models/message';
import { isMacOS } from '../OS';
import { queueAllCached } from '../receiver/receiver';
import { getConversationController } from '../session/conversations';
import { AttachmentDownloads, ToastUtils } from '../session/utils';
import { getOurPubKeyStrFromCache } from '../session/utils/User';
import { BlockedNumberController } from '../util';
import { ExpirationTimerOptions } from '../util/expiringMessages';
import { Notifications } from '../util/notifications';
import { Registration } from '../util/registration';
import { isSignInByLinking, Storage } from '../util/storage';
import { Data } from '../data/data';
import { deleteAllLogs } from '../node/logs';
import { OpenGroupData } from '../data/opengroups';
import { loadKnownBlindedKeys } from '../session/apis/open_group_api/sogsv3/knownBlindedkeys';
import { initialiseEmojiData } from '../util/emoji';
import { LibSessionUtil } from '../session/utils/libsession/libsession_utils';
import { runners } from '../session/utils/job_runners/JobRunner';
import { SettingsKey } from '../data/settings-key';

console.log('Storage fetch');
void Storage.fetch();

async function startJobRunners() {
  // start the job runners
  await runners.avatarDownloadRunner.loadJobsFromDb();
  runners.avatarDownloadRunner.startProcessing();
  await runners.configurationSyncRunner.loadJobsFromDb();
  runners.configurationSyncRunner.startProcessing();
}

// We need this 'first' check because we don't want to start the app up any other time
//   than the first time. And storage.fetch() will cause onready() to fire.
let first = true;
// eslint-disable-next-line @typescript-eslint/no-misused-promises
Storage.onready(async () => {
  if (!first) {
    return;
  }
  first = false;

  // Ensure accounts created prior to 1.0.0-beta8 do have their
  // 'primaryDevicePubKey' defined.

  if (Registration.isDone() && !Storage.get('primaryDevicePubKey')) {
    await Storage.put('primaryDevicePubKey', getOurPubKeyStrFromCache());
  }

  global.SBOT.shutdown = async () => {
    AttachmentDownloads.stop();
    await Data.shutdown();
  }

  const currentVersion = '1.11.5';
  const lastVersion = Storage.get('version');
  let newVersion = !lastVersion || currentVersion !== lastVersion;
  await Storage.put('version', currentVersion);

  if (newVersion) {
    console.log(`New version detected: ${currentVersion}; previous: ${lastVersion}`);

    await Data.cleanupOrphanedAttachments();

    await deleteAllLogs();
  }
  try {
    if (Registration.isDone()) {
      try {
        await LibSessionUtil.initializeLibSessionUtilWrappers();
      } catch (e) {
        console.warn('LibSessionUtil.initializeLibSessionUtilWrappers failed with', e.message);
        // I don't think there is anything we can do if this happens
        throw e;
      }
    }
    await initialiseEmojiData(nativeEmojiData);
    await AttachmentDownloads.initAttachmentPaths();

    await Promise.all([
      getConversationController().load(),
      BlockedNumberController.load(),
      OpenGroupData.opengroupRoomsLoad(),
      loadKnownBlindedKeys(),
    ]);
    await startJobRunners();
  } catch (error) {
    console.error(
      'main_renderer: ConversationController failed to load:',
      error && error.stack ? error.stack : error
    );
  } finally {
    void start();
  }
});

async function manageExpiringData() {
  await Data.cleanSeenMessages();
  await Data.cleanLastHashes();
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  setTimeout(manageExpiringData, 1000 * 60 * 60);
}

async function start() {
  void manageExpiringData();
  // window.dispatchEvent(new Event('storage_ready'));

  console.info('Cleanup: starting...');

  const results = await Promise.all([Data.getOutgoingWithoutExpiresAt()]);

  // Combine the models
  const messagesForCleanup = results.reduce(
    (array, current) => array.concat((current as any).toArray()),
    []
  );

  console.info(`Cleanup: Found ${messagesForCleanup.length} messages for cleanup`);

  const idsToCleanUp: Array<string> = [];
  await Promise.all(
    messagesForCleanup.map((message: MessageModel) => {
      const sentAt = message.get('sent_at');

      if (message.hasErrors()) {
        return null;
      }

      console.info(`Cleanup: Deleting unsent message ${sentAt}`);
      idsToCleanUp.push(message.id);
      return null;
    })
  );
  if (idsToCleanUp.length) {
    await Data.removeMessagesByIds(idsToCleanUp);
  }
  console.info('Cleanup: complete');

  console.info('listening for registration events');
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  // WhisperEvents.on('registration_done', async () => {
  //   console.info('handling registration event');

  //   await connect();
  // });

  function openInbox() {
    console.log('[SBOT] openInbox');
    getConversationController()
      .loadPromise()
  }

  function showRegistrationView() {
    console.log('[SBOT] showRegistrationView');
  }
  ExpirationTimerOptions.initExpiringMessageListener();

  if (Registration.isDone() && !isSignInByLinking()) {
    await connect();
    openInbox();
  } else {
    showRegistrationView();
  }

  global.SBOT.openInbox = () => {
    openInbox();
  }
}

function onOnline() {
  console.info('online')

  void connect();
}

function disconnect() {
  console.info('disconnect');

  AttachmentDownloads.stop();
}

let connectCount = 0;
async function connect() {
  console.info('connect');

  if (!Registration.everDone()) {
    return;
  }

  connectCount += 1;
  Notifications.disable(); // avoid notification flood until empty
  setTimeout(() => {
    Notifications.enable();
  }, 10 * 1000); // 10 sec

  setTimeout(() => {
    void queueAllCached();
  }, 10 * 1000); // 10 sec
  await AttachmentDownloads.start({
    logger: console,
  });

}

global.Session = global.Session || {};

global.Session.setNewSessionID = (sessionID: string) => {
  console.log(sessionID)
};
