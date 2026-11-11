/** 100ms ticks. Decay and permanent growth are both defined per game minute. */
export const TICKS_PER_MINUTE = 600;

/** Multiplies the permanent score's magnitude once per game minute. */
export const PERMANENT_GROWTH_PER_MINUTE = 1.056;

/** Applied after growth and after an event. The permanent score has no ceiling. */
export const PERMANENT_FLOOR = -20;

/**
 * One directed opinion is the sum of these decaying buckets plus a single
 * permanent score that every event writes into.
 */
export enum RelationEvent {
  AcceptAlliance = 0,
  AttackEnemy = 1,
  GiveTiles = 2,
  RemoveEmbargo = 3,
  PositiveEmoji = 4,
  SendGold = 5,
  SendTroops = 6,
  AddEmbargo = 7,
  Attack = 8,
  AllianceEnds = 9,
  Betray = 10,
  Nuke = 11,
  ReceiveMirv = 12,
  Target = 13,
  BreakAllianceNeighbor = 14,
  CaptureTradeShip = 15,
  CaptureTroopTransport = 16,
  AssistAlly = 17,
  NegativeEmoji = 18,
  SendMirv = 19,
  /** Live function of troops the empire has committed. Decay 0. Not an event. */
  CommittedTroops = 20,
  PoachVassal = 21,
  AttackVassal = 22,
}

export const RELATION_EVENT_COUNT = RelationEvent.AttackVassal + 1;

export interface RelationEventSpec {
  positive: boolean;
  decayPerMinute: number;
  /** Cap on this event's decaying bucket. */
  max: number;
  /** Flat heat added when the caller does not pass an amount. */
  defaultHeat: number;
  /** Flat permanent added when the caller does not pass an amount. */
  defaultPermanent: number;
}

export const RELATION_SPECS: readonly RelationEventSpec[] = [
  spec(true, 0, 50, 50, 0),
  spec(true, 5, 250, 0, 0),
  spec(true, 2, 250, 0, 0),
  spec(true, 0, 50, 50, 0),
  spec(true, 25, 100, 5, 0),
  spec(true, 20, 150, 0, 0),
  spec(true, 7, 250, 0, 0),
  spec(false, 0, 50, 50, 0),
  spec(false, 65, 400, 400, 30),
  spec(false, 0, 50, 50, 0),
  spec(false, 20, 200, 200, 120),
  spec(false, 65, 400, 400, 35),
  spec(false, 100, 600, 600, 50),
  spec(false, 45, 300, 150, 7),
  spec(false, 12, 40, 30, 0),
  spec(false, 15, 50, 5, 0),
  spec(false, 15, 50, 25, 0),
  spec(false, 10, 20, 10, 0),
  spec(false, 20, 150, 35, 0),
  spec(false, 15, 100, 50, 0),
  spec(true, 0, Number.POSITIVE_INFINITY, 0, 0),
  spec(false, 25, 400, 200, 20),
  spec(false, 70, 400, 250, 3),
];

function spec(
  positive: boolean,
  decayPerMinute: number,
  max: number,
  defaultHeat: number,
  defaultPermanent: number,
): RelationEventSpec {
  return { positive, decayPerMinute, max, defaultHeat, defaultPermanent };
}

export interface RelationRecord {
  heat: number[];
  permanent: number;
  grownThroughMinute: number;
}

export function emptyRelation(minute: number): RelationRecord {
  return {
    heat: new Array<number>(RELATION_EVENT_COUNT).fill(0),
    permanent: 0,
    grownThroughMinute: minute,
  };
}

export function relationTotal(record: RelationRecord): number {
  let sum = record.permanent;
  for (let i = 0; i < record.heat.length; i++) sum += record.heat[i];
  return sum;
}

export function isRelationEmpty(record: RelationRecord): boolean {
  if (record.permanent !== 0) return false;
  for (let i = 0; i < record.heat.length; i++) {
    if (record.heat[i] !== 0) return false;
  }
  return true;
}

/**
 * Adds one event. `heatAmount` and `permanentAmount` are magnitudes; the
 * event's direction supplies the sign. Omitted amounts use the flat defaults.
 * The permanent score is then held at {@link PERMANENT_FLOOR}.
 */
