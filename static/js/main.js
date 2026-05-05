// Expects TREE_DATA and ADD_NODE_URL defined by the template.
// Update URL is ADD_NODE_URL + nodeId + "/"

const nodes = new Map();
const canvas = document.getElementById("tree-canvas");
const ctx = canvas.getContext("2d");

const addDialog = document.getElementById("add-node-dialog");
const addForm   = document.getElementById("add-node-form");
const editDialog = document.getElementById("edit-node-dialog");
const editForm   = document.getElementById("edit-node-form");

let pendingParentId  = null;
let editingNodeId    = null;
let pendingDeleteId  = null;
let dragState        = null; // {nodeId, startMX, startMY, origX, origY}
let hoveredNodeId    = null;

// ── Constants ────────────────────────────────────────────────────────────────
const NODE_W   = 120;
const NODE_H   = 44;
const NODE_R   = 38;
const BTN_W    = 52;
const BTN_H    = 18;
const BTN_GAP  = 6;   // horizontal gap between the two buttons
const BTN_TOP  = 6;   // gap between node bottom edge and button top
const TRASH_R  = 9;   // radius of the trash button circle

// ── State ────────────────────────────────────────────────────────────────────
function applyEvent(evt) {
  if (evt.type === "node_added" || evt.type === "node_updated") {
    nodes.set(evt.node.id, evt.node);
  } else if (evt.type === "nodes_deleted") {
    for (const id of evt.ids) nodes.delete(id);
    if (evt.ids.includes(hoveredNodeId)) hoveredNodeId = null;
  }
  render();
}

function loadInitialData() {
  for (const n of TREE_DATA.nodes) nodes.set(n.id, n);
}

// ── Geometry ─────────────────────────────────────────────────────────────────

// Returns pixel center of node. Unpositioned nodes default to canvas center.
function nodePos(node) {
  return {
    x: node.content.x ?? canvas.width / 2,
    y: node.content.y ?? 80,
  };
}

// Y coordinate of the lowest edge of the node shape
function nodeBottom(node) {
  const { y } = nodePos(node);
  return node.content.shape === "circle" ? y + NODE_R : y + NODE_H / 2;
}

// Bounding rects for the two buttons below a node
function btnRects(node) {
  const { x } = nodePos(node);
  const top = nodeBottom(node) + BTN_TOP;
  return {
    edit: { x: x - BTN_GAP / 2 - BTN_W, y: top, w: BTN_W, h: BTN_H },
    add:  { x: x + BTN_GAP / 2,          y: top, w: BTN_W, h: BTN_H },
  };
}

function inRect(mx, my, r) {
  return mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h;
}

// Center of the trash button: upper-right corner of the node
function trashPos(node) {
  const { x, y } = nodePos(node);
  if (node.content.shape === "circle") {
    return { x: x + Math.round(NODE_R * 0.68), y: y - Math.round(NODE_R * 0.68) };
  }
  return { x: x + NODE_W / 2 - 6, y: y - NODE_H / 2 + 6 };
}

// True when cursor is anywhere inside the node's interactive area
function isOverNode(mx, my, node) {
  const { x, y } = nodePos(node);
  if (node.content.shape === "circle") {
    if ((mx - x) ** 2 + (my - y) ** 2 <= NODE_R ** 2) return true;
  } else {
    if (inRect(mx, my, { x: x - NODE_W / 2, y: y - NODE_H / 2, w: NODE_W, h: NODE_H })) return true;
  }
  const b = btnRects(node);
  if (inRect(mx, my, b.edit) || inRect(mx, my, b.add)) return true;
  const tp = trashPos(node);
  if ((mx - tp.x) ** 2 + (my - tp.y) ** 2 <= TRASH_R ** 2) return true;
  return false;
}

// Returns {type: "trash"|"edit"|"add"|"drag", node} or null
function hitTest(mx, my) {
  // Trash button only visible on hovered node — check it first
  if (hoveredNodeId) {
    const hn = nodes.get(hoveredNodeId);
    if (hn) {
      const tp = trashPos(hn);
      if ((mx - tp.x) ** 2 + (my - tp.y) ** 2 <= TRASH_R ** 2) return { type: "trash", node: hn };
    }
  }
  for (const node of nodes.values()) {
    if (node.id === hoveredNodeId) {
      const b = btnRects(node);
      if (inRect(mx, my, b.edit)) return { type: "edit", node };
      if (inRect(mx, my, b.add))  return { type: "add",  node };
    }
    const { x, y } = nodePos(node);
    if (node.content.shape === "circle") {
      if ((mx - x) ** 2 + (my - y) ** 2 <= NODE_R ** 2) return { type: "drag", node };
    } else {
      if (inRect(mx, my, { x: x - NODE_W / 2, y: y - NODE_H / 2, w: NODE_W, h: NODE_H }))
        return { type: "drag", node };
    }
  }
  return null;
}

