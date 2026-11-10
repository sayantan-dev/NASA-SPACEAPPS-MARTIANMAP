# Planetary texture sources and limits

The Solar System renderer loads these local equirectangular maps directly; it does not synthesize per-planet canvas textures. Maps provide visual context only. Planet radii and orbital distances remain schematic as disclosed in the interface.

| Body | File | Source / limitation |
| --- | --- | --- |
| Mercury | `mercury-nasa.jpg` | NASA MESSENGER global mosaic. Black regions are missing mosaic coverage and should not be read as physical dark terrain. |
| Venus | `venus-clouds.jpg` | Solar System Scope equirectangular Venus atmosphere map. Yellow-gold cloud appearance; not a surface map or current weather. CC BY 4.0. |
| Earth | `earth-with-clouds-nasa.jpg` | NASA Goddard SVS equirectangular Blue Marble map with a global cloud composite. The cloud layer is from 2007 and the presentation was art-directed; it is an appearance texture, not live weather. |
| Mars | `mars.jpg` | JPL Viking-derived global map. A localized embedded optical raster is overlaid around Jezero during the globe approach. |
| Jupiter | `jupiter.jpg` | NASA Hubble 2015 global atmospheric map, 3600×1800 source. The Great Red Spot and cloud bands are integrated in the map. Polar caps absent from the source map were edge-extended for complete sphere coverage. |
| Saturn | `saturn.jpg` | Solar System Scope atmospheric map, based on NASA imagery; representative, with gaps filled and color slightly enhanced. CC BY 4.0. |
| Saturn rings | `saturn-ring-alpha.png` | Solar System Scope radial ring texture with transparency, mapped radially onto the existing Saturn ring geometry. CC BY 4.0. |
| Uranus | `uranus.jpg` | Solar System Scope pale cyan atmospheric map based on NASA imagery. Uranus has very low-contrast visible cloud features; this map is illustrative and CC BY 4.0. |
| Neptune | `neptune.jpg` | Solar System Scope representative atmospheric map based on NASA imagery; not a current weather product. CC BY 4.0. |

Texture files are in sRGB and use the standard Three.js sphere UV layout. The Saturn rings retain the existing ring plane and rotation hierarchy and use the source map's alpha for the visible ring divisions. The Earth globe also has a subtle blue atmospheric rim. The Jezero optical patch retains the image's north-up orientation. The Mars descent is a visual transition to the existing local terrain dataset, not a physically modeled atmospheric-entry or spacecraft flight profile.

Earth map source: NASA Goddard Scientific Visualization Studio, [Equirectangular Projected Earth for “LARGEST”](https://svs.gsfc.nasa.gov/3615/). Its base uses Blue Marble Next Generation data, with the cloud composite credited to NOAA's Climate Prediction Center.

Jupiter map source: NASA Goddard Scientific Visualization Studio, [Hubble global Jupiter map](https://svs.gsfc.nasa.gov/12021/), from 2015 Hubble observations. Other credited third-party textures are from [Solar System Scope](https://www.solarsystemscope.com/textures/) and are distributed under [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/). Attribution: Solar System Scope (solarsystemscope.com). These outer-planet maps are visual representations rather than scientific analysis products; cloud patterns vary over time.
