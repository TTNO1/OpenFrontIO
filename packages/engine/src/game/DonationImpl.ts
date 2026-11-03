import { Donation, Player, Tick } from "./Game";

export class DonationImpl implements Donation {

  constructor(
    private _recipient: Player,
    private _sender: Player,
    private _tick: Tick,
    private _amount: number,
    private _type: "troops" | "gold" | "tiles",
    private _relationChange: number | null,
  ) {}
  
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
    return this._amount;
  }
  
  type() {
    return this._type;
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
  
}
