# Agent Stage app icon

`icon.svg` is the source of truth: a spotlight over a terminal on a stage,
drawn as original vector geometry with no people, characters, or theme-pack art.
The generator produces `icon.png`, `icon.ico`, `icon.icns`, and the matching
`docs/logo.svg` / `docs/logo.png` used by the splash, toolbar, and favicon.

Regenerate the complete set on any platform with:

```sh
node tools/make-logo.cjs
```
