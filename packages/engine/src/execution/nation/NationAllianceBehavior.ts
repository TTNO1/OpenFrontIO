import {
  Difficulty,
  GameMode,
  PlayerType,
} from "@openfront/engine-api/game/GameTypes";
import { PseudoRandom } from "@openfront/engine-lib/PseudoRandom";
import {
  readVersioned,
  snapshotType,
  Versioned,
} from "@openfront/engine-lib/snapshot/SnapshotType";
import { assertNever } from "@openfront/engine-lib/Util";
import { z } from "zod";
import { Game, Player } from "../../game/Game";
import type {
  SnapshotReader,
  SnapshotWriter,
} from "../../snapshot/SnapshotContext";
import { AllianceExtensionExecution } from "../alliance/AllianceExtensionExecution";
import { AllianceRequestExecution } from "../alliance/AllianceRequestExecution";
import {
  EMOJI_DENY_ENEMY,
  EMOJI_DENY_TRAITOR,
  EMOJI_HANDSHAKE,
  EMOJI_LOVE,
  EMOJI_SCARED_OF_THREAT,
  NationEmojiBehavior,
} from "./NationEmojiBehavior";
import { findJuiciestTarget, findRunawayLeader } from "./NationUtils";

export class NationAllianceBehavior {
  constructor(
    private random: PseudoRandom,
    private game: Game,
    private player: Player,
    private emojiBehavior: NationEmojiBehavior,
  ) {}

  /** No state of its own; the owner supplies the shared references. */
  snapshot(w: SnapshotWriter): Versioned {
    return w.versioned(NationAllianceBehaviorSnapshot, {});
  }

  /** Fills a prototype-only shell; only assigns (see README). */
  restoreSnapshot(
    raw: unknown,
    r: SnapshotReader,
    random: PseudoRandom,
    player: Player,
    emojiBehavior: NationEmojiBehavior,
  ): void {
    readVersioned(NationAllianceBehaviorSnapshot, raw);
    this.random = random;
    this.game = r.game;
    this.player = player;
    this.emojiBehavior = emojiBehavior;
  }

  handleAllianceRequests() {
    if (this.game.config().disableAlliances()) return;
    if (this.player.empire() !== null) {
      for (const req of this.player.incomingAllianceRequests()) req.reject();
      return;
    }

    for (const req of this.player.incomingAllianceRequests()) {
      // Alliance Request intents created during the spawn phase are executed on
      // the first tick post-spawn phase. With the following condition we reject
      // all requests created during the spawn phase.
      if (
        req.createdAt() <= this.game.config().numSpawnPhaseTurns() + 1 ||
        req.requestor().empire() !== null
      ) {
        req.reject();
        continue;
      }
      if (this.getAllianceDecision(req.requestor(), true)) {
        req.accept();
      } else {
        req.reject();
      }
    }
  }

  handleAllianceExtensionRequests() {
    if (this.game.config().disableAlliances()) return;
    if (this.player.empire() !== null) return;

    for (const alliance of this.player.alliances()) {
      // Alliance expiration tracked by Events Panel, only human ally can click Request to Renew
      // Skip if no expiration yet/ ally didn't request extension yet / nation already agreed to extend
      if (!alliance.onlyOneAgreedToExtend()) continue;

      const human = alliance.other(this.player);
      if (!this.getAllianceDecision(human, true)) continue;

      this.game.addExecution(
        new AllianceExtensionExecution(this.player, human.id()),
      );
    }
  }

  maybeSendAllianceRequests(borderingEnemies: Player[]) {
    if (this.game.config().disableAlliances()) return;

    // Only easy nations are allowed to send alliance requests to bots
    const isAcceptablePlayerType = (p: Player) =>
      (p.type() === PlayerType.Bot &&
        this.game.config().gameConfig().difficulty === Difficulty.Easy) ||
      p.type() !== PlayerType.Bot;

    for (const enemy of borderingEnemies) {
      if (
        this.random.chance(30) &&
        isAcceptablePlayerType(enemy) &&
        this.player.canSendAllianceRequest(enemy) &&
        this.getAllianceDecision(enemy, false)
      ) {
        this.game.addExecution(
          new AllianceRequestExecution(this.player, enemy.id()),
        );
      }
    }
  }

