import { PlayerType, UnitType } from "@openfront/engine-api/game/GameTypes";
import { AllianceRejectExecution } from "@openfront/engine/execution/alliance/AllianceRejectExecution";
import { AllianceRequestExecution } from "@openfront/engine/execution/alliance/AllianceRequestExecution";
import { NukeExecution } from "@openfront/engine/execution/NukeExecution";
import { Game, Player } from "@openfront/engine/game/Game";
import { playerInfo, setup } from "./util/Setup";
import { constructionExecution } from "./util/utils";

let game: Game;
let player1: Player;
let player2: Player;

describe("AllianceRequestExecution", () => {
  beforeEach(async () => {
    game = await setup(
      "plains",
      { infiniteGold: true, instantBuild: true, infiniteTroops: true },
      [
        playerInfo("player1", PlayerType.Human),
        playerInfo("player2", PlayerType.Human),
        playerInfo("player3", PlayerType.Nation),
      ],
    );

    player1 = game.player("player1");
    player1.conquer(game.ref(0, 0));

    player2 = game.player("player2");
    player2.conquer(game.ref(0, 1));
  });

  test("Can create alliance by counter-request", () => {
    game.addExecution(new AllianceRequestExecution(player1, player2.id()));
    game.executeNextTick();

    game.addExecution(new AllianceRequestExecution(player2, player1.id()));
    game.executeNextTick();

    expect(player1.isAlliedWith(player2)).toBeTruthy();
    expect(player2.isAlliedWith(player1)).toBeTruthy();
    expect(player1.relationValue(player2)).toBe(50);
    expect(player2.relationValue(player1)).toBe(50);
  });

  test("Accepting a one-sided request sets both opinions", () => {
    const request = player1.createAllianceRequest(player2);
    expect(request).not.toBeNull();
    request!.accept();

    expect(player1.isAlliedWith(player2)).toBeTruthy();
    expect(player1.relationValue(player2)).toBe(50);
    expect(player2.relationValue(player1)).toBe(50);
    expect(player2.playerProfile().relationValues?.[player1.smallID()]).toBe(
      50,
    );
  });

  test("Ending an alliance cancels the bonus and reforming restores it", () => {
    player1.createAllianceRequest(player2)!.accept();
    expect(player2.relationValue(player1)).toBe(50);

    player1.breakAlliance(player1.allianceWith(player2)!);
    expect(player1.relationValue(player2)).toBe(0);
    expect(player2.relationValue(player1)).toBe(0);

    player1.createAllianceRequest(player2)!.accept();
    expect(player1.relationValue(player2)).toBe(50);
    expect(player2.relationValue(player1)).toBe(50);
  });

  test("Ending a vassalage clears the garrison score", () => {
    const empire = player1;
    const vassal = player2;
    empire.createVassalageRequest(vassal)!.accept();
    empire.addTroops(100_000);
    expect(empire.commitTroopsToVassal(vassal, 50_000)).toBeGreaterThan(0);
    expect(vassal.relationValue(empire)).not.toBe(0);

    vassal.breakVassalage(vassal.vassalageWith(empire)!);
    expect(vassal.relationValue(empire)).toBe(0);
  });

  test("Can reject alliance request", () => {
    game.addExecution(new AllianceRequestExecution(player1, player2.id()));
    game.executeNextTick();

    game.addExecution(new AllianceRejectExecution(player1.id(), player2));
    game.executeNextTick();

    expect(player1.isAlliedWith(player2)).toBeFalsy();
    expect(player2.isAlliedWith(player1)).toBeFalsy();
    expect(player1.outgoingAllianceRequests().length).toBe(0);
  });

  test("Alliance request expires", () => {
    game.config().allianceRequestDuration = () => 5;
    game.addExecution(new AllianceRequestExecution(player1, player2.id()));
    game.executeNextTick();

    expect(player1.outgoingAllianceRequests().length).toBe(1);

    for (let i = 0; i < 6; i++) {
      game.executeNextTick();
    }

    expect(player1.outgoingAllianceRequests().length).toBe(0);
    expect(player1.isAlliedWith(player2)).toBeFalsy();
    expect(player2.isAlliedWith(player1)).toBeFalsy();
  });

  // Resolves exploit https://github.com/openfrontio/OpenFrontIO/issues/2071
  test("alliance request is revoked immediately if requester launches a nuke", () => {
    game.config().nukeAllianceBreakThreshold = () => 0;
    // Player 1 sends an alliance request to player 2.
    game.addExecution(new AllianceRequestExecution(player1, player2.id()));
    game.executeNextTick();

    expect(player1.outgoingAllianceRequests().length).toBe(1);
    expect(player2.incomingAllianceRequests().length).toBe(1);

    // Player 1 Builds a silo & launches a missile at player 2.
    constructionExecution(game, player1, 0, 0, UnitType.MissileSilo);
    game.addExecution(
      new NukeExecution(UnitType.AtomBomb, player1, game.ref(0, 1), null),
    );
    game.executeNextTick();
    game.executeNextTick();

    expect(player1.outgoingAllianceRequests().length).toBe(0);
    expect(player2.incomingAllianceRequests().length).toBe(0);
    expect(player1.isAlliedWith(player2)).toBeFalsy();
    expect(player2.isAlliedWith(player1)).toBeFalsy();
  });
});
