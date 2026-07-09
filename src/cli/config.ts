/**
 * CLI config — `${XDG_CONFIG_HOME:-$HOME/.config}/staff/config.json`.
 */

export interface StaffCliConfig {
  rig?: string;
  userRoot?: string; // default applied at read site: `${HOME}/Staff`
  alwaysUserRoot?: boolean;
  roots?: Record<string, string>; // abs folder → abs root
}

export function configDir(): string {
  const xdg = Deno.env.get("XDG_CONFIG_HOME");
  if (xdg) return `${xdg}/staff`;
  const home = Deno.env.get("HOME");
  if (!home) throw new Error("HOME is unset — cannot locate config dir");
  return `${home}/.config/staff`;
}

export function configPath(): string {
  return `${configDir()}/config.json`;
}

export async function loadCliConfig(): Promise<StaffCliConfig> {
  try {
    const text = await Deno.readTextFile(configPath());
    const parsed = JSON.parse(text) as StaffCliConfig;
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) return {};
    throw new Error(
      `unreadable config at ${configPath()}: ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
  }
}

export async function saveCliConfig(c: StaffCliConfig): Promise<void> {
  await Deno.mkdir(configDir(), { recursive: true });
  await Deno.writeTextFile(configPath(), JSON.stringify(c, null, 2) + "\n");
}
