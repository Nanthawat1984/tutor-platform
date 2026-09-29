// Bootstrap: register the alias loader (used via node --import).
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register('./alias-loader.mjs', pathToFileURL('./scripts/'));
