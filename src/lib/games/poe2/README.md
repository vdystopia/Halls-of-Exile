# Path of Exile 2

What is here so far:

- `classes.ts` — the eight classes and twenty-three ascendancies, from the 0.5
  passive tree that Path of Building 2 ships.
- `gems.ts`, `gem-art-index.json`, `skill-names.json` — every gem a player can
  cut (235 skills and spirit gems, and the supports), with its inventory
  picture, from `npm run gems:poe2`. The source is repoe-fork's Path of Exile 2
  export at `repoe-fork.github.io/poe2/`, which also hosts the art as WebP;
  `npm run art:fetch` downloads it into `public/items/poe2/`.

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
- **Item art and gem colours.** repoe-fork's Path of Exile 2 export carries
  `base_items.json` and `uniques.json` with art paths, the art itself under
  `Art/`, and each gem's `color` in `skill_gems.json` — the same material the
  Path of Exile 1 indexes are built from, so an `item-art-index.json` and a
  `gem-colors.json` for this game are the same scripts pointed at `/poe2/`.
  Gear tiles fall back to silhouettes until then, so this is not blocking.
