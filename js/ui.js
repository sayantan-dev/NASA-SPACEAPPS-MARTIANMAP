/* ARES interface: six modules, guided tour, Learn More popups, route planner panel. */
(function () {
  "use strict";
  const A = ARES,
    { M, GW, GH } = A,
    S = A.state,
    $ = (s) => document.querySelector(s),
    QA = M.qa;
  const fmt = (n, d) =>
    Number(n).toLocaleString("en-US", {
      minimumFractionDigits: d || 0,
      maximumFractionDigits: d || 0,
    });
  const hm = (s) => {
    const m = Math.round(s / 60);
    return (
      Math.floor(m / 60) + " h " + String(m % 60).padStart(2, "0") + " min"
    );
  };

  // ---- data-status tags: used everywhere a number appears ----
  const CHIPS = {
    obs: ["Observed", "Measured by a spacecraft"],
    derived: ["Derived", "Calculated from observed data"],
    prov: ["Provisional", "Calculated, but not yet validated"],
    model: ["Modelled", "An estimate from a simple model"],
    assumed: ["Assumed", "A value we chose, not a measurement"],
  };
  const chip = (k) =>
    `<span class="chip ${k}" title="${CHIPS[k][1]}">${CHIPS[k][0]}</span>`;
  const learn = (g, t) =>
    `<button class="learn" data-act="learn" data-g="${g}" aria-label="Learn more: ${t}">?</button>`;
  const ratio = (1 / M.cos_lat - 1) * 100;
  const GLOSS = {
    dem: [
      "Elevation model",
      "A grid where every cell stores a height. ARES builds the 3D ground from one: NASA's HiRISE stereo terrain model. The original has 1 m cells; here it is averaged to about 10 m cells so it runs in a browser.",
    ],
    slope: [
      "Slope",
      `How steep the ground is, in degrees. 0° is flat and 45° is as steep as a staircase ramp. Our slope layer is <b>provisional</b>: each cell is the average of many 1 m slopes (small steep spots are smoothed away), and east-west slopes read up to about 1.5° too low because the map stretches east-west distances by ${ratio.toFixed(1)}%.`,
    ],
    hillshade: [
      "Hillshade",
      "A picture of how the ground would look lit from one side, which makes hills and hollows easy to see. It is only a visual aid. The sun angle (from the north-west, 45° up) is a display choice, not the real Martian sun.",
    ],
    rough: [
      "Roughness",
      "How much the height changes between a cell and its neighbours (the largest difference in a 3 × 3 window, about 3 m). It is high wherever the ground is steep, so it is <b>not</b> a boulder map.",
    ],
    haz: [
      "Slope bins",
      "Four colour bins (0-5°, 5-15°, 15-25°, over 25°) so steepness is easy to see at a glance. They are <b>provisional visual bins</b>. They are not tested limits for any spacesuit or rover.",
    ],
    proj: [
      "Map stretch",
      `The map uses a projection whose scale is exact at the equator. At 18.5° north, east-west distances on the map are about ${ratio.toFixed(1)}% longer than on the ground. ARES multiplies east-west distances by cos(latitude) = ${M.cos_lat.toFixed(3)} for every distance it shows.`,
    ],
    rad: [
      "Space radiation",
      "Mars has a thin atmosphere and no global magnetic field, so radiation at the surface is higher than on Earth. The figure used here (about 0.67 mSv per day) is a published Curiosity measurement from Gale Crater, quoted from memory, so check it against the paper before you rely on it. Jezero has no on-site radiation detector that I know of.",
    ],
    sol: [
      "Sol",
      "A Martian day is called a sol and lasts about 24 hours 39 minutes 35 seconds.",
    ],
    route: [
      "How routes are found",
      "The planner searches a 20 m grid for the cheapest path. Cost is the true 3D distance, multiplied up on steep ground. Cells steeper than your slope limit are blocked. The limit is <b>your assumption</b>, not a NASA safety value.",
    ],
  };
  const GLOSS_EXTRA = { geoid: 0 };

  // ---- modal ----
  const modal = $("#modal");
  const openModal = (html) => {
    modal.innerHTML = `<div class="card pop">${html}<button class="btn" data-act="close">Close</button></div>`;
    modal.hidden = false;
  };
  const closeModal = () => {
    modal.hidden = true;
    modal.innerHTML = "";
  };

  // ---- modules ----
  let cur = null;
  const evaState = {
    pick: null,
    start: null,
    goal: null,
    routes: [],
    active: 0,
    limit: 25,
    speed: 0.7,
  };
  const hazShare = (k) => fmt((100 * QA.hazard_class_counts[k]) / QA.both, 1);

  const MODS = [
    {
      id: "overview",
      n: "Mission Overview",
      r: () => `
      <h2>Jezero Crater, Mars</h2>
      <p class="lede">A walkable terrain study built from NASA HiRISE data. See what the ground is like, plan a surface walk, and check how far to trust each number.</p>
      <div class="grid2">
        <div class="stat"><b>${fmt(((M.x1 - M.x0) * M.cos_lat) / 1000, 1)} × ${fmt((M.y1 - M.y0) / 1000, 1)} km</b><span>ground area ${chip("derived")}</span></div>
        <div class="stat"><b>${fmt(QA.dem_valid_pct, 1)} %</b><span>of it has elevation data ${chip("derived")}</span></div>
        <div class="stat"><b>${fmt(M.zmin)} to ${fmt(M.zmax)} m</b><span>height range, 10 m grid ${chip("derived")}</span></div>
        <div class="stat"><b>10 m</b><span>web resolution (source 1 m)</span></div>
      </div>
      <div class="row"><button class="btn pri" data-act="tour">Take the 60-second tour</button><button class="btn" data-act="go" data-m="eva">Plan an EVA</button></div>
      <details open><summary>What is ARES?</summary><p>ARES turns real orbital data into a planning tool for the first people to walk on Mars. An EVA (extravehicular activity) is a walk outside the spacecraft. Drag the 3D view, then try the modules on the left of the top bar.</p></details>
      <h3>The five tags</h3>
      <p class="tags">${["obs", "derived", "prov", "model", "assumed"].map((k) => `<span>${chip(k)} ${CHIPS[k][1]}</span>`).join("")}</p>
      <p class="note">Nothing in ARES is shown as real unless it is tagged Observed or Derived.</p>`,
    },

    {
      id: "explore",
      n: "Surface Explorer",
      r: () => `
      <h2>Surface Explorer</h2><p class="lede">Mix layers and hover the ground to read its numbers.</p>
      <h3>Base picture</h3>
      <label class="opt"><input type="checkbox" data-in="optical" ${S.optical ? "checked" : ""}> Orbital photo ${chip("obs")} <small>2 m preview, grey, tinted for display</small></label>
      <label class="opt"><input type="checkbox" data-in="hill" ${S.hill ? "checked" : ""}> Hillshade ${chip("derived")} ${learn("hillshade", "hillshade")}</label>
      <h3>Analysis layer</h3>
      ${[
        ["none", "None", ""],
        ["elevation", "Elevation", chip("derived") + learn("dem", "elevation")],
        ["slope", "Slope", chip("prov") + learn("slope", "slope")],
        ["rough", "Roughness", chip("prov") + learn("rough", "roughness")],
        ["haz", "Slope bins", chip("prov") + learn("haz", "slope bins")],
      ]
        .map(
          ([v, t, x]) =>
            `<label class="opt"><input type="radio" name="ov" value="${v}" data-in="ov" ${S.overlay === v ? "checked" : ""}> ${t} ${x}</label>`,
        )
        .join("")}
      <div class="row2"><span>Opacity</span><input type="range" min="10" max="100" value="${S.opacity * 100}" data-in="op"></div>
      <div id="legend"></div>
      <h3>3D view</h3>
      <div class="row2"><span>Height exaggeration <b id="exv">${S.ex.toFixed(1)}×</b></span><input type="range" min="10" max="60" value="${S.ex * 10}" data-in="ex"></div>
      <details><summary>How do I read this?</summary><p>Bright slope colours mark steeper ground. Hover anywhere: the readout at the bottom left shows elevation, slope, roughness and map position for that spot. Exaggeration stretches heights to make relief easier to see; it does not change any number.</p></details>`,
      b: legend,
    },

    {
      id: "eva",
      n: "EVA Planner",
      r: () => `
      <h2>EVA Planner</h2><p class="lede">Pick a start and a destination on the 3D map. ARES finds a shortest and a gentlest route. ${learn("route", "route finding")}</p>
      <div class="row"><button class="btn ${evaState.pick === "start" ? "pri" : ""}" data-act="pick" data-w="start">${evaState.start ? "Move start" : "Set start"}</button>
        <button class="btn ${evaState.pick === "goal" ? "pri" : ""}" data-act="pick" data-w="goal">${evaState.goal ? "Move destination" : "Set destination"}</button></div>
      <div class="row"><button class="btn" data-act="demo">Try a demo route</button><button class="btn" data-act="clearEva">Clear</button></div>
      <div class="row2"><span>Slope limit <b id="limv">${evaState.limit}°</b> ${chip("assumed")}</span><input type="range" min="8" max="40" value="${evaState.limit}" data-in="limit"></div>
      <div class="row2"><span>Walking speed <b id="spv">${evaState.speed.toFixed(1)} m/s</b> ${chip("assumed")}</span><input type="range" min="3" max="15" value="${evaState.speed * 10}" data-in="speed"></div>
      <div id="evaOut" class="out"><p class="note">${evaState.pick ? "Now click the 3D map." : "No route yet."}</p></div>
      <details><summary>What this does not include</summary><p>Boulders, loose soil, suit and rover limits, science stops, rest, and any real mobility rule. The slope limit and speed are assumptions. Distances use the true 3D path and are corrected for the map stretch ${learn("proj", "map stretch")}.</p></details>`,
      b: () => {
        evaOut();
        drawEva();
      },
    },

    {
      id: "targets",
      n: "Science Targets",
      r: () => `
      <h2>Science Targets</h2><p class="lede">Places worth a closer look. The landing site comes from remembered coordinates; the others were found by searching the data.</p>
      ${A.targets
        .map((t) => {
          const ll = A.toLatLon.apply(null, A.cellToProj(t.i, t.j)),
            k = A.idx(t.i, t.j);
          return `<div class="tcard">
        <div class="trow"><b>${t.name}</b>${chip(t.kind)}</div>
        <p class="note">${ll[0].toFixed(4)}° N, ${ll[1].toFixed(4)}° E · ${fmt(A.elev(k))} m · slope ${fmt(A.slopeDeg(k), 1)}°</p>
        <p>${TDESC[t.id]}</p><button class="btn" data-act="fly" data-t="${t.id}">Fly there</button> <button class="btn" data-act="evaTo" data-t="${t.id}">Route here</button></div>`;
        })
        .join("")}
      <h3>Mission context, not on the map yet</h3>
      <div class="tcard"><div class="trow"><b>Three Forks sample depot</b>${chip("obs")}</div><p>Perseverance left its first sample tubes here from 21 Dec 2022 to 28 Jan 2023: the first sample depot on another planet (NASA JPL). Map position not yet sourced.</p></div>
      <div class="tcard"><div class="trow"><b>Cheyava Falls</b>${chip("obs")}</div><p>A rock with leopard-spot patterns found in July 2024 at the northern edge of Neretva Vallis. NASA later called it a potential biosignature. Map position not yet sourced.</p></div>`,
    },

    {
      id: "env",
      n: "Environment",
      r: () => `
      <h2>Environment</h2><p class="lede">Slide the clock to move the sun and see what a walk would feel like.</p>
      <div class="row2"><span>Local time <b id="hrv"></b></span><input type="range" min="0" max="24" step="0.5" value="${S.hour}" data-in="hour"></div>
      <label class="opt"><input type="checkbox" data-in="sun" ${S.sun ? "checked" : ""}> Move the sun with the clock <small>visual model</small></label>
      <div class="row2"><span>Time outside <b id="eh"></b></span><input type="range" min="1" max="8" value="4" data-in="eh"></div>
      <div id="envOut" class="out"></div>
      <h3>Reference facts</h3>
      <table class="tbl"><tr><td>Day length (sol) ${learn("sol", "sol")}</td><td>24 h 39 min 35 s</td><td>${chip("obs")}</td></tr>
      <tr><td>Surface gravity</td><td>about 3.71 m/s²</td><td>${chip("obs")}</td></tr>
      <tr><td>Air pressure</td><td>about 0.6 kPa on average</td><td>${chip("obs")}</td></tr></table>
      <p class="note">These facts are general Mars values, not Jezero-specific, and quoted from memory. Verify before publishing.</p>`,
      b: envOut,
    },

    {
      id: "data",
      n: "Data & Provenance",
      r: () => `
      <h2>Data &amp; Provenance</h2><p class="lede">Every layer, where it came from, and what we have and have not checked.</p>
      <table class="tbl"><tr><th>Layer</th><th>In ARES</th><th>Tag</th></tr>
      <tr><td>Elevation</td><td>HiRISE terrain model, 1 m → 10 m average</td><td>${chip("derived")}</td></tr>
      <tr><td>Orbital photo</td><td>25 cm mosaic → 2 m preview → ~7 m texture</td><td>${chip("obs")}</td></tr>
      <tr><td>Hillshade</td><td>1 m → 10 m average; sun at 315°, 45°</td><td>${chip("derived")}</td></tr>
      <tr><td>Slope</td><td>1 m slope, averaged to 10 m</td><td>${chip("prov")}</td></tr>
      <tr><td>Roughness</td><td>3 × 3 largest difference, averaged</td><td>${chip("prov")}</td></tr>
      <tr><td>Slope bins</td><td>4 bins from the 1 m slope; majority per cell</td><td>${chip("prov")}</td></tr>
      <tr><td>Solar System tilt values</td><td><a href="https://nssdc.gsfc.nasa.gov/planetary/factsheet/" target="_blank" rel="noopener">NASA/NSSDC Planetary Fact Sheet</a>; distances, body sizes, phases, and simulation rates are schematic</td><td>${chip("obs")}</td></tr>
      <tr><td>Landing reference</td><td><a href="https://ntrs.nasa.gov/citations/20210024644" target="_blank" rel="noopener">Perseverance touchdown: 18.44463° N, 77.45088° E (NASA Langley)</a>; raster target placement remains approximate</td><td>${chip("prov")}</td></tr>
      <tr><td>Routes, times, dose, temperature</td><td>Simple models with assumed inputs</td><td>${chip("model")}</td></tr></table>
      <h3>Checks computed from your 1 m rasters</h3>
      <table class="tbl"><tr><td>Elevation valid</td><td>${fmt(QA.dem_valid_pct, 3)} %</td></tr>
      <tr><td>Slope valid</td><td>${fmt(QA.slope_valid_pct, 3)} %</td></tr>
      <tr><td>Slope valid where elevation is empty</td><td>${fmt(QA.slope_only)} pixels</td></tr>
      <tr><td>Elevation valid, slope empty</td><td>${fmt(QA.dem_only)} pixels (${fmt((100 * QA.dem_only) / QA.pixels, 3)} %)</td></tr>
      <tr><td>NaN or infinite values</td><td>${fmt(QA.nonfinite_valid)}</td></tr>
      <tr><td>First valid DEM column across rows</td><td>${fmt(QA.first_col_min)}–${fmt(QA.first_col_max)} (column index)</td></tr>
      <tr><td>Slope bins (share of valid area)</td><td>${[1, 2, 3, 4].map((k) => hazShare(k) + " %").join(" · ")}</td></tr></table>
      <details open><summary>Known limits</summary><ul>
      <li>The slope layer was made at the map's own scale, so east-west slopes read up to about 1.5° low. It has not been recomputed yet.</li>
      <li>A suspicious straight-edged patch with horizontal striping lies west-middle in the 1 m slope data. Not yet resolved.</li>
      <li>The 25 cm photo (1.19 GB) is <b>not</b> in this app. Only a 2 m preview is used, shown at about 7 m detail.</li>
      <li>The landing reference uses NASA-published Perseverance touchdown coordinates. Its placement on this embedded terrain raster remains approximate because the original source rasters and georeferencing files were not included.</li>
      <li>Roughness is a relief index and the slope bins are visual. Neither is a safety limit.</li></ul></details>
      <details><summary>Not integrated</summary><p>ARES_optical_region_25cm.tif and the full 1 m rasters. The pipeline in <code>pipeline/build_data.py</code> reads them and writes the browser data.</p></details>`,
    },
  ];

  const TDESC = {
    landing:
      "Where Perseverance touched down in February 2021 (position approximate). Everything in this study is measured relative to the flat crater floor around it.",
    high: "The highest ground inside the data, away from the edge. High ground gives long views and is where slopes tend to be steep.",
    low: "The lowest ground inside the data. Water would collect here, so it is a place to look for layered sediments.",
    steep:
      "The steepest 10 m cell in the study area. Good for seeing what a no-go zone looks like. A walking route should end here only on purpose.",
  };

  function legend() {
    const el = $("#legend");
    if (!el) return;
    const o = S.overlay;
    const bar = (st, a, b) =>
      `<div class="bar" style="background:linear-gradient(90deg,${st.join(",")})"></div><div class="bl"><span>${a}</span><span>${b}</span></div>`;
    el.innerHTML =
      o === "elevation"
        ? bar(A.RAMPS.elevation, fmt(M.zmin) + " m", fmt(M.zmax) + " m")
        : o === "slope"
          ? bar(A.RAMPS.slope, "0°", "30° or more")
          : o === "rough"
            ? bar(A.RAMPS.rough, "0 m", "2 m or more")
            : o === "haz"
              ? ["0-5°", "5-15°", "15-25°", "over 25°"]
                  .map(
                    (t, i) =>
                      `<div class="hz"><i style="background:${A.HAZ[i + 1]}"></i>${t}<span>${hazShare(i + 1)} %</span></div>`,
                  )
                  .join("")
              : "";
  }

  // ---- EVA planner ----
  const rampColor = (st, t) => {
    const m = st.length - 1,
      x = Math.max(0, Math.min(1, t)) * m,
      a = Math.min(Math.floor(x), m - 1),
      f = x - a;
    const p = (h) => [1, 3, 5].map((k) => parseInt(h.substr(k, 2), 16)),
      c0 = p(st[a]),
      c1 = p(st[a + 1]);
    return (
      "rgb(" + c0.map((v, k) => Math.round(v + (c1[k] - v) * f)).join(",") + ")"
    );
  };
  function setPoint(which, i, j) {
    const k = A.idx(i, j);
    if (!A.valid(k) || A.slopeDeg(k) !== A.slopeDeg(k))
      return toast("That spot has no elevation data. Try another.");
    evaState[which] = [i, j];
    evaState.pick = which === "start" && !evaState.goal ? "goal" : null;
    planAll();
    go("eva", true);
  }
  function planAll() {
    evaState.routes = [];
    if (!evaState.start || !evaState.goal) return;
    const s = A.fineToCoarse(evaState.start[0], evaState.start[1]),
      g = A.fineToCoarse(evaState.goal[0], evaState.goal[1]);
    evaState.routes = [
      ["Shortest", 0, "#f2b84b"],
      ["Gentlest", 5, "#6fd6e6"],
    ].map(([n, w, c]) => {
      const p = A.plan(s[0], s[1], g[0], g[1], w, evaState.limit);
      return p ? { n, c, path: p, m: A.metrics(p) } : { n, c, fail: true };
    });
    evaState.active = Math.min(evaState.active, 1);
  }
  function drawEva() {
    A.clearOverlay("eva");
    if (evaState.start)
      A.addMarker(
        "eva",
        evaState.start[0],
        evaState.start[1],
        "Start",
        0x7bd34a,
      );
    if (evaState.goal)
      A.addMarker(
        "eva",
        evaState.goal[0],
        evaState.goal[1],
        "Destination",
        0xe0573f,
      );
    evaState.routes.forEach((r, n) => {
      if (!r.fail)
        A.addRoute(
          "eva",
          r.path.map((c) => A.coarseToFine(c[0], c[1])),
          parseInt(r.c.substr(1), 16),
          n === evaState.active ? 0.2 : 0.1,
        );
    });
  }
  function evaOut() {
    const el = $("#evaOut");
    if (!el) return;
    if (!evaState.routes.length) {
      el.innerHTML = `<p class="note">${evaState.pick ? "Now click the 3D map to place the " + (evaState.pick === "start" ? "start" : "destination") + "." : "No route yet. Set a start and a destination, or try the demo."}</p>`;
      return;
    }
    const rows = evaState.routes
      .map((r, n) =>
        r.fail
          ? `<tr><td><i class="dot" style="background:${r.c}"></i>${r.n}</td><td colspan="4">No route under a ${evaState.limit}° limit. Raise the limit or move a point.</td></tr>`
          : `<tr class="${n === evaState.active ? "on" : ""}" data-act="route" data-n="${n}"><td><i class="dot" style="background:${r.c}"></i>${r.n}</td><td>${fmt(r.m.dist)} m</td><td>${hm(r.m.dist / evaState.speed)}</td><td>+${fmt(r.m.up)} m</td><td>${fmt(r.m.max, 0)}°</td></tr>`,
      )
      .join("");
    const a = evaState.routes[evaState.active];
    el.innerHTML = `<table class="tbl sel"><tr><th>Route</th><th>Distance</th><th>Time</th><th>Climb</th><th>Max 10 m slope</th></tr>${rows}</table>
      ${a && !a.fail ? `<canvas id="prof" width="640" height="220"></canvas><p class="note">Height along the ${a.n.toLowerCase()} route. Colour shows the maximum underlying 10 m cell slope. ${fmt(a.m.steepDist)} m of it has a cell above 15°. Time = distance ÷ assumed speed, nothing else.</p>` : ""}`;
    if (a && !a.fail) profile(a.m.prof);
  }
  function profile(pr) {
    const c = $("#prof"),
      x = c.getContext("2d"),
      W = c.width,
      H = c.height,
      pad = 28;
    const d = pr[pr.length - 1][0] || 1;
    let lo = 1e9,
      hi = -1e9;
    pr.forEach((p) => {
      lo = Math.min(lo, p[1]);
      hi = Math.max(hi, p[1]);
    });
    if (hi - lo < 20) {
      hi += 10;
      lo -= 10;
    }
    const X = (v) => pad + (v / d) * (W - pad - 8),
      Y = (v) => H - 22 - ((v - lo) / (hi - lo)) * (H - 40);
    x.clearRect(0, 0, W, H);
    x.font = "16px system-ui";
    x.fillStyle = "#98a1ad";
    x.strokeStyle = "rgba(255,255,255,.1)";
    x.fillText(fmt(hi) + " m", 2, 16);
    x.fillText(fmt(lo) + " m", 2, H - 6);
    x.fillText(fmt(d) + " m along the route", W - 190, H - 6);
    for (let k = 1; k < pr.length; k++) {
      x.beginPath();
      x.moveTo(X(pr[k - 1][0]), Y(pr[k - 1][1]));
      x.lineTo(X(pr[k][0]), Y(pr[k][1]));
      x.lineTo(X(pr[k][0]), H - 22);
      x.lineTo(X(pr[k - 1][0]), H - 22);
      x.closePath();
      x.fillStyle = rampColor(A.RAMPS.slope, pr[k][2] / 30);
      x.globalAlpha = 0.55;
      x.fill();
      x.globalAlpha = 1;
    }
    x.beginPath();
    pr.forEach((p, k) =>
      k ? x.lineTo(X(p[0]), Y(p[1])) : x.moveTo(X(p[0]), Y(p[1])),
    );
    x.strokeStyle = "#ece7df";
    x.lineWidth = 2;
    x.stroke();
  }

  // ---- environment: every number here is a model or an assumption ----
  const temp = (h) => -43 + 38 * Math.sin((Math.PI * (h - 8)) / 12);
  function envOut() {
    const el = $("#envOut");
    if (!el) return;
    const h = S.hour,
      eh = +($("[data-in=eh]") || { value: 4 }).value;
    $("#hrv").textContent =
      String(Math.floor(h)).padStart(2, "0") + ":" + (h % 1 ? "30" : "00");
    $("#eh").textContent = eh + " h";
    let lo = 1e9,
      hi = -1e9;
    for (let t = h; t <= h + eh; t += 0.25) {
      const v = temp(t);
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    const dose = (eh * 0.67) / 24;
    el.innerHTML = `<div class="kv"><span>Air temperature ${chip("assumed")}</span><b>${Math.round(lo)} to ${Math.round(hi)} °C</b></div>
      <div class="kv"><span>Radiation for the walk ${chip("model")} ${learn("rad", "radiation")}</span><b>${dose.toFixed(2)} mSv</b></div>
      <p class="note">Temperature is an invented day curve (about -81 to -5 °C), not a Jezero measurement. Radiation is 0.67 mSv per day × the hours outside, from a Gale Crater measurement, with no shielding from a suit. That is about ${fmt(dose / 0.1, 1)} chest X-rays (roughly 0.1 mSv each).</p>`;
  }

  // ---- targets overlay ----
  function drawTargets() {
    A.clearOverlay("targets");
    A.targets.forEach((t) =>
      A.addMarker(
        "targets",
        t.i,
        t.j,
        t.name.replace(" (approximate)", ""),
        t.kind === "prov" ? 0xf2b84b : 0x6fd6e6,
        () => fly(t.id),
      ),
    );
  }
  function fly(id) {
    const t = A.targets.find((x) => x.id === id);
    A.viewCell(t.i, t.j, 16, 1500);
  }

  // ---- shell ----
  const nav = $("#nav"),
    panel = $("#panel");
  nav.innerHTML = MODS.map(
    (m, i) =>
      `<button data-act="go" data-m="${m.id}"><i>${i + 1}</i>${m.n}</button>`,
  ).join("");
  function go(id, keep) {
    const m = MODS.find((x) => x.id === id);
    if (!keep) {
      cur = id;
      A.clearOverlay();
    }
    cur = id;
    panel.classList.remove("rise");
    void panel.offsetWidth;
    panel.classList.add("rise");
    panel.innerHTML = m.r();
    m.b && m.b();
    nav
      .querySelectorAll("button")
      .forEach((b) => b.classList.toggle("on", b.dataset.m === id));
    A.ctl.autoRotate = id === "overview";
    if (!keep && id === "targets") drawTargets();
    if (id === "eva") drawEva();
    if (id !== "eva") evaState.pick = null;
  }
  function toast(t) {
    const el = $("#toast");
    el.textContent = t;
    el.classList.add("on");
    clearTimeout(toast.t);
    toast.t = setTimeout(() => el.classList.remove("on"), 3200);
  }
  let rebuildT;
  const later = (f) => {
    clearTimeout(rebuildT);
    rebuildT = setTimeout(f, 140);
  };

  const ACT = {
    go: (b) => go(b.dataset.m),
    learn: (b) =>
      openModal(
        `<h3>${GLOSS[b.dataset.g][0]}</h3><p>${GLOSS[b.dataset.g][1]}</p>`,
      ),
    close: closeModal,
    tour: () => startTour(),
    fly: (b) => fly(b.dataset.t),
    evaTo: (b) => {
      const t = A.targets.find((x) => x.id === b.dataset.t),
        l = A.targets[0];
      evaState.start = [l.i, l.j];
      evaState.goal = [t.i, t.j];
      planAll();
      go("eva");
    },
    pick: (b) => {
      evaState.pick = b.dataset.w;
      go("eva", true);
      toast(
        "Click the 3D map to place the " +
          (b.dataset.w === "start" ? "start." : "destination."),
      );
    },
    clearEva: () => {
      Object.assign(evaState, {
        start: null,
        goal: null,
        routes: [],
        pick: null,
      });
      A.clearOverlay("eva");
      go("eva", true);
    },
    demo: () => {
      const l = A.targets[0];
      evaState.start = [l.i, l.j];
      evaState.goal = [1000, 300];
      planAll();
      go("eva");
      A.viewCell(1170, 370, 60, 1800);
    },
    route: (b) => {
      evaState.active = +b.dataset.n;
      drawEva();
      evaOut();
    },
    recenter: () => A.viewOverview(1100),
    panel: () => document.body.classList.toggle("panel-collapsed"),
  };
  const IN = {
    optical: (e) => {
      S.optical = e.checked;
      A.compose();
    },
    hill: (e) => {
      S.hill = e.checked;
      A.compose();
    },
    ov: (e) => {
      S.overlay = e.value;
      A.compose();
      legend();
    },
    op: (e) => {
      S.opacity = e.value / 100;
      A.compose();
    },
    ex: (e) => {
      S.ex = e.value / 10;
      $("#exv").textContent = S.ex.toFixed(1) + "×";
      later(() => A.rebuild());
    },
    limit: (e) => {
      evaState.limit = +e.value;
      $("#limv").textContent = e.value + "°";
      later(() => {
        planAll();
        evaOut();
        drawEva();
      });
    },
    speed: (e) => {
      evaState.speed = e.value / 10;
      $("#spv").textContent = evaState.speed.toFixed(1) + " m/s";
      evaOut();
    },
    hour: (e) => {
      A.setHour(+e.value);
      envOut();
    },
    sun: (e) => {
      S.sun = e.checked;
      A.setHour(S.hour);
    },
    eh: () => envOut(),
  };
  panel.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (b && ACT[b.dataset.act]) ACT[b.dataset.act](b);
  });
  [nav, modal, $("#tour"), $("#top"), $("#map-tools")].forEach((el) =>
    el.addEventListener("click", (e) => {
      const b = e.target.closest("[data-act]");
      if (b && ACT[b.dataset.act]) ACT[b.dataset.act](b);
    }),
  );
  const onIn = (e) => {
    const f = IN[e.target.dataset.in];
    if (f) f(e.target);
  };
  panel.addEventListener("input", onIn);
  panel.addEventListener("change", onIn);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });
  addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeModal();
      endTour();
    }
  });

  // ---- hover readout and map clicks ----
  const hud = $("#hud");
  A.onProbe = (p) => {
    if (!p) {
      hud.classList.remove("on");
      return;
    }
    const c = A.worldToCell(p.x, p.z),
      k = A.idx(c[0], c[1]),
      pr = A.cellToProj(c[0], c[1]),
      ll = A.toLatLon(pr[0], pr[1]),
      hz = A.L.haz[k];
    hud.classList.add("on");
    hud.innerHTML = `<b>${fmt(A.elev(k))} m</b> elevation <span class="chip derived">Derived</span><br>slope <b>${fmt(A.slopeDeg(k), 1)}°</b> · roughness <b>${fmt(A.roughM(k), 2)} m</b> <span class="chip prov">Provisional</span><br>bin ${hz ? ["", "0-5°", "5-15°", "15-25°", "over 25°"][hz] : "none"} · ${ll[0].toFixed(4)}° N ${ll[1].toFixed(4)}° E`;
  };
  A.onClick = (p) => {
    if (cur === "eva" && evaState.pick) {
      const c = A.worldToCell(p.x, p.z);
      setPoint(evaState.pick, Math.round(c[0]), Math.round(c[1]));
    }
  };
  A.onRebuild = () => {
    if (cur === "eva") drawEva();
    if (cur === "targets") drawTargets();
  };

  // ---- guided tour ----
  const STEPS = [
    [
      "Welcome to ARES",
      "This is real terrain from NASA's HiRISE camera, in Jezero Crater. We will show you around in six quick steps.",
      () => go("overview"),
    ],
    [
      "Look around",
      "Drag to turn the view. Scroll to zoom. Right-drag to slide. Hover the ground to read its height and steepness.",
      () => A.viewOverview(1400),
    ],
    [
      "Layers",
      "Surface Explorer lets you paint slope, roughness or elevation on the ground. Steep ground glows red.",
      () => {
        go("explore");
        S.overlay = "slope";
        A.compose();
        go("explore");
      },
    ],
    [
      "Plan a walk",
      "EVA Planner finds the shortest and the gentlest route between two points. Try the demo route.",
      () => go("eva"),
    ],
    [
      "Trust the tags",
      "Every number wears a tag: Observed, Derived, Provisional, Modelled or Assumed. Tap the ? buttons to learn what a word means.",
      () => go("data"),
    ],
    [
      "You are ready",
      "Open Data & Provenance any time to see what is real and what is not. Press Esc to close messages.",
      () => go("overview"),
    ],
  ];
  let step = -1;
  function startTour() {
    step = 0;
    showStep();
  }
  function showStep() {
    const t = $("#tour");
    if (step < 0) {
      t.hidden = true;
      return;
    }
    t.hidden = false;
    const s = STEPS[step];
    s[2]();
    t.innerHTML = `<div class="dots">${STEPS.map((_, i) => `<i class="${i === step ? "on" : ""}"></i>`).join("")}</div><h3>${s[0]}</h3><p>${s[1]}</p>
      <div class="row"><button class="btn" data-act="tskip">Skip</button>${step ? '<button class="btn" data-act="tback">Back</button>' : ""}<button class="btn pri" data-act="tnext">${step === STEPS.length - 1 ? "Finish" : "Next"}</button></div>`;
  }
  function endTour() {
    step = -1;
    $("#tour").hidden = true;
    try {
      localStorage.setItem("ares_seen", "1");
    } catch (e) {}
  }
  Object.assign(ACT, {
    tnext: () => {
      step++;
      step >= STEPS.length ? endTour() : showStep();
    },
    tback: () => {
      step--;
      showStep();
    },
    tskip: endTour,
    guide: () => startTour(),
  });

  // ---- start ----
  const planetProfiles = {
    Mercury: {
      kind: "Terrestrial planet · 1st from the Sun",
      description:
        "A cratered, airless world with an ancient surface and extreme day-to-night temperature changes.",
      distance: "0.39 AU",
      diameter: "4,879 km",
      day: "58.6 d",
      year: "88.0 d",
      tilt: "0.03°",
    },
    Venus: {
      kind: "Terrestrial planet · 2nd from the Sun",
      description:
        "A dense carbon-dioxide atmosphere hides the surface beneath a persistent, fast-moving cloud deck.",
      distance: "0.72 AU",
      diameter: "12,104 km",
      day: "243 d · retrograde",
      year: "224.7 d",
      tilt: "177.4°",
    },
    Earth: {
      kind: "Terrestrial planet · 3rd from the Sun",
      description:
        "Our reference world: liquid-water oceans, active geology and a protective atmosphere.",
      distance: "1.00 AU",
      diameter: "12,756 km",
      day: "23.9 h",
      year: "365.2 d",
      tilt: "23.4°",
    },
    Mars: {
      kind: "Terrestrial planet · 4th from the Sun",
      description:
        "Ancient lake basin. Preserved delta deposits. The Jezero terrain is ready for exploration.",
      distance: "1.52 AU",
      diameter: "6,792 km",
      day: "24.6 h",
      year: "687 d",
      tilt: "25.2°",
    },
    Jupiter: {
      kind: "Gas giant · 5th from the Sun",
      description:
        "The largest planet, with rapidly changing cloud belts and long-lived storms.",
      distance: "5.20 AU",
      diameter: "142,984 km",
      day: "9.9 h",
      year: "4,331 d",
      tilt: "3.1°",
    },
    Saturn: {
      kind: "Gas giant · 6th from the Sun",
      description:
        "A low-density gas giant surrounded by an immense system of icy rings.",
      distance: "9.58 AU",
      diameter: "120,536 km",
      day: "10.7 h",
      year: "10,747 d",
      tilt: "26.7°",
    },
    Uranus: {
      kind: "Ice giant · 7th from the Sun",
      description:
        "A pale cyan ice giant with an extreme axial tilt and a cold, layered atmosphere.",
      distance: "19.2 AU",
      diameter: "51,118 km",
      day: "17.2 h · retrograde",
      year: "30,589 d",
      tilt: "97.8°",
    },
    Neptune: {
      kind: "Ice giant · 8th from the Sun",
      description:
        "A distant blue ice giant with fast winds and atmospheric storms that evolve over time.",
      distance: "30.1 AU",
      diameter: "49,528 km",
      day: "16.1 h",
      year: "59,800 d",
      tilt: "28.3°",
    },
  };
  function updatePlanetReadout(name) {
    const profile = planetProfiles[name];
    if (!profile) return;
    $("#planet-readout").innerHTML =
      `<small>SELECTED WORLD</small><b>${name.toUpperCase()}</b><span>${profile.kind}</span><p>${profile.description}</p>`;
    $("#planet-index").textContent =
      `${String(Object.keys(planetProfiles).indexOf(name) + 1).padStart(2, "0")} / 08`;
    $("#planet-facts").innerHTML = [
      ["distance", "MEAN SUN DISTANCE"],
      ["diameter", "DIAMETER"],
      ["day", "ROTATION PERIOD"],
      ["year", "ORBITAL PERIOD"],
      ["tilt", "AXIAL TILT"],
    ]
      .map(
        ([k, label]) =>
          `<div class="planet-fact"><b>${profile[k]}</b><span>${label}</span></div>`,
      )
      .join("");
    const enter = $("#enter");
    enter.innerHTML =
      name === "Mars"
        ? "BEGIN MARS EXPEDITION <span>↗</span>"
        : "SELECT MARS TO CONTINUE <span>↗</span>";
    enter.disabled = name !== "Mars";
    enter.setAttribute("aria-disabled", String(name !== "Mars"));
  }
  window.addEventListener("ares:planet-selected", (e) =>
    updatePlanetReadout(e.detail.name),
  );
  const intro = $("#intro"),
    journeyHud = $("#journey-hud"),
    journeyLabel = $("#journey-status"),
    journeyProgress = $("#journey-progress-bar"),
    journeyStep = $("#journey-progress-text");
  const JOURNEY_STEPS = [
    [0.02, "01 — PLANETARY APPROACH", "LEAVING SYSTEM NAVIGATION"],
    [0.28, "02 — MARS APPROACH", "APPROACHING PLANETARY BODY"],
    [0.53, "03 — REGIONAL ACQUISITION", "JEZERO REGION ACQUIRED"],
    [0.76, "04 — LOCAL DESCENT", "DESCENDING TOWARDS LANDING REGION"],
    [0.84, "05 — TERRAIN HANDOFF", "ACQUIRING TERRAIN VIEW"],
  ];
  window.addEventListener("ares:journey-stage", (e) => {
    const p = e.detail.progress;
    journeyProgress.style.width = `${Math.round(p * 100)}%`;
    const step = JOURNEY_STEPS.reduce(
      (a, b) => (p >= b[0] ? b : a),
      JOURNEY_STEPS[0],
    );
    journeyStep.textContent = step[1];
    journeyLabel.textContent = step[2];
    if (p >= 0.84 && !document.body.classList.contains("handoff-pending")) {
      try {
        A.prepareDescent({ duration: 1800, startScale: 1.75 });
        document.body.classList.remove("solar-system-mode");
        document.body.classList.add("handoff-pending");
        intro.classList.add("handoff");
      } catch (err) {
        console.error("ARES terrain handoff preparation failed", err);
        if (A.cancelDescent) A.cancelDescent();
        if (window.ARES_SOLAR) window.ARES_SOLAR.cancelJourney();
        journeyLabel.textContent = "HANDOFF FAILED · ARRIVAL CANCELLED";
      }
    }
  });
  window.addEventListener("ares:journey-complete", () => {
    journeyHud.hidden = true;
    document.body.classList.add("terrain-active");
    document.body.classList.remove(
      "solar-system-mode",
      "handoff-pending",
      "cinematic-flight",
    );
    intro.classList.add("gone");
    go("overview");
    A.enterMission();
  });
  window.addEventListener("ares:journey-cancelled", () => {
    journeyHud.hidden = true;
    if (A.cancelDescent) A.cancelDescent();
    intro.classList.remove("flight-mode", "handoff");
    document.body.classList.add("solar-system-mode");
    document.body.classList.remove(
      "handoff-pending",
      "cinematic-flight",
      "terrain-active",
    );
  });
  window.addEventListener("ares:journey-error", (e) => {
    journeyHud.hidden = true;
    if (A.cancelDescent) A.cancelDescent();
    intro.classList.remove("flight-mode", "handoff");
    document.body.classList.add("solar-system-mode");
    document.body.classList.remove(
      "handoff-pending",
      "cinematic-flight",
      "terrain-active",
    );
    $("#status").textContent =
      `ARRIVAL ERROR · ${e.detail?.message || "Please retry"}`;
  });
  const cancelJourney = () =>
    window.ARES_SOLAR && window.ARES_SOLAR.cancelJourney();
  $("#journey-cancel").addEventListener("click", cancelJourney);
  $("#overview-mode").addEventListener("click", () => {
    if (window.ARES_SOLAR) window.ARES_SOLAR.overview();
  });
  $("#solar-return").addEventListener("click", () => {
    if (window.ARES_SOLAR) window.ARES_SOLAR.overview();
  });
  $("#enter").addEventListener("click", () => {
    if (window.ARES_SOLAR?.getSelected() !== "Mars") {
      $("#status").textContent = "SELECT MARS TO BEGIN THE EXPEDITION";
      return;
    }
    if (!window.ARES_SOLAR?.beginJourney) {
      $("#status").textContent = "ARRIVAL SYSTEM UNAVAILABLE · RELOAD TO RETRY";
      return;
    }
    journeyHud.hidden = false;
    intro.classList.add("flight-mode");
    document.body.classList.add("cinematic-flight");
    journeyLabel.textContent = JOURNEY_STEPS[0][2];
    journeyStep.textContent = JOURNEY_STEPS[0][1];
    journeyProgress.style.width = "0%";
    const started = window.ARES_SOLAR.beginJourney();
    if (!started) {
      journeyHud.hidden = true;
      intro.classList.remove("flight-mode");
      document.body.classList.remove("cinematic-flight");
      $("#status").textContent = "ARRIVAL COULD NOT START · PLEASE RETRY";
    }
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !journeyHud.hidden) cancelJourney();
  });
  updatePlanetReadout("Mars");
  $("#status").textContent = `${fmt(A.triangles)} terrain triangles ready`;
  go("overview", true);
})();
