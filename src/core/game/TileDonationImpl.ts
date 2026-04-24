import { Player, TerraNullius, Tick, TileDonation } from "./Game";
import { GameImpl } from "./GameImpl";
import { TileRef } from "./GameMap";
import { Donation, PlayerImpl } from "./PlayerImpl";

export class TileDonationImpl extends Donation implements TileDonation {
  private _isActive = true;
  private _borderSize = 0;

  constructor(
    private _id: string,
    public readonly recipient: Player,
    public readonly tick: Tick,
    public readonly sender: Player,
    private _tiles: number,
    private _border: Set<number>,
    private _mg: GameImpl,
  ) {
    super(recipient, tick);
  }

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

  delete() {
    if (this.recipient.isPlayer()) {
      (this.recipient as PlayerImpl)._incomingTileDonations = (
        this.recipient as PlayerImpl
      )._incomingTileDonations.filter((td) => td !== this);
    }

    (this.sender as PlayerImpl)._outgoingTileDonations = (
      this.sender as PlayerImpl
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
