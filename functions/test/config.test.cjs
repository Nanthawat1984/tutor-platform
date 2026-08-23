const test = require('node:test');
const assert = require('node:assert/strict');

const { getLineServerConfig, requireLineServerConfig, LineConfigurationError } = require('../lib/line/config.js');

function clearLineEnv() {
  for (const name of [
    'LINE_NOTIFICATIONS_ENABLED',
    'LINE_CHANNEL_ID',
    'LINE_CHANNEL_SECRET',
    'LINE_CHANNEL_ACCESS_TOKEN',
    'LINE_OFFICIAL_ACCOUNT_ID',
    'NEXT_PUBLIC_LINE_LIFF_ID',
  ]) delete process.env[name];
}

test('disabled LINE configuration does not require credentials', () => {
  clearLineEnv();
  const config = getLineServerConfig();

  assert.equal(config.enabled, false);
  assert.equal(config.officialAccountId, '@966mqfzj');
  assert.doesNotThrow(() => requireLineServerConfig());
});

test('enabled LINE configuration rejects a missing channel secret', () => {
  clearLineEnv();
  process.env.LINE_NOTIFICATIONS_ENABLED = 'true';
  process.env.LINE_CHANNEL_ID = 'channel-id';
  process.env.LINE_CHANNEL_ACCESS_TOKEN = 'access-token';

  assert.throws(() => requireLineServerConfig(), (error) => {
    assert.equal(error instanceof LineConfigurationError, true);
    assert.equal(error.code, 'LINE_CONFIGURATION_ERROR');
    assert.match(error.message, /LINE_CHANNEL_SECRET/);
    return true;
  });

  clearLineEnv();
});
