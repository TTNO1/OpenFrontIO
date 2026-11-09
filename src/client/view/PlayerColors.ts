/**
 * A player's territory and border colours. PlayerView uses this for live
 * players and the replay viewer (ReplayPalette) for a replay's, so both
 * draw a player the same way.
 */

import type { Team } from "@openfront/engine-api/game/GameTypes";
import type { PlayerCosmetics } from "@openfront/shared/WireSchemas";
import { Colord, colord, RgbaColor } from "colord";
import type { Theme } from "../theme/ThemeProvider";

/**
 * The theme's colours unless a colour or pattern cosmetic overrides them.
 * In team games the territory keeps the team colour. `themed` is the
 * theme's territory colour for the player (Theme.territoryColor), and
 * `focused` whether they're the local player, whose border stands out.
 */
export function resolvePlayerColors(
  theme: Pick<Theme, "borderColor" | "focusedBorderColor">,
  themed: Colord,
  cosmetics: PlayerCosmetics,
  team: Team | null,
  focused: boolean,
): { territory: Colord; border: Colord } {
  const themedBorder = theme.borderColor(themed);
  // A pattern without a palette of its own is drawn in the theme's colours.
  const palette = cosmetics.pattern
    ? (cosmetics.pattern.colorPalette ?? {
        primaryColor: themed.toHex(),
        secondaryColor: themedBorder.toHex(),
      })
    : undefined;
  const territory =
    team === null
      ? colord(
          cosmetics.color?.color ?? palette?.primaryColor ?? themed.toHex(),
        )
      : themed;
  const border = colord(
    palette?.secondaryColor ??
      cosmetics.color?.color ??
      (focused ? theme.focusedBorderColor() : themedBorder).toHex(),
  );
  return { territory, border };
}

export function gammaMix(color1: Colord, color2: Colord, weight1: number): Colord {
  const rgba1 = color1.rgba;
  const rgba2 = color2.rgba;
  const weight2 = 1 - weight1;
  const newR = Math.sqrt((rgba1.r**2) * weight1 + (rgba2.r**2) * weight2);
  const newG = Math.sqrt((rgba1.g**2) * weight1 + (rgba2.g**2) * weight2);
  const newB = Math.sqrt((rgba1.b**2) * weight1 + (rgba2.b**2) * weight2);
  const newA = rgba1.a * weight1 + rgba2.a**2 * weight2;
  return new Colord({r: newR, g: newG, b: newB, a: newA});
}
