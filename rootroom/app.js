(() => {
  "use strict";

  const tileSets = {
    vowels: {
      label: "Vowels",
      type: "vowel",
      items: ["a","e","i","o","u","y"]
    },
    consonants: {
      label: "Consonants",
      type: "consonant",
      items: ["b","c","d","f","g","h","j","k","l","m","n","p","qu","r","s","t","v","w","x","y","z"]
    },
    teams: {
      label: "Teams",
      type: "team",
      items: ["sh","ch","th","wh","ph","ck","ng","tch","dge","ai","ay","ee","ea","oa","ow","oi","oy","ar","or","er","ir","ur"]
    },
    chunks: {
      label: "Chunks",
      type: "chunk",
      items: ["ild","old","ind","ost","unk","all","ank","ink","onk","ung"]
    },
    prefixes: {
      label: "Prefixes",
      type: "prefix",
      items: ["un","re","dis","mis","pre"]
    },
    suffixes: {
      label: "Suffixes",
      type: "suffix",
      items: ["s","es","ed","ing","er","est","ly","ful","less"]
    },
    special: {
      label: "Special",
      type: "special",
      items: ["e","'","-","•","/"]
    }
  };

  const board = document.getElementById("board");
  const emptyState = document.getElementById("emptyState");
  const tileCount = document.getElementById("tileCount");
  const tileTray = document.getElementById("tileTray");
  const categoryTabs = document.getElementById("categoryTabs");
  const tileSearch = document.getElementById("tileSearch");

  const undoBtn = document.getElementById("undoBtn");
  const redoBtn = document.getElementById("redoBtn");
  const duplicateBtn = document.getElementById("duplicateBtn");
  const deleteBtn = document.getElementById("deleteBtn");

  let activeCategory = "vowels";
  let selectedTile = null;
  let dragState = null;
  let nextId = 1;
  let history = [];
  let historyIndex = -1;
  let suppressSnapshot = false;

  function renderCategoryTabs() {
    categoryTabs.innerHTML = "";
    Object.entries(tileSets).forEach(([key, group]) => {
      const btn = document.createElement("button");
      btn.className = "category-btn" + (key === activeCategory ? " active" : "");
      btn.type = "button";
      btn.textContent = group.label;
      btn.dataset.category = key;
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", key === activeCategory ? "true" : "false");
      btn.addEventListener("click", () => {
        activeCategory = key;
        tileSearch.value = "";
        renderCategoryTabs();
        renderTileTray();
      });
      categoryTabs.appendChild(btn);
    });
  }

  function renderTileTray() {
    const search = tileSearch.value.trim().toLowerCase();
    tileTray.innerHTML = "";

    const groups = search
      ? Object.values(tileSets)
      : [tileSets[activeCategory]];

    groups.forEach(group => {
      group.items
        .filter(text => text.toLowerCase().includes(search))
        .forEach(text => tileTray.appendChild(makeLibraryTile(text, group.type)));
    });

    if (!tileTray.children.length) {
      const msg = document.createElement("span");
      msg.style.color = "#758179";
      msg.style.fontSize = ".85rem";
      msg.textContent = "No matching tiles.";
      tileTray.appendChild(msg);
    }
  }

  function makeLibraryTile(text, type) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = `tile library-tile ${type}`;
    el.textContent = text;
    if (text === "y") {
      const job = type === "vowel" ? "vowel" : "consonant";
      el.title = `y acting as a ${job}`;
      el.setAttribute("aria-label", `y acting as a ${job}`);
    } else {
      el.title = `Add ${text}`;
    }
    el.addEventListener("click", () => {
      const offset = 24 * (board.querySelectorAll(".board-tile").length % 8);
      addBoardTile(text, type, 60 + offset, 80 + offset, false);
      snapshot();
    });
    return el;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function addBoardTile(text, type, x, y, selected = true) {
    const el = document.createElement("div");
    el.className = `tile board-tile ${type}`;
    el.textContent = text;
    el.dataset.text = text;
    el.dataset.type = type;
    el.dataset.tileId = String(nextId++);
    el.style.left = `${Math.max(0, x)}px`;
    el.style.top = `${Math.max(0, y)}px`;
    el.tabIndex = 0;

    el.addEventListener("pointerdown", beginDrag);
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      selectTile(el);
    });
    el.addEventListener("dblclick", (e) => {
      e.preventDefault();
      e.stopPropagation();
      selectTile(el);
      duplicateSelected();
    });

    board.appendChild(el);
    if (selected) selectTile(el);
    updateUI();
    return el;
  }

  function selectTile(el) {
    if (selectedTile && selectedTile !== el) {
      selectedTile.classList.remove("selected");
    }
    selectedTile = el;
    if (selectedTile) selectedTile.classList.add("selected");
    updateUI();
  }

  function deselect() {
    if (selectedTile) selectedTile.classList.remove("selected");
    selectedTile = null;
    updateUI();
  }

  function beginDrag(e) {
    if (e.button !== undefined && e.button !== 0) return;
    const el = e.currentTarget;
    e.preventDefault();
    e.stopPropagation();
    selectTile(el);

    const tileRect = el.getBoundingClientRect();
    const boardRect = board.getBoundingClientRect();

    dragState = {
      pointerId: e.pointerId,
      el,
      dx: e.clientX - tileRect.left,
      dy: e.clientY - tileRect.top,
      boardRect,
      startLeft: parseFloat(el.style.left) || 0,
      startTop: parseFloat(el.style.top) || 0
    };

    el.classList.add("dragging");

    try {
      el.setPointerCapture(e.pointerId);
    } catch {}

    el.addEventListener("pointermove", dragMove);
    el.addEventListener("pointerup", endDrag);
    el.addEventListener("pointercancel", endDrag);
  }

  function dragMove(e) {
    if (!dragState || e.pointerId !== dragState.pointerId) return;
    e.preventDefault();

    const { el, dx, dy } = dragState;
    const boardRect = board.getBoundingClientRect();
    const maxX = Math.max(0, board.clientWidth - el.offsetWidth);
    const maxY = Math.max(0, board.clientHeight - el.offsetHeight);

    const x = clamp(e.clientX - boardRect.left - dx, 0, maxX);
    const y = clamp(e.clientY - boardRect.top - dy, 0, maxY);

    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  }

  function endDrag(e) {
    if (!dragState) return;
    const { el, startLeft, startTop, pointerId } = dragState;

    el.classList.remove("dragging");
    el.removeEventListener("pointermove", dragMove);
    el.removeEventListener("pointerup", endDrag);
    el.removeEventListener("pointercancel", endDrag);

    try {
      if (el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId);
    } catch {}

    const endLeft = parseFloat(el.style.left) || 0;
    const endTop = parseFloat(el.style.top) || 0;
    const changed = Math.abs(endLeft - startLeft) > 0.5 || Math.abs(endTop - startTop) > 0.5;

    dragState = null;
    if (changed) snapshot();
  }

  function duplicateSelected() {
    if (!selectedTile) return;
    const x = (parseFloat(selectedTile.style.left) || 0) + 70;
    const y = (parseFloat(selectedTile.style.top) || 0) + 70;
    addBoardTile(
      selectedTile.dataset.text,
      selectedTile.dataset.type,
      x,
      y,
      true
    );
    snapshot();
  }

  function deleteSelected() {
    if (!selectedTile) return;
    selectedTile.remove();
    selectedTile = null;
    updateUI();
    snapshot();
  }

  function clearBoard() {
    if (!board.querySelector(".board-tile")) return;
    if (!confirm("Clear every tile from the board?")) return;
    board.querySelectorAll(".board-tile").forEach(el => el.remove());
    selectedTile = null;
    updateUI();
    snapshot();
  }

  function serializeBoard() {
    return [...board.querySelectorAll(".board-tile")].map(el => ({
      text: el.dataset.text,
      type: el.dataset.type,
      left: parseFloat(el.style.left) || 0,
      top: parseFloat(el.style.top) || 0
    }));
  }

  function restoreBoard(data) {
    suppressSnapshot = true;
    board.querySelectorAll(".board-tile").forEach(el => el.remove());
    selectedTile = null;
    if (Array.isArray(data)) {
      data.forEach(item => addBoardTile(
        String(item.text ?? ""),
        String(item.type ?? "consonant"),
        Number(item.left ?? 0),
        Number(item.top ?? 0),
        false
      ));
    }
    suppressSnapshot = false;
    updateUI();
  }

  function snapshot() {
    if (suppressSnapshot) return;
    const state = JSON.stringify(serializeBoard());

    if (historyIndex >= 0 && history[historyIndex] === state) {
      updateUI();
      return;
    }

    history = history.slice(0, historyIndex + 1);
    history.push(state);
    historyIndex = history.length - 1;

    if (history.length > 60) {
      history.shift();
      historyIndex--;
    }
    updateUI();
  }

  function undo() {
    if (historyIndex <= 0) return;
    historyIndex--;
    restoreBoard(JSON.parse(history[historyIndex]));
    updateUI();
  }

  function redo() {
    if (historyIndex >= history.length - 1) return;
    historyIndex++;
    restoreBoard(JSON.parse(history[historyIndex]));
    updateUI();
  }

  function updateUI() {
    const count = board.querySelectorAll(".board-tile").length;
    tileCount.textContent = `${count} ${count === 1 ? "tile" : "tiles"}`;
    emptyState.classList.toggle("hidden", count > 0);
    undoBtn.disabled = historyIndex <= 0;
    redoBtn.disabled = historyIndex < 0 || historyIndex >= history.length - 1;
    duplicateBtn.disabled = !selectedTile;
    deleteBtn.disabled = !selectedTile;
  }

  tileSearch.addEventListener("input", renderTileTray);
  board.addEventListener("pointerdown", (e) => {
    if (e.target === board) deselect();
  });

  undoBtn.addEventListener("click", undo);
  redoBtn.addEventListener("click", redo);
  duplicateBtn.addEventListener("click", duplicateSelected);
  deleteBtn.addEventListener("click", deleteSelected);
  document.getElementById("clearBtn").addEventListener("click", clearBoard);

  document.getElementById("saveBtn").addEventListener("click", () => {
    localStorage.setItem("rootroom-tile-room-board", JSON.stringify(serializeBoard()));
    alert("Board saved in this browser.");
  });

  document.getElementById("loadBtn").addEventListener("click", () => {
    const raw = localStorage.getItem("rootroom-tile-room-board");
    if (!raw) {
      alert("No saved board was found in this browser.");
      return;
    }
    try {
      restoreBoard(JSON.parse(raw));
      snapshot();
    } catch {
      alert("The saved board could not be loaded.");
    }
  });

  document.getElementById("fullscreenBtn").addEventListener("click", async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {}
  });

  document.addEventListener("keydown", (e) => {
    const activeTag = document.activeElement?.tagName;
    const typing = activeTag === "INPUT" || activeTag === "TEXTAREA";

    if (!typing && (e.key === "Delete" || e.key === "Backspace")) {
      if (selectedTile) {
        e.preventDefault();
        deleteSelected();
      }
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
      e.preventDefault();
      undo();
    }

    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) {
      e.preventDefault();
      redo();
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
      if (selectedTile) {
        e.preventDefault();
        duplicateSelected();
      }
    }
  });

  renderCategoryTabs();
  renderTileTray();
  snapshot();
  updateUI();
})();
