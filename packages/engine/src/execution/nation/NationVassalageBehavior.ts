import { PlayerType } from "@openfront/engine-api/game/GameTypes";
import { PseudoRandom } from "@openfront/engine-lib/PseudoRandom";
import { Game, Player, VassalageRequest } from "../../game/Game";
import {
  EMOJI_AGGRESSIVE_ATTACK,
  EMOJI_DEFENSE_THANKS,
  EMOJI_EMPIRE_DEFENSE_GRATITUDE,
  EMOJI_EMPIRE_INSUFFICIENT_DEFENSE,
  EMOJI_LOVE,
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

  private readonly GARRISON_GOOD_RELATION = 75;
  private readonly TRIBUTE_GOOD_RELATION = 25;
  private readonly RECENT_ATTACKS_WINDOW = 20 * 10;
  private readonly NON_THREAT_RELATION = 600;

  maintain(): void {
    this.answerRequests();
    this.maybeSeekVassalage();
    this.maybeCommitGarrison();
    this.maybePayTribute();
    this.maybeSendEmoji();
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
    const requestor = req.requestor();
    const relation = this.player.relationValue(requestor);
    const recentAttackScore = this.player.recentAttackersTotalThreatScore(
      this.RECENT_ATTACKS_WINDOW,
    );
    if (req.vassal() === this.player) {
      // We are being asked to become the vassal.
      const oldEmpire = this.player.empire();
      if (!oldEmpire) {
        //if (this.threateningNeighbors(1) < 0.5) return false;
        const incomingAttacksFactor =
          recentAttackScore <= 1
            ? 1
            : Math.max(1 - recentAttackScore * 0.04, 0.7);
        if (
          this.player.threatScore(requestor) >=
          this.requiredThreatScore(relation) * incomingAttacksFactor
        ) {
          if (recentAttackScore >= 7) {
            this.emojiBehavior.sendEmoji(requestor, EMOJI_DEFENSE_THANKS);
          }
          return true;
        }
        return false;
      } else {
        // We are being asked to be poached
        // Make sure they can supply garrison
        if (requestor.troops() < this.game.config().maxTroops(this.player) * 5)
          return false;
        const relationDifference =
          relation - this.player.relationValue(oldEmpire);
        const requiredRelativeThreatScore =
          relationDifference >= 0
            ? Math.max(5 - relationDifference * 0.0125, 2)
            : Math.min(5 - relationDifference * 0.025, 20);
        return oldEmpire.threatScore(requestor) >= requiredRelativeThreatScore;
      }
    } else {
      // We are being asked to become the empire.
      // Make sure we can supply the vassals garrison
      if (
        this.game.config().maxTroops(this.player) <
        this.game.config().maxTroops(requestor) * 5
      )
        return false;
      // If we are under attack, we cannot support another vassal rn, so increase required threat ratio
      const incomingAttacksFactor = Math.max(recentAttackScore * 0.75, 1);
      return (
        requestor.threatScore(this.player) >
        this.requiredThreatScore(relation) * incomingAttacksFactor
      );
    }
  }

  private maybeSeekVassalage(): void {
    if (this.player.empire()) return;

    const recentAttackScore = this.player.recentAttackersTotalThreatScore(
      this.RECENT_ATTACKS_WINDOW,
    );
    const threateningNeighbors = this.player.threateningNeighbors(3);

    if (recentAttackScore >= 6 || threateningNeighbors > 0.92) {
      //We are outnumbered, we will request to become a vassal
      const outgoingVassalageRecipients = this.player
        .outgoingVassalageRequests()
        .map((vr) => vr.recipient());
      const empireCandidates = this.neighbors()
        .filter(
          (p) =>
            p.type() !== PlayerType.Bot &&
            !outgoingVassalageRecipients.includes(p),
        )
        .sort((a, b) => {
          let result =
            this.bucket(this.player.threatScore(b), 1.5) -
            this.bucket(this.player.threatScore(a), 1.5);
          if (result !== 0) return result;
          result = this.player.relationValue(b) - this.player.relationValue(a);
          return result;
        })
        .slice(0, 4)
        .filter(
          (p) =>
            this.player.canSendSelfVassalageRequest(p) &&
            this.player.threatScore(p) >= 5 &&
            p.troops() >= this.game.config().maxTroops(this.player) * 3,
        );
      if (empireCandidates.length === 0) return;
      let empire = empireCandidates[0];
      for (let i = 1; i < empireCandidates.length; i++) {
        if (this.random.probability(0.5)) {
          empire = empireCandidates[i];
        } else {
          break;
        }
      }
      this.emojiBehavior.sendEmoji(empire, EMOJI_REQUEST_VASSALAGE);
      this.player.createSelfVassalageRequest(empire);
    }

    //TODO add empires requesting vassals
    /*for (const other of this.neighbors()) {
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
    }*/
  }

  private maybeCommitGarrison(): void {
    if (!this.random.chance(2)) return;

    const vassalsToCheck = this.player.vassals().sort((a, b) => {
      let result =
        this.bucket(this.player.relationValue(b), 25) -
        this.bucket(this.player.relationValue(a), 25);
      if (result !== 0) return result;
      result =
        b.recentAttackersTotalThreatScore(
          this.RECENT_ATTACKS_WINDOW,
          this.player,
        ) -
        a.recentAttackersTotalThreatScore(
          this.RECENT_ATTACKS_WINDOW,
          this.player,
        );
      if (result !== 0) return result;
      result = b.threateningNeighbors(1) - a.threateningNeighbors(1);
      return result;
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

      const minimumGarrisonGap = Math.max(
        0,
        bareMinimumGarrison - currentGarrison,
      );
      const troopsAboveMinimumReserve = Math.max(0, myTroops - minimumReserve);
      if (troopsAboveMinimumReserve === 0) break;

      let commitment = Math.min(troopsAboveMinimumReserve, minimumGarrisonGap);
      myTroops -= commitment;
      troopsToCommit.set(vassal, commitment);
    }

    for (const vassal of vassalsToCheck) {
      const relation = this.player.relationValue(vassal);
      const liked = relation >= this.GARRISON_GOOD_RELATION;

      const comfortableReserve = myTroopCapacity * (liked ? 0.4 : 0.65);

      const neutralGarrison = Math.max(1, this.game.config().maxTroops(vassal));
      const committedTroops = troopsToCommit.get(vassal) ?? 0;
      const currentGarrison = vassal.absorption() + committedTroops;

      const neutralGarrisonGap = Math.max(0, neutralGarrison - currentGarrison);
      const troopsAboveComfortableReserve = Math.max(
        0,
        myTroops - comfortableReserve,
      );
      if (troopsAboveComfortableReserve === 0) break;

      let commitment = Math.min(
        troopsAboveComfortableReserve,
        neutralGarrisonGap,
      );
      myTroops -= commitment;
      troopsToCommit.set(vassal, committedTroops + commitment);
    }

    for (const vassal of vassalsToCheck) {
      const abundantReserve = myTroopCapacity * 0.75;

      const abundantGarrison = Math.max(
        myTroopCapacity * 0.1,
        this.game.config().maxTroops(vassal) * 3,
      );
      const committedTroops = troopsToCommit.get(vassal) ?? 0;
      const currentGarrison = vassal.absorption() + committedTroops;

      const abundantGarrisonGap = Math.max(
        0,
        abundantGarrison - currentGarrison,
      );
      const troopsAboveAbundantReserve = Math.max(
        0,
        myTroops - abundantReserve,
      );
      if (troopsAboveAbundantReserve === 0) break;

      let commitment = Math.min(
        troopsAboveAbundantReserve,
        abundantGarrisonGap,
      );
      myTroops -= commitment;
      troopsToCommit.set(vassal, committedTroops + commitment);
    }

    for (const vassal of vassalsToCheck) {
      const abundantReserve = myTroopCapacity * 0.75;

      const maxGarrison = myTroopCapacity * 0.5;
      const committedTroops = troopsToCommit.get(vassal) ?? 0;
      const currentGarrison = vassal.absorption() + committedTroops;

      const maxGarrisonGap = Math.max(0, maxGarrison - currentGarrison);
      const troopsAboveAbundantReserve = Math.max(
        0,
        myTroops - abundantReserve,
      );
      if (troopsAboveAbundantReserve === 0) break;

      let commitment = Math.min(troopsAboveAbundantReserve, maxGarrisonGap);
      myTroops -= commitment;
      troopsToCommit.set(vassal, committedTroops + commitment);
    }

    for (const vassal of vassalsToCheck) {
      const commitment = troopsToCommit.get(vassal) ?? 0;
      if (commitment > 0) {
        this.player.commitTroopsToVassal(vassal, Math.floor(commitment));
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
    const gold =
      (this.player.gold() * BigInt(1000)) / BigInt(Math.round(share * 1000));
    this.player.donateGold(empire, gold);
  }

  private maybeSendEmoji(): void {
    if (this.player.type() !== PlayerType.Nation || !this.random.chance(10))
      return;
    const empire = this.player.empire();
    if (
      empire !== null &&
      empire.type() === PlayerType.Human &&
      this.player.canSendEmoji(empire)
    ) {
      const myMaxTroops = this.game.config().maxTroops(this.player);
      if (this.player.absorption() >= myMaxTroops * 2.5) {
        this.emojiBehavior.sendEmoji(empire, EMOJI_EMPIRE_DEFENSE_GRATITUDE);
      } else if (this.player.absorption() < myMaxTroops) {
        this.emojiBehavior.sendEmoji(empire, EMOJI_EMPIRE_INSUFFICIENT_DEFENSE);
      }
    }
    for (const vassal of this.player.vassals()) {
      const relation = this.player.relation(vassal);
      if (relation >= 75) {
        this.emojiBehavior.sendEmoji(vassal, EMOJI_LOVE);
      } else if (relation <= -25) {
        this.emojiBehavior.sendEmoji(vassal, EMOJI_AGGRESSIVE_ATTACK);
      }
    }
  }

  private neighbors(): Player[] {
    return this.player
      .nearby()
      .filter((n): n is Player => n.isPlayer() && n.type() !== PlayerType.Bot);
  }

  private requiredThreatScore(relation: number): number {
    if (relation < 0) return Math.min(10 - 0.035 * relation, 20);
    return Math.max(10 - 0.0095 * relation, 7);
  }

  private bucket(value: number, step: number): number {
    return Math.floor(value / step);
  }
}
