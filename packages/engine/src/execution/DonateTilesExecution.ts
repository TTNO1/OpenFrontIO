import {
  Difficulty,
  PlayerID,
  PlayerType,
  TerrainType,
} from "@openfront/engine-api/game/GameTypes";
import { TileRef } from "@openfront/engine-api/game/GameMap";
import { PseudoRandom } from "@openfront/engine-lib/PseudoRandom";
import {
  zInt,
  zNum,
  zPlayerRef,
  zRandom,
  zTiles,
} from "@openfront/engine-lib/snapshot/SnapshotType";
import { assertNever } from "@openfront/engine-lib/Util";
import { z } from "zod";
import { Execution, Game, Player, TileDonation } from "../game/Game";
import { execSnapshotType } from "../snapshot/ExecutionSnapshot";
import type {
  ExecRecord,
  SnapshotReader,
  SnapshotWriter,
} from "../snapshot/SnapshotContext";
import { FlatBinaryHeap } from "./utils/FlatBinaryHeap";

export class DonateTilesExecution implements Execution {
	private recipient: Player;
	private toDonate = new FlatBinaryHeap();
	
	private tileDonation: TileDonation | null = null;
	
	private random: PseudoRandom;
	private mg: Game;

	private active = true;
	
	//The change in relation per proportion of a weighted total of tiles given
	private relationPerPortionOfTiles: number;
	//The weight applied to the sender's tile count to calculate weighted total
	private totalTilesSenderWeight: number;
	
	private totalWeightedTiles: number;

	constructor(
		private sender: Player,
		private recipientID: PlayerID,
		private tiles: number | null,
	) {}

	init(mg: Game, ticks: number): void {
		this.mg = mg;
		this.random = new PseudoRandom(mg.ticks());

		if (!mg.hasPlayer(this.recipientID)) {
			console.warn(
				`DonateTilesExecution recipient ${this.recipientID} not found`,
			);
			this.active = false;
			return;
		}

		this.recipient = mg.player(this.recipientID);
		this.tiles ??= mg.config().defaultDonationTilesAmount(this.sender);
		this.tiles = Math.floor(Math.max(Math.min(this.sender.numTilesOwned(), this.tiles), 0));
		
		if (this.sender === this.recipient) {
			console.error(`Player ${this.sender} cannot donate tiles to itself`);
			this.active = false;
			return;
		}

		if (!this.sender.canDonateTiles(this.recipient)) {
			console.warn(`cannot send tiles from ${this.sender} to ${this.recipient}`);
			this.active = false;
			return;
		}
		
		this.tileDonation = this.sender.createTileDonation(
			this.recipient,
			this.tiles,
			new Set<TileRef>(),
		);

		this.refreshToDonate();

		for (const incoming of this.sender.incomingTileDonations()) {
			if (incoming.sender() === this.recipient) {
				// Recipient has opposing donation, cancel them out
				if (incoming.tiles() > this.tileDonation.tiles()) {
					incoming.setTiles(incoming.tiles() - this.tileDonation.tiles());
					this.tileDonation.delete();
					this.active = false;
					return;
				} else {
					this.tileDonation.setTiles(this.tileDonation.tiles() - incoming.tiles());
					incoming.delete();
				}
			}
		}
		
		for (const outgoing of this.sender.outgoingTileDonations()) {
			if (
				outgoing !== this.tileDonation &&
				outgoing.recipient() === this.tileDonation.recipient()
			) {
				this.tileDonation.setTiles(this.tileDonation.tiles() + outgoing.tiles());
				outgoing.delete();
			}
		}

		const difficulty = this.mg.config().gameConfig().difficulty;
		switch (difficulty) {
			case Difficulty.Easy:
				//+250 per 50%
				this.relationPerPortionOfTiles = 250/.5;
				this.totalTilesSenderWeight = 0.9;
				break;
			case Difficulty.Medium:
				//+200 per 50%
				this.relationPerPortionOfTiles = 200/.5;
				this.totalTilesSenderWeight = 0.7;
				break;
			case Difficulty.Hard:
				//+150 per 50%
				this.relationPerPortionOfTiles = 150/.5;
				this.totalTilesSenderWeight = 0.5;
				break;
			case Difficulty.Impossible:
				//+100 per 50%
				this.relationPerPortionOfTiles = 100/.5;
				this.totalTilesSenderWeight = 0.3;
				break;
			default:
				assertNever(difficulty);
		}
		
		this.totalWeightedTiles = (this.sender.numTilesOwned() * this.totalTilesSenderWeight) + (this.recipient.numTilesOwned() * (1 - this.totalTilesSenderWeight));
		
	}

