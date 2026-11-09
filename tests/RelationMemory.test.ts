import { Difficulty } from "@openfront/engine-api/game/GameTypes";
import {
  applyRelationEvent,
  committedTroopRelation,
  decayRelation,
  emptyRelation,
  PERMANENT_FLOOR,
  PERMANENT_GROWTH_PER_MINUTE,
  RelationEvent,
  relationTotal,
  requiredRelationForThreat,
  threatFromCounts,
} from "@openfront/engine/game/RelationMemory";

describe("relation memory", () => {
  test("an attack pins the permanent score at the floor", () => {
    const record = emptyRelation(0);
    applyRelationEvent(record, RelationEvent.Attack);
    expect(record.heat[RelationEvent.Attack]).toBe(-400);
    expect(record.permanent).toBe(PERMANENT_FLOOR);
    expect(relationTotal(record)).toBe(-405);
  });

  test("a large favor can still be cut by a betrayal without passing the floor", () => {
    const record = emptyRelation(0);
    record.permanent = 200;
    applyRelationEvent(record, RelationEvent.Betray);
    expect(record.permanent).toBe(80);
    record.permanent = 20;
    applyRelationEvent(record, RelationEvent.Attack);
    expect(record.permanent).toBe(PERMANENT_FLOOR);
  });

  test("permanent magnitude grows once a minute, then the floor is applied", () => {
    const record = emptyRelation(0);
    record.permanent = 10;
    decayRelation(record, 1);
    expect(record.permanent).toBeCloseTo(10 * PERMANENT_GROWTH_PER_MINUTE);
    record.permanent = PERMANENT_FLOOR;
    decayRelation(record, 2);
    expect(record.permanent).toBe(PERMANENT_FLOOR);
  });

  test("heat decays toward zero and stays inside its cap", () => {
    const record = emptyRelation(0);
    applyRelationEvent(record, RelationEvent.Target);
    applyRelationEvent(record, RelationEvent.Target);
    expect(record.heat[RelationEvent.Target]).toBe(-300);
    for (let minute = 1; minute <= 10; minute++) decayRelation(record, minute);
    expect(record.heat[RelationEvent.Target]).toBeGreaterThan(-300);
    expect(record.heat[RelationEvent.Target]).toBeLessThan(0);
  });

  test("a weaker neighbor must be liked more", () => {
    expect(requiredRelationForThreat(1)).toBe(0);
    expect(requiredRelationForThreat(0.5)).toBeGreaterThan(
      requiredRelationForThreat(1),
    );
    const easy = threatFromCounts(100, 100, 10, 20, 0, Difficulty.Easy);
    const hard = threatFromCounts(100, 100, 10, 20, 0, Difficulty.Hard);
    expect(easy).toBe(1);
    expect(hard).toBeGreaterThan(easy);
    expect(
      threatFromCounts(100, 100, 10, 20, 0, Difficulty.Hard, 100, 400),
    ).toBeGreaterThan(
      threatFromCounts(100, 100, 10, 20, 0, Difficulty.Hard, 100, 100),
    );
  });

  test("alliance accept and end cancel, and forming it again restores the bonus", () => {
    const record = emptyRelation(0);
    applyRelationEvent(record, RelationEvent.AcceptAlliance);
    expect(relationTotal(record)).toBe(50);
    applyRelationEvent(record, RelationEvent.AllianceEnds);
    expect(relationTotal(record)).toBe(0);
    applyRelationEvent(record, RelationEvent.AcceptAlliance);
    expect(relationTotal(record)).toBe(50);
    applyRelationEvent(record, RelationEvent.AllianceEnds);
    expect(relationTotal(record)).toBe(0);
  });

  test("an embargo and its removal cancel, and embargoing again restores the penalty", () => {
    const record = emptyRelation(0);
    applyRelationEvent(record, RelationEvent.AddEmbargo);
    expect(relationTotal(record)).toBe(-50);
    applyRelationEvent(record, RelationEvent.RemoveEmbargo);
    expect(relationTotal(record)).toBe(0);
    applyRelationEvent(record, RelationEvent.AddEmbargo);
    expect(relationTotal(record)).toBe(-50);
  });

  test("a garrison below the vassal's capacity is resented", () => {
    expect(committedTroopRelation(50, 100)).toBe(-100);
    expect(committedTroopRelation(150, 100)).toBe(25);
  });
});
