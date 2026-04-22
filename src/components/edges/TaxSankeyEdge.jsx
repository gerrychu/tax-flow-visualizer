import { getBezierPath } from '@xyflow/react';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTaxStore } from '../../store/taxStore';
import { formatCurrency } from '../../utils/format';

export default function TaxSankeyEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data = {},
  markerEnd,
}) {
  const { color = '#94a3b8', dashed, dotted, amount = 0, isReference, widthPx = 1, sourceOffsetY = 0, targetOffsetY = 0, tooltipLabel, sourceCurvature, targetCurvature, onEdgeMouseEnter, onEdgeMouseLeave } = data;

  const sankeyMode = useTaxStore(s => s.sankeyMode);
  const [mouse, setMouse] = useState(null);

  if (sankeyMode && !isReference && amount === 0) {
    return null;
  }

  const isSankey = sankeyMode && !isReference;
  const sy = sourceY + (isSankey ? sourceOffsetY : 0);
  const ty = targetY + (isSankey ? targetOffsetY : 0);

  let edgePath;
  if (sourceCurvature !== undefined || targetCurvature !== undefined) {
    const dx = Math.abs(targetX - sourceX);
    const cp1x = sourceX + dx * (sourceCurvature ?? 0.5);
    const cp2x = targetX - dx * (targetCurvature ?? 0.5);
    edgePath = `M ${sourceX},${sy} C ${cp1x},${sy} ${cp2x},${ty} ${targetX},${ty}`;
  } else {
    [edgePath] = getBezierPath({
      sourceX,
      sourceY: sy,
      sourcePosition,
      targetX,
      targetY: ty,
      targetPosition,
    });
  }

  const strokeWidth = isSankey ? widthPx : (isReference ? 1.5 : 2);
  const isDashed = dashed || dotted || isReference;

  const handlers = amount !== 0 ? {
    onMouseEnter: (e) => { onEdgeMouseEnter?.(); setMouse({ x: e.clientX, y: e.clientY }); },
    onMouseMove:  (e) => setMouse({ x: e.clientX, y: e.clientY }),
    onMouseLeave: ()  => { onEdgeMouseLeave?.(); setMouse(null); },
  } : {};

  return (
    <>
      {/* Visible path */}
      <path
        id={id}
        className="react-flow__edge-path"
        d={edgePath}
        fill="none"
        markerEnd={markerEnd}
        style={{
          stroke: color,
          strokeWidth,
          strokeDasharray: isDashed ? '5,5' : undefined,
          opacity: isReference ? 0.5 : 0.75,
          pointerEvents: 'none',
        }}
      />
      {/* Wide transparent hit area so hover is easy to trigger */}
      {amount !== 0 && (
        <path
          d={edgePath}
          fill="none"
          style={{
            stroke: 'transparent',
            strokeWidth: Math.max(strokeWidth + 12, 20),
            cursor: 'crosshair',
            pointerEvents: 'stroke',
          }}
          {...handlers}
        />
      )}
      {mouse && createPortal(
        <div style={{
          position: 'fixed',
          left: mouse.x + 14,
          top: mouse.y - 32,
          background: '#1e293b',
          color: 'white',
          fontSize: 12,
          fontWeight: 500,
          padding: '4px 10px',
          borderRadius: 6,
          pointerEvents: 'none',
          zIndex: 9999,
          boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
          whiteSpace: 'nowrap',
        }}>
          {tooltipLabel && <div style={{ fontSize: 11, opacity: 0.75, marginBottom: 2 }}>{tooltipLabel}</div>}
          {formatCurrency(amount)}
        </div>,
        document.body
      )}
    </>
  );
}
