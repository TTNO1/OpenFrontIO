import { PlayerType } from "@openfront/engine-api/game/GameTypes";
import { AttackExecution } from "@openfront/engine/execution/AttackExecution";
import { playerInfo, setup } from "./util/Setup";

test("an empire attacks across a vassal border and the tick returns", async () => {
  const game = await setup(
    "plains",
    { infiniteTroops: true, spawnImmunityDuration: 0 },
    [
      playerInfo("empire", PlayerType.Human),
      playerInfo("vassal", PlayerType.Human),
      playerInfo("defender", PlayerType.Human),
    ],
  );
  const empire = game.player("empire");
  const vassal = game.player("vassal");
  const defender = game.player("defender");
  // Empire does not touch the defender. The vassal sits between them.
  empire.conquer(game.ref(0, 0));
  vassal.conquer(game.ref(0, 1));
  defender.conquer(game.ref(0, 2));
  empire.createVassalageRequest(vassal)!.accept();
  empire.addTroops(10_000);

  game.addExecution(new AttackExecution(5_000, empire, defender.id()));
  for (let i = 0; i < 40; i++) {
    game.executeNextTick();
  }

  expect(defender.numTilesOwned()).toBe(0);
});
