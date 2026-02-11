import type { MsgContext } from "../../auto-reply/templating.js";
import type { SessionScope } from "./types.js";
import { resolveHdDirectIsolationTarget } from "../../extensions/hd/memory-adapter.js";
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
    const isolated = resolveHdDirectIsolationTarget({
      surface: ctx.Surface,
      provider: ctx.Provider,
      from: ctx.From,
      senderId: ctx.SenderId,
    });
    if (isolated) {
      return buildAgentPeerSessionKey({
        agentId: DEFAULT_AGENT_ID,
        mainKey: canonicalMainKey,
        channel: isolated.channel,
        peerKind: "direct",
        peerId: isolated.peerId,
        dmScope: "per-channel-peer",
      });
    }
    return canonical;
  }
  return `agent:${DEFAULT_AGENT_ID}:${raw}`;
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

  const isolated = resolveHdDirectIsolationTarget({
    surface: params.ctx.Surface,
    provider: params.ctx.Provider,
    from: params.ctx.From,
    senderId: params.ctx.SenderId,
  });
  if (!isolated) {
    return undefined;
  }

  return buildAgentPeerSessionKey({
    agentId: parsed.agentId || DEFAULT_AGENT_ID,
    mainKey: params.mainKey,
    channel: isolated.channel,
    peerKind: "direct",
    peerId: isolated.peerId,
    dmScope: "per-channel-peer",
  });
}
