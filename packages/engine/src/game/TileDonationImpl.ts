import { TileRef } from "@openfront/engine-api/game/GameMap";
import { Player, Tick, TileDonation } from "./Game";
import { GameImpl } from "./GameImpl";
import { PlayerImpl } from "./PlayerImpl";

export class TileDonationImpl implements TileDonation {
  private _isActive = true;
  private _borderSize = 0;

  constructor(
    private _id: string,
    private _recipient: Player,
    private _sender: Player,
    private _tick: Tick,
    private _tiles: number,
    private _border: Set<number>,
    private _relationChange: number | null,
    private _mg: GameImpl,
  ) {}

  tiles(): number {
    return this._tiles;
  }
  setTiles(tiles: number) {
    this._tiles = Math.max(0, tiles);
  }

  isActive() {
    return this._isActive;
  }

  id() {
    return this._id;
  }
  
  sender() {
    return this._sender;
  }
  
  recipient() {
    return this._recipient;
  }
  
  tick() {
    return this._tick;
  }
  
  amount() {
    return this.tiles();
  }
  
  type(): "tiles" {
    return "tiles";
  }
  
  relationChange() {
    return this._relationChange;
  }
  
  setRelationChange(value: number) {
    this._relationChange = value;
  }
  
  addRelationChange(value: number) {
    this._relationChange = (this._relationChange ?? 0) + value;
  }

  delete() {
    if (this._recipient.isPlayer()) {
      (this._recipient as PlayerImpl)._incomingTileDonations = (
        this._recipient as PlayerImpl
      )._incomingTileDonations.filter((td) => td !== this);
    }

    (this._sender as PlayerImpl)._outgoingTileDonations = (
      this._sender as PlayerImpl
    )._outgoingTileDonations.filter((td) => td !== this);

    this._isActive = false;
  }

  cancel() {
    this._isActive = false;
  }

  borderSize(): number {
    return this._borderSize;
  }

  clearBorder(): void {
    this._borderSize = 0;
    this._border.clear();
  }

  addBorderTile(tile: TileRef): void {
    if (!this._border.has(tile)) {
      this._borderSize += 1;
      this._border.add(tile);
    }
  }

  removeBorderTile(tile: TileRef): void {
    if (this._border.has(tile)) {
      this._borderSize -= 1;
      this._border.delete(tile);
    }
  }

}