export function applyRelationEvent(
  record: RelationRecord,
  event: RelationEvent,
  heatAmount?: number,
  permanentAmount?: number,
): void {
  // Alliance and embargo are a status, not two piles that both stay full.
  // Accept is +50. Ending removes that 50, so the pair is 0. Forming it
  // again puts the +50 back. An embargo is −50, lifting it returns to 0,
  // and placing it again is −50 once more.
  if (
    event === RelationEvent.AcceptAlliance ||
    event === RelationEvent.AllianceEnds
  ) {
    const bonus = RELATION_SPECS[RelationEvent.AcceptAlliance].defaultHeat;
    record.heat[RelationEvent.AcceptAlliance] =
      event === RelationEvent.AcceptAlliance ? bonus : 0;
    record.heat[RelationEvent.AllianceEnds] = 0;
    return;
  }
  if (
    event === RelationEvent.AddEmbargo ||
    event === RelationEvent.RemoveEmbargo
  ) {
    const penalty = RELATION_SPECS[RelationEvent.AddEmbargo].defaultHeat;
    record.heat[RelationEvent.AddEmbargo] =
      event === RelationEvent.AddEmbargo ? -penalty : 0;
    record.heat[RelationEvent.RemoveEmbargo] = 0;
    return;
  }

  const row = RELATION_SPECS[event];
  const heat = heatAmount ?? row.defaultHeat;
  const permanent = permanentAmount ?? row.defaultPermanent;
  const sign = row.positive ? 1 : -1;
  if (heat !== 0) {
    const next = record.heat[event] + sign * heat;
    record.heat[event] = clamp(next, -row.max, row.max);
  }
  if (permanent !== 0) {
    record.permanent = Math.max(
      PERMANENT_FLOOR,
      record.permanent + sign * permanent,
    );
  }
}

/** Replaces one bucket. Used for the committed-troop score, which is live. */
export function setRelationHeat(
  record: RelationRecord,
  event: RelationEvent,
  signed: number,
): void {
  const max = RELATION_SPECS[event].max;
  record.heat[event] = clamp(signed, -max, max);
}

/** One tick of heat decay, then permanent growth if a new game minute started. */
export function decayRelation(record: RelationRecord, minute: number): void {
  for (let i = 0; i < RELATION_EVENT_COUNT; i++) {
    const rate = RELATION_SPECS[i].decayPerMinute;
    const value = record.heat[i];
    if (rate === 0 || value === 0) continue;
    const step = rate / TICKS_PER_MINUTE;
    if (Math.abs(value) <= step) record.heat[i] = 0;
    else record.heat[i] = value - Math.sign(value) * step;
  }
  if (minute > record.grownThroughMinute) {
    let steps = minute - record.grownThroughMinute;
    if (steps > 10000) steps = 10000;
    if (record.permanent !== 0) {
      let permanent = record.permanent;
      for (let i = 0; i < steps; i++) permanent *= PERMANENT_GROWTH_PER_MINUTE;
      record.permanent = Math.max(PERMANENT_FLOOR, permanent);
    }
    record.grownThroughMinute = minute;
  }
}

export function relationMinute(ticks: number): number {
  return Math.floor(ticks / TICKS_PER_MINUTE);
}

export const RELATION_READ = {
  assistAlly: 100,
  assistAllyNukes: 150,
  defensePost: -125,
  emoji: 0,
  startEmbargo: -50,
  stopEmbargo: -45,
  /** A nation will not attack another nation at or above this opinion. */
  noAttack: 300,
} as const;

/** Enemy-of-my-enemy: C was attacked within this many ticks. */
export const EOE_WINDOW_TICKS = 30 * 10;

/** No bonus if A themselves attacked C within this many ticks. */
export const EOE_COOLDOWN_TICKS = 180 * 10;

/** Heat and permanent per percent of the beneficiary's troop capacity. */
export const EOE_HEAT_PER_PERCENT = 1.75;
export const EOE_PERMANENT_PER_PERCENT = 0.25;

export const TILE_HEAT_PER_PERCENT = 6;
export const TILE_PERMANENT_PER_PERCENT = 2;
export const TILE_DONATION_MAX_PERCENT = 50;

export const GOLD_HEAT_PER_CHUNK = 5;
export const GOLD_PERMANENT_PER_CHUNK = 0.15;

export const TROOP_HEAT_PER_PERCENT = 1.5;
export const TROOP_PERMANENT_PER_PERCENT = 0.3;

/**
 * Vassal's opinion of the empire from the garrison currently committed.
 * Above the vassal's troop capacity each extra percent is +0.5. Below it,
 * each missing percent is -2. Decay is 0 because the caller rewrites this.
 */
export function committedTroopRelation(
  committed: number,
  vassalTroopCapacity: number,
): number {
  const cap = Math.max(1, vassalTroopCapacity);
  const percent = (committed / cap) * 100;
  if (percent >= 100) return 0.5 * (percent - 100);
  return -2 * (100 - percent);
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
