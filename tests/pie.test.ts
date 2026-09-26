import assert from "node:assert/strict";
import test from "node:test";
import { pieSlices, pointAt } from "../src/lib/pie";

const geometry = { cx: 120, cy: 120, radius: 100 };

test("slices start at twelve o'clock, run clockwise, and sum to the whole", () => {
  const slices = pieSlices(
    [
      { name: "Witch", n: 17 },
      { name: "Marauder", n: 10 },
      { name: "Ranger", n: 6 },
      { name: "Nobody", n: 0 },
    ],
    (item) => item.n,
    geometry,
  );
  assert.deepEqual(
    slices.map((slice) => slice.item.name),
    ["Witch", "Marauder", "Ranger"],
    "a class with no characters takes no slice",
  );
  assert.equal(slices[0].start, 0);
  assert.equal(slices[slices.length - 1].end, 360);
  for (let at = 1; at < slices.length; at += 1) assert.equal(slices[at].start, slices[at - 1].end, "slices abut");
  assert.ok(Math.abs(slices.reduce((sum, slice) => sum + slice.share, 0) - 1) < 1e-9);
  assert.equal(Math.round(slices[0].share * 100), 52);
  // The first slice's arc begins at the top of the circle.
  assert.match(slices[0].path, /^M 120 120 L 120 20 A 100 100 0 1 1 /, "over half the pie, so the large-arc flag is set");
  assert.match(slices[1].path, /A 100 100 0 0 1 /, "under half, so it is not");
  // Labels sit inside the wedge, on its bisector, part way out.
  const middle = pointAt(120, 120, 66, slices[0].start + (slices[0].end - slices[0].start) / 2);
  assert.deepEqual(slices[0].label, middle);
});

test("a lone slice is drawn as a full circle with its label at the centre, and nothing at all draws nothing", () => {
  const [only] = pieSlices([{ n: 5 }], (item) => item.n, geometry);
  assert.equal(only.share, 1);
  assert.match(only.path, /^M 120 20 A 100 100 0 1 1 120 220 A 100 100 0 1 1 120 20 Z$/);
  assert.deepEqual(only.label, { x: 120, y: 120 }, "a disc has no bisector to hang a label on");
  assert.ok(only.room >= 100, "and room for any name");
  assert.deepEqual(pieSlices([{ n: 0 }, { n: 0 }], (item) => item.n, geometry), []);
  assert.deepEqual(pieSlices([], () => 1, geometry), []);
});

/**
 * A label's room is what keeps a thin slice's name off its neighbours: a wedge
 * pointing straight up offers only its width across at the label radius, while
 * the same wedge pointing sideways lets a horizontal name run along it.
 */
test("a thin wedge has little room for a label when it points up, and more when it points sideways", () => {
  // Three equal 7% slices at the top, the rest one big slice: the first points up.
  const up = pieSlices([{ n: 7 }, { n: 7 }, { n: 7 }, { n: 79 }], (item) => item.n, geometry);
  const chord = 2 * 66 * Math.sin((up[0].end - up[0].start) * (Math.PI / 360));
  assert.ok(Math.abs(up[0].room - chord) < 1, `an upright wedge's room is its chord (${up[0].room} vs ${chord})`);
  // A 7% slice whose bisector points to three o'clock: a big slice before it turns it there.
  const side = pieSlices([{ n: 21.5 }, { n: 7 }, { n: 71.5 }], (item) => item.n, geometry);
  assert.ok(Math.abs((side[1].start + side[1].end) / 2 - 90) < 1);
  assert.ok(side[1].room > up[0].room * 2, `a sideways wedge has more room (${side[1].room} vs ${up[0].room})`);
  assert.ok(side[1].room <= 80, "but never more than most of the radius");
});

test("a point at a bearing lands where a clock hand would", () => {
  assert.deepEqual(pointAt(0, 0, 10, 0), { x: 0, y: -10 });
  assert.deepEqual(pointAt(0, 0, 10, 90), { x: 10, y: 0 });
  assert.deepEqual(pointAt(0, 0, 10, 180), { x: 0, y: 10 });
  assert.deepEqual(pointAt(0, 0, 10, 270), { x: -10, y: 0 });
});

/** The class ring: an offset lets a leading group be centred on the top, the way Witch is. */
test("an offset starts the wheel before twelve o'clock so the first slice is centred on it", () => {
  const slices = pieSlices([{ n: 25 }, { n: 25 }, { n: 50 }], (item) => item.n, { ...geometry, offset: -45 });
  assert.equal(slices[0].start, -45);
  assert.equal(slices[0].end, 45, "a quarter slice straddles the top evenly");
  assert.equal(slices[2].end, 315);
  assert.deepEqual(slices[0].label, pointAt(120, 120, 66, 0), "and its label sits straight up");
});
