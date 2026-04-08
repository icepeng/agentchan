/**
 * What kind of resource a slash command points at. The domain layer (this
 * package) owns this list — every value here is something creative-agent
 * knows how to dispatch on. Hosts (webui client/server, future RPC clients)
 * can attach their own host-only slash kinds with their own source tags
 * (e.g. the webui client uses `"local"` for in-process commands like /clear).
 *
 * Adding a new domain source (e.g. `"tool"`, `"agent"`, `"mcp"`) is the only
 * change required to surface a new slash kind to every host that consumes
 * `listSlashCommands` — host code branches on `source !== "local"` and
 * forwards everything else to the server unchanged.
 */
export type SlashSource = "skill";

/**
 * Catalog entry for a slash command exposed by the domain layer. This is the
 * shape every host (autocomplete UI, RPC `get_commands`, future IDE plugin)
 * sees. Intentionally minimal — host-specific metadata stays in host types.
 */
export interface SlashCommandInfo {
  name: string;
  description?: string;
  source: SlashSource;
}
