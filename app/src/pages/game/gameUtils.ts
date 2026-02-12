import type { GameSummary } from "../../lib/firestoreGames";
import type { PlayerSlot } from "../../types";

export const SLOTS: PlayerSlot[] = ["p1", "p2", "p3"];

export function isBotUid(uid: string | undefined | null): boolean {
  return Boolean(uid && uid.startsWith("bot:"));
}

export function seatLabel(seat: PlayerSlot): string {
  return seat.toUpperCase();
}

export function displayNameForUser(user: { displayName?: string | null; email?: string | null } | null): string {
  const dn = user?.displayName?.trim();
  if (dn) return dn.slice(0, 20);
  const email = user?.email?.trim();
  if (email) return email.split("@")[0]?.slice(0, 20) || "Player";
  return "Player";
}

export function playerLabel(uid: string, playerNames: Record<string, string> | undefined): string {
  return playerNames?.[uid] ?? (uid.startsWith("bot:") ? "Bot" : "Player");
}

export function imgSrc(path: string | undefined | null): string | null {
  if (!path) return null;
  return encodeURI(path);
}

export function seatOrder(mySeat: PlayerSlot): PlayerSlot[] {
  if (mySeat === "p1") return ["p1", "p2", "p3"];
  if (mySeat === "p2") return ["p2", "p3", "p1"];
  return ["p3", "p1", "p2"];
}

export function groupSeatsByValue(values: Partial<Record<PlayerSlot, string>> | undefined): Record<string, PlayerSlot[]> {
  const out: Record<string, PlayerSlot[]> = {};
  if (!values) return out;
  for (const seat of SLOTS) {
    const v = values[seat];
    if (!v) continue;
    out[v] = out[v] ?? [];
    out[v]!.push(seat);
  }
  return out;
}

export function canControlSeat(game: GameSummary, actorUid: string, seat: PlayerSlot): boolean {
  const uid = game.players?.[seat];
  if (!uid) return false;
  if (uid === actorUid) return true;
  return Boolean(game.createdBy === actorUid && isBotUid(uid));
}
