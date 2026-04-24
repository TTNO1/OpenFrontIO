import { VassalageRequest, Player, Tick } from "./Game";
import { GameImpl } from "./GameImpl";
import { AllianceRequestUpdate, GameUpdateType, VassalageRequestUpdate } from "./GameUpdates";

export class VassalageRequestImpl implements VassalageRequest {
  private status_: "pending" | "accepted" | "rejected" = "pending";

  constructor(
    private requestor_: Player,
    private recipient_: Player,
    private vassal_: Player,
    private empire_: Player,
    private tickCreated: number,
    private game: GameImpl,
  ) {}

  status(): "pending" | "accepted" | "rejected" {
    return this.status_;
  }

  requestor(): Player {
    return this.requestor_;
  }

  recipient(): Player {
    return this.recipient_;
  }
  
  vassal(): Player {
    return this.vassal_;
  }
  
  empire(): Player {
    return this.empire_;
  }

  createdAt(): Tick {
    return this.tickCreated;
  }

  accept(): void {
    this.status_ = "accepted";
    this.game.acceptVassalageRequest(this);
  }
  reject(): void {
    this.status_ = "rejected";
    this.game.rejectVassalageRequest(this);
  }

  toUpdate(): VassalageRequestUpdate {
    return {
      type: GameUpdateType.VassalageRequest,
      requestorID: this.requestor_.smallID(),
      recipientID: this.recipient_.smallID(),
      vassalID: this.vassal_.smallID(),
      empireID: this.empire_.smallID(),
      createdAt: this.tickCreated,
    };
  }
}
