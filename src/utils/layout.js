// ─── Zone / sub-column layout constants ──────────────────────────────────────
// Max sub-cols per zone (0-indexed): z1=1, z2=5, z3=4, z4=3, z5=4
// Zone 3 start is derived from zone 2's last column end so layout stays in sync.
export const SUB_COL_WIDTH = 350;
export const NODE_WIDTH = 200;

export const Z2_START = 350;
export const Z3_Z4_OFFSET = SUB_COL_WIDTH * 2; // z4 starts this many px after z3
export const Z4_Z5_OFFSET = 2 * SUB_COL_WIDTH; // z5 starts this many px after z4

// Z3_START is a placeholder — overwritten dynamically in buildGraph once numDynamicSubCol is known.
// Z3_START = Z2_START + (3 + numDynamicSubCol) * SUB_COL_WIDTH
const Z3_START_DEFAULT = Z2_START + 3 * SUB_COL_WIDTH; // numDynamicSubCol=0 baseline
export const ZONE_STARTS = [0, 0, Z2_START, Z3_START_DEFAULT, Z3_START_DEFAULT + Z3_Z4_OFFSET, Z3_START_DEFAULT + Z3_Z4_OFFSET + Z4_Z5_OFFSET];
export const NODE_HEIGHT_FLOW = 120; // default flow-mode height
export const NODE_MIN_HEIGHT = 80;
export const NODE_V_GAP = 24; // minimum vertical gap between nodes in same sub-col
export const NODE_START_Y = 60;
export const SPINE_CENTER_Y = 220; // y-coordinate of the spine centerline (vertical midpoint of all spine nodes)

// Zone config: each zone has sub-columns
// zone index (0-based), subCol index (0-based)
export function nodeX(zone, subCol) {
  return ZONE_STARTS[zone] + subCol * SUB_COL_WIDTH;
}

// Given a list of nodes in the same sub-column, compute y positions
// nodeList: [{ id, height }]
// Returns: { [id]: y }
export function computeColumnY(nodeList, startY = NODE_START_Y, gap = NODE_V_GAP) {
  const result = {};
  let y = startY;
  for (const node of nodeList) {
    result[node.id] = y;
    y += (node.height || NODE_HEIGHT_FLOW) + gap;
  }
  return result;
}
