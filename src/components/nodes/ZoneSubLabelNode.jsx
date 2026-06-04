export default function ZoneSubLabelNode({ data }) {
  return (
    <div style={{
      fontSize: 26,
      fontWeight: 500,
      color: '#0f172a',
      pointerEvents: 'none',
      userSelect: 'none',
      whiteSpace: 'pre',
      lineHeight: 1.2,
    }}>
      {data.label}
    </div>
  );
}
