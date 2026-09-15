// Coupon + referral types — server-validated, never client-written.
export interface Coupon {
  id: string;
  code: string;
  kind: 'percent' | 'fixed';
  value: number;
  maxDiscount?: number;
  minAmount?: number;
  usageLimit?: number;
  usedCount: number;
  isActive: boolean;
  expiresAt?: unknown;
}

export interface Referral {
  id: string;
  referrerId: string;
  referredEmail?: string;
  code: string;
  status: 'pending' | 'rewarded';
  rewardAmount: number;
}
