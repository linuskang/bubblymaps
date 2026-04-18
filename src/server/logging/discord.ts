import { env } from '@/env';

type DiscordEmbed = {
  title: string;
  description?: string;
  color?: number;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  footer?: { text: string };
  timestamp?: string;
};

type ActivityActor = {
  id?: string | null;
  handle?: string | null;
  source?: string;
};

function formatActor(actor?: ActivityActor) {
  if (!actor) return 'unknown';
  if (actor.source === 'api') return 'api token';
  if (actor.handle) return `@${actor.handle}`;
  if (actor.id) return `user:${actor.id}`;
  return 'unknown';
}

function sanitizeValue(value: unknown): string {
  if (value === null || value === undefined) return 'n/a';
  if (typeof value === 'string') return value.length > 1000 ? `${value.slice(0, 997)}...` : value;

  try {
    const serialized = JSON.stringify(value);
    return serialized.length > 1000 ? `${serialized.slice(0, 997)}...` : serialized;
  } catch {
    return String(value);
  }
}

export async function log(content: { content?: string; embeds?: DiscordEmbed[] }) {
  if (!env.DISCORD_WEBHOOK_URL) return;

  try {
    await fetch(env.DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(content),
    });
  } catch (e) {
    console.error('Failed to log to Discord', e);
  }
}

export async function logToDiscord(action: string, details: string, user: any) {
  if (!env.DISCORD_WEBHOOK_URL) return;

  try {
    const content = {
      embeds: [
        {
          title: `Moderation Action: ${action}`,
          description: details,
          color: 16711680,
          footer: {
            text: `Action performed by @${user.handle} (ID: ${user.id})`,
          },
          timestamp: new Date().toISOString(),
        },
      ],
    };

    await log(content);
  } catch (err) {
    console.error(err);
  }
}

export async function logEndpointActivity(args: {
  action: string;
  route: string;
  actor?: ActivityActor;
  status: 'success' | 'failed';
  metadata?: Record<string, unknown>;
  reason?: string;
}) {
  if (!env.DISCORD_WEBHOOK_URL) return;

  const metadataFields = Object.entries(args.metadata ?? {}).slice(0, 8).map(([key, value]) => ({
    name: key,
    value: sanitizeValue(value),
    inline: true,
  }));

  const embed: DiscordEmbed = {
    title: `${args.action} (${args.status})`,
    description: args.reason ? `Reason: ${args.reason}` : undefined,
    color: args.status === 'success' ? 5763719 : 15548997,
    fields: [
      { name: 'Route', value: args.route, inline: true },
      { name: 'Actor', value: formatActor(args.actor), inline: true },
      ...metadataFields,
    ],
    timestamp: new Date().toISOString(),
  };

  await log({ embeds: [embed] });
}