import {
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
import { z } from "zod";
import { Execution, Game, Player, TileDonation } from "../game/Game";
import {
  RelationEvent,
  TILE_DONATION_MAX_PERCENT,
  TILE_HEAT_PER_PERCENT,
  TILE_PERMANENT_PER_PERCENT,
} from "../game/RelationMemory";
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
	
	// Sender's land when the gift started. Percentages use this, not the shrinking remainder.
	private tileBasis = 0;
	private initialTiles = 0;

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
		this.tileBasis = Math.min(this.recipient.numTilesOwned(), this.sender.numTilesOwned());
		const maxTiles = Math.floor(this.sender.numTilesOwned() * (TILE_DONATION_MAX_PERCENT / 100));
		this.tiles = Math.floor(Math.max(Math.min(maxTiles, this.tiles), 0));
		this.initialTiles = this.tiles;
		
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
		
		const donated = this.initialTiles - this.tileDonation.tiles();
		const percent = this.tileBasis <= 0 ? 0 : (donated / this.tileBasis) * 100;
		this.tileDonation.setRelationChange(percent * TILE_HEAT_PER_PERCENT);
		if (percent > 0) {
			this.recipient.applyRelation(
				this.sender,
				RelationEvent.GiveTiles,
				percent * TILE_HEAT_PER_PERCENT,
				percent * TILE_PERMANENT_PER_PERCENT,
			);
		}

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
			tileBasis: this.tileBasis,
			initialTiles: this.initialTiles,
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
		this.tileBasis = s.tileBasis;
		this.initialTiles = s.initialTiles;
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
	tileBasis: zNum(),
	initialTiles: zNum(),
});
type DonateTilesState = z.infer<typeof DonateTilesStateSchema>;

export const DonateTilesExecutionSnapshot = execSnapshotType({
	name: "DonateTiles",
	version: 2,
	schema: DonateTilesStateSchema,
	migrations: {
		1: (data) => ({
			...data,
			tileBasis: 0,
			initialTiles: data.tiles ?? 0,
		}),
	},
	cls: () => DonateTilesExecution,
});
