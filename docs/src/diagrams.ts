import { create, props } from "@stylexjs/stylex"
import type { Html, HtmlBuilder } from "foldkit/html"
import { colors } from "./theme.stylex"
import { className } from "./styles"

type Step = Readonly<{
  x: number
  y: number
  width: number
  title: string
  detail: string
  tone?: "accent" | "authority" | "hint"
}>
type Connection = Readonly<{ path: string; label?: string; x?: number; y?: number; provisional?: boolean }>
type Diagram = Readonly<{
  title: string
  caption: string
  height: number
  steps: ReadonlyArray<Step>
  connections: ReadonlyArray<Connection>
}>

const diagrams = {
  first: {
    title: "One agent. One Effect. No infrastructure.",
    caption: "The model is a provided service. The process boundary runs the Effect and receives the answer.",
    height: 154,
    steps: [
      { x: 22, y: 45, width: 160, title: "Your task", detail: "Fix average([])" },
      { x: 228, y: 45, width: 160, title: "Agent.run", detail: "Model Layer", tone: "accent" },
      { x: 434, y: 45, width: 160, title: "A proposed fix", detail: "Return 0 for []" },
    ],
    connections: [{ path: "M182 76H223" }, { path: "M388 76H429" }],
  },
  loop: {
    title: "Follow a coding turn",
    caption:
      "A tool result goes back into the model’s context. The loop continues under policy until the agent completes, fails, or suspends.",
    height: 286,
    steps: [
      { x: 20, y: 40, width: 150, title: "Prompt", detail: "Fix average([])" },
      { x: 224, y: 40, width: 160, title: "Model", detail: "Choose the next action", tone: "accent" },
      { x: 438, y: 40, width: 160, title: "Completed", detail: "Typed output" },
      { x: 224, y: 174, width: 160, title: "Tool handler", detail: "read_file → source" },
      { x: 438, y: 174, width: 160, title: "Policy + approval", detail: "May this call execute?" },
    ],
    connections: [
      { path: "M170 71H219" },
      { path: "M384 71H433", label: "answer", x: 408, y: 56 },
      { path: "M350 103V132H518V169", label: "tool call", x: 448, y: 126 },
      { path: "M438 205H389", label: "allowed", x: 413, y: 191 },
      { path: "M224 205H194V132H267V108", label: "result", x: 176, y: 169 },
    ],
  },
  tools: {
    title: "A tool is a typed boundary",
    caption:
      "A schema validates the requested path. Authorization is a separate check before your Effect handler executes.",
    height: 156,
    steps: [
      { x: 15, y: 44, width: 173, title: "Model request", detail: "read_file({ path })" },
      { x: 225, y: 44, width: 166, title: "Schema + policy", detail: "Validate, then authorize", tone: "accent" },
      { x: 428, y: 44, width: 175, title: "Effect handler", detail: "Source text → model" },
    ],
    connections: [{ path: "M188 75H220" }, { path: "M391 75H423" }],
  },
  models: {
    title: "Change the model, keep the agent",
    caption:
      "The scripted and live Layers satisfy the same model requirement. Provider credentials stay on the execution host.",
    height: 228,
    steps: [
      { x: 32, y: 80, width: 172, title: "coding-agent", detail: "Instructions + toolkit" },
      { x: 276, y: 29, width: 278, title: "Scripted model Layer", detail: "Deterministic • offline", tone: "hint" },
      {
        x: 276,
        y: 135,
        width: 278,
        title: "Provider model Layer",
        detail: "API key • network • provider cost",
        tone: "accent",
      },
    ],
    connections: [{ path: "M204 111H238V60H271" }, { path: "M238 111V166H271" }],
  },
  output: {
    title: "From a proposed change to an application value",
    caption:
      "The terminal structured-output turn is decoded through your Schema. A valid shape does not prove the proposed patch is correct.",
    height: 156,
    steps: [
      { x: 18, y: 44, width: 174, title: "Coding loop", detail: "Inspect and propose" },
      { x: 225, y: 44, width: 166, title: "Output Schema", detail: "Decode the final value", tone: "accent" },
      { x: 424, y: 44, width: 174, title: "Change report", detail: "{ file, change, tests }" },
    ],
    connections: [{ path: "M192 75H220" }, { path: "M391 75H419" }],
  },
  approvals: {
    title: "Approval is before execution",
    caption:
      "Denied calls never reach the handler. Pending decisions suspend work; durable storage is needed if the decision outlives this host.",
    height: 284,
    steps: [
      { x: 20, y: 109, width: 160, title: "apply_patch", detail: "needsApproval: true" },
      { x: 224, y: 109, width: 160, title: "Approvals service", detail: "Your application decides", tone: "accent" },
      { x: 435, y: 16, width: 166, title: "Approved", detail: "Execute the handler" },
      { x: 435, y: 109, width: 166, title: "Denied", detail: "PermissionDenied" },
      { x: 435, y: 202, width: 166, title: "Pending", detail: "Suspend with a token", tone: "hint" },
    ],
    connections: [
      { path: "M180 140H219" },
      { path: "M384 140H405V47H430" },
      { path: "M405 140H430" },
      { path: "M405 140V233H430" },
    ],
  },
  context: {
    title: "Build the context, don’t mix its owners",
    caption:
      "Instructions set the rules. Session history carries the conversation. Recalled memory adds relevant knowledge from a separate store.",
    height: 234,
    steps: [
      { x: 20, y: 15, width: 178, title: "Instructions + skills", detail: "Repository rules" },
      { x: 20, y: 88, width: 178, title: "Session", detail: "The fix-average thread" },
      { x: 20, y: 161, width: 178, title: "Memory", detail: "Relevant prior knowledge", tone: "hint" },
      { x: 276, y: 88, width: 140, title: "Prompt", detail: "Effect AI Prompt", tone: "accent" },
      { x: 465, y: 88, width: 134, title: "Model", detail: "Next coding turn" },
    ],
    connections: [
      { path: "M198 46H232V119H271" },
      { path: "M198 119H228" },
      { path: "M198 192H232V119" },
      { path: "M416 119H460" },
    ],
  },
  events: {
    title: "Two kinds of progress",
    caption: "A preview can make the UI responsive. Only canonical committed events establish the recoverable history.",
    height: 221,
    steps: [
      { x: 28, y: 80, width: 170, title: "Active attempt", detail: "Model and tool work", tone: "accent" },
      {
        x: 282,
        y: 28,
        width: 292,
        title: "Provisional preview",
        detail: "Display it, but do not treat it as a receipt",
        tone: "hint",
      },
      {
        x: 282,
        y: 131,
        width: 292,
        title: "Committed events",
        detail: "Replay from the authoritative cursor",
        tone: "authority",
      },
    ],
    connections: [{ path: "M198 111H240V59H277", provisional: true }, { path: "M240 111V162H277" }],
  },
  quality: {
    title: "Separate a claim from evidence",
    caption:
      "A schema validates the report. A completion gate checks your acceptance condition. A real test command is needed to establish that code passes.",
    height: 156,
    steps: [
      { x: 20, y: 44, width: 170, title: "Proposed report", detail: "Changed file + tests" },
      {
        x: 225,
        y: 44,
        width: 166,
        title: "Completion gates",
        detail: "Predicate / command / verifier",
        tone: "accent",
      },
      { x: 426, y: 44, width: 170, title: "Verdict", detail: "Accept, retry, or fail" },
    ],
    connections: [{ path: "M190 75H220" }, { path: "M391 75H421" }],
  },
  durability: {
    title: "Keep the work. Replace the compute.",
    caption:
      "Rivet owns the actor’s compute lifecycle. Generalist’s shared object engine owns canonical state in S3 or native R2. Wake notifications and previews are derived, not storage authority.",
    height: 332,
    steps: [
      { x: 24, y: 28, width: 167, title: "Local / server host", detail: "Replaceable process", tone: "hint" },
      { x: 223, y: 28, width: 167, title: "Rivet actor", detail: "Stable partition key", tone: "hint" },
      { x: 422, y: 28, width: 167, title: "Cloudflare host", detail: "Independent option", tone: "hint" },
      {
        x: 121,
        y: 140,
        width: 371,
        title: "Generalist Runtime",
        detail: "Runs • Sessions • claims • waits • recovery",
        tone: "accent",
      },
      {
        x: 121,
        y: 250,
        width: 371,
        title: "One object-storage engine",
        detail: "S3 / native R2 • canonical journal and receipts",
        tone: "authority",
      },
    ],
    connections: [
      { path: "M107 91V120H230V135" },
      { path: "M306 91V135" },
      { path: "M505 91V120H382V135" },
      { path: "M306 203V245", label: "committed state", x: 377, y: 228 },
    ],
  },
  agents: {
    title: "One coding family, separate child Runs",
    caption:
      "The lead delegates bounded work to specialists. Children have their own Run and Session identities; related durable work stays in the coordinated parent partition.",
    height: 276,
    steps: [
      { x: 198, y: 20, width: 218, title: "Coding lead", detail: "Plan, delegate, integrate", tone: "accent" },
      { x: 41, y: 151, width: 232, title: "Reviewer child", detail: "Check the proposed guard" },
      { x: 341, y: 151, width: 232, title: "Test-writer child", detail: "Cover empty and nonempty input" },
    ],
    connections: [
      { path: "M259 83V114H157V146", label: "spawn", x: 193, y: 108 },
      { path: "M355 83V114H457V146", label: "spawn", x: 415, y: 108 },
      { path: "M273 183H336", label: "policy-allowed messages", x: 306, y: 245 },
    ],
  },
  recovery: {
    title: "Reopen, reconcile, then continue",
    caption:
      "A new owner recovers recorded outcomes. An uncertain external effect requires resolution rather than an unqualified automatic retry.",
    height: 255,
    steps: [
      { x: 20, y: 87, width: 166, title: "Host stops", detail: "The journal remains", tone: "hint" },
      { x: 225, y: 87, width: 168, title: "Replacement owner", detail: "Claim + reconcile", tone: "accent" },
      { x: 437, y: 26, width: 163, title: "Recorded result", detail: "Replay / continue", tone: "authority" },
      { x: 437, y: 151, width: 163, title: "Unknown outcome", detail: "needs-resolution" },
    ],
    connections: [{ path: "M186 118H220" }, { path: "M393 118H413V57H432" }, { path: "M413 118V182H432" }],
  },
} satisfies Record<string, Diagram>

