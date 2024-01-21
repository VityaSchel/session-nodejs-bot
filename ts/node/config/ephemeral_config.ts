import path from 'path';

import { start } from './base_config';

const targetPath = path.join(global.SBOT.profileDataPath, 'ephemeral.json');

export const ephemeralConfig = start('ephemeral', targetPath, {
  allowMalformedOnStartup: true,
});
