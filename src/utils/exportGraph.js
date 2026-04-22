import { toPng, toSvg } from 'html-to-image';
import { getNodesBounds, getViewportForBounds } from '@xyflow/react';

const IMAGE_WIDTH = 2400;
const PIXEL_RATIO = 2;
const PADDING = 0.08;

function getExportTransform(nodes) {
  const bounds = getNodesBounds(nodes);
  const imageHeight = Math.max(800, Math.round(IMAGE_WIDTH * (bounds.height / bounds.width)));
  const viewport = getViewportForBounds(bounds, IMAGE_WIDTH, imageHeight, 0.05, 2, PADDING);
  return { viewport, imageWidth: IMAGE_WIDTH, imageHeight };
}

function getViewportEl() {
  return document.querySelector('.react-flow__viewport');
}

// Tooltips are portalled to document.body (position: fixed) so they are
// outside .react-flow__viewport and automatically excluded from the export.
function exportOpts(viewport, imageWidth, imageHeight) {
  return {
    backgroundColor: '#ffffff',
    width: imageWidth,
    height: imageHeight,
    pixelRatio: PIXEL_RATIO,
    style: {
      transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
      transformOrigin: 'top left',
    },
  };
}

function download(dataUrl, filename) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

export async function exportToPng(nodes) {
  const el = getViewportEl();
  const { viewport, imageWidth, imageHeight } = getExportTransform(nodes);
  const dataUrl = await toPng(el, exportOpts(viewport, imageWidth, imageHeight));
  download(dataUrl, 'tax-flow.png');
}

export async function exportToSvg(nodes) {
  const el = getViewportEl();
  const { viewport, imageWidth, imageHeight } = getExportTransform(nodes);
  const dataUrl = await toSvg(el, exportOpts(viewport, imageWidth, imageHeight));
  download(dataUrl, 'tax-flow.svg');
}
