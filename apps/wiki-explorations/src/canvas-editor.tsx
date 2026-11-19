import dagre from "@dagrejs/dagre"
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react"
import { useMemo, useRef, useState } from "react"
import Markdown from "react-markdown"
import rehypeHighlight from "rehype-highlight"

import { EventType, edgeId, inspectGraph, type Canvas, type GraphNode } from "./graph.js"

const kinds = {
  event: { title: "Event", glyph: "ϟ", color: "#ffedd8" },
  transformation: { title: "Transformation", glyph: "ƒ", color: "#e9edff" },
  property: { title: "Property", glyph: "▤", color: "#e2f2e9" },
}

type FlowNode = Node<GraphNode, "graph">
const width = 228
const height = 86

function NodeCard({ data, selected }: NodeProps<FlowNode>) {
  const kind = kinds[data.kind]

  return (
    <div className={`node-card ${data.kind} ${selected ? "selected" : ""}`}>
      {data.kind !== "event" && <Handle type="target" position={Position.Left} id="input" />}
      <div className="node-kind">
        <span className="node-glyph">{kind.glyph}</span>
        {kind.title}
        {data.kind === "event" && <span className="event-type">{data.eventType}</span>}
      </div>
      <strong title={data.title}>{data.title.trim() || "Untitled"}</strong>
      <span className="node-description">{data.description.trim().replace(/\s+/g, " ")}</span>
      <Handle type="source" position={Position.Right} id="output" />
    </div>
  )
}

const nodeTypes = { graph: NodeCard }

function NodeSidebar({
  node,
  edit,
  close,
  remove,
}: {
  node: GraphNode
  edit: (node: GraphNode, group?: symbol) => void
  close: () => void
  remove: () => void
}) {
  const [preview, setPreview] = useState(false)
  const editGroup = useRef<symbol>(undefined)
  const kind = kinds[node.kind]

  function startTextEdit() {
    editGroup.current = Symbol()
  }

  return (
    <aside className={`sidebar ${node.kind}`} aria-label="Node editor">
      <div className="sidebar-heading">
        <span className="node-glyph">{kind.glyph}</span>
        <h2>{kind.title}</h2>
        <button className="icon-button" aria-label="Close node editor" onClick={close}>
          ×
        </button>
      </div>
      <label>
        Title
        <input
          value={node.title}
          onFocus={startTextEdit}
          onChange={(event) => edit({ ...node, title: event.target.value }, editGroup.current)}
        />
      </label>
      {node.kind === "event" && (
        <label>
          Event type
          <select
            value={node.eventType}
            onChange={(event) => {
              const eventType = EventType.literals.find((type) => type === event.target.value)
              if (eventType) edit({ ...node, eventType })
            }}
          >
            {EventType.literals.map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>
        </label>
      )}
      <div className="description-header">
        <label htmlFor="description">Description</label>
        <div className="segmented" aria-label="Markdown mode">
          <button aria-pressed={!preview} onClick={() => setPreview(false)}>
            Write
          </button>
          <button aria-pressed={preview} onClick={() => setPreview(true)}>
            Preview
          </button>
        </div>
      </div>
      {preview ? (
        <div className="markdown-preview">
          <Markdown rehypePlugins={[rehypeHighlight]}>{node.description}</Markdown>
        </div>
      ) : (
        <textarea
          id="description"
          value={node.description}
          placeholder="Write in Markdown…"
          onFocus={startTextEdit}
          onChange={(event) =>
            edit({ ...node, description: event.target.value }, editGroup.current)
          }
        />
      )}
      <button className="delete-button" onClick={remove}>
        Delete node
      </button>
    </aside>
  )
}

export function CanvasEditor({
  canvas,
  onEdit,
}: {
  canvas: Canvas
  onEdit: (next: Canvas, group?: symbol) => void
}) {
  const [selected, setSelected] = useState<string>()
  const [drag, setDrag] = useState<{ id: string; position: GraphNode["position"] }>()
  const [menu, setMenu] = useState<"add" | "lint">()
  const [connectionError, setConnectionError] = useState("")
  const flow = useReactFlow<FlowNode, Edge>()
  const selectedNode = canvas.nodes.find(({ id }) => id === selected)
  const report = useMemo(() => inspectGraph(canvas), [canvas])

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
      kind === "event" ? { ...fields, kind, eventType: "Claim added" } : { ...fields, kind }
    onEdit({ ...canvas, nodes: [...canvas.nodes, node] })
    setSelected(node.id)
    setMenu(undefined)
  }

  function layout() {
    if (report.errors.length) return
    const graph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}))
    graph.setGraph({ rankdir: "LR", nodesep: 40, ranksep: 102 })
    for (const { id } of canvas.nodes) graph.setNode(id, { width, height })
    for (const { source, target } of canvas.edges) graph.setEdge(source, target)
    dagre.layout(graph)
    const nodes = canvas.nodes.map((node) => {
      const { x, y } = graph.node(node.id)
      return { ...node, position: { x: x - width / 2, y: y - height / 2 } }
    })
    onEdit({ ...canvas, nodes })
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

            onEdit({
              ...canvas,
              nodes: canvas.nodes.filter(({ id }) => !removedNodes.has(id)),
              edges: canvas.edges.filter(
                (edge) =>
                  !removedEdges.has(edgeId(edge)) &&
                  !removedNodes.has(edge.source) &&
                  !removedNodes.has(edge.target),
              ),
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
              <button
                aria-expanded={menu === "lint"}
                onClick={() => setMenu(menu === "lint" ? undefined : "lint")}
              >
                Lint
                {report.errors.length + report.warnings.length > 0
                  ? ` · ${report.errors.length + report.warnings.length}`
                  : ""}
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
            {menu === "lint" && (
              <div className="popover lint">
                {report.errors.map((error) => (
                  <p key={error}>{error}</p>
                ))}
                {report.warnings.map(({ id, message }) => (
                  <button
                    key={`${id}-${message}`}
                    onClick={() => {
                      setSelected(id)
                      void flow.fitView({ nodes: [{ id }], maxZoom: 1.2, duration: 200 })
                    }}
                  >
                    {canvas.nodes.find((node) => node.id === id)?.title || "Untitled"} · {message}
                  </button>
                ))}
                {report.errors.length + report.warnings.length === 0 && <p>No graph issues.</p>}
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
          remove={() => {
            void flow.deleteElements({ nodes: [{ id: selectedNode.id }] })
          }}
        />
      )}
    </main>
  )
}
