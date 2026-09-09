# Trailpad Layout Exporter

This Figma plugin imports and exports the layout JSON consumed by `beta/main.js`.

## Use

1. In Figma, open **Plugins > Development > Import plugin from manifest...** and choose `figma-plugin/manifest.json`.
2. Select a frame containing the layout.
3. Select each structural layer and click its role button: `base`, `joystick`, `joystickHead`, `eightWayWrapper`, `arrowOn`, or `arrowOff`.
4. Select each button layer and click its matching button name. Button names are `A`, `B`, `X`, `Y`, `LB`, `RB`, `LT`, `RT`, `View`, `Menu`, `LS`, `RS`, `Up`, `Down`, `Left`, and `Right`.
5. Export the selected frame. The frame name becomes the JSON filename and asset folder name. The frame's top-left is the layout origin, so positions are exported as pixel strings relative to that frame.

To import an existing layout, click **Import JSON to canvas** and choose one of the files in `beta/layouts`. You can multi-select the JSON and its referenced image files in the same picker; image paths are matched by relative path when available, then by filename. The plugin creates a new frame centered in the viewport, names each imported layer using its schema key, and recreates geometry, image and solid fills, text, borders, corner radii, shadows, visibility, and labels as editable Figma layers. Import always creates a new frame and does not modify an existing selection. Unselected or unavailable image assets are reported in the Figma notification and fall back to the layer's solid background color.

Solid fills, text, corner radii, strokes, drop shadows, visibility, geometry, labels, and z-index are exported. Z-index follows the selected frame's flattened Figma layer order, with later layers receiving higher values.

Every recognized element missing from the selected frame is still emitted in the JSON with `display: "none"`.