	tick(ticks: number): void {
		if (this.tileDonation === null) {
			throw new Error("Tile Donation not initialized");
		}
		let tileCount = this.tileDonation.tiles(); // cache tile count
	
		if (!this.tileDonation.isActive() || !this.sender.isAlive()) {
			this.tileDonation.delete();
			this.active = false;
			this.updateRelation();
			return;
		}
		
		let numTilesPerTick = Math.ceil(this.tileDonation.borderSize() / 5);
	
		while (numTilesPerTick > 0) {
			if (tileCount < 1) {
				this.tileDonation.delete();
				this.active = false;
				this.updateRelation();
				return;
			}
	
			if (this.toDonate.size() === 0) {
				this.refreshToDonate();
				if (this.toDonate.size() === 0) {
					this.tileDonation.delete();
					this.active = false;
					this.updateRelation();
					return;
				}
			}
	
			const tileToDonate = this.toDonate.dequeue();
			this.tileDonation.removeBorderTile(tileToDonate);
	
			let onBorder = false;
			for (const n of this.mg.neighbors(tileToDonate)) {
				if (this.mg.owner(n) === this.recipient) {
					onBorder = true;
					break;
				}
			}
			if (this.mg.owner(tileToDonate) !== this.sender || !onBorder) {
				continue;
			}
			
			this.addNeighbors(tileToDonate);
			
			numTilesPerTick -= 1;
			tileCount -= 1;
			this.tileDonation.setTiles(tileCount);
			this.recipient.conquer(tileToDonate);
			//this.handleDeadDefender(); TODO transfer gold when die?
		}
		
	}
	
	private updateRelation() {
		if (this.tileDonation === null) {
			throw new Error("Tile Donation not initialized");
		}
		
		const relationUpdate = this.relationPerPortionOfTiles * (((this.tiles as number) - this.tileDonation.tiles()) / this.totalWeightedTiles);
		this.tileDonation.setRelationChange(relationUpdate);
		this.recipient.updateRelation(this.sender, relationUpdate);

		// Only AI nations auto-respond with emojis, human players should not
		if (
			this.recipient.type() === PlayerType.Nation &&
			this.recipient.canSendEmoji(this.sender)
		) {//TODO advanced emoji response
			/*this.mg.addExecution(
				new EmojiExecution(
					this.recipient,
					this.sender.id(),
					this.random.randElement(
						relationUpdate >=  ? EMOJI_LOVE : EMOJI_DONATION_TOO_SMALL,
					),
				),
			);*/
		}
	}
	
	private refreshToDonate() {
		if (this.tileDonation === null) {
			throw new Error("Tile Donation not initialized");
		}

		this.toDonate.clear();
		this.tileDonation.clearBorder();
		for (const tile of this.recipient.borderTiles()) {
			this.addNeighbors(tile);
		}
	}
	
