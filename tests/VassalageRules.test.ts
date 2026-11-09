import { PlayerType } from "@openfront/engine-api/game/GameTypes";
import { GameUpdateType } from "@openfront/engine-api/game/GameUpdates";
import { PseudoRandom } from "@openfront/engine-lib/PseudoRandom";
import { AllianceExtensionExecution } from "@openfront/engine/execution/alliance/AllianceExtensionExecution";
import { AttackExecution } from "@openfront/engine/execution/AttackExecution";
import { CommitTroopsExecution } from "@openfront/engine/execution/CommitTroopsExecution";
import { NationAttackBehavior } from "@openfront/engine/execution/nation/NationAttackBehavior";
import { RelationEvent } from "@openfront/engine/game/RelationMemory";
import { playerInfo, setup } from "./util/Setup";

const config = { infiniteTroops: true, spawnImmunityDuration: 0 };

test("the garrison opinion is written as soon as the vassalage forms", async () => {
  const game = await setup("plains", config, [
    playerInfo("empire", PlayerType.Human),
    playerInfo("vassal", PlayerType.Human),
  ]);
  const empire = game.player("empire");
  const vassal = game.player("vassal");
  empire.conquer(game.ref(0, 0));
  vassal.conquer(game.ref(0, 1));

  empire.createVassalageRequest(vassal)!.accept();

  expect(vassal.relationValue(empire)).toBe(-200);
});

test("a vassal cannot open or renew an alliance", async () => {
  const game = await setup("plains", config, [
    playerInfo("empire", PlayerType.Human),
    playerInfo("vassal", PlayerType.Human),
    playerInfo("friend", PlayerType.Human),
    playerInfo("stranger", PlayerType.Human),
  ]);
  const empire = game.player("empire");
  const vassal = game.player("vassal");
  const friend = game.player("friend");
  const stranger = game.player("stranger");
  vassal.createAllianceRequest(friend)!.accept();
  empire.createVassalageRequest(vassal)!.accept();

  expect(vassal.isAlliedWith(friend)).toBe(true);
  expect(vassal.canSendAllianceRequest(stranger)).toBe(false);
  expect(stranger.canSendAllianceRequest(vassal)).toBe(false);
  expect(vassal.createAllianceRequest(stranger)).toBeNull();

  game.addExecution(new AllianceExtensionExecution(vassal, friend.id()));
  game.executeNextTick();
  expect(vassal.allianceWith(friend)!.agreedToExtend(vassal)).toBe(false);
});

test("a full garrison refuses more troops and says so", async () => {
  const game = await setup("plains", config, [
    playerInfo("empire", PlayerType.Human),
    playerInfo("vassal", PlayerType.Human),
  ]);
  const empire = game.player("empire");
  const vassal = game.player("vassal");
  empire.conquer(game.ref(0, 0));
  vassal.conquer(game.ref(0, 1));
  empire.createVassalageRequest(vassal)!.accept();
  const half = Math.floor(game.config().maxTroops(empire) / 2);
  empire.addTroops(half);
  game.addExecution(new CommitTroopsExecution(empire, vassal.id(), half));
  game.executeNextTick();
  const sent = game.executeNextTick();
  expect(vassal.absorption()).toBe(half);
  expect(
    sent[GameUpdateType.DisplayEvent].some(
      (update) => update.message === "events_display.sent_garrison_to_player",
    ),
  ).toBe(true);

  empire.addTroops(100);
  game.addExecution(new CommitTroopsExecution(empire, vassal.id(), 100));
  game.executeNextTick();
  const full = game.executeNextTick();
  expect(vassal.absorption()).toBe(half);
  expect(
    full[GameUpdateType.DisplayEvent].some(
      (update) => update.message === "events_display.garrison_full",
    ),
  ).toBe(true);
});

test("an ally can be asked to become a vassal or an empire", async () => {
  const game = await setup("plains", config, [
    playerInfo("a", PlayerType.Human),
    playerInfo("b", PlayerType.Human),
  ]);
  const a = game.player("a");
  const b = game.player("b");
  a.conquer(game.ref(0, 0));
  b.conquer(game.ref(0, 1));
  a.createAllianceRequest(b)!.accept();

  expect(a.isAlliedWith(b)).toBe(true);
  expect(a.canSendVassalageRequest(b)).toBe(true);
  expect(b.canSendSelfVassalageRequest(a)).toBe(true);
  expect(a.createVassalageRequest(b)).not.toBeNull();
});

test("a vassal's vassals move to the new empire, and a vassal cannot attack", async () => {
  const game = await setup("plains", config, [
    playerInfo("empire", PlayerType.Human),
    playerInfo("middle", PlayerType.Nation),
    playerInfo("sub", PlayerType.Nation),
    playerInfo("stranger", PlayerType.Human),
    playerInfo("weak", PlayerType.Nation),
  ]);
  const empire = game.player("empire");
  const middle = game.player("middle");
  const sub = game.player("sub");
  const stranger = game.player("stranger");
  empire.conquer(game.ref(0, 0));
  middle.conquer(game.ref(0, 1));
  sub.conquer(game.ref(0, 2));
  stranger.conquer(game.ref(0, 3));
  middle.createVassalageRequest(sub)!.accept();
  empire.createVassalageRequest(middle)!.accept();

  expect(middle.empire()).toBe(empire);
  expect(sub.empire()).toBe(empire);
  expect(middle.vassals()).toHaveLength(0);
  expect(middle.canAttackPlayer(sub)).toBe(false);
  const weak = game.player("weak");
  middle.addTroops((weak.outgoingTroops() + weak.troops()) * 20);
  expect(middle.canAttackPlayer(weak)).toBe(true);
  expect(middle.canAttackPlayer(sub)).toBe(false);
  expect(middle.canSendVassalageRequest(stranger)).toBe(false);
  let open: number | null = null;
  for (const neighbor of game.neighbors(game.ref(0, 1))) {
    if (game.isLand(neighbor) && !game.hasOwner(neighbor)) {
      open = neighbor;
      break;
    }
  }
  expect(open).not.toBeNull();
  expect(middle.canAttack(open!)).toBe(true);
});

