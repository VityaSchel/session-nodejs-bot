import { throttle, uniq } from 'lodash';
import moment from 'moment';
import { LocalizerKeys } from '../types/LocalizerKeys';
import { initWallClockListener } from './wallClockListener';

import { Data } from '../data/data';
import { getConversationController } from '../session/conversations';
import { console } from '../sessionjs-logger';

export async function destroyMessagesAndUpdateRedux(
  messages: Array<{
    conversationKey: string;
    messageId: string;
  }>
) {
  if (!messages.length) {
    return;
  }
  const conversationWithChanges = uniq(messages.map(m => m.conversationKey));

  try {
    // Delete all those messages in a single sql call
    await Data.removeMessagesByIds(messages.map(m => m.messageId));
  } catch (e) {
    console.error('destroyMessages: removeMessagesByIds failed', e && e.message ? e.message : e);
  }
  // trigger a redux update if needed for all those messages
  // window.inboxStore?.dispatch(messagesExpired(messages));
  console.log('[SBOT/redux] messagesExpired')

  // trigger a refresh the last message for all those uniq conversation
  conversationWithChanges.forEach(convoIdToUpdate => {
    getConversationController()
      .get(convoIdToUpdate)
      ?.updateLastMessage();
  });
}

async function destroyExpiredMessages() {
  try {
    console.info('destroyExpiredMessages: Loading messages...');
    const messages = await Data.getExpiredMessages();

    const messagesExpiredDetails: Array<{
      conversationKey: string;
      messageId: string;
    }> = messages.map(m => ({
      conversationKey: m.get('conversationId'),
      messageId: m.id,
    }));

    messages.forEach(expired => {
      console.info('Message expired', {
        sentAt: expired.get('sent_at'),
      });
    });

    await destroyMessagesAndUpdateRedux(messagesExpiredDetails);
  } catch (error) {
    console.error(
      'destroyExpiredMessages: Error deleting expired messages',
      error && error.stack ? error.stack : error
    );
  }

  console.info('destroyExpiredMessages: complete');
  void checkExpiringMessages();
}

let timeout: NodeJS.Timeout | undefined;
async function checkExpiringMessages() {
  // Look up the next expiring message and set a timer to destroy it
  const messages = await Data.getNextExpiringMessage();
  const next = messages.at(0);
  if (!next) {
    return;
  }

  const expiresAt = next.get('expires_at');
  if (!expiresAt) {
    return;
  }
  console.info('next message expires', new Date(expiresAt).toISOString());
  console.info('next message expires in ', (expiresAt - Date.now()) / 1000);

  let wait = expiresAt - Date.now();

  // In the past
  if (wait < 0) {
    wait = 0;
  }

  // Too far in the future, since it's limited to a 32-bit value
  if (wait > 2147483647) {
    wait = 2147483647;
  }

  if (timeout) {
    global.clearTimeout(timeout);
  }
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  timeout = global.setTimeout(async () => destroyExpiredMessages(), wait);
}
const throttledCheckExpiringMessages = throttle(checkExpiringMessages, 1000);

let isInit = false;

const initExpiringMessageListener = () => {
  if (isInit) {
    throw new Error('expiring messages listener is already init');
  }

  void checkExpiringMessages();

  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  initWallClockListener(async () => throttledCheckExpiringMessages());
  isInit = true;
};

const updateExpiringMessagesCheck = () => {
  void throttledCheckExpiringMessages();
};

function getTimerOptionName(time: number, unit: moment.DurationInputArg2) {
  return (
    // window.i18n(['timerOption', time, unit].join('_') as LocalizerKeys) ||
    moment.duration(time, unit).humanize()
  );
}
function getTimerOptionAbbreviated(time: number, unit: string) {
  return ''//window.i18n(['timerOption', time, unit, 'abbreviated'].join('_') as LocalizerKeys);
}

const timerOptionsDurations: Array<{
  time: number;
  unit: moment.DurationInputArg2;
  seconds: number;
}> = [
  { time: 0, unit: 'seconds' as moment.DurationInputArg2 },
  { time: 5, unit: 'seconds' as moment.DurationInputArg2 },
  { time: 10, unit: 'seconds' as moment.DurationInputArg2 },
  { time: 30, unit: 'seconds' as moment.DurationInputArg2 },
  { time: 1, unit: 'minute' as moment.DurationInputArg2 },
  { time: 5, unit: 'minutes' as moment.DurationInputArg2 },
  { time: 30, unit: 'minutes' as moment.DurationInputArg2 },
  { time: 1, unit: 'hour' as moment.DurationInputArg2 },
  { time: 6, unit: 'hours' as moment.DurationInputArg2 },
  { time: 12, unit: 'hours' as moment.DurationInputArg2 },
  { time: 1, unit: 'day' as moment.DurationInputArg2 },
  { time: 1, unit: 'week' as moment.DurationInputArg2 },
].map(o => {
  const duration = moment.duration(o.time, o.unit); // 5, 'seconds'
  return {
    time: o.time,
    unit: o.unit,
    seconds: duration.asSeconds(),
  };
});

function getName(seconds = 0) {
  const o = timerOptionsDurations.find(m => m.seconds === seconds);

  if (o) {
    return getTimerOptionName(o.time, o.unit);
  }
  return [seconds, 'seconds'].join(' ');
}
function getAbbreviated(seconds = 0) {
  const o = timerOptionsDurations.find(m => m.seconds === seconds);

  if (o) {
    return getTimerOptionAbbreviated(o.time, o.unit);
  }

  return [seconds, 's'].join('');
}

function getTimerSecondsWithName(): any {
  return timerOptionsDurations.map(t => {
    return { name: getName(t.seconds), value: t.seconds };
  });
}

export const ExpirationTimerOptions = {
  getName,
  getAbbreviated,
  updateExpiringMessagesCheck,
  initExpiringMessageListener,
  getTimerSecondsWithName,
};
