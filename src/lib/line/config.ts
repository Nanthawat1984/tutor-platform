export interface LineClientConfig {
  enabled: boolean;
  officialAccountId: string;
  liffId: string;
}

export function getLineClientConfig(): LineClientConfig {
  const liffId = process.env.NEXT_PUBLIC_LINE_LIFF_ID?.trim() || '';

  return {
    enabled: Boolean(liffId),
    officialAccountId: process.env.NEXT_PUBLIC_LINE_OFFICIAL_ACCOUNT_ID?.trim() || '@966mqfzj',
    liffId,
  };
}
