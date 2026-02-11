import type { MsgContext } from "../../auto-reply/templating.js";
import type { SessionScope } from "./types.js";
import {
  buildAgentPeerSessionKey,
  buildAgentMainSessionKey,
  DEFAULT_AGENT_ID,
  parseAgentSessionKey,
  normalizeMainKey,
} from "../../routing/session-key.js";
import { normalizeE164 } from "../../utils.js";
import { resolveGroupSessionKey } from "./group.js";

// Decide which session bucket to use (per-sender vs global).
export function deriveSessionKey(scope: SessionScope, ctx: MsgContext) {
  if (scope === "global") {
    return "global";
  }
  const resolvedGroup = resolveGroupSessionKey(ctx);
  if (resolvedGroup) {
    return resolvedGroup.key;
  }
  const from = ctx.From ? normalizeE164(ctx.From) : "";
  return from || "unknown";
}

/**
 * Resolve the session key with a canonical direct-chat bucket (default: "main").
 * All non-group direct chats collapse to this bucket; groups stay isolated.
 */
export function resolveSessionKey(scope: SessionScope, ctx: MsgContext, mainKey?: string) {
  const explicit = ctx.SessionKey?.trim();
  const canonicalMainKey = normalizeMainKey(mainKey);
  if (explicit) {
    const explicitLower = explicit.toLowerCase();
    const remapped = remapExplicitMainSessionToIsolatedPeer({
      scope,
      ctx,
      explicit: explicitLower,
      mainKey: canonicalMainKey,
    });
    return remapped ?? explicitLower;
  }
  const raw = deriveSessionKey(scope, ctx);
  if (scope === "global") {
    return raw;
  }
  const canonical = buildAgentMainSessionKey({
    agentId: DEFAULT_AGENT_ID,
    mainKey: canonicalMainKey,
  });
  const isGroup = raw.includes(":group:") || raw.includes(":channel:");
  if (!isGroup) {
    const isolatedChannel = resolveDirectIsolationChannel(ctx);
    if (isolatedChannel) {
      const isolatedPeerId = resolveDirectIsolationPeerId(ctx, isolatedChannel);
      if (isolatedPeerId) {
        return buildAgentPeerSessionKey({
          agentId: DEFAULT_AGENT_ID,
          mainKey: canonicalMainKey,
          channel: isolatedChannel,
          peerKind: "direct",
          peerId: isolatedPeerId,
          dmScope: "per-channel-peer",
        });
      }
    }
    return canonical;
  }
  return `agent:${DEFAULT_AGENT_ID}:${raw}`;
}

function resolveDirectIsolationChannel(ctx: MsgContext): string | undefined {
  const surface = ctx.Surface?.trim().toLowerCase();
  const provider = ctx.Provider?.trim().toLowerCase();
  const from = ctx.From?.trim().toLowerCase() ?? "";
  const fromPrefix = from.split(":")[0]?.trim();
  const channel = surface || provider || fromPrefix;
  if (channel === "telegram" || channel === "webchat") {
    return channel;
  }
  return undefined;
}

function resolveDirectIsolationPeerId(ctx: MsgContext, channel: string): string | undefined {
  const sender = (ctx.SenderId ?? "").trim().toLowerCase();
  if (sender && sender !== "unknown") {
    return sender;
  }

  const from = (ctx.From ?? "").trim().toLowerCase();
  if (!from || from === "unknown") {
    return undefined;
  }
  const prefix = `${channel}:`;
  if (from.startsWith(prefix)) {
    const peer = from.slice(prefix.length).trim();
    return peer && peer !== "unknown" ? peer : undefined;
  }
  return from;
}

function remapExplicitMainSessionToIsolatedPeer(params: {
  scope: SessionScope;
  ctx: MsgContext;
  explicit: string;
  mainKey: string;
}): string | undefined {
  if (params.scope === "global") {
    return undefined;
  }
  const parsed = parseAgentSessionKey(params.explicit);
  if (!parsed) {
    return undefined;
  }
  if (parsed.rest.toLowerCase() !== params.mainKey) {
    return undefined;
  }

  const channel = resolveDirectIsolationChannel(params.ctx);
  if (!channel) {
    return undefined;
  }
  const peerId = resolveDirectIsolationPeerId(params.ctx, channel);
  if (!peerId) {
    return undefined;
  }

  return buildAgentPeerSessionKey({
    agentId: parsed.agentId || DEFAULT_AGENT_ID,
    mainKey: params.mainKey,
    channel,
    peerKind: "direct",
    peerId,
    dmScope: "per-channel-peer",
  });
}
