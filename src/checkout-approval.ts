/**
 * Human-in-the-loop gate for placing a real order.
 *
 * Everything up to the order — search, basket edits, slot booking — is safe to
 * run autonomously. Spending money is not, so the real checkout is split in two:
 * a dry run mints a short-lived confirmation code bound to the provider and to a
 * fingerprint of the basket it previewed, and placing the order requires that
 * code back. An agent therefore cannot place an order without first producing a
 * preview for a human, and an approval granted for one basket does not carry
 * over to a different one.
 *
 * Codes live in memory only, so they die with the server process.
 */

import { createHash, randomBytes } from 'crypto';
import type { Basket } from './providers/types';

/** How long a confirmation code stays valid after the dry run that minted it. */
export const APPROVAL_TTL_MS = 10 * 60 * 1000;

/**
 * Stable digest of what the user is being asked to approve: which items, how
 * many of each, and the total. Any basket edit after approval changes this and
 * voids the code.
 */
export function basketFingerprint(basket: Basket): string {
  const items = basket.items
    .map(item => `${item.product_uid}:${item.quantity}`)
    .sort()
    .join('|');
  return createHash('sha256')
    .update(`${basket.provider}|${items}|${basket.total_cost.toFixed(2)}`)
    .digest('hex')
    .slice(0, 12);
}

interface PendingApproval {
  provider: string;
  fingerprint: string;
  expiresAt: number;
}

const pending = new Map<string, PendingApproval>();

function prune(now: number): void {
  for (const [code, approval] of pending) {
    if (approval.expiresAt <= now) pending.delete(code);
  }
}

export interface IssuedApproval {
  code: string;
  expiresAt: number;
  expiresInMinutes: number;
}

/** Mint a confirmation code for the basket a dry run just previewed. */
export function issueApproval(provider: string, basket: Basket, now = Date.now()): IssuedApproval {
  prune(now);
  let code: string;
  do {
    code = randomBytes(3).toString('hex').toUpperCase();
  } while (pending.has(code));

  const expiresAt = now + APPROVAL_TTL_MS;
  pending.set(code, { provider, fingerprint: basketFingerprint(basket), expiresAt });

  return { code, expiresAt, expiresInMinutes: Math.round(APPROVAL_TTL_MS / 60000) };
}

export type RedeemResult = { ok: true } | { ok: false; reason: string };

/**
 * Consume a confirmation code. Succeeds only for the provider it was issued
 * for, before it expires, and while the basket still matches the preview.
 * Codes are single-use: a successful redemption cannot be replayed.
 */
export function redeemApproval(
  code: string | undefined,
  provider: string,
  basket: Basket,
  now = Date.now()
): RedeemResult {
  prune(now);

  if (!code) {
    return {
      ok: false,
      reason:
        'no confirmation_code was supplied. Run checkout with dry_run=true, show the preview to the user, and pass the code back once they approve it.',
    };
  }

  const approval = pending.get(code.trim().toUpperCase());
  if (!approval) {
    return {
      ok: false,
      reason:
        'that confirmation_code is unknown, already used, or expired. Run a fresh dry run and get the user to approve the new preview.',
    };
  }

  if (approval.provider !== provider) {
    return {
      ok: false,
      reason: `that confirmation_code was issued for ${approval.provider}, not ${provider}. Run a dry run against ${provider} and get that preview approved.`,
    };
  }

  if (approval.fingerprint !== basketFingerprint(basket)) {
    return {
      ok: false,
      reason:
        'the basket has changed since the approved preview, so the approval no longer covers this order. Run a fresh dry run and get the user to approve the new total.',
    };
  }

  pending.delete(code.trim().toUpperCase());
  return { ok: true };
}

/** Test/maintenance helper: drop every outstanding approval. */
export function clearApprovals(): void {
  pending.clear();
}
