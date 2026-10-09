// MA-4f (tests only): a wall's solid as Revit's re-read sends it — a box around the line [ax, ay] → [bx, by], t thick from z0 to z1, as 12
// triangles of 9 numbers each (mm, the model's frame), the winding as it falls. Its quads: 0 the left side (+n), 1 the end at b, 2 the right
// side (−n), 3 the end at a, 4 the base, 5 the top — 18 numbers each.
export const boxMesh = ([ax, ay], [bx, by], t, z0, z1) => {
  const L = Math.hypot(bx - ax, by - ay), nx = (-(by - ay) / L) * (t / 2), ny = ((bx - ax) / L) * (t / 2);
  const c = (i) => [...[[ax + nx, ay + ny], [bx + nx, by + ny], [bx - nx, by - ny], [ax - nx, ay - ny]][i % 4], i < 4 ? z0 : z1];
  return [[0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7], [0, 3, 2, 1], [4, 5, 6, 7]]
    .flatMap(([a, b, d, e]) => [...c(a), ...c(b), ...c(d), ...c(a), ...c(d), ...c(e)]);
};