  private getAllianceDecision(
    otherPlayer: Player,
    isResponse: boolean,
  ): boolean {
    // Easy (dumb) nations sometimes get confused and accept/reject randomly (Just like dumb humans do)
    if (this.isConfused()) {
      return this.random.chance(2);
    }
    const threat = this.player.threatScore(otherPlayer);
    // Self-preservation: an overwhelming neighbor is accepted even if they
    // are a traitor, a runaway, or already have too many alliances.
    if (threat >= 8) {
      if (!isResponse && this.random.probability(0.7)) {
        this.emojiBehavior.sendEmoji(otherPlayer, EMOJI_SCARED_OF_THREAT);
      }
      if (isResponse && this.random.probability(0.7)) {
        this.emojiBehavior.sendEmoji(otherPlayer, EMOJI_LOVE);
      }
      return true;
    }
    // Nearly always reject traitors
    if (otherPlayer.isTraitor() && this.random.probability(0.9)) {
      if (isResponse && this.random.probability(0.7)) {
        this.emojiBehavior.sendEmoji(otherPlayer, EMOJI_DENY_TRAITOR);
      }
      return false;
    }
    // Reject if otherPlayer has allied with a lot of players (Hard and Impossible only)
    // To make sure there are enough non-friendly players in the game to stop the crown with nukes
    if (this.hasTooManyAlliances(otherPlayer)) {
      return false;
    }
    // Don't help a runaway leader grow even further (Medium and up)
    if (this.isRunawayLeader(otherPlayer)) {
      return false;
    }
    // Maybe reject if we are in a team game (allying makes less sense there)
    if (this.shouldRejectInTeamGame()) {
      return false;
    }
    // Reject if we already have some alliances, we don't want to ally with the entire map
    if (this.checkAlreadyEnoughAlliances(otherPlayer)) {
      return false;
    }
    // A weaker nation has to be liked more. A stronger one is accepted on less.
    const required = this.requiredRelationForThreat(threat);
    if (this.player.relationValue(otherPlayer) < required) {
      if (isResponse && this.random.probability(0.7)) {
        this.emojiBehavior.sendEmoji(otherPlayer, EMOJI_DENY_ENEMY);
      }
      return false;
    }
    if (this.random.chance(3)) {
      this.emojiBehavior.sendEmoji(otherPlayer, EMOJI_HANDSHAKE);
    }
    return true;
  }

  private hasTooManyAlliances(otherPlayer: Player): boolean {
    const { difficulty } = this.game.config().gameConfig();
    if (
      difficulty !== Difficulty.Hard &&
      difficulty !== Difficulty.Impossible
    ) {
      return false;
    }

    const totalPlayers = this.game
      .players()
      .filter((p) => p.type() !== PlayerType.Bot).length;
    // An alliance with us is the one being renewed, not another one
    const otherPlayerAlliances =
      otherPlayer.alliances().length -
      (otherPlayer.isAlliedWith(this.player) ? 1 : 0);

    if (difficulty === Difficulty.Hard) {
      return otherPlayerAlliances >= totalPlayers * 0.5;
    } else {
      return otherPlayerAlliances >= totalPlayers * 0.25;
    }
  }

  private isRunawayLeader(otherPlayer: Player): boolean {
    return findRunawayLeader(this.game) === otherPlayer;
  }
  
  /** A weaker neighbor must be liked more before an alliance is worth it. */
  private requiredRelationForThreat(threat: number): number {
    return 40 * (1 - threat);
  }

  private isConfused(): boolean {
    const { difficulty } = this.game.config().gameConfig();
    switch (difficulty) {
      case Difficulty.Easy:
        return this.random.chance(10); // 10% chance to be confused on easy
      case Difficulty.Medium:
        return this.random.chance(20); // 5% chance to be confused on medium
      case Difficulty.Hard:
        return this.random.chance(40); // 2.5% chance to be confused on hard
      case Difficulty.Impossible:
        return false; // No confusion on impossible
      default:
        assertNever(difficulty);
    }
  }

  private shouldRejectInTeamGame(): boolean {
    if (this.game.config().gameConfig().gameMode !== GameMode.Team) {
      return false;
    }

    const { difficulty } = this.game.config().gameConfig();
    switch (difficulty) {
      case Difficulty.Easy:
        return this.random.nextInt(0, 100) < 25;
      case Difficulty.Medium:
        return this.random.nextInt(0, 100) < 50;
      case Difficulty.Hard:
        return this.random.nextInt(0, 100) < 75;
      case Difficulty.Impossible:
        return true;
      default:
        assertNever(difficulty);
    }
  }

