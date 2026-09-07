# Path of Exile 2

What is here so far:

- `classes.ts` — the eight classes and twenty-three ascendancies, from the 0.5
  passive tree that Path of Building 2 ships.

What is not here yet, and where it will come from:

- **The parser.** Path of Building 2 writes `<PathOfBuilding2>` as its root
  element, so a code identifies its own game; the envelope (URL-safe base64 over
  a zlib deflate of XML) and the item-text grammar are the same as Path of
  Exile 1's. The vocabulary is not: `Spirit:` and `Rune:` are header keys,
  `Sockets: S` counts rune sockets rather than linked colours, `{enchant}`,
  `{rune}` and `{desecrated}` join `{crafted}`, and a false boolean is written
  as the string `"nil"` rather than omitted.
- **The paper doll.** Charm 1-3, Flask 1-2 and Leg/Arm slots, against Path of
  Exile 1's five flasks and abyssal sockets.
- **Item art.** No catalogue equivalent to RePoE's has been found for Path of
  Exile 2; the tree's own art ships as compressed DDS atlases. Gear tiles fall
  back to silhouettes, so this is not blocking.

Base items, uniques and skills for Path of Exile 2 are published in
`PathOfBuildingCommunity/PathOfBuilding-PoE2` under `src/Data/`, which is where
the equivalents of `item-art-index.json` and `gem-colors.json` will be generated
from.