test("a garrison wipes an incoming attack before any land is lost", async () => {
  const game = await setup("plains", config, [
    playerInfo("empire", PlayerType.Human),
    playerInfo("vassal", PlayerType.Human),
    playerInfo("attacker", PlayerType.Human),
  ]);
  const empire = game.player("empire");
  const vassal = game.player("vassal");
  const attacker = game.player("attacker");
  empire.conquer(game.ref(0, 0));
  vassal.conquer(game.ref(0, 1));
  attacker.conquer(game.ref(0, 2));
  empire.createVassalageRequest(vassal)!.accept();
  empire.addTroops(20_000);
  const given = empire.commitTroopsToVassal(vassal, 8_000);
  expect(given).toBeGreaterThanOrEqual(4_000);
  attacker.addTroops(10_000);

  game.addExecution(new AttackExecution(3_000, attacker, vassal.id()));
  for (let i = 0; i < 15; i++) game.executeNextTick();
  expect(vassal.numTilesOwned()).toBe(1);
  expect(vassal.absorption()).toBe(given - 3_000);

  game.addExecution(new AttackExecution(given, attacker, vassal.id()));
  for (let i = 0; i < 25; i++) game.executeNextTick();
  expect(vassal.numTilesOwned()).toBe(0);
});

test("an empire cannot attack a vassal's ally through that vassal", async () => {
  const game = await setup("plains", config, [
    playerInfo("empire", PlayerType.Human),
    playerInfo("vassal", PlayerType.Human),
    playerInfo("ally", PlayerType.Human),
  ]);
  const empire = game.player("empire");
  const vassal = game.player("vassal");
  const ally = game.player("ally");
  const allyTile = game.ref(0, 2);
  empire.conquer(game.ref(0, 0));
  vassal.conquer(game.ref(0, 1));
  ally.conquer(allyTile);
  vassal.createAllianceRequest(ally)!.accept();
  empire.createVassalageRequest(vassal)!.accept();
  empire.addTroops(10_000);

  expect(empire.canAttack(allyTile)).toBe(false);
  game.addExecution(new AttackExecution(5_000, empire, ally.id()));
  for (let i = 0; i < 20; i++) game.executeNextTick();
  expect(ally.numTilesOwned()).toBe(1);
});

test("a nation does not attack another nation it rates at 300 or more", async () => {
  const game = await setup("plains", config, [
    playerInfo("nation", PlayerType.Nation),
    playerInfo("other", PlayerType.Nation),
  ]);
  const nation = game.player("nation");
  const other = game.player("other");
  nation.conquer(game.ref(0, 0));
  other.conquer(game.ref(0, 1));
  nation.addTroops(10_000);
  const behavior = new NationAttackBehavior(
    new PseudoRandom(1),
    game,
    nation,
    0,
    0,
    0,
    {} as never,
    { maybeSendAttackEmoji: () => {}, sendEmoji: () => {} } as never,
    {} as never,
  );

  expect(behavior.sendAttack(other)).toBe(true);
  nation.setRelationHeat(other, RelationEvent.CommittedTroops, 300);
  expect(behavior.sendAttack(other)).toBe(false);
  nation.setRelationHeat(other, RelationEvent.CommittedTroops, 299);
  expect(behavior.sendAttack(other)).toBe(true);
});

test("attacking a tribe does not grant enemy-of-enemy opinion", async () => {
  const game = await setup("plains", config, [
    playerInfo("attacker", PlayerType.Human),
    playerInfo("tribe", PlayerType.Bot),
    playerInfo("nation", PlayerType.Nation),
    playerInfo("enemy", PlayerType.Nation),
  ]);
  const attacker = game.player("attacker");
  const tribe = game.player("tribe");
  const nation = game.player("nation");
  const enemy = game.player("enemy");
  attacker.conquer(game.ref(0, 0));
  tribe.conquer(game.ref(0, 1));
  attacker.conquer(game.ref(1, 0));
  enemy.conquer(game.ref(1, 1));
  attacker.addTroops(5_000);
  // The nation was hit by the tribe. Attacking that tribe is not a favor.
  tribe.createAttack(nation, 1, null, new Set());
  game.addExecution(new AttackExecution(1_000, attacker, tribe.id()));
  game.executeNextTick();
  expect(nation.relationValue(attacker)).toBe(0);

  // The same nation does gain the bonus when the shared enemy is a nation.
  enemy.createAttack(nation, 1, null, new Set());
  game.addExecution(new AttackExecution(1_000, attacker, enemy.id()));
  game.executeNextTick();
  expect(nation.relationValue(attacker)).toBeGreaterThan(0);
});
