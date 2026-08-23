import type Stripe from 'stripe';
import { getStripeClient } from './stripe';

export type StripeConnectMode = 'disabled' | 'locked' | 'test' | 'live';
export type StripeConnectStatus = {
  accountId: string;
  transfersStatus: string | null;
  payoutsStatus: string | null;
  requirementsCurrentlyDue: string[];
  mode: StripeConnectMode;
};

const STRIPE_CONNECT_API_VERSION = '2026-07-29.preview';

export function getStripeConnectMode(): StripeConnectMode {
  if (process.env.STRIPE_CONNECT_ENABLED !== 'true') return 'disabled';
  const key = process.env.STRIPE_SECRET_KEY?.trim() || '';
  if (!key) return 'locked';
  const liveKey = key.startsWith('sk_live_');
  if (liveKey && process.env.STRIPE_CONNECT_LIVE_ENABLED !== 'true') return 'locked';
  if (key.startsWith('sk_test_')) return 'test';
  return liveKey ? 'live' : 'locked';
}

export function isStripeConnectReadyForTransfers(status: Pick<StripeConnectStatus, 'transfersStatus'>) {
  return status.transfersStatus === 'active';
}

function getStripeSecretKey() {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error('Stripe is not configured');
  return key;
}

async function stripeV2Request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`https://api.stripe.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getStripeSecretKey()}`,
      'Content-Type': 'application/json',
      'Stripe-Version': STRIPE_CONNECT_API_VERSION,
      ...(init.headers || {}),
    },
    cache: 'no-store',
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof body?.error?.message === 'string' ? body.error.message : 'Stripe Connect request failed';
    throw new Error(message);
  }
  return body as T;
}

function extractConnectStatus(account: any, mode: StripeConnectMode): StripeConnectStatus {
  const recipient = account?.configuration?.recipient;
  const capabilities = recipient?.capabilities?.stripe_balance || {};
  return {
    accountId: String(account?.id || ''),
    transfersStatus: capabilities.stripe_transfers?.status || null,
    payoutsStatus: capabilities.payouts?.status || null,
    requirementsCurrentlyDue: Array.isArray(account?.requirements?.currently_due)
      ? account.requirements.currently_due.filter((item: unknown): item is string => typeof item === 'string')
      : [],
    mode,
  };
}

export async function retrieveStripeConnectAccount(accountId: string): Promise<StripeConnectStatus> {
  const mode = getStripeConnectMode();
  if (!/^acct_[A-Za-z0-9]+$/.test(accountId)) throw new Error('Invalid Stripe Connect account id');
  const account = await stripeV2Request<any>(
    `/v2/core/accounts/${encodeURIComponent(accountId)}?include=configuration.recipient&include=requirements`,
    { method: 'GET' },
  );
  return extractConnectStatus(account, mode);
}

export async function createStripeConnectAccount(opts: {
  uid: string;
  email: string;
  displayName: string;
}): Promise<StripeConnectStatus> {
  const mode = getStripeConnectMode();
  if (!['test', 'live'].includes(mode)) throw new Error('Stripe Connect is locked');

  const account = await stripeV2Request<any>('/v2/core/accounts', {
    method: 'POST',
    headers: {
      'Idempotency-Key': `tutorfinder-connect-account-${opts.uid}`,
    },
    body: JSON.stringify({
      contact_email: opts.email,
      display_name: opts.displayName || 'TutorFinder ครู',
      dashboard: 'express',
      identity: {
        country: 'th',
        entity_type: 'individual',
      },
      configuration: {
        recipient: {
          capabilities: {
            stripe_balance: {
              stripe_transfers: { requested: true },
            },
          },
        },
      },
      defaults: {
        currency: 'thb',
        responsibilities: {
          fees_collector: 'application',
          losses_collector: 'application',
        },
        locales: ['th-TH'],
      },
      include: ['configuration.recipient', 'identity', 'requirements'],
      metadata: { tutorfinder_user_id: opts.uid },
    }),
  });

  const status = extractConnectStatus(account, mode);
  if (!status.accountId) throw new Error('Stripe did not return a connected account id');
  return status;
}

export async function createStripeConnectOnboardingLink(opts: {
  accountId: string;
  returnUrl: string;
  refreshUrl: string;
}): Promise<string> {
  const stripe = getStripeClient();
  if (!stripe) throw new Error('Stripe is not configured');
  const link = await stripe.accountLinks.create({
    account: opts.accountId,
    return_url: opts.returnUrl,
    refresh_url: opts.refreshUrl,
    type: 'account_onboarding',
  });
  return link.url;
}

/**
 * Creates a transfer only after the caller has explicitly enabled Connect.
 * source_transaction is optional because an admin payout may aggregate several
 * completed lessons; when present it binds the transfer to the originating charge.
 */
export async function createStripeConnectTransfer(opts: {
  payoutId: string;
  accountId: string;
  amount: number;
  currency?: string;
  sourceTransaction?: string;
}): Promise<{ status: 'created'; transferId: string; mode: StripeConnectMode } | { status: 'disabled' | 'locked' | 'invalid' }> {
  const mode = getStripeConnectMode();
  if (mode === 'disabled') return { status: 'disabled' };
  if (mode === 'locked') return { status: 'locked' };
  if (!/^acct_[A-Za-z0-9]+$/.test(opts.accountId) || !Number.isFinite(opts.amount) || opts.amount <= 0) {
    return { status: 'invalid' };
  }

  const stripe = getStripeClient();
  if (!stripe) return { status: 'locked' };
  const amountInSatang = Math.round(opts.amount * 100);
  if (amountInSatang <= 0) return { status: 'invalid' };

  const params: Stripe.TransferCreateParams = {
    amount: amountInSatang,
    currency: (opts.currency || 'thb').toLowerCase(),
    destination: opts.accountId,
    ...(opts.sourceTransaction ? { source_transaction: opts.sourceTransaction } : {}),
  };
  const transfer = await stripe.transfers.create(params, {
    idempotencyKey: `tutorfinder-connect-payout-${opts.payoutId}`,
  });
  return { status: 'created', transferId: transfer.id, mode };
}
