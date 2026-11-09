import { PlayerID } from "@openfront/engine-api/game/GameTypes";
import { zPlayerRef } from "@openfront/engine-lib/snapshot/SnapshotType";
import { z } from "zod";
import { Execution, Game, Player } from "../game/Game";
import { execSnapshotType } from "../snapshot/ExecutionSnapshot";
import type {
  ExecRecord,
  SnapshotReader,
  SnapshotWriter,
} from "../snapshot/SnapshotContext";

const KindSchema = z.enum(["makeVassal", "becomeVassal", "reject", "break"]);
type Kind = z.infer<typeof KindSchema>;

/** One diplomatic step: offer empire, offer vassalage, reject, or break. */
export class VassalageIntentExecution implements Execution {
  private other: Player | null = null;
  private mg: Game | null = null;
  private active = true;

  constructor(
    private actor: Player,
    private otherID: PlayerID,
    private kind: Kind,
  ) {}

  init(mg: Game, _ticks: number): void {
    this.mg = mg;
    if (!mg.hasPlayer(this.otherID)) {
      this.active = false;
      return;
    }
    this.other = mg.player(this.otherID);
  }

  tick(): void {
    const other = this.other;
    if (other === null) {
      this.active = false;
      return;
    }
    if (this.kind === "makeVassal" && this.actor.canSendVassalageRequest(other)) {
      this.actor.createVassalageRequest(other);
    } else if (
      this.kind === "becomeVassal" &&
      this.actor.canSendSelfVassalageRequest(other)
    ) {
      this.actor.createSelfVassalageRequest(other);
    } else if (this.kind === "reject") {
      const request = other
        .outgoingVassalageRequests()
        .find((vr) => vr.recipient() === this.actor);
      request?.reject();
    } else if (this.kind === "break" && this.actor.empire() === other) {
      const vassalage = this.actor.vassalageWith(other);
      if (vassalage !== null) this.actor.breakVassalage(vassalage);
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
    return VassalageIntentExecutionSnapshot.write({
      active: this.active,
      initialized: this.mg !== null,
      actor: w.player(this.actor),
      other: this.other === null ? null : w.player(this.other),
      otherID: this.otherID,
      kind: this.kind,
    });
  }

  restoreSnapshot(s: VassalageIntentState, r: SnapshotReader): void {
    this.active = s.active;
    if (s.initialized) this.mg = r.game;
    this.actor = r.player(s.actor);
    this.otherID = s.otherID;
    this.kind = s.kind;
    this.other = s.other === null ? null : r.player(s.other);
  }
}

const VassalageIntentStateSchema = z.object({
  active: z.boolean(),
  initialized: z.boolean(),
  actor: zPlayerRef(),
  other: zPlayerRef().nullable(),
  otherID: z.string(),
  kind: KindSchema,
});
type VassalageIntentState = z.infer<typeof VassalageIntentStateSchema>;

export const VassalageIntentExecutionSnapshot = execSnapshotType({
  name: "VassalageIntent",
  version: 1,
  schema: VassalageIntentStateSchema,
  cls: () => VassalageIntentExecution,
});
