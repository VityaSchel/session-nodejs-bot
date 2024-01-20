import path from 'path';

import { start } from './base_config';

const userData = __dirname + '/../../session-data/';
const userDataPath = userData;
const targetPath = path.join(userDataPath, 'ephemeral.json');

export const ephemeralConfig = start('ephemeral', targetPath, {
  allowMalformedOnStartup: true,
});