  private checkAlreadyEnoughAlliances(otherPlayer: Player): boolean {
    const { difficulty } = this.game.config().gameConfig();
    switch (difficulty) {
      case Difficulty.Easy:
        return false;
      case Difficulty.Medium:
        return this.player.alliances().length >= this.random.nextInt(4, 6);
      case Difficulty.Hard:
      case Difficulty.Impossible: {
        const borderingPlayers = this.player
          .nearby()
          .filter(
            (n): n is Player => n.isPlayer() && n.type() !== PlayerType.Bot,
          );
        const borderingFriends = borderingPlayers.filter(
          (o) => this.player.isFriendly(o),
        );
        if (
          borderingPlayers.length >= 2 &&
          borderingPlayers.includes(otherPlayer)
        ) {
          return borderingPlayers.length <= borderingFriends.length + 1;
        }
        if (difficulty === Difficulty.Hard) {
          return this.player.alliances().length >= this.random.nextInt(3, 5);
        }
        return this.player.alliances().length >= this.random.nextInt(2, 4);
      }
      default:
        assertNever(difficulty);
    }
  }

  // juiciestAlly comes from findJuiciestAlly(borderingFriends) - callers looping
  // over borderingFriends should compute it once, not on every call
  maybeBetray(
    otherPlayer: Player,
    juiciestAlly: Player | null,
    borderingFriends: Player[],
    borderingEnemies: Player[],
  ): boolean {
    if (!this.player.isAlliedWith(otherPlayer)) return false;

    const { difficulty } = this.game.config().gameConfig();

    // Betray our juiciest ally (e.g. a MIRVed one), if it's safe to do so (everybody around us is weak)
    if (
      (difficulty === Difficulty.Hard ||
        difficulty === Difficulty.Impossible) &&
      juiciestAlly === otherPlayer &&
      this.isSafeToBetray(otherPlayer, borderingFriends, borderingEnemies)
    ) {
      this.betray(otherPlayer);
      return true;
    }

    // Betray very weak players (similar check as above but for the easier difficulties)
    // This doesn't check for maxTroops and isn't really smart. It makes nations vulnerable, but that's intended.
    // On easy, don't betray humans
    if (
      (difficulty === Difficulty.Easy || difficulty === Difficulty.Medium) &&
      !(
        difficulty === Difficulty.Easy &&
        otherPlayer.type() === PlayerType.Human
      ) &&
      this.player.troops() >= otherPlayer.troops() * 10
    ) {
      this.betray(otherPlayer);
      return true;
    }

    // Betray traitors who aren't significantly stronger than us
    if (
      difficulty !== Difficulty.Easy &&
      otherPlayer.isTraitor() &&
      otherPlayer.troops() < this.player.troops() * 1.2
    ) {
      this.betray(otherPlayer);
      return true;
    }

    // Betray our only bordering player if we are much stronger than them
    if (
      difficulty !== Difficulty.Easy &&
      borderingFriends.length + borderingEnemies.length === 1 &&
      otherPlayer.troops() * 3 < this.player.troops()
    ) {
      this.betray(otherPlayer);
      return true;
    }

    return false;
  }

  // Juiciest ally regardless of strength; isSafeToBetray() rejects the too-strong ones
  findJuiciestAlly(borderingFriends: Player[]): Player | null {
    const candidates = borderingFriends.filter((friend) =>
      this.player.isAlliedWith(friend),
    );
    return findJuiciestTarget(this.game, candidates);
  }

  // Safe if target + non-allied neighbors + (unless target's already a traitor,
  // since betraying them wouldn't make us one) our other allies stay under a third of our troops
  private isSafeToBetray(
    target: Player,
    borderingFriends: Player[],
    borderingEnemies: Player[],
  ): boolean {
    const otherAllies = target.isTraitor()
      ? []
      : borderingFriends.filter(
          (f) => f !== target && this.player.isAlliedWith(f),
        );
    const threats = [target, ...borderingEnemies, ...otherAllies];
    const nearbyThreatTroops = threats.reduce((sum, threat) => {
      const outgoing = threat
        .outgoingAttacks()
        .reduce((s, attack) => s + attack.troops(), 0);
      return sum + threat.troops() + outgoing;
    }, 0);
    return nearbyThreatTroops < this.player.troops() * 0.33;
  }

  private betray(target: Player): void {
    const alliance = this.player.allianceWith(target);
    if (!alliance) return;
    this.player.breakAlliance(alliance);
  }
}

export const NationAllianceBehaviorSnapshot = snapshotType({
  name: "NationAllianceBehavior",
  version: 1,
  schema: z.object({}),
});
