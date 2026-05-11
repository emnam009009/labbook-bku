/**
 * lineage-graph.ts — D3 force-directed graph rendering for lineage modal.
 *
 * Renders LineageGraph (nodes + edges) into an SVG inside the modal.
 * Force layout with drag, zoom/pan, click to navigate.
 *
 * D3 modules used (modular for tree-shaking):
 *   - d3-selection: DOM manipulation
 *   - d3-force: physics simulation
 *   - d3-zoom: pan/zoom
 *   - d3-drag: node dragging
 *
 * Round R154-1 — Phase B.5
 */

import * as d3sel from 'd3-selection';
import * as d3force from 'd3-force';
import * as d3zoom from 'd3-zoom';
import * as d3drag from 'd3-drag';
import type { LineageGraph } from '@/domains/lineage/service';

// Color per node type
const NODE_COLORS: Record<string, string> = {
  'material':  '#7C3AED',  // purple
  'sample':    '#0D9488',  // teal
  'experiment':'#F59E0B',  // amber (center)
  'dataasset': '#3B82F6',  // blue
};

const NODE_RADIUS: Record<string, number> = {
  'material':  18,
  'sample':    16,
  'experiment':24,  // center, larger
  'dataasset': 14,
};

// Edge styling per type
const EDGE_STYLES: Record<string, { color: string; dash?: string; label?: string }> = {
  'composed_of': { color: '#A78BFA', label: 'composed of' },
  'parent':      { color: '#9CA3AF', dash: '4,3', label: 'parent' },
  'input':       { color: '#0D9488', label: 'input' },
  'output':      { color: '#16A34A', label: 'output' },
  'attached':    { color: '#3B82F6', dash: '3,3', label: 'attached' },
};

interface SimNode extends d3force.SimulationNodeDatum {
  id: string;
  refId: string;
  type: string;
  label: string;
  sublabel?: string;
  isCenter?: boolean;
}

interface SimLink extends d3force.SimulationLinkDatum<SimNode> {
  type: string;
}

export function renderLineageGraph(container: HTMLElement, graph: LineageGraph): void {
  const width = container.clientWidth || 700;
  const height = 480;

  // Clear previous
  container.innerHTML = '';

  // Convert to D3 sim format
  const nodes: SimNode[] = graph.nodes.map(n => ({
    id: n.id,
    refId: n.refId,
    type: n.type,
    label: n.label,
    sublabel: n.sublabel,
    isCenter: n.isCenter,
  }));
  const links: SimLink[] = graph.edges.map(e => ({
    source: e.source,
    target: e.target,
    type: e.type,
  }));

  // SVG root
  const svg = d3sel.select(container)
    .append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('width', '100%')
    .attr('height', height);

  // Inner group for zoom
  const g = svg.append('g');

  // Arrow marker for edges (directional)
  const defs = svg.append('defs');
  for (const [type, style] of Object.entries(EDGE_STYLES)) {
    defs.append('marker')
      .attr('id', `arrow-${type}`)
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 18)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', style.color);
  }

  // Edges
  const link = g.append('g')
    .selectAll('line')
    .data(links)
    .join('line')
    .attr('stroke', d => EDGE_STYLES[d.type]?.color || '#CBD5E1')
    .attr('stroke-width', 1.5)
    .attr('stroke-dasharray', d => EDGE_STYLES[d.type]?.dash || '0')
    .attr('marker-end', d => `url(#arrow-${d.type})`);

  // Node groups
  const node = g.append('g')
    .selectAll('g')
    .data(nodes)
    .join('g')
    .attr('class', 'lb-lineage-node')
    .attr('data-node-id', d => d.id)
    .style('cursor', 'pointer');

  // Node circle
  node.append('circle')
    .attr('r', d => NODE_RADIUS[d.type] || 14)
    .attr('fill', d => d.isCenter ? '#FBBF24' : (NODE_COLORS[d.type] || '#9CA3AF'))
    .attr('stroke', d => d.isCenter ? '#92400E' : '#FFFFFF')
    .attr('stroke-width', d => d.isCenter ? 3 : 2);

  // Node label (main, below circle)
  node.append('text')
    .attr('y', d => (NODE_RADIUS[d.type] || 14) + 14)
    .attr('text-anchor', 'middle')
    .attr('font-size', '11px')
    .attr('font-weight', '600')
    .attr('fill', '#0F172A')
    .text(d => d.label);

  // Node sublabel (smaller, below main)
  node.append('text')
    .attr('y', d => (NODE_RADIUS[d.type] || 14) + 26)
    .attr('text-anchor', 'middle')
    .attr('font-size', '9px')
    .attr('fill', '#6B7280')
    .text(d => d.sublabel || '');

  // Drag behavior
  const dragBehavior = d3drag.drag<SVGGElement, SimNode>()
    .on('start', (event, d) => {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    })
    .on('drag', (event, d) => {
      d.fx = event.x;
      d.fy = event.y;
    })
    .on('end', (event, d) => {
      if (!event.active) simulation.alphaTarget(0);
      // Release for natural settle, but center stays fixed
      if (!d.isCenter) {
        d.fx = null;
        d.fy = null;
      }
    });

  node.call(dragBehavior as any);

  // Click → navigate (close lineage modal, open detail of clicked entity)
  node.on('click', (event, d) => {
    event.stopPropagation();
    if (typeof (window as any).onLineageNodeClick === 'function') {
      (window as any).onLineageNodeClick(d.type, d.refId);
    }
  });

  // Zoom/pan
  const zoomBehavior = d3zoom.zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.3, 3])
    .on('zoom', (event) => {
      g.attr('transform', event.transform);
    });
  svg.call(zoomBehavior as any);

  // Force simulation
  const simulation = d3force.forceSimulation<SimNode>(nodes)
    .force('link', d3force.forceLink<SimNode, SimLink>(links).id(d => d.id).distance(90))
    .force('charge', d3force.forceManyBody().strength(-280))
    .force('center', d3force.forceCenter(width / 2, height / 2))
    .force('collide', d3force.forceCollide().radius(d => (NODE_RADIUS[(d as SimNode).type] || 14) + 4))
    .on('tick', () => {
      link
        .attr('x1', d => (d.source as SimNode).x!)
        .attr('y1', d => (d.source as SimNode).y!)
        .attr('x2', d => (d.target as SimNode).x!)
        .attr('y2', d => (d.target as SimNode).y!);
      node.attr('transform', d => `translate(${d.x},${d.y})`);
    });

  // Pin center node initially
  const center = nodes.find(n => n.isCenter);
  if (center) {
    center.fx = width / 2;
    center.fy = height / 2;
  }
}
