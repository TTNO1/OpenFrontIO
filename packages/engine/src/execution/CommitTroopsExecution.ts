import { MessageType, PlayerID, PlayerType } from "@openfront/engine-api/game/GameTypes";
import { renderTroops } from "@openfront/engine-lib/Format";
import { zPlayerRef } from "@openfront/engine-lib/snapshot/SnapshotType";
import { z } from "zod";
import { Execution, Game, Player } from "../game/Game";
import { execSnapshotType } from "../snapshot/ExecutionSnapshot";
import type {
  ExecRecord,
  SnapshotReader,
  SnapshotWriter,
} from "../snapshot/SnapshotContext";
import { PseudoRandom } from "@openfront/engine-lib/PseudoRandom";
import { EMOJI_CHARM_ALLIES, EMOJI_LOVE } from "./nation/NationEmojiBehavior";
import { EmojiExecution } from "./EmojiExecution";

export class CommitTroopsExecution implements Execution {
  private recipient: Player | null = null;
  private mg: Game | null = null;
  private active = true;
  private random: PseudoRandom;

  constructor(
    private sender: Player,
    private recipientID: PlayerID,
    private troops: number | null,
  ) {}

  init(mg: Game, _ticks: number): void {
    this.random = new PseudoRandom(mg.ticks());
    this.mg = mg;
    if (!mg.hasPlayer(this.recipientID)) {
      this.active = false;
      return;
    }
    this.recipient = mg.player(this.recipientID);
    this.troops ??= Math.floor(this.sender.troops() / 2);
  }

  tick(): void {
    if (this.recipient === null || this.troops === null || this.mg === null) {
      this.active = false;
      return;
    }
    const hadTroops = this.sender.troops() > 0;
    const given = this.sender.commitTroopsToVassal(this.recipient, this.troops);
    const name = this.recipient.displayName();
    if (given > 0) {
      this.mg.displayMessage(
        "events_display.sent_garrison_to_player",
        MessageType.DONATION_SENT,
        this.sender.id(),
        undefined,
        { name, troops: renderTroops(given) },
        undefined,
        this.recipient.id(),
      );
      if (this.random.probability(0.6)
        && this.recipient.type() === PlayerType.Nation
        && this.sender.type() === PlayerType.Human
        && this.recipient.canSendEmoji(this.sender)) {
          let emojiSet = EMOJI_LOVE;
          if (this.recipient.absorption() >= this.mg.config().maxTroops(this.recipient)){
            emojiSet = EMOJI_CHARM_ALLIES;
          }
        this.mg.addExecution(
          new EmojiExecution(
            this.recipient,
            this.sender.id(),
            this.random.randElement(emojiSet),
          ),
        );
      }
    } else if (hadTroops) {
      // Half of troop capacity is already parked. Nothing moved, so say so
      // instead of leaving the button looking broken.
      this.mg.displayMessage(
        "events_display.garrison_full",
        MessageType.DONATION_SENT,
        this.sender.id(),
        undefined,
        { name },
        undefined,
        this.recipient.id(),
      );
    }
    this.active = false;
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }

  snapshot(w: SnapshotWriter): ExecRecord {
    return CommitTroopsExecutionSnapshot.write({
      active: this.active,
      initialized: this.mg !== null,
      sender: w.player(this.sender),
      recipient: this.recipient === null ? null : w.player(this.recipient),
      recipientID: this.recipientID,
      troops: this.troops,
    });
  }

  restoreSnapshot(s: CommitTroopsState, r: SnapshotReader): void {
    this.active = s.active;
    if (s.initialized) this.mg = r.game;
    this.sender = r.player(s.sender);
    this.recipientID = s.recipientID;
    this.troops = s.troops;
    this.recipient = s.recipient === null ? null : r.player(s.recipient);
  }
}

const CommitTroopsStateSchema = z.object({
  active: z.boolean(),
  initialized: z.boolean(),
  sender: zPlayerRef(),
  recipient: zPlayerRef().nullable(),
  recipientID: z.string(),
  troops: z.number().nullable(),
});
type CommitTroopsState = z.infer<typeof CommitTroopsStateSchema>;

export const CommitTroopsExecutionSnapshot = execSnapshotType({
  name: "CommitTroops",
  version: 1,
  schema: CommitTroopsStateSchema,
  cls: () => CommitTroopsExecution,
});
