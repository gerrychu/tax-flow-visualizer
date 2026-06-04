import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useNodesInitialized,
  applyNodeChanges,
  Controls,
  ControlButton,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useTaxStore } from '../store/taxStore';
import { buildGraph } from '../utils/buildGraph';
import { NODE_V_GAP } from '../utils/layout';

import TaxSourceNode from './nodes/TaxSourceNode';
import TaxComputedNode from './nodes/TaxComputedNode';
import TaxBracketNode from './nodes/TaxBracketNode';
import TaxDeductionNode from './nodes/TaxDeductionNode';
import TaxResultNode from './nodes/TaxResultNode';
import ZoneDividerNode from './nodes/ZoneDividerNode';
import ZoneLabelNode from './nodes/ZoneLabelNode';
import ZoneSubLabelNode from './nodes/ZoneSubLabelNode';
import TaxSankeyEdge from './edges/TaxSankeyEdge';
import FloatingControls from './FloatingControls';
import OverridePopover from './OverridePopover';

const nodeTypes = {
  taxSource: TaxSourceNode,
  taxComputed: TaxComputedNode,
  taxBracket: TaxBracketNode,
  taxDeduction: TaxDeductionNode,
  taxResult: TaxResultNode,
  zoneDivider: ZoneDividerNode,
  zoneLabel: ZoneLabelNode,
  zoneSubLabel: ZoneSubLabelNode,
};

const edgeTypes = {
  taxSankey: TaxSankeyEdge,
};

