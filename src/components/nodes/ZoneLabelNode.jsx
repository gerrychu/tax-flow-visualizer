export default function ZoneLabelNode({ data }) {
  return (
    <div style={{
      fontSize: 36,
      fontWeight: 700,
      color: '#0f172a',
      textTransform: 'uppercase',
      pointerEvents: 'none',
      userSelect: 'none',
      whiteSpace: 'pre',
      lineHeight: 1.2,
    }}>
      {data.label}
    </div>
  );
}
