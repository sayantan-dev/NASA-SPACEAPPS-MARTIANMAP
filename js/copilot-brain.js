/**
 * ARES - Mars Mission Copilot Intelligence Module (Standalone)
 * Processes natural language requests using an expanded, high-density data matrix.
 */
(function () {
  const initCopilotBrain = () => {
    // Core DOM Hooks
    const badge = document.getElementById("ares-copilot-badge");
    const win = document.getElementById("ares-copilot-window");
    const close = document.getElementById("chat-close-btn");
    const input = document.getElementById("chat-input");
    const btn = document.getElementById("chat-send-btn");
    const log = document.getElementById("chat-log");

    if (!badge || !win) return;

    console.log(
      "[ARES BRAIN] Initializing high-density standalone copilot engine.",
    );

    // UI Panel Event Handlers
    badge.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      badge.style.setProperty("display", "none", "important");
      win.classList.remove("hidden");
      win.style.setProperty("display", "flex", "important");
      if (input) input.focus();
    };

    if (close) {
      close.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        win.style.setProperty("display", "none", "important");
        win.classList.add("hidden");
        badge.style.setProperty("display", "flex", "important");
      };
    }

    // Setup Chat Event Listeners
    if (btn && input && log) {
      btn.onclick = processQuery;
      input.onkeypress = (e) => {
        if (e.key === "Enter") processQuery();
      };
    }

    function processQuery() {
      const queryText = input.value.trim();
      if (!queryText) return;

      appendBubble(queryText, "user");
      input.value = "";

      setTimeout(() => {
        const answerText = matchIntelDataset(queryText);
        appendBubble(answerText, "bot");

        // Real-time Visual Tracking Hook
        const low = queryText.toLowerCase();
        if (low.match(/(jezero|crater|delta|mesh|model|map|terrain|geology)/)) {
          shiftThreeCam("jezero");
        } else if (low.match(/(eva|route|path|walk|plan|shortest|gentlest)/)) {
          shiftThreeCam("eva-path");
        }
      }, 300);
    }

    function appendBubble(text, sender) {
      const div = document.createElement("div");
      div.className = `chat-message ${sender}`;
      div.innerText = text;
      log.appendChild(div);
      log.scrollTop = log.scrollHeight;
    }

    function matchIntelDataset(userInput) {
      const raw = userInput.toLowerCase().trim();

      // 🚀 EXPANDED, HIGH-DENSITY KNOWLEDGE MATRIX
      const database = [
        // --- CATEGORY 1: GREETINGS & CORE ASSISTANCE ---
        {
          keys: ["hello", "hi", "hey", "greetings", "help", "status", "online"],
          text: "Hey there! Welcome to the ARES Mission Control cockpit terminal. 🚀 I'm your operational copilot. I can break down the science behind Jezero Crater, pull telemetry metrics from your data structures, explain our NASA source sets, or guide you step-by-step through our custom 3D EVA Path Planner. What can I help you check?",
        },
        // --- CATEGORY 2: DETAILED APPLICATION WORKFLOWS ---
        {
          keys: [
            "surface explorer",
            "explorer tab",
            "explorer view",
            "3d model",
            "look around",
            "canvas",
          ],
          text: "The 'Surface Explorer' tab opens our immersive 3D viewport of the Martian terrain! You can click and drag to rotate the crater, zoom in to look closely at geological formations, and use the 'LAYERS' matrix toggle on the bottom left to instantly overlay active color-coded elevation heatmaps.",
        },
        {
          keys: [
            "eva planner",
            "plan a route",
            "route planner",
            "path finder",
            "walk planning",
            "pathing",
          ],
          text: "The 'EVA Planner' tab is our core astronaut routing dashboard. It uses a network calculation matrix to plot exploration paths between target site coordinates. It maps two choices: the absolute Shortest Route or the safety-focused Gentlest Route. Adjust the 'Slope Limit' slider to restrict paths on dangerous inclines!",
        },
        {
          keys: [
            "mission overview",
            "landing site",
            "summary",
            "about this dashboard",
          ],
          text: "The 'Mission Overview' panel serves as your initial flight debriefing deck. It pulls primary telemetry data points, coordinate anchors, and local atmospheric metrics to give your crew an overview before running field simulations.",
        },
        {
          keys: ["layers button", "toggle layers", "heatmap", "color map"],
          text: "Clicking the 'LAYERS' toolbar element down on the left fires a custom event loop that shifts the Three.js mesh materials. It changes the visual landscape from standard natural color telemetry to an altitude variance heatmap, highlighting steep cliffs in red.",
        },
        {
          keys: ["recenter", "center button", "reset view"],
          text: "The 'RECENTER' button triggers an instant spatial tracking correction, adjusting your camera vector to safely lock back onto our main crater study origin points.",
        },
        // --- CATEGORY 3: SCIENCE, DATASETS, AND DATA THEORY ---
        {
          keys: [
            "what is ares",
            "project purpose",
            "goal",
            "hackathon",
            "space apps",
          ],
          text: "ARES stands for Autonomous Route Evaluation Simulation. Developed for the NASA Space Apps Challenge, it converts raw satellite imagery into functional, interactive workspaces. It helps mission teams test routes and prevent life-threatening vehicle tip-overs during astronaut surface excursions.",
        },
        {
          keys: [
            "nasa data",
            "data source",
            "hirise",
            "mro",
            "where did you get the data",
          ],
          text: "Our terrain map is completely built on authentic NASA data! We sourced high-fidelity spatial telemetry from the HiRISE (High Resolution Imaging Science Experiment) camera attached to the Mars Reconnaissance Orbiter. We converted their raw digital elevation models into the optimized web-ready 3D grid you see here.",
        },
        {
          keys: [
            "elevation",
            "height",
            "deep",
            "altitude",
            "variance",
            "vertical",
          ],
          text: "Jezero Crater features intense vertical drops! The altitude metrics in our active matrix span from -2,613 meters up to -1,664 meters relative to the Mars zero-datum baseline. Our grid monitors these height vectors using rigid 10-meter cell boundaries for fine accuracy.",
        },
        {
          keys: ["slope", "steep", "angle", "incline", "hills", "grades"],
          text: "Slope represents the steepness incline of the ground measured in degrees. The ARES engine calculates these vectors dynamically across every single face of the 3D terrain grid. If a cliff face exceeds the degree ceiling you set on your dashboard slider (e.g., 25°), the routing algorithm automatically flags it as hazardous and builds a detour around it.",
        },
        {
          keys: ["jezero", "crater location", "coordinates", "landing zone"],
          text: "We are tracking the Jezero Crater delta zone, located at coordinates 18.44463° N and 77.45088° E on Mars. NASA sent the Perseverance rover here because this ancient dry lake bed holds massive clay layers and river deposits that are vital for researching potential fossilized biological history.",
        },
        // --- CATEGORY 4: ADVANCED CAPABILITIES ---
        {
          keys: ["shortest path", "shortest route", "direct line"],
          text: "The Shortest Path engine strictly targets minimizing total distance, routing the user across the direct line of nodes. Warning: This mode ignores intense inclines, so always cross-check your Hazard alerts before clearing a crew for deployment.",
        },
        {
          keys: [
            "gentlest path",
            "gentlest route",
            "safest path",
            "avoid hills",
          ],
          text: "The Gentlest Path algorithm weighs node connections based on changes in slope angles. It purposely maps paths along flatter ridges and contours, providing an entry plan that minimizes physical stress and rover rollover risks.",
        },
      ];

      // Fuzzy Scoring Pipeline
      let highestScore = 0;
      let finalMatch = "";

      for (const item of database) {
        let currentScore = 0;
        for (const key of item.keys) {
          if (raw.includes(key)) {
            currentScore += 5; // Direct phrase hit
          }
          const individualWords = key.split(" ");
          individualWords.forEach((word) => {
            if (word.length > 3 && raw.includes(word)) {
              currentScore += 1; // Partial phrase overlap matching
            }
          });
        }
        if (currentScore > highestScore) {
          highestScore = currentScore;
          finalMatch = item.text;
        }
      }

      if (highestScore > 0) return finalMatch;

      // Intelligent Conversational Fallback
      return "I've picked up your query telemetry, but I don't have that specific parameter logged in my system core. Try asking me something like: 'What does the Surface Explorer do?', 'Tell me about the NASA HiRISE data source', or 'How does the EVA Planner track slope angles?'";
    }

    function shiftThreeCam(zone) {
      if (typeof controls !== "undefined" && typeof camera !== "undefined") {
        if (zone === "jezero") {
          controls.target.set(0, -2100, 0);
          camera.position.set(3000, 1500, 3000);
        } else if (zone === "eva-path") {
          controls.target.set(-500, -1800, 400);
          camera.position.set(1200, 800, 1200);
        }
        controls.update();
        console.log(`[ARES BRAIN] Camera tracking vectors aligned to: ${zone}`);
      }
    }
  };

  // Safe execution window initialization hooks
  if (
    document.readyState === "complete" ||
    document.readyState === "interactive"
  ) {
    setTimeout(initCopilotBrain, 200);
  } else {
    window.addEventListener("load", initCopilotBrain);
  }
})();
