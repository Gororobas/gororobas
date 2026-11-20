import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  Panel,
  ReactFlow,
  useReactFlow,
  type Edge,
} from "@xyflow/react"
import { useMemo, useState } from "react"

import { edgeId, inspectGraph, withoutNodes, type Canvas, type GraphNode } from "./graph.js"
import { layoutPositions } from "./layout.js"
import { height, kinds, nodeTypes, width, type FlowNode } from "./node-card.js"
import { NodeSidebar } from "./node-sidebar.js"

export function CanvasEditor({
  canvas,
  onEdit,
  onOpenPipeline,
}: {
  canvas: Canvas
  onEdit: (next: Canvas, group?: symbol) => void
  onOpenPipeline: (id: string) => void
}) {
  const [selected, setSelected] = useState<string>()
  const [drag, setDrag] = useState<{ id: string; position: GraphNode["position"] }>()
  const [menu, setMenu] = useState<"add">()
  const [connectionError, setConnectionError] = useState("")
  const flow = useReactFlow<FlowNode, Edge>()
  const selectedNode = canvas.nodes.find(({ id }) => id === selected)

  const nodes = useMemo(
    () =>
      canvas.nodes.map((node): FlowNode => ({
        id: node.id,
        type: "graph",
        width,
        height,
        position: drag?.id === node.id ? drag.position : node.position,
        selected: node.id === selected,
        data: node,
      })),
    [canvas.nodes, drag, selected],
  )

  const edges = useMemo(
    () =>
      canvas.edges.map((edge): Edge => {
        const active = edge.source === selected || edge.target === selected
        const stroke = active ? "#202025" : "#a1a1aa"

        return {
          ...edge,
          id: edgeId(edge),
          type: "smoothstep",
          sourceHandle: "output",
          targetHandle: "input",
          markerEnd: { type: MarkerType.ArrowClosed, color: stroke },
          style: { stroke, strokeWidth: active ? 2.7 : 1.5 },
          zIndex: active ? 1 : 0,
        }
      }),
    [canvas.edges, selected],
  )

  function add(kind: GraphNode["kind"]) {
    const position = flow.screenToFlowPosition({
      x: window.innerWidth / 2 - 110,
      y: window.innerHeight / 2 - 40,
    })
    const fields = { id: crypto.randomUUID(), title: "", description: "", position }
    const node: GraphNode =
      kind === "event"
        ? { ...fields, kind, eventType: "Claim", isEvaluationRequired: false }
        : { ...fields, kind }
    onEdit({ ...canvas, nodes: [...canvas.nodes, node] })
    setSelected(node.id)
    setMenu(undefined)
  }

  function layout() {
    if (inspectGraph(canvas).errors.length) return
    const positions = layoutPositions(
      canvas.nodes.map(({ id }) => id),
      canvas.edges,
    )

    onEdit({
      ...canvas,
      nodes: canvas.nodes.map((node) => ({
        ...node,
        position: positions.get(node.id) ?? node.position,
      })),
    })

    requestAnimationFrame(() => {
      void flow.fitView({ duration: 220, padding: 0.18 })
    })
  }

  return (
    <main className="editor">
      <div className="flow">
        <ReactFlow<FlowNode, Edge>
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          minZoom={0.1}
          maxZoom={3}
          edgesReconnectable={false}
          multiSelectionKeyCode={null}
          selectionKeyCode={null}
          onNodeClick={(_, node) => setSelected(node.id)}
          onNodeDoubleClick={(_, node) => onOpenPipeline(node.id)}
          onPaneClick={() => {
            setSelected(undefined)
            setMenu(undefined)
            setConnectionError("")
          }}
          onNodesChange={(changes) => {
            for (const change of changes) {
              if (change.type === "select" && change.selected) setSelected(change.id)
              if (change.type !== "position" || !change.position) continue

              if (change.dragging) setDrag({ id: change.id, position: change.position })
              else {
                const position = change.position
                const original = canvas.nodes.find(({ id }) => id === change.id)?.position
                setDrag(undefined)
                if (original?.x === position.x && original.y === position.y) continue

                onEdit({
                  ...canvas,
                  nodes: canvas.nodes.map((node) =>
                    node.id === change.id ? { ...node, position } : node,
                  ),
                })
              }
            }
          }}
          onConnect={({ source, target }) => {
            const next = { ...canvas, edges: [...canvas.edges, { source, target }] }
            const { errors } = inspectGraph(next)
            setConnectionError(errors.join(" "))
            if (!errors.length) onEdit(next)
          }}
          onDelete={({ nodes, edges }) => {
            const removedNodes = new Set(nodes.map(({ id }) => id))
            const removedEdges = new Set(edges.map(({ id }) => id))
            const remaining = withoutNodes(canvas, removedNodes)

            onEdit({
              ...remaining,
              edges: remaining.edges.filter((edge) => !removedEdges.has(edgeId(edge))),
            })

            if (selected && removedNodes.has(selected)) setSelected(undefined)
          }}
        >
          <Background gap={22} size={1.2} color="#d6d6db" />
          <Controls />
          <MiniMap
            style={{ width: 155, height: 95 }}
            pannable
            zoomable
            nodeColor={(node: FlowNode) => kinds[node.data.kind].color}
          />
          <Panel className="canvas-panel" position="top-left">
            <div className="canvas-actions">
              <button
                className="primary"
                aria-expanded={menu === "add"}
                onClick={() => setMenu(menu === "add" ? undefined : "add")}
              >
                ＋ Add node
              </button>
              <button onClick={layout} disabled={!nodes.length}>
                Auto layout
              </button>
            </div>
            {menu === "add" && (
              <div className="popover">
                {(["event", "transformation", "property"] as const).map((kind) => (
                  <button key={kind} className={kind} onClick={() => add(kind)}>
                    <span className="node-glyph">{kinds[kind].glyph}</span>
                    {kinds[kind].title}
                  </button>
                ))}
              </div>
            )}
            {connectionError && (
              <div className="connection-error" role="alert">
                {connectionError}
                <button
                  aria-label="Dismiss connection error"
                  onClick={() => setConnectionError("")}
                >
                  ×
                </button>
              </div>
            )}
          </Panel>
        </ReactFlow>
      </div>
      {selectedNode && (
        <NodeSidebar
          key={selectedNode.id}
          node={selectedNode}
          edit={(node, group) =>
            onEdit(
              {
                ...canvas,
                nodes: canvas.nodes.map((existing) => (existing.id === node.id ? node : existing)),
              },
              group,
            )
          }
          close={() => setSelected(undefined)}
          openPipeline={() => onOpenPipeline(selectedNode.id)}
          remove={() => {
            void flow.deleteElements({ nodes: [{ id: selectedNode.id }] })
          }}
        />
      )}
    </main>
  )
}
