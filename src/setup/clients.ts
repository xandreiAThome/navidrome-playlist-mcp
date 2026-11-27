import { manualConfig } from './entry.ts';
import type { ServerEntry } from './entry.ts';
import { SetupInterrupted } from './prompts.ts';
import type { Choice, Prompts } from './prompts.ts';

/**
 * The MCP clients setup installs into. An allowlist of our own rather than every
 * add-mcp agent, so an add-mcp upgrade cannot silently offer an unvetted client.
 */
export const SUPPORTED_CLIENTS = [
  'claude-code',
  'claude-desktop',
  'vscode',
  'cursor',
  'codex',
  'gemini-cli',
  'github-copilot-cli',
  'windsurf',
] as const;
export type ClientId = (typeof SUPPORTED_CLIENTS)[number];

export type Client = { id: ClientId; name: string; configPath: string; detected: boolean };

export type InstallOutcome =
  /** The entry was written to the client's user-scope configuration. */
  | { status: 'written'; path: string }
  /** Writing would not reach the client; the user must copy the entry to `path`. */
  | { status: 'manual'; path: string; reason: string }
  | { status: 'failed'; path: string };

/** User-scope MCP client configuration, as setup needs it. */
export interface Clients {
  /** The supported clients, in allowlist order. */
  list(): Promise<Client[]>;
  /** The client's current setup entry, if it has one. */
  read(id: ClientId): Promise<ServerEntry | undefined>;
  /** Writes the setup entry, replacing any previous one and keeping other servers. */
  install(id: ClientId, entry: ServerEntry): InstallOutcome;
}

const SECRET = /PASSWORD|TOKEN|SECRET|KEY/i;
const MASK = '********';

/**
 * Line diff of two entries, field by field; secret values are never shown, only
 * whether they changed. Returns undefined when the entries are equal.
 */
export function entryDiff(before: ServerEntry, after: ServerEntry): string | undefined {
  const lines: string[] = [];
  let changed = false;
  const field = (key: string, old: string | undefined, now: string | undefined) => {
    const secret = SECRET.test(key);
    const show = (value: string) => `${key}: ${secret ? MASK : value}`;
    if (old === now) {
      if (now !== undefined) lines.push(`  ${show(now)}`);
      return;
    }
    changed = true;
    if (old !== undefined) lines.push(`- ${show(old)}`);
    if (now !== undefined)
      lines.push(`+ ${show(now)}${secret && old !== undefined ? ' (changed)' : ''}`);
  };
  field('command', before.command, after.command);
  field('args', before.args.join(' '), after.args.join(' '));
  const keys = [...Object.keys(after.env), ...Object.keys(before.env)];
  for (const key of new Set(keys)) field(key, before.env[key], after.env[key]);
  return changed ? lines.join('\n') : undefined;
}

/** Whether to write the entry, after showing any change to an existing one. */
async function shouldWrite(
  prompts: Prompts,
  clients: Clients,
  client: Client,
  entry: ServerEntry,
  overwrite: boolean,
): Promise<boolean> {
  const existing = await clients.read(client.id);
  if (!existing) return true;
  const diff = entryDiff(existing, entry);
  if (diff === undefined) {
    prompts.log.info(`${client.name} is already up to date.`);
    return false;
  }
  prompts.note(diff, `Changes to the navidrome server in ${client.name}`);
  if (overwrite) return true;
  const confirmed = await prompts.confirm({
    message: `Overwrite the navidrome server in ${client.name}?`,
    initial: false,
  });
  if (!confirmed) prompts.log.info(`Left ${client.name} unchanged.`);
  return confirmed;
}

const MANUAL = 'manual';
export type Selection = ClientId | typeof MANUAL;

/**
 * Asks which clients to install into, detected ones first and preselected, and
 * installs the entry into each. The manual option prints the entry to copy.
 * A given selection is used without asking; `overwrite` replaces existing
 * entries without confirming, still showing what changes. Returns whether
 * the entry reached the user: written to a client or printed to copy.
 */
export async function clientStep(
  prompts: Prompts,
  clients: Clients,
  entry: ServerEntry,
  { selection, overwrite = false }: { selection?: Selection[]; overwrite?: boolean } = {},
): Promise<boolean> {
  const all = await clients.list();
  const ordered = [...all.filter((c) => c.detected), ...all.filter((c) => !c.detected)];
  const choices: Choice<Selection>[] = [
    ...ordered.map((c) => ({
      value: c.id,
      label: c.name,
      hint: c.detected ? `detected, ${c.configPath}` : c.configPath,
    })),
    { value: MANUAL, label: 'Show config to copy manually' },
  ];
  const selected =
    selection ??
    (await prompts.multiselect<Selection>({
      message: 'Install the server into which clients?',
      choices,
      initial: ordered.filter((c) => c.detected).map((c) => c.id),
      required: true,
    }));
  let showManual = selected.includes(MANUAL);
  const written: string[] = [];
  try {
    for (const client of ordered.filter((c) => selected.includes(c.id))) {
      if (!(await shouldWrite(prompts, clients, client, entry, overwrite))) continue;
      const outcome = clients.install(client.id, entry);
      if (outcome.status === 'written') {
        written.push(`${client.name} (${outcome.path})`);
        prompts.log.success(`Installed into ${client.name} (${outcome.path}).`);
      } else {
        showManual = true;
        if (outcome.status === 'manual')
          prompts.log.warn(`${outcome.reason} Copy the config below into ${outcome.path}.`);
        // add-mcp's error text is not shown: it is not vetted to be free of secrets.
        else
          prompts.log.error(
            `Could not write the ${client.name} configuration (${outcome.path}). Copy the config below instead.`,
          );
      }
    }
  } catch (error) {
    if (written.length) throw new SetupInterrupted(error, written);
    throw error;
  }
  if (showManual) prompts.note(manualConfig(entry), 'Add this server to your MCP client');
  return written.length > 0 || showManual;
}
