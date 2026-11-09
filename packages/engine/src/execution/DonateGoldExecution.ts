import {
  Difficulty,
  Gold,
  PlayerID,
  PlayerType,
} from "@openfront/engine-api/game/GameTypes";
import { PseudoRandom } from "@openfront/engine-lib/PseudoRandom";
import {
  zPlayerRef,
  zRandom,
} from "@openfront/engine-lib/snapshot/SnapshotType";
import { assertNever, toInt } from "@openfront/engine-lib/Util";
import { z } from "zod";
import { Execution, Game, Player } from "../game/Game";
import {
  GOLD_HEAT_PER_CHUNK,
  GOLD_PERMANENT_PER_CHUNK,
  RelationEvent,
} from "../game/RelationMemory";
import { execSnapshotType } from "../snapshot/ExecutionSnapshot";
import type {
  ExecRecord,
  SnapshotReader,
  SnapshotWriter,
} from "../snapshot/SnapshotContext";
import { EmojiExecution } from "./EmojiExecution";
import {
  EMOJI_DONATION_OK,
  EMOJI_DONATION_TOO_SMALL,
  EMOJI_LOVE,
} from "./nation/NationEmojiBehavior";

export class DonateGoldExecution implements Execution {
  private recipient: Player;
  private gold: Gold | null = null;

  private mg: Game;
  private random: PseudoRandom;

  private active = true;

  constructor(
    private sender: Player,
    private recipientID: PlayerID,
    goldNum: number | null,
  ) {
    this.gold = goldNum !== null ? toInt(goldNum) : null;
  }

  init(mg: Game, ticks: number): void {
    this.mg = mg;
    this.random = new PseudoRandom(mg.ticks());

    if (!mg.hasPlayer(this.recipientID)) {
      console.warn(
        `DonateGoldExecution recipient ${this.recipientID} not found`,
      );
      this.active = false;
      return;
    }

    this.recipient = mg.player(this.recipientID);
    this.gold ??= this.sender.gold() / 3n;
  }

  tick(ticks: number): void {
    if (this.gold === null) throw new Error("not initialized");
    if (
      this.sender.canDonateGold(this.recipient) &&
      this.sender.donateGold(this.recipient, this.gold)
    ) {
      // Give relation points based on how much gold was donated
      const chunks = this.calculateChunks(this.gold, ticks);
      if (chunks > 0) {
        this.recipient.applyRelation(
          this.sender,
          RelationEvent.SendGold,
          chunks * GOLD_HEAT_PER_CHUNK,
          chunks * GOLD_PERMANENT_PER_CHUNK,
        );
      }

      // Only AI nations auto-respond with emojis, human players should not
      if (
        this.recipient.type() === PlayerType.Nation &&
        this.recipient.canSendEmoji(this.sender)
      ) {
        // Select emoji based on donation value
        const emoji =
          chunks * GOLD_HEAT_PER_CHUNK >= 50
            ? EMOJI_LOVE
            : chunks > 0
              ? EMOJI_DONATION_OK
              : EMOJI_DONATION_TOO_SMALL;

        this.mg.addExecution(
          new EmojiExecution(
            this.recipient,
            this.sender.id(),
            this.random.randElement(emoji),
          ),
        );
      }
    } else {
      console.warn(
        `cannot send gold from ${this.sender.name()} to ${this.recipient.name()}`,
      );
    }
    this.active = false;
  }

  private getGoldChunkSize(): number {
    const { difficulty } = this.mg.config().gameConfig();
    switch (difficulty) {
      case Difficulty.Easy:
        return 2_500;
      case Difficulty.Medium:
        return 5_000;
      case Difficulty.Hard:
        return 12_500;
      case Difficulty.Impossible:
        return 25_000;
      default:
        assertNever(difficulty);
    }
  }

  private calculateChunks(goldSent: Gold, ticks: number): number {
    const chunkSize = this.getGoldChunkSize();
    // For every 5 minutes that pass, multiply the chunk size to scale with game progression
    const chunkSizeMultiplier =
      ticks / (3000 + this.mg.config().numSpawnPhaseTurns());
    const adjustedChunkSize = BigInt(
      Math.round(chunkSize + chunkSize * chunkSizeMultiplier),
    );
    return Number(goldSent / adjustedChunkSize);
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }

  snapshot(w: SnapshotWriter): ExecRecord {
    return DonateGoldExecutionSnapshot.write({
      active: this.active,
      initialized: this.mg !== undefined,
      recipient: this.recipient === undefined ? null : w.player(this.recipient),
      gold: this.gold,
      random: this.random === undefined ? null : w.random(this.random),
      sender: w.player(this.sender),
      recipientID: this.recipientID,
    });
  }

  restoreSnapshot(s: DonateGoldState, r: SnapshotReader): void {
    this.active = s.active;
    if (s.initialized) this.mg = r.game;
    if (s.recipient !== null) this.recipient = r.player(s.recipient);
    this.gold = s.gold;
    if (s.random !== null) this.random = r.random(s.random);
    this.sender = r.player(s.sender);
    this.recipientID = s.recipientID;
  }
}

const DonateGoldStateSchema = z.object({
  active: z.boolean(),
  initialized: z.boolean(),
  recipient: zPlayerRef().nullable(),
  gold: z.bigint().nullable(),
  random: zRandom().nullable(),
  sender: zPlayerRef(),
  recipientID: z.string(),
});
type DonateGoldState = z.infer<typeof DonateGoldStateSchema>;

export const DonateGoldExecutionSnapshot = execSnapshotType({
  name: "DonateGold",
  version: 1,
  schema: DonateGoldStateSchema,
  cls: () => DonateGoldExecution,
});
