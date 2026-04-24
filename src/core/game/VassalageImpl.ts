import { Game, Vassalage, Player, Tick } from "./Game";
import { GameUpdateType } from "./GameUpdates";

export class VassalageImpl implements Vassalage {

  constructor(
    private readonly mg: Game,
    readonly requestor_: Player,
    readonly recipient_: Player,
    readonly vassal_: Player,
    readonly empire_: Player,
    private readonly createdAt_: Tick,
    private readonly id_: number,
  ) {}

  other(player: Player): Player {
    if (this.requestor_ === player) {
      return this.recipient_;
    }
    return this.requestor_;
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
    return this.createdAt_;
  }

  public id(): number {
    return this.id_;
  }
  
}
