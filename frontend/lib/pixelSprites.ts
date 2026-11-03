// Tiny pixel-art players, shared by the Super Bowl animation and the Play now game.

// 8 pixels wide. h helmet, k skin, j jersey, n numbers, p pants, b boots
const TORSO = ["..hhhh..", ".hhhhhh.", ".hhhhkk.", "..jjjj..", ".jjnnjj.", "jjjnnjjj", ".jjjjjj."];
const LEGS: Record<string, string[]> = {
  stand: ["..pppp..", "..pppp..", "..p..p..", "..b..b.."],
  run1: ["..pppp..", ".pp..pp.", "pp....p.", "b.....b."],
  run2: ["..pppp..", "..pp.pp.", ".pp...pp", ".b....b."],
};
const CHEER = ["j.hhhh.j", "jhhhhhhj", ".hhhhkk.", "..jjjj..", "..jnnj..", "..jnnj..", "..jjjj.."];

export type Pose = "stand" | "run1" | "run2" | "cheer";
export type Sprites = Record<Pose, HTMLCanvasElement>;

function dist(a: string, b: string) {
  const p = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const [r1, g1, b1] = p(a);
  const [r2, g2, b2] = p(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
}

export function buildSprites(primary: string, secondary: string, flip: boolean, skin: string): Sprites {
  const accent = dist(primary, secondary) > 110 ? secondary : "#f8fafc"; // pants and numbers need to stand out from the jersey
  const pal: Record<string, string> = { h: primary, j: primary, k: skin, n: accent, p: accent, b: "#111827" };
  const make = (rows: string[]) => {
    const c = document.createElement("canvas");
    c.width = 8;
    c.height = rows.length;
    const g = c.getContext("2d")!;
    rows.forEach((row, y) =>
      [...row].forEach((ch, x) => {
        if (!pal[ch]) return;
        g.fillStyle = pal[ch];
        g.fillRect(flip ? 7 - x : x, y, 1, 1);
      }),
    );
    return c;
  };
  return {
    stand: make([...TORSO, ...LEGS.stand]),
    run1: make([...TORSO, ...LEGS.run1]),
    run2: make([...TORSO, ...LEGS.run2]),
    cheer: make([...CHEER, ...LEGS.stand]),
  };
}

