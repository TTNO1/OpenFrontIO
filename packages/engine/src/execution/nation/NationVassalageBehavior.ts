import { PlayerType } from "@openfront/engine-api/game/GameTypes";
import { PseudoRandom } from "@openfront/engine-lib/PseudoRandom";
import { EmojiExecution } from "../EmojiExecution";
import { DonateGoldExecution } from "../DonateGoldExecution";
import { Game, Player, VassalageRequest } from "../../game/Game";
import {
  EMOJI_EMPIRE_DEFENSE_GRATITUDE,
  EMOJI_EMPIRE_INSUFFICIENT_DEFENSE,
  EMOJI_REQUEST_EMPIRE,
  EMOJI_REQUEST_VASSALAGE,
  NationEmojiBehavior,
} from "./NationEmojiBehavior";

/**
 * Offers, requests, and upkeep for vassalage. Decisions follow the relation
 * sheet: a good opinion plus a large power gap, or an overwhelming threat
 * even without that opinion.
 */
export class NationVassalageBehavior {
  constructor(
    private random: PseudoRandom,
    private game: Game,
    private player: Player,
    private emojiBehavior: NationEmojiBehavior,
  ) {}
  
  private readonly DECISION_GOOD_RELATION = 100;
  private readonly GARRISON_GOOD_RELATION = 75;
	private readonly TRIBUTE_GOOD_RELATION = 25;
  
  maintain(): void {
    this.answerRequests();
    this.maybeSeekVassalage();
    this.maybeCommitGarrison();
    this.maybePayTribute();
    this.maybeComplain();
		this.maybeShowGratitude();
  }

  private answerRequests(): void {
    for (const req of this.player.incomingVassalageRequests()) {
      if (req.createdAt() <= this.game.config().numSpawnPhaseTurns() + 1) {
        req.reject();
        continue;
      }
      if (this.accepts(req)) req.accept();
      else req.reject();
    }
  }

  private accepts(req: VassalageRequest): boolean {
    if (req.vassal() === this.player) {// We are being asked to become the vassal.
      const empire = req.empire();
      if (!this.weakerThanMostNeighbors()) return false;
      const good = this.player.relationValue(empire) >= this.DECISION_GOOD_RELATION;
      if (good) return this.isMuchStronger(this.player, empire);
      return this.isOverwhelming(this.player, empire);
    } else {// We are being asked to become the empire.
      const vassal = req.vassal();
      const good = this.player.relationValue(vassal) >= this.DECISION_GOOD_RELATION;
      // Make sure we can supply the vassals garrison
      if(this.game.config().maxTroops(this.player) < this.game.config().maxTroops(vassal) * 5) return false;
      if (good) return this.isMuchStronger(vassal, this.player);
      return this.isOverwhelming(vassal, this.player);
    }
  }

  private maybeSeekVassalage(): void {
    for (const other of this.borderingPlayers()) {
      if (this.player.hasVassalageWith(other)) continue;
      if (
        this.player.relationValue(other) >= this.DECISION_GOOD_RELATION &&
        this.isMuchStronger(other, this.player) &&
        this.random.chance(8) &&
        this.player.canSendVassalageRequest(other)
      ) {
        this.emojiBehavior.sendEmoji(other, EMOJI_REQUEST_EMPIRE);
        this.player.createVassalageRequest(other);
        continue;
      }
      const attacked = this.player
        .incomingAttacks()
        .some((attack) => attack.attacker() === other);
      const good = this.player.relationValue(other) >= this.DECISION_GOOD_RELATION;
      const wantsProtection =
        (good && this.isMuchStronger(this.player, other)) || (attacked && this.isOverwhelming(this.player, other));
      if (
        wantsProtection &&
        this.random.chance(6) &&
        this.player.canSendSelfVassalageRequest(other)
      ) {
        this.emojiBehavior.sendEmoji(other, EMOJI_REQUEST_VASSALAGE);
        this.player.createSelfVassalageRequest(other);
      }
    }
  }

