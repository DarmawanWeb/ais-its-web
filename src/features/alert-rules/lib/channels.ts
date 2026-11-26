/** Notification channels of a rule (spec §13.9): one target each, 1 to 10 per rule. */
export const CHANNEL_TYPES = ['email', 'telegram', 'webhook'] as const;
export type ChannelType = (typeof CHANNEL_TYPES)[number];

export const MAX_CHANNELS = 10;
export const MAX_TARGET_LENGTH = 2048;

export interface ChannelValue {
  type: ChannelType;
  target: string;
}

/** Why a target is refused before the request (translated as `channels.errors.<problem>`). */
export type ChannelProblem =
  'required' | 'tooLong' | 'email' | 'telegram' | 'webhookUrl' | 'webhookCredentials' | 'duplicate';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Chat ids (`-100…` for groups and channels) or a public `@channelusername`. */
const TELEGRAM = /^(-?\d{1,20}|@[A-Za-z][A-Za-z0-9_]{3,31})$/;

export function validateTarget(type: ChannelType, rawTarget: string): ChannelProblem | null {
  const target = rawTarget.trim();
  if (!target) return 'required';
  if (target.length > MAX_TARGET_LENGTH) return 'tooLong';
  switch (type) {
    case 'email':
      return EMAIL.test(target) ? null : 'email';
    case 'telegram':
      return TELEGRAM.test(target) ? null : 'telegram';
    case 'webhook': {
      let url: URL;
      try {
        url = new URL(target);
      } catch {
        return 'webhookUrl';
      }
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return 'webhookUrl';
      if (url.username || url.password) return 'webhookCredentials';
      return null;
    }
  }
}

/** Problems of every channel of a list (duplicates included), index → problem. */
export function validateChannels(channels: readonly ChannelValue[]): Map<number, ChannelProblem> {
  const problems = new Map<number, ChannelProblem>();
  const seen = new Set<string>();
  channels.forEach((channel, index) => {
    const problem = validateTarget(channel.type, channel.target);
    if (problem) {
      problems.set(index, problem);
      return;
    }
    const key = `${channel.type}:${channel.target.trim().toLowerCase()}`;
    if (seen.has(key)) problems.set(index, 'duplicate');
    seen.add(key);
  });
  return problems;
}

/** Plain-http webhooks are accepted by the API but deliver alerts unencrypted. */
export function isInsecureWebhook(channel: ChannelValue): boolean {
  return channel.type === 'webhook' && /^http:\/\//i.test(channel.target.trim());
}

/** Count of channels per type. */
export function countChannels(channels: readonly { type: string }[]): Record<ChannelType, number> {
  const counts: Record<ChannelType, number> = { email: 0, telegram: 0, webhook: 0 };
  for (const channel of channels) {
    if (channel.type in counts) counts[channel.type as ChannelType] += 1;
  }
  return counts;
}

/** A target shortened for chips (host of webhooks, the address otherwise). */
export function shortTarget(channel: { type: string; target: string }): string {
  if (channel.type === 'webhook') {
    try {
      const url = new URL(channel.target);
      return `${url.host}${url.pathname === '/' ? '' : url.pathname}`;
    } catch {
      return channel.target;
    }
  }
  return channel.target;
}

/** A webhook signing secret returned once (create, PATCH adding the target, rotate-secret). */
export interface RevealedSecret {
  /** Index of the channel in the rule's `channels`. */
  index: number;
  target: string;
  /** Sent as `X-AIS-ITS-Key-Id` with every delivery signed by this secret. */
  keyId: string | null;
  secret: string;
}

/**
 * The webhook channels of a rule response that carry their signing secret (notification 0.2:
 * only the response that created the key has it; every other response has `signingSecret: null`).
 */
export function revealedSecrets(rule: {
  channels: readonly {
    type: string;
    target: string;
    keyId?: string | null;
    signingSecret?: string | null;
  }[];
}): RevealedSecret[] {
  return rule.channels.flatMap((channel, index) =>
    channel.type === 'webhook' && channel.signingSecret
      ? [
          {
            index,
            target: channel.target,
            keyId: channel.keyId ?? null,
            secret: channel.signingSecret,
          },
        ]
      : [],
  );
}
