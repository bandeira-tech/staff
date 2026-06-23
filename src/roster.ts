/**
 * @module
 * Client-side roster + warm/cold fade. Pure functions: no rig, no IO.
 * Takes the operator-chosen root explicitly — there is no protocol-level
 * default scheme.
 */

export interface ObservedDelivery {
  uri: string;
  payload: string | null;
}

export interface Roster {
  names: string[];
  speaking: string[];
  presence: string[];
}

function rosterRegex(root: string): RegExp {
  if (!root.endsWith("/")) throw new Error(`root must end with '/', got: ${root}`);
  const escaped = root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped}(stream|presence)\\/([a-z0-9][a-z0-9-]{0,31})\\/`);
}

export function rosterFromObserved(
  root: string,
  deliveries: ObservedDelivery[],
): Roster {
  const re = rosterRegex(root);
  const speakingSet = new Set<string>();
  const presenceSet = new Set<string>();
  for (const { uri } of deliveries) {
    const m = re.exec(uri);
    if (!m) continue;
    const [, channel, name] = m;
    if (channel === "stream") speakingSet.add(name);
    else if (channel === "presence") presenceSet.add(name);
  }
  const names = [...new Set([...speakingSet, ...presenceSet])].sort();
  return { names, speaking: [...speakingSet].sort(), presence: [...presenceSet].sort() };
}

export interface GradientStop {
  name: string;
  age: number;
  opacity: number;
}

const FLOOR = 0.18;

/**
 * Map name → last-seen-ms to an array of `{name, age, opacity}` sorted by
 * name. Anything older than `windowMs` is dropped. Opacity decays linearly
 * from 1 to `FLOOR` over the window.
 */
export function gradientStops(
  lastSeen: Map<string, number>,
  now: number,
  windowMs: number,
): GradientStop[] {
  const out: GradientStop[] = [];
  for (const [name, ts] of lastSeen) {
    const age = now - ts;
    if (age >= windowMs) continue;
    const k = Math.min(1, age / windowMs);
    const opacity = 1 - k * (1 - FLOOR);
    out.push({ name, age, opacity });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}