export type DiagramName = keyof typeof diagrams

const styles = create({
  figure: {
    margin: "24px 0",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.line,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: colors.background,
  },
  header: { margin: 0, padding: "16px 18px 0", fontSize: 12, fontWeight: 500, color: colors.foreground },
  scroll: { overflowX: "auto", scrollbarWidth: "thin" },
  svg: {
    display: "block",
    width: "100%",
    minWidth: 510,
    height: "auto",
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
  },
  rectangle: { fill: colors.background, stroke: colors.line, strokeWidth: 1.2 },
  accent: { fill: colors.accentSoft, stroke: colors.accent, strokeOpacity: 0.48 },
  authority: { fill: colors.soft, stroke: colors.accent, strokeWidth: 1.6 },
  hint: { fill: colors.soft, strokeDasharray: "4 3" },
  title: { fill: colors.foreground, fontSize: 12, fontWeight: 500, textAnchor: "middle" },
  detail: { fill: colors.muted, fontSize: 10, textAnchor: "middle" },
  edge: { fill: "none", stroke: colors.faint, strokeWidth: 1.2, strokeLinejoin: "round" },
  provisional: { strokeDasharray: "4 3" },
  arrow: { fill: colors.faint },
  edgeLabel: { fill: colors.muted, fontSize: 9, textAnchor: "middle" },
  caption: {
    margin: 0,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: colors.line,
    padding: "12px 18px",
    fontSize: 12,
    lineHeight: 1.7,
    color: colors.muted,
    backgroundColor: colors.soft,
  },
})