  private maybeCommitGarrison(): void {
    if (!this.random.chance(2)) return;
    
    const vassalsToCheck = this.player.vassals().sort((a, b) => {
			return this.player.relationValue(a) - this.player.relationValue(b);
		});
    
    const myTroopCapacity = this.game.config().maxTroops(this.player);
    let troopsToCommit = new Map<Player, number>();
    let myTroops = this.player.troops();
    
    for (const vassal of vassalsToCheck) {
      const relation = this.player.relationValue(vassal);
      const liked = relation >= this.GARRISON_GOOD_RELATION;
      
      const minimumReserve = myTroopCapacity * (liked ? 0.2 : 0.4);
      
      const neutralGarrison = Math.max(1, this.game.config().maxTroops(vassal));
      const bareMinimumGarrison = neutralGarrison * 0.2;
      const currentGarrison = vassal.absorption();
      
      const minimumGarrisonGap = Math.max(0, bareMinimumGarrison - currentGarrison);
      const troopsAboveMinimumReserve = Math.max(0, myTroops - minimumReserve);
      if(troopsAboveMinimumReserve == 0) break;
      
      let commitment = Math.min(troopsAboveMinimumReserve, minimumGarrisonGap);
      myTroops -= commitment;
      troopsToCommit.set(vassal, commitment);
    }
    
    for(const vassal of vassalsToCheck) {
      const relation = this.player.relationValue(vassal);
      const liked = relation >= this.GARRISON_GOOD_RELATION;
      
      const comfortableReserve = myTroopCapacity * (liked ? 0.4 : 0.65);
      
      const neutralGarrison = Math.max(1, this.game.config().maxTroops(vassal));
      const committedTroops = troopsToCommit.get(vassal) ?? 0;
      const currentGarrison = vassal.absorption() + committedTroops;
      
      const neutralGarrisonGap = Math.max(0, neutralGarrison - currentGarrison);
      const troopsAboveComfortableReserve = Math.max(0, myTroops - comfortableReserve);
      if(troopsAboveComfortableReserve == 0) break;
      
      let commitment = Math.min(troopsAboveComfortableReserve, neutralGarrisonGap);
      myTroops -= commitment;
      troopsToCommit.set(vassal, committedTroops + commitment);
    }
    
    for(const vassal of vassalsToCheck) {
      const abundantReserve = myTroopCapacity * 0.75;
      
      const abundantGarrison = Math.max(myTroopCapacity * 0.1, this.game.config().maxTroops(vassal) * 3);
      const committedTroops = troopsToCommit.get(vassal) ?? 0;
      const currentGarrison = vassal.absorption() + committedTroops;
      
      const abundantGarrisonGap = Math.max(0, abundantGarrison - currentGarrison);
      const troopsAboveAbundantReserve = Math.max(0, myTroops - abundantReserve);
      if(troopsAboveAbundantReserve == 0) break;
      
      let commitment = Math.min(troopsAboveAbundantReserve, abundantGarrisonGap);
      myTroops -= commitment;
      troopsToCommit.set(vassal, committedTroops + commitment);
    }
		
		for(const vassal of vassalsToCheck) {
      const abundantReserve = myTroopCapacity * 0.75;
      
      const maxGarrison = myTroopCapacity * 0.5;
      const committedTroops = troopsToCommit.get(vassal) ?? 0;
      const currentGarrison = vassal.absorption() + committedTroops;
      
      const maxGarrisonGap = Math.max(0, maxGarrison - currentGarrison);
      const troopsAboveAbundantReserve = Math.max(0, myTroops - abundantReserve);
      if(troopsAboveAbundantReserve == 0) break;
      
      let commitment = Math.min(troopsAboveAbundantReserve, maxGarrisonGap);
			myTroops -= commitment;
			troopsToCommit.set(vassal, committedTroops + commitment);
		}
    
    for(const vassal of vassalsToCheck) {
      const commitment = troopsToCommit.get(vassal) ?? 0;
      if(commitment > 0) {
        const given = this.player.commitTroopsToVassal(vassal, Math.floor(commitment));
      }
    }
		
  }

  private maybePayTribute(): void {
    const empire = this.player.empire();
    if (empire === null) return;
    const relation = this.player.relationValue(empire);
    if (relation < this.TRIBUTE_GOOD_RELATION) return;
    // A fonder vassal sends tribute more often, and a larger share.
    const probability = Math.min(relation / 600, 0.333);
    if (!this.random.probability(probability)) return;
    const share = Math.max(1000 / relation, 5);
    const gold = (this.player.gold() * BigInt(1000)) / BigInt(Math.round(share*1000));
		this.player.donateGold(empire, gold);
  }
	
	private maybeShowGratitude(): void {
		const empire = this.player.empire();
		if (empire !== null
			&& this.random.chance(10)
			&& this.player.type() === PlayerType.Nation
			&& empire.type() === PlayerType.Human
			&& this.player.canSendEmoji(this.player)
			&& this.player.absorption() > this.game.config().maxTroops(this.player) * 2.5) {
			this.game.addExecution(
				new EmojiExecution(
					this.player,
					empire.id(),
					this.random.randElement(EMOJI_EMPIRE_DEFENSE_GRATITUDE),
				),
			);
		}
	}

  private maybeComplain(): void {
    const empire = this.player.empire();
    if (empire === null) return;
    const cap = this.game.config().maxTroops(this.player);
    if (cap <= 0 || this.player.absorption() >= cap) return;
    if (!this.random.chance(10)) return;
    if (!this.player.canSendEmoji(empire)) return;
    this.emojiBehavior.sendEmoji(empire, EMOJI_EMPIRE_INSUFFICIENT_DEFENSE);
  }

  private borderingPlayers(): Player[] {
    return this.player
      .nearby()
      .filter((n): n is Player => n.isPlayer() && n.type() !== PlayerType.Bot);
  }

  private weakerThanMostNeighbors(): boolean {
    const neighbors = this.borderingPlayers();
    if (neighbors.length === 0) return true;
    let stronger = 0;
    for (const neighbor of neighbors) {
			if (this.player.isFriendly(neighbor)) continue;
      if (this.player.threatScore(neighbor) > 1.2) stronger++;
    }
    return stronger * 2 > neighbors.length;
  }

  /**
   * 
   * @param base 
   * @param candidate 
   * @returns true if candidate is much stronger than base
   */
  private isMuchStronger(base: Player, candidate: Player): boolean {
    return base.threatScore(candidate) >= 8;
  }

  /**
   * 
   * @param base 
   * @param candidate 
   * @returns true if candidate is overwhelmingly stronger than base
   */
  private isOverwhelming(base: Player, candidate: Player): boolean {
    return base.threatScore(candidate) >= 11.5;
  }
  
}
