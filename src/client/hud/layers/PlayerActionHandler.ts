import { TileRef } from "@openfront/engine-api/game/GameMap";
import { EventBus } from "@openfront/shared/EventBus";
import {
  SendAllianceExtensionIntentEvent,
  SendAllianceRequestIntentEvent,
  SendAttackIntentEvent,
  SendBoatAttackIntentEvent,
  SendBreakAllianceIntentEvent,
  SendDeleteUnitIntentEvent,
  SendDonateGoldIntentEvent,
  SendDonateTilesIntentEvent,
  SendDonateTroopsIntentEvent,
  SendEmbargoIntentEvent,
  SendEmojiIntentEvent,
  SendSpawnIntentEvent,
  SendTargetPlayerIntentEvent,
  SendVassalageRequestIntentEvent,
  SendCommitTroopsIntentEvent,
} from "../../Transport";
import { UIState } from "../../UIState";
import { PlayerView } from "../../view";

export class PlayerActionHandler {
  constructor(
    private eventBus: EventBus,
    private uiState: UIState,
  ) {}

  handleAttack(player: PlayerView, targetId: string | null) {
    this.eventBus.emit(
      new SendAttackIntentEvent(
        targetId,
        this.uiState.attackRatio * player.troops(),
      ),
    );
  }

  handleBoatAttack(player: PlayerView, targetTile: TileRef) {
    this.eventBus.emit(
      new SendBoatAttackIntentEvent(
        targetTile,
        this.uiState.attackRatio * player.troops(),
      ),
    );
  }

  async findBestTransportShipSpawn(
    player: PlayerView,
    tile: TileRef,
  ): Promise<TileRef | false> {
    return await player.bestTransportShipSpawn(tile);
  }

  handleSpawn(tile: TileRef) {
    this.eventBus.emit(new SendSpawnIntentEvent(tile));
  }

  handleAllianceRequest(player: PlayerView, recipient: PlayerView) {
    this.eventBus.emit(new SendAllianceRequestIntentEvent(player, recipient));
  }

  handleExtendAlliance(recipient: PlayerView) {
    this.eventBus.emit(new SendAllianceExtensionIntentEvent(recipient));
  }

  handleBreakAlliance(player: PlayerView, recipient: PlayerView) {
    this.eventBus.emit(new SendBreakAllianceIntentEvent(player, recipient));
  }

  handleVassalageRequest(recipient: PlayerView, asEmpire: boolean) {
    this.eventBus.emit(
      new SendVassalageRequestIntentEvent(recipient, asEmpire),
    );
  }

  handleTargetPlayer(targetId: string | null) {
    if (!targetId) return;

    this.eventBus.emit(new SendTargetPlayerIntentEvent(targetId));
  }

  handleDonateGold(recipient: PlayerView) {
    this.eventBus.emit(new SendDonateGoldIntentEvent(recipient, null));
  }

  handleDonateTroops(recipient: PlayerView, troops?: number) {
    const amount = troops ?? null;
    if (amount !== null && amount <= 0) {
      return;
    }
    this.eventBus.emit(new SendDonateTroopsIntentEvent(recipient, amount));
  }

  handleCommitTroops(recipient: PlayerView, troops: number) {
    if (troops <= 0) return;
    this.eventBus.emit(new SendCommitTroopsIntentEvent(recipient, troops));
  }
  
  handleDonateTiles(recipient: PlayerView, tiles?: number) {
    const amount = tiles ?? null;
    if (amount !== null && amount <= 0) {
      return;
    }
    this.eventBus.emit(new SendDonateTilesIntentEvent(recipient, amount));
  }

  handleEmbargo(recipient: PlayerView, action: "start" | "stop") {
    this.eventBus.emit(new SendEmbargoIntentEvent(recipient, action));
  }

  handleEmoji(targetPlayer: PlayerView | "AllPlayers", emojiIndex: number) {
    this.eventBus.emit(new SendEmojiIntentEvent(targetPlayer, emojiIndex));
  }

  handleDeleteUnit(unitId: number) {
    this.eventBus.emit(new SendDeleteUnitIntentEvent(unitId));
  }
}