export const diagramView = <Message>({
  h,
  name,
  id,
}: {
  h: HtmlBuilder<Message>
  name: DiagramName
  id: string
}): Html => {
  const diagram: Diagram = diagrams[name]
  const marker = `diagram-arrow-${id}`
  return h.figure(
    [h.Class(className(props(styles.figure)))],
    [
      h.p([h.Class(className(props(styles.header)))], [diagram.title]),
      h.div(
        [h.Class(className(props(styles.scroll))), h.Tabindex(0), h.AriaLabel(`Diagram: ${diagram.title}`)],
        [
          h.svg(
            [
              h.ViewBox(`0 0 616 ${diagram.height}`),
              h.Class(className(props(styles.svg))),
              h.Role("img"),
              h.AriaLabel(diagram.caption),
            ],
            [
              h.defs(
                [],
                [
                  h.marker(
                    [
                      h.Id(marker),
                      h.ViewBox("0 0 8 8"),
                      h.RefX("7"),
                      h.RefY("4"),
                      h.MarkerWidth("7"),
                      h.MarkerHeight("7"),
                      h.Orient("auto"),
                    ],
                    [h.path([h.D("M1 1L7 4L1 7Z"), h.Class(className(props(styles.arrow)))])],
                  ),
                ],
              ),
              ...diagram.connections.map((connection) =>
                h.g(
                  [],
                  [
                    h.path([
                      h.D(connection.path),
                      h.MarkerEnd(`url(#${marker})`),
                      h.Class(className(props(styles.edge, connection.provisional === true && styles.provisional))),
                    ]),
                    connection.label === undefined
                      ? h.empty
                      : h.text(
                          [
                            h.X(String(connection.x)),
                            h.Y(String(connection.y)),
                            h.Class(className(props(styles.edgeLabel))),
                          ],
                          [connection.label],
                        ),
                  ],
                ),
              ),
              ...diagram.steps.map((step) =>
                h.g(
                  [],
                  [
                    h.rect([
                      h.X(String(step.x)),
                      h.Y(String(step.y)),
                      h.Width(String(step.width)),
                      h.Height("63"),
                      h.Rx("6"),
                      h.Class(
                        className(
                          props(
                            styles.rectangle,
                            step.tone === "accent" && styles.accent,
                            step.tone === "authority" && styles.authority,
                            step.tone === "hint" && styles.hint,
                          ),
                        ),
                      ),
                    ]),
                    h.text(
                      [
                        h.X(String(step.x + step.width / 2)),
                        h.Y(String(step.y + 25)),
                        h.Class(className(props(styles.title))),
                      ],
                      [step.title],
                    ),
                    h.text(
                      [
                        h.X(String(step.x + step.width / 2)),
                        h.Y(String(step.y + 44)),
                        h.Class(className(props(styles.detail))),
                      ],
                      [step.detail],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
      h.figcaption([h.Class(className(props(styles.caption)))], [diagram.caption]),
    ],
  )
}