function TaxFlow() {
  const { documents, filingStatus, overrides, focusedDocId, computed, lastAddedDocId, clearLastAddedDoc, setExpandToDoc, setShowExportMenu, setShowPresetsMenu, setSelectedNode, setSelectedDoc } = useTaxStore();
  const [openPopover, setOpenPopover] = useState(null);
  const [canvasTooltip, setCanvasTooltip] = useState(null);
  const [nodesDraggable, setNodesDraggable] = useState(false);
  const [layoutKey, setLayoutKey] = useState(0);
  const tooltipDisabled = useRef(false);
  const isOverEdge = useRef(false);
  const dragCount = useRef(0);
  const scrollCount = useRef(0);
  const checkTooltipDisabled = () => {
    if (dragCount.current >= 2 && scrollCount.current >= 2) {
      tooltipDisabled.current = true;
      setCanvasTooltip(null);
    }
  };
  const { fitView, fitBounds, getNode } = useReactFlow();
  const prevDocCountRef = useRef(documents.length);

  // Build graph data — sankeyMode handled per-edge via Zustand subscription
  const { nodes: rawNodes, edges: rawEdges } = useMemo(() => {
    return buildGraph(documents, filingStatus, overrides, computed, focusedDocId);
  }, [documents, filingStatus, overrides, computed, focusedDocId]);

  // Inject override click handler into nodes
  const baseNodes = useMemo(() => {
    return rawNodes.map(node => ({
      ...node,
      data: {
        ...node.data,
        onOverrideClick: (key, id) => {
          const nodeEl = document.querySelector(`[data-id="${id}"]`);
          let pos = { x: 800, y: 200 };
          if (nodeEl) {
            const rect = nodeEl.getBoundingClientRect();
            pos = { x: Math.min(rect.right + 8, window.innerWidth - 300), y: Math.max(8, rect.top) };
          }
          setOpenPopover(prev => (prev?.key === key ? null : { key, pos }));
        },
      },
    }));
  }, [rawNodes]);

  // Local node state so drag positions are tracked without persisting to the store.
  // Reset whenever the graph is rebuilt (documents/overrides change).
  const [nodes, setNodes] = useState(baseNodes);
  useEffect(() => { setNodes(baseNodes); }, [baseNodes]);

  // Zoom to newly added document's source node.
  // Use baseNodes (not nodes state) — baseNodes is always current on the same render
  // that lastAddedDocId is set, whereas nodes state lags one render behind.
  useEffect(() => {
    if (!lastAddedDocId) return;
    const targetNode = baseNodes.find(n => n.data?.sourceDocId === lastAddedDocId);
    if (!targetNode) return;
    clearLastAddedDoc();
    setTimeout(() => {
      fitView({
        nodes: [{ id: targetNode.id }],
        padding: 1.2,
        duration: 500,
        maxZoom: 1.5,
      });
    }, 50);
  }, [lastAddedDocId, baseNodes, fitView, clearLastAddedDoc]);

  // Track document count changes (for future use)
  useEffect(() => {
    prevDocCountRef.current = documents.length;
  }, [documents.length]);

  const onNodesChange = (changes) =>
    setNodes(nds => applyNodeChanges(changes, nds));

  const handleResetView = useCallback(() => {
    setNodes(baseNodes);
    setLayoutKey(k => k + 1);
    setTimeout(() => fitView({ padding: 0.12, duration: 500 }), 100);
  }, [baseNodes, fitView]);

  const onNodeClick = (_evt, node) => {
    if (node.data?.sourceDocId) {
      setExpandToDoc(node.data.sourceDocId);
      setSelectedDoc(node.data.sourceDocId);
    } else {
      setSelectedDoc(null);
    }
  };

  const onSelectionChange = useCallback(({ nodes: selected }) => {
    setSelectedNode(selected.length === 1 ? selected[0].id : null);
  }, [setSelectedNode]);

  const onEdgeClick = useCallback((_evt, edge) => {
    setSelectedNode(null);
    const src = getNode(edge.source);
    const tgt = getNode(edge.target);
    if (!src || !tgt) return;
    const x1 = Math.min(src.position.x, tgt.position.x);
    const y1 = Math.min(src.position.y, tgt.position.y);
    const x2 = Math.max(src.position.x + (src.measured?.width ?? 190), tgt.position.x + (tgt.measured?.width ?? 190));
    const y2 = Math.max(src.position.y + (src.measured?.height ?? 80), tgt.position.y + (tgt.measured?.height ?? 80));
    fitBounds({ x: x1, y: y1, width: x2 - x1, height: y2 - y1 }, { padding: 0.08, duration: 500 });
  }, [getNode, fitBounds, setSelectedNode]);

  // After React Flow measures actual DOM heights, apply exact NODE_V_GAP spacing
  // between nodes whose positions are derived from other nodes' heights.
  const nodesInitialized = useNodesInitialized();
  useEffect(() => {
    if (!nodesInitialized) return;
    setNodes(nds => {
      const posMap = {};

      // Re-stack zone-4 subCol-0 nodes (tax brackets + deductBracket + LTCG) with
      // actual measured heights so the gap between each node is exactly NODE_V_GAP.
      // The first node (highest bracket) keeps its spine-centered position.
      const bracketColNodes = nds
        .filter(n => n.data?.zone === 4 && n.data?.subCol === 0 && n.measured?.height)
        .sort((a, b) => a.position.y - b.position.y);
      if (bracketColNodes.length > 0) {
        let y = bracketColNodes[0].position.y;
        for (const n of bracketColNodes) {
          posMap[n.id] = y;
          y += n.measured.height + NODE_V_GAP;
        }
      }

      // Compute LTCG bracket start Y: below the deduct-bracket node + 2× gap.
      // Extra 100px added when a "Preferential brackets" label is present.
      const deductBracketNode = nds.find(n => n.id === 'deduct-bracket');
      const hasPrefLabel = nds.some(n => n.id === 'zone-label-pref');
      let prefStartY = null;
      if (deductBracketNode?.measured?.height) {
        const bracketY = posMap['deduct-bracket'] ?? deductBracketNode.position.y;
        prefStartY = bracketY + deductBracketNode.measured.height + NODE_V_GAP * 2 + (hasPrefLabel ? 50 : 0);
      }
      if (hasPrefLabel && prefStartY !== null) {
        const labelX = bracketColNodes.length > 0 ? bracketColNodes[0].position.x : nds.find(n => n.id === 'zone-label-pref').position.x;
        posMap['zone-label-pref'] = { x: labelX, y: prefStartY - 45 };
      }

      // Re-stack zone-4 subCol-1 LTCG bracket nodes:
      //   x — aligned with ordinary income bracket column
      //   y — starting at prefStartY, stacking downward
      const prefBracketColNodes = nds
        .filter(n => n.data?.zone === 4 && n.data?.subCol === 1 && n.measured?.height)
        .sort((a, b) => a.position.y - b.position.y);
      if (prefBracketColNodes.length > 0) {
        const bracketX = bracketColNodes.length > 0
          ? bracketColNodes[0].position.x
          : prefBracketColNodes[0].position.x;
        const startY = prefStartY ?? prefBracketColNodes[0].position.y;
        let y = startY;
        for (const n of prefBracketColNodes) {
          posMap[n.id] = { x: bracketX, y };
          y += n.measured.height + NODE_V_GAP;
        }
      }

      // Position Ordinary income node at the max of:
      //   - Y of the 0% preferential bracket (bottom of pref bracket column)
      //   - bottom edge of the deduction node + NODE_V_GAP
      const prefZeroBracket = prefBracketColNodes.find(n => n.data?.rate === 0);
      if (prefZeroBracket) {
        const p = posMap[prefZeroBracket.id];
        const prefZeroY = typeof p === 'object' ? p.y : (p ?? prefZeroBracket.position.y);

        const deductionNode = nds.find(n => n.id === 'deduction');
        const deductionBottom = deductionNode
          ? ((posMap['deduction'] ?? deductionNode.position.y) + (deductionNode.measured?.height ?? 0) + NODE_V_GAP*2)
          : 0;

        posMap['ordinary-inc'] = Math.max(prefZeroY, deductionBottom);
      }

      // Keep amount-keep exactly NODE_V_GAP below total-tax.
      const totalTax = nds.find(n => n.id === 'total-tax');
      if (totalTax?.measured?.height) {
        posMap['amount-keep'] = totalTax.position.y + totalTax.measured.height + NODE_V_GAP;
      }

      const WAGES_LABEL_OFFSET = 50;

      // Compute actual bracket column bottom from zone-4 subCol-0 and subCol-1 nodes,
      // now that they've been restacked above with real measured heights.
      // This is used to push W-2 SS wages and W-2 Medicare wages groups (zone 1) below
      // the lowest bracket node, correcting for estimateNodeHeight inaccuracies in buildGraph.
      const actualBracketColBottom = [...bracketColNodes, ...prefBracketColNodes].reduce((max, n) => {
        const pos = posMap[n.id];
        const y = (typeof pos === 'object' ? pos.y : pos) ?? n.position.y;
        return Math.max(max, y + (n.measured?.height ?? 0));
      }, 0);

      if (actualBracketColBottom > 0) {
        // Helper: if the first node in a sorted group is above minY, shift the whole group
        // (source nodes + all ySyncGroup-tagged dependents) down by the required delta.
        const nudgeWagesGroup = (wagesGroupKey, minY) => {
          const groupNodes = nds
            .filter(n => n.data?.wagesGroup === wagesGroupKey)
            .sort((a, b) => a.position.y - b.position.y);
          if (groupNodes.length === 0) return 0;
          const delta = minY - (posMap[groupNodes[0].id] ?? groupNodes[0].position.y);
          if (delta <= 0) return 0;
          groupNodes.forEach(n => {
            posMap[n.id] = (posMap[n.id] ?? n.position.y) + delta;
          });
          nds.filter(n => n.data?.ySyncGroup === `${wagesGroupKey}-wages`).forEach(n => {
            posMap[n.id] = (posMap[n.id] ?? n.position.y) + delta;
          });
          const last = groupNodes[groupNodes.length - 1];
          return (posMap[last.id] ?? last.position.y) + (last.measured?.height ?? 80);
        };

        const hasSSLabel = nds.some(n => n.id === 'zone-label-ss');
        const ssBottom = nudgeWagesGroup('ss', actualBracketColBottom + NODE_V_GAP * 2);
        if (hasSSLabel) {
          nds.filter(n => n.data?.wagesGroup === 'ss' || n.data?.ySyncGroup === 'ss-wages').forEach(n => {
            posMap[n.id] = (posMap[n.id] ?? n.position.y) + WAGES_LABEL_OFFSET;
          });
        }

        // Restack SS WHG nodes BEFORE nudging Medicare wages so their actual bottom
        // can be incorporated into medMinY.
        let ssWhgBottom = ssBottom;
        const firstSsWagesNode = nds
          .filter(n => n.data?.wagesGroup === 'ss')
          .sort((a, b) => a.position.y - b.position.y)[0];
        if (firstSsWagesNode?.measured?.height) {
          const wagesY = posMap[firstSsWagesNode.id] ?? firstSsWagesNode.position.y;
          const ssWhgSourceNodes = nds
            .filter(n => n.data?.wagesGroup === 'ss-whg' && n.measured?.height)
            .sort((a, b) => a.position.y - b.position.y);
          let whgY = wagesY + firstSsWagesNode.measured.height;
          for (const n of ssWhgSourceNodes) {
            posMap[n.id] = whgY;
            whgY += n.measured.height + NODE_V_GAP;
          }
          if (ssWhgSourceNodes.length > 0) {
            ssWhgBottom = whgY - NODE_V_GAP; // bottom of last SS WHG node
          }
          const firstWhgY = ssWhgSourceNodes.length > 0
            ? (posMap[ssWhgSourceNodes[0].id] ?? ssWhgSourceNodes[0].position.y)
            : wagesY + firstSsWagesNode.measured.height;
          nds.filter(n => n.data?.ySyncGroup === 'ss-whg').forEach(n => { posMap[n.id] = firstWhgY; });
          posMap['ss-overpay-total'] = wagesY;
        }

        const medMinY = Math.max(actualBracketColBottom, ssBottom, ssWhgBottom) + NODE_V_GAP * 2;
        nudgeWagesGroup('med', medMinY);

        // Restack Medicare WHG source nodes below the first Medicare wages node using measured heights.
        const firstMedWagesNode = nds
          .filter(n => n.data?.wagesGroup === 'med')
          .sort((a, b) => a.position.y - b.position.y)[0];
        if (firstMedWagesNode?.measured?.height) {
          const medWagesY = posMap[firstMedWagesNode.id] ?? firstMedWagesNode.position.y;
          const medWhgSourceNodes = nds
            .filter(n => n.data?.wagesGroup === 'med-whg' && n.measured?.height)
            .sort((a, b) => a.position.y - b.position.y);
          let medWhgY = medWagesY + firstMedWagesNode.measured.height;
          for (const n of medWhgSourceNodes) {
            posMap[n.id] = medWhgY;
            medWhgY += n.measured.height + NODE_V_GAP;
          }
          if (medWhgSourceNodes.length > 0) {
            posMap['med-whg-agg'] = posMap[medWhgSourceNodes[0].id] ?? medWhgSourceNodes[0].position.y;
          }
        }
      }

      // Position "Social Security" sub-label above the first SS wages node.
      const firstSsWagesNode = nds
        .filter(n => n.data?.wagesGroup === 'ss')
        .sort((a, b) => a.position.y - b.position.y)[0];
      if (firstSsWagesNode && nds.some(n => n.id === 'zone-label-ss')) {
        const ssY = posMap[firstSsWagesNode.id] ?? firstSsWagesNode.position.y;
        posMap['zone-label-ss'] = { x: firstSsWagesNode.position.x, y: ssY - 45 };
      }

      // Position "Medicare" sub-label above the first Medicare wages node.
      const firstMedWagesLabelNode = nds
        .filter(n => n.data?.wagesGroup === 'med')
        .sort((a, b) => a.position.y - b.position.y)[0];
      if (firstMedWagesLabelNode && nds.some(n => n.id === 'zone-label-med')) {
        nds.filter(n => n.data?.wagesGroup === 'med' || n.data?.ySyncGroup === 'med-wages').forEach(n => {
          posMap[n.id] = (posMap[n.id] ?? n.position.y);
        });
        const medY = posMap[firstMedWagesLabelNode.id] ?? firstMedWagesLabelNode.position.y;
        posMap['zone-label-med'] = { x: firstMedWagesLabelNode.position.x, y: medY - 45 };
      }

      if (Object.keys(posMap).length === 0) return nds;
      return nds.map(n => {
        const p = posMap[n.id];
        if (p === undefined) return n;
        if (typeof p === 'object') return { ...n, position: { ...n.position, ...p } };
        return { ...n, position: { ...n.position, y: p } };
      });
    });
  }, [nodesInitialized, layoutKey]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <ReactFlow
        nodes={nodes}
        edges={rawEdges.map(e => ({ ...e, data: { ...e.data, onEdgeMouseEnter: () => { isOverEdge.current = true; setCanvasTooltip(null); }, onEdgeMouseLeave: () => { isOverEdge.current = false; } } }))}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.12 }}
        onNodesChange={onNodesChange}
        onNodeClick={onNodeClick}
        onSelectionChange={onSelectionChange}
        onEdgeClick={onEdgeClick}
        nodesConnectable={false}
        nodesDraggable={nodesDraggable}
        panOnDrag
        zoomOnScroll
        minZoom={0.15}
        maxZoom={2}
        style={{ background: '#f8fafc' }}
        proOptions={{ hideAttribution: true }}
        onPaneClick={() => { setOpenPopover(null); setShowExportMenu(false); setShowPresetsMenu(false); setSelectedNode(null); setSelectedDoc(null); }}
        onMoveStart={(e) => {
          if (e?.type === 'wheel') { scrollCount.current += 1; }
          else { dragCount.current += 1; }
          checkTooltipDisabled();
        }}
        onPaneMouseMove={(e) => { if (!tooltipDisabled.current && !isOverEdge.current) setCanvasTooltip({ x: e.clientX, y: e.clientY }); }}
        onPaneMouseLeave={() => setCanvasTooltip(null)}
        onEdgeMouseEnter={() => setCanvasTooltip(null)}
        onEdgeMouseLeave={() => setCanvasTooltip(null)}
      >
        <Controls showInteractive={false}>
          <ControlButton onClick={handleResetView} title="Reset layout">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
            </svg>
          </ControlButton>
          <ControlButton onClick={() => setNodesDraggable(d => !d)} title={nodesDraggable ? 'Lock nodes' : 'Unlock nodes'}>
            {nodesDraggable ? (
              <svg viewBox="0 -2 24 26" fill="currentColor">
                <path d="M18 8H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/>
                <path d="M7 8V4a5 5 0 0 1 10 0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
              </svg>
            )}
          </ControlButton>
        </Controls>
        <FloatingControls />
      </ReactFlow>

      {canvasTooltip && (
        <div style={{
          position: 'fixed',
          top: canvasTooltip.y + 10,
          left: canvasTooltip.x + 10,
          zIndex: 100,
          background: 'rgba(100,116,139,0.85)',
          color: 'white',
          fontSize: 12,
          borderRadius: 6,
          padding: '6px 10px',
          pointerEvents: 'none',
          lineHeight: 1.6,
          whiteSpace: 'nowrap',
        }}>
          🔍 Scroll to zoom<br />✥ Drag to pan<br />Like Google Maps
        </div>
      )}

      {openPopover && (
        <OverridePopover
          overrideKey={openPopover.key}
          anchorPos={openPopover.pos}
          onClose={() => setOpenPopover(null)}
        />
      )}
    </div>
  );
}

export default function TaxCanvas() {
  return (
    <ReactFlowProvider>
      <TaxFlow />
    </ReactFlowProvider>
  );
}