	private addNeighbors(tile: TileRef) {
		if (this.tileDonation === null) {
			throw new Error("Tile Donation not initialized");
		}

		const tickNow = this.mg.ticks(); // cache tick

		for (const neighbor of this.mg.neighbors(tile)) {
			if (
				this.mg.isWater(neighbor) ||
				this.mg.owner(neighbor) !== this.sender
			) {
				continue;
			}
			this.tileDonation.addBorderTile(neighbor);
			let numOwnedByRecipient = 0;
			for (const n of this.mg.neighbors(neighbor)) {
				if (this.mg.owner(n) === this.recipient) {
					numOwnedByRecipient++;
				}
			}

			let mag = 0;
			switch (this.mg.terrainType(neighbor)) {
				case TerrainType.Plains:
					mag = 1;
					break;
				case TerrainType.Highland:
					mag = 1.5;
					break;
				case TerrainType.Mountain:
					mag = 2;
					break;
			}

			const priority =
				(this.random.nextInt(0, 5) + 10) * (1 - numOwnedByRecipient * 0.5 + mag / 2) + tickNow;

			this.toDonate.enqueue(neighbor, priority);
		}
	}

	isActive(): boolean {
		return this.active;
	}

	activeDuringSpawnPhase(): boolean {
		return false;
	}

	snapshot(w: SnapshotWriter): ExecRecord {
		return DonateTilesExecutionSnapshot.write({
			active: this.active,
			initialized: this.mg !== undefined,
			toDonate: this.toDonate.getState(),
			random: this.random === undefined ? null : w.random(this.random),
			recipient:
				this.recipient === undefined ? null : w.player(this.recipient),
			tileDonationId: this.tileDonation?.id() ?? null,
			sender: w.player(this.sender),
			recipientID: this.recipientID,
			tiles: this.tiles,
			relationPerPortionOfTiles: this.relationPerPortionOfTiles ?? null,
			totalTilesSenderWeight: this.totalTilesSenderWeight ?? null,
			totalWeightedTiles: this.totalWeightedTiles ?? null,
		});
	}

	restoreSnapshot(s: DonateTilesState, r: SnapshotReader): void {
		this.active = s.active;
		this.toDonate = FlatBinaryHeap.fromState(s.toDonate);
		if (s.initialized) this.mg = r.game;
		if (s.random !== null) this.random = r.random(s.random);
		this.sender = r.player(s.sender);
		this.recipientID = s.recipientID;
		if (s.recipient !== null) this.recipient = r.player(s.recipient);
		this.tiles = s.tiles;
		if (s.relationPerPortionOfTiles !== null) {
			this.relationPerPortionOfTiles = s.relationPerPortionOfTiles;
		}
		if (s.totalTilesSenderWeight !== null) {
			this.totalTilesSenderWeight = s.totalTilesSenderWeight;
		}
		if (s.totalWeightedTiles !== null) {
			this.totalWeightedTiles = s.totalWeightedTiles;
		}
		this.tileDonation = null;
		if (s.tileDonationId !== null && this.sender !== undefined) {
			this.tileDonation =
				this.sender
					.outgoingTileDonations()
					.find((donation) => donation.id() === s.tileDonationId) ?? null;
			if (this.tileDonation === null) this.active = false;
		}
	}
}

const DonateTilesStateSchema = z.object({
	active: z.boolean(),
	initialized: z.boolean(),
	toDonate: z.object({
		pri: z.custom<Float32Array>(
			(v) => v instanceof Float32Array,
			"expected float32s",
		),
		tiles: zTiles(),
		capacity: zInt(),
	}),
	random: zRandom().nullable(),
	recipient: zPlayerRef().nullable(),
	tileDonationId: z.string().nullable(),
	sender: zPlayerRef(),
	recipientID: z.string(),
	tiles: zNum().nullable(),
	relationPerPortionOfTiles: zNum().nullable(),
	totalTilesSenderWeight: zNum().nullable(),
	totalWeightedTiles: zNum().nullable(),
});
type DonateTilesState = z.infer<typeof DonateTilesStateSchema>;

export const DonateTilesExecutionSnapshot = execSnapshotType({
	name: "DonateTiles",
	version: 1,
	schema: DonateTilesStateSchema,
	cls: () => DonateTilesExecution,
});
