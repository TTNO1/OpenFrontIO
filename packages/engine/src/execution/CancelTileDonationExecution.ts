import { zPlayerRef } from "@openfront/engine-lib/snapshot/SnapshotType";
import { z } from "zod";
import { Execution, Game, Player } from "../game/Game";
import { execSnapshotType } from "../snapshot/ExecutionSnapshot";
import type {
  ExecRecord,
  SnapshotReader,
  SnapshotWriter,
} from "../snapshot/SnapshotContext";

/** Stops a land gift. Tiles already handed over still count for relation. */
export class CancelTileDonationExecution implements Execution {
  private active = true;
  private mg: Game | null = null;

  constructor(
    private requestor: Player,
    private donationID: string,
  ) {}

  init(mg: Game, _ticks: number): void {
    this.mg = mg;
  }

  tick(): void {
    const donation = this.requestor
      .outgoingTileDonations()
      .find((entry) => entry.id() === this.donationID);
    donation?.cancel();
    this.active = false;
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }

  snapshot(w: SnapshotWriter): ExecRecord {
    return CancelTileDonationExecutionSnapshot.write({
      active: this.active,
      initialized: this.mg !== null,
      requestor: w.player(this.requestor),
      donationID: this.donationID,
    });
  }

  restoreSnapshot(s: CancelTileDonationState, r: SnapshotReader): void {
    this.active = s.active;
    if (s.initialized) this.mg = r.game;
    this.requestor = r.player(s.requestor);
    this.donationID = s.donationID;
  }
}

const CancelTileDonationStateSchema = z.object({
  active: z.boolean(),
  initialized: z.boolean(),
  requestor: zPlayerRef(),
  donationID: z.string(),
});
type CancelTileDonationState = z.infer<typeof CancelTileDonationStateSchema>;

export const CancelTileDonationExecutionSnapshot = execSnapshotType({
  name: "CancelTileDonation",
  version: 1,
  schema: CancelTileDonationStateSchema,
  cls: () => CancelTileDonationExecution,
});
