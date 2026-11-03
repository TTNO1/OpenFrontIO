import { Difficulty } from "@openfront/engine-api/game/GameTypes";

// Relation buckets used to tune how fast opinion moves. GIVE_TILES is still
// unfinished in the fork: blank difficulty cells are 0 until those numbers
// are chosen.
export abstract class RelationCategory {
  public abstract readonly increments: Record<string, number>;
  public abstract readonly maximums: Record<string, number>;
  public abstract readonly decayRates: Record<string, number>;

  public getIncrement(difficulty: Difficulty): number {
    return this.increments[difficulty];
  }

  public getMaximum(difficulty: Difficulty): number {
    return this.maximums[difficulty];
  }

  public getDecayRate(difficulty: Difficulty): number {
    return this.decayRates[difficulty];
  }
}

export const ACCEPT_ALLIANCE = new (class extends RelationCategory {
  increments = {
    Easy: 50,
    Medium: 50,
    Hard: 50,
    Impossible: 50,
  };
  maximums = {
    Easy: 50,
    Medium: 50,
    Hard: 50,
    Impossible: 50,
  };
  decayRates = {
    Easy: 0,
    Medium: 0,
    Hard: 0,
    Impossible: 0,
  };
})();

export const ATTACK_ENEMY = new (class extends RelationCategory {
  increments = {
    Easy: 50,
    Medium: 30,
    Hard: 20,
    Impossible: 15,
  };
  maximums = {
    Easy: 150,
    Medium: 100,
    Hard: 50,
    Impossible: 30,
  };
  decayRates = {
    Easy: 150.0 / 6000,
    Medium: 150.0 / 6000,
    Hard: 50.0 / 6000,
    Impossible: 30.0 / 6000,
  };
})();

export const GIVE_TILES = new (class extends RelationCategory {
  increments = {
    Easy: 0,
    Medium: 0,
    Hard: 0,
    Impossible: 5,
  };
  maximums = {
    Easy: 0,
    Medium: 0,
    Hard: 0,
    Impossible: 0,
  };
  decayRates = {
    Easy: 0,
    Medium: 0,
    Hard: 0,
    Impossible: 0,
  };
})();