// ── Rendering ────────────────────────────────────────────────────────────────
function resize() {
  const c = canvas.parentElement;
  canvas.width  = c.clientWidth;
  canvas.height = c.clientHeight;
  render();
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Edges
  ctx.strokeStyle = "#888";
  ctx.lineWidth = 1.5;
  for (const node of nodes.values()) {
    if (!node.parent_id) continue;
    const parent = nodes.get(node.parent_id);
    if (!parent) continue;
    const from = nodePos(parent);
    const to   = nodePos(node);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }

  for (const node of nodes.values()) drawNode(node);
}

function roundedRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y,     x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h,     x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y,         x + r, y);
  ctx.closePath();
}

function drawNode(node) {
  const { x, y } = nodePos(node);
  const { color = "#ffffff", shape = "rect", label = "" } = node.content;

  ctx.fillStyle   = color;
  ctx.strokeStyle = "#444";
  ctx.lineWidth   = 1.5;

  if (shape === "circle") {
    ctx.beginPath();
    ctx.arc(x, y, NODE_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else {
    roundedRect(x - NODE_W / 2, y - NODE_H / 2, NODE_W, NODE_H, 6);
    ctx.fill();
    ctx.stroke();
  }

  // Label — truncate to fit
  ctx.fillStyle    = "#111";
  ctx.font         = "13px sans-serif";
  ctx.textAlign    = "center";
  ctx.textBaseline = "middle";
  const maxW = shape === "circle" ? NODE_R * 1.3 : NODE_W - 12;
  let text = label;
  while (ctx.measureText(text).width > maxW && text.length > 1) text = text.slice(0, -1);
  if (text !== label) text = text.slice(0, -1) + "…";
  ctx.fillText(text, x, y);

  // Buttons — only when this node is hovered
  if (node.id === hoveredNodeId) {
    const b = btnRects(node);
    drawBtn(b.edit, "Edit",    "#555", "#fff");
    drawBtn(b.add,  "+ Child", "#1a1a2e", "#fff");
    drawTrashBtn(node);
  }
}

function drawTrashBtn(node) {
  const { x, y } = trashPos(node);

  ctx.fillStyle = "#e53935";
  ctx.beginPath();
  ctx.arc(x, y, TRASH_R, 0, Math.PI * 2);
  ctx.fill();

  // Minimal trash-can icon in white
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1.4;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // Lid handle
  ctx.beginPath();
  ctx.moveTo(x - 1.8, y - 3.5);
  ctx.lineTo(x - 1.8, y - 5);
  ctx.lineTo(x + 1.8, y - 5);
  ctx.lineTo(x + 1.8, y - 3.5);
  ctx.stroke();
  // Lid
  ctx.beginPath();
  ctx.moveTo(x - 4.5, y - 3.5);
  ctx.lineTo(x + 4.5, y - 3.5);
  ctx.stroke();
  // Body outline
  ctx.beginPath();
  ctx.moveTo(x - 3.5, y - 2.5);
  ctx.lineTo(x - 3,   y + 4);
  ctx.lineTo(x + 3,   y + 4);
  ctx.lineTo(x + 3.5, y - 2.5);
  ctx.stroke();
  // Centre line
  ctx.beginPath();
  ctx.moveTo(x, y - 2);
  ctx.lineTo(x, y + 3.5);
  ctx.stroke();
}

function drawBtn(r, label, bg, fg) {
  ctx.fillStyle = bg;
  roundedRect(r.x, r.y, r.w, r.h, 3);
  ctx.fill();
  ctx.fillStyle    = fg;
  ctx.font         = "11px sans-serif";
  ctx.textAlign    = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2);
}

// ── Mouse interaction ────────────────────────────────────────────────────────
canvas.addEventListener("mousedown", e => {
  if (e.button !== 0) return;
  const rect = canvas.getBoundingClientRect();
  const hit = hitTest(e.clientX - rect.left, e.clientY - rect.top);
  if (!hit) return;

  if (hit.type === "trash") {
    initiateDelete(hit.node);
  } else if (hit.type === "edit") {
    openEditDialog(hit.node);
  } else if (hit.type === "add") {
    openAddDialog(hit.node);
  } else {
    const { x, y } = nodePos(hit.node);
    dragState = { nodeId: hit.node.id, startMX: e.clientX, startMY: e.clientY, origX: x, origY: y };
    canvas.style.cursor = "grabbing";
  }
});

canvas.addEventListener("mousemove", e => {
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  if (dragState) {
    const node = nodes.get(dragState.nodeId);
    if (node) {
      node.content.x = dragState.origX + (e.clientX - dragState.startMX);
      node.content.y = dragState.origY + (e.clientY - dragState.startMY);
      render();
    }
    return;
  }

  // Update hover state (which node shows its trash button)
  let newHover = null;
  for (const node of nodes.values()) {
    if (isOverNode(mx, my, node)) { newHover = node.id; break; }
  }
  if (newHover !== hoveredNodeId) {
    hoveredNodeId = newHover;
    render();
  }

  // Cursor hint
  const hit = hitTest(mx, my);
  canvas.style.cursor = !hit ? "default" : hit.type === "drag" ? "grab" : "pointer";
});

// Listen on window so drag isn't broken if mouse leaves canvas
window.addEventListener("mouseup", async () => {
  if (!dragState) return;
  const node = nodes.get(dragState.nodeId);
  dragState = null;
  canvas.style.cursor = "default";
  if (node) await patchNode(node.id, { x: node.content.x, y: node.content.y });
});

// ── Dialogs ──────────────────────────────────────────────────────────────────
function openAddDialog(parentNode) {
  pendingParentId = parentNode.id;
  addForm.reset();
  addDialog.showModal();
}

function openEditDialog(node) {
  editingNodeId = node.id;
  editForm.elements["label"].value = node.content.label || "";
  editForm.elements["color"].value = node.content.color || "#aaddff";
  editForm.elements["shape"].value = node.content.shape || "rect";
  editDialog.showModal();
}

document.getElementById("add-cancel").addEventListener("click", () => {
  addDialog.close();
  pendingParentId = null;
});

document.getElementById("edit-cancel").addEventListener("click", () => {
  editDialog.close();
  editingNodeId = null;
});

addForm.addEventListener("submit", async e => {
  e.preventDefault();
  const parent = nodes.get(pendingParentId);
  if (!parent) return;

  const siblings = [...nodes.values()].filter(n => n.parent_id === pendingParentId);
  const px = parent.content.x ?? canvas.width / 2;
  const py = parent.content.y ?? 80;
  const content = {
    label: addForm.elements["label"].value.trim(),
    color: addForm.elements["color"].value,
    shape: addForm.elements["shape"].value,
    x: px + siblings.length * 140,
    y: py + 130,
  };

  const res = await postJSON(ADD_NODE_URL, { parent_id: pendingParentId, content });
  if (!res) return;
  applyEvent(res);
  addDialog.close();
  pendingParentId = null;
});

editForm.addEventListener("submit", async e => {
  e.preventDefault();
  const content = {
    label: editForm.elements["label"].value.trim(),
    color: editForm.elements["color"].value,
    shape: editForm.elements["shape"].value,
  };

  const res = await postJSON(ADD_NODE_URL + editingNodeId + "/", { content });
  if (!res) return;
  applyEvent(res);
  editDialog.close();
  editingNodeId = null;
});

function countDescendants(nodeId) {
  let count = 0;
  for (const node of nodes.values()) {
    if (node.parent_id === nodeId) count += 1 + countDescendants(node.id);
  }
  return count;
}

const deleteConfirmDialog = document.getElementById("delete-confirm-dialog");

function initiateDelete(node) {
  const childCount = countDescendants(node.id);
  if (childCount > 0) {
    pendingDeleteId = node.id;
    document.getElementById("delete-confirm-msg").textContent =
      `Are you sure you want to delete "${node.content.label}" with ${childCount} child node(s)?`;
    deleteConfirmDialog.showModal();
  } else {
    executeDelete(node.id);
  }
}

document.getElementById("delete-confirm-ok").addEventListener("click", () => {
  deleteConfirmDialog.close();
  if (pendingDeleteId) { executeDelete(pendingDeleteId); pendingDeleteId = null; }
});

document.getElementById("delete-confirm-cancel").addEventListener("click", () => {
  deleteConfirmDialog.close();
  pendingDeleteId = null;
});

async function executeDelete(nodeId) {
  const res = await postJSON(ADD_NODE_URL + nodeId + "/delete/", {});
  if (res) applyEvent(res);
}

async function patchNode(nodeId, contentUpdates) {
  // Fire-and-forget position save; errors are non-critical
  postJSON(ADD_NODE_URL + nodeId + "/", { content: contentUpdates }).catch(() => {});
}

// ── Helpers ──────────────────────────────────────────────────────────────────
async function postJSON(url, body) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRFToken": getCsrfToken() },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || "Request failed.");
      return null;
    }
    return res.json();
  } catch {
    alert("Network error.");
    return null;
  }
}

function getCsrfToken() {
  const m = document.cookie.match(/csrftoken=([^;]+)/);
  return m ? m[1] : "";
}

// ── Boot ──────────────────────────────────────────────────────────────────────
window.addEventListener("resize", resize);
loadInitialData();
requestAnimationFrame(resize);
