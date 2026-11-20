# Icons — regeneration notes

Source of truth for the brand mark: `assets/aether-mark.svg` (512×512, standalone, no external refs).
Banner: `assets/aether-banner.svg` (1200×320).

Palette (keep to these only):

| Token | Value | Use |
|---|---|---|
| Ink | `#0D0D0D` | rounded-square tile, wordmark |
| Paper | `#FFFFFF` | banner background, adaptive-icon background |
| Accent | `#10A37F` | the "A" glyph — the single green accent |
| Muted | `#6E6E80` / `#8E8EA0` | tagline / footer links |
| Hairline | `#E5E5E5`, `#EDEDED` | footer rule, banner border |

## What exists today (verified)

```
$ find app/src/main/res -type d
res/drawable  res/drawable-nodpi  res/font  res/mipmap-anydpi-v26  res/values  res/xml
```

* **No raster mipmaps.** `res/mipmap-mdpi` … `res/mipmap-xxxhdpi` do not exist at all.
* Adaptive icon only: `res/mipmap-anydpi-v26/ic_launcher.xml` and `ic_launcher_round.xml`.
* Background = `@color/ic_launcher_background` → `res/values/colors.xml` = `#FFFFFF` (already the new Paper color, nothing to change).
* Foreground = `res/drawable/ic_launcher_foreground.xml`, which is **not a vector**: it is an
  `<inset>` wrapping `<bitmap android:src="@drawable/aether_mark">` →
  `res/drawable-nodpi/aether_mark.png` (1024×1024 PNG). There is therefore **no vector launcher
  source to recolour**, and no hard-coded fill colours exist in that file — so it was left untouched.
* `minSdk = 26` (`app/build.gradle.kts`), so the adaptive icon alone is sufficient at runtime; the
  density PNGs below are only needed if legacy pre-26 icons or a vector foreground are wanted.
* Nightly builds point at `@mipmap/ic_launcher_nightly` / `@mipmap/ic_launcher_nightly_round`
  (`app/build.gradle.kts`), and **neither resource exists** in `res/` — those will have to be
  produced as well (same sizes, ideally a tinted variant of the mark).

## Files to regenerate from `assets/aether-mark.svg`

Legacy launcher PNGs (only if legacy/pre-26 icons are required; each also needs a `_round` copy):

| Density | Folder | Size |
|---|---|---|
| mdpi | `app/src/main/res/mipmap-mdpi/ic_launcher.png` (+ `_round`) | 48×48 |
| hdpi | `app/src/main/res/mipmap-hdpi/ic_launcher.png` (+ `_round`) | 72×72 |
| xhdpi | `app/src/main/res/mipmap-xhdpi/ic_launcher.png` (+ `_round`) | 96×96 |
| xxhdpi | `app/src/main/res/mipmap-xxhdpi/ic_launcher.png` (+ `_round`) | 144×144 |
| xxxhdpi | `app/src/main/res/mipmap-xxxhdpi/ic_launcher.png` (+ `_round`) | 192×192 |

Adaptive-icon foreground (108 dp canvas; glyph must stay inside the 72 dp safe zone). Preferred:
replace the bitmap with a real vector drawable derived from the mark, i.e.
`app/src/main/res/drawable/ic_launcher_foreground.xml` (vector with `#10A37F` path and
`#FFFFFF` background, dropping the `<bitmap>`), or export PNG layers:

| Density | Size |
|---|---|
| mdpi | 108×108 |
| hdpi | 162×162 |
| xhdpi | 216×216 |
| xxhdpi | 324×324 |
| xxxhdpi | 432×432 |

Store / other surfaces:

| Target | Size | Source |
|---|---|---|
| Google Play listing icon | 512×512 PNG (no transparency) | `assets/aether-mark.svg` flattened on `#FFFFFF` |
| iOS App Store | 1024×1024 | `iosApp/Resources/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png` |
| In-app / docs mark | 1024×1024 | `app/src/main/res/drawable-nodpi/aether_mark.png` |
| README mark | 1024×1024 | `public/aether_mark.png` |

## Commands (not executed here — no image tooling in this environment)

```bash
# single size
rsvg-convert -w 512 -h 512 assets/aether-mark.svg -o aether-mark-512.png
# or with Inkscape
inkscape assets/aether-mark.svg -w 512 -h 512 -o aether-mark-512.png

# all legacy densities
for s in 48 72 96 144 192; do
  rsvg-convert -w $s -h $s assets/aether-mark.svg -o ic_launcher-${s}.png
done
```

Android Studio → *New → Image Asset → Launcher Icons (Adaptive and Legacy)* using
`assets/aether-mark.svg` as the source will produce all of the above in one step; set the
background layer to `#FFFFFF` and the foreground glyph to `#10A37F`.