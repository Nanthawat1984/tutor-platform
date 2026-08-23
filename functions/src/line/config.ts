export class LineConfigurationError extends Error {
  readonly code = 'LINE_CONFIGURATION_ERROR';

  constructor(message: string) {
    super(message);
    this.name = 'LineConfigurationError';
  }
}

export interface LineServerConfig {
  enabled: boolean;
  officialAccountId: string;
  liffId: string;
  loginChannelId: string;
  channelId: string;
  channelSecret: string;
  channelAccessToken: string;
  appUrl: string;
}

function readValue(name: string): string {
  return process.env[name]?.trim() || '';
}

function readBoolean(value: string): boolean {
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

export function getLineServerConfig(): LineServerConfig {
  return {
    enabled: readBoolean(process.env.LINE_NOTIFICATIONS_ENABLED || 'false'),
    officialAccountId: readValue('LINE_OFFICIAL_ACCOUNT_ID') || '@966mqfzj',
    liffId: readValue('NEXT_PUBLIC_LINE_LIFF_ID'),
    loginChannelId: readValue('LINE_LOGIN_CHANNEL_ID'),
    channelId: readValue('LINE_CHANNEL_ID'),
    channelSecret: readValue('LINE_CHANNEL_SECRET'),
    channelAccessToken: readValue('LINE_CHANNEL_ACCESS_TOKEN'),
    appUrl: readValue('NEXT_PUBLIC_APP_URL') || 'http://localhost:3000',
  };
}

export function requireLineServerConfig(): LineServerConfig {
  const config = getLineServerConfig();
  if (!config.enabled) return config;

  const missing = Object.entries({
    LINE_CHANNEL_ID: config.channelId,
    LINE_CHANNEL_SECRET: config.channelSecret,
    LINE_CHANNEL_ACCESS_TOKEN: config.channelAccessToken,
  })
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new LineConfigurationError(`Missing LINE configuration: ${missing.join(', ')}`);
  }

  return config;
}
