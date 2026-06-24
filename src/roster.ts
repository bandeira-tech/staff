/**
 * @module
 * Client-side roster + warm/cold fade. Pure functions: no rig, no IO.
 * Derived from join (presence in) and end (presence out) URI types.
 */
import { parseUri } from "./protocol.ts";

export interface ObservedDelivery {
  uri: string;
  payload: string | null;
}

export interface Roster {
  names: string[];   // union of ever-seen participants
  joined: string[];  // currently in the room (join minus end)
  spoken: string[];  // ever posted a msg
}

export function rosterFromObserved(
  root: string,
  deliveries: ObservedDelivery[],
): Roster {
  const everSeen = new Set<string>();
  const ins = new Set<string>();
  const outs = new Set<string>();
  const spoken = new Set<string>();
  for (const { uri } of deliveries) {
    const p = parseUri(root, uri);
    if (!p || p.type === "meta") continue;
    everSeen.add(p.who);
    if (p.type === "join") ins.add(p.who);
    else if (p.type === "end") outs.add(p.who);
    else if (p.type === "msg") spoken.add(p.who);
  }
  const joined = [...ins].filter((n) => !outs.has(n)).sort();
  return {
    names: [...everSeen].sort(),
    joined,
    spoken: [...spoken].sort(),
  };
}

export interface GradientStop {
  name: string;
  age: number;
  opacity: number;
}

const FLOOR = 0.18;

export function gradientStops(
  lastSeen: Map<string, number>,
  now: number,
  windowMs: number,
): GradientStop[] {
  const out: GradientStop[] = [];
  for (const [name, ts] of lastSeen) {
    const age = now - ts;
    if (age > windowMs) continue;
    const k = Math.min(1, age / windowMs);
    const opacity = 1 - k * (1 - FLOOR);
    out.push({ name, age, opacity });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}
