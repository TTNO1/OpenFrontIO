import { Difficulty } from "./Game";

export abstract class RelationCategory {
  
  public abstract readonly increments: object;
  public abstract readonly maximums: object;
  public abstract readonly decayRates: object;
  
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

export const ACCEPT_ALLIANCE = new class extends RelationCategory {
	increments = {
	  "Easy": 50,
	  "Medium": 50,
	  "Hard": 50,
	  "Impossible": 50,
	};
	maximums = {
	  "Easy": 50,
	  "Medium": 50,
	  "Hard": 50,
	  "Impossible": 50,
	};
	decayRates = {
	  "Easy": 0,
	  "Medium": 0,
	  "Hard": 0,
	  "Impossible": 0,
	};
};

export const ATTACK_ENEMY = new class extends RelationCategory {
	increments = {
	  "Easy": 50,
	  "Medium": 30,
	  "Hard": 20,
	  "Impossible": 15,
	};
	maximums = {
	  "Easy": 150,
	  "Medium": 100,
	  "Hard": 50,
	  "Impossible": 30,
	};
	decayRates = {
	  "Easy": 150.0/6000,
	  "Medium": 150.0/6000,
	  "Hard": 50.0/6000,
	  "Impossible": 30.0/6000,
	};
};

export const GIVE_TILES = new class extends RelationCategory {
	increments = {
	  "Easy": ,
	  "Medium": ,
	  "Hard": ,
	  "Impossible":5,
	};
	maximums = {
	  "Easy": ,
	  "Medium": ,
	  "Hard": ,
	  "Impossible": ,
	};
	decayRates = {
	  "Easy": ,
	  "Medium": ,
	  "Hard": ,
	  "Impossible": ,
	};
};