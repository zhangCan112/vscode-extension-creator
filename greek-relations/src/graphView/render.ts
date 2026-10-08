// Cytoscape rendering for the Greek relations graph webview.
// Canvas theming per the skill: colors are --vscode-* / --vscode-charts-* theme
// variables resolved via getComputedStyle, hot-swapped by watching
// body[data-vscode-theme-kind] with a MutationObserver.

import cytoscape from "cytoscape";
import { Deity, Relation, RelationType } from "../types";
import { edgeIdOf } from "./protocol";

interface DomainGroup {
  label: string;
  colorVar: string;
  keywords: readonly string[];
}

const OTHER_GROUP: DomainGroup = { label: "Other", colorVar: "--vscode-charts-blue", keywords: [] };

const DOMAIN_GROUPS: readonly DomainGroup[] = [
  { label: "Sky & Light", colorVar: "--vscode-charts-yellow", keywords: ["sky", "thunder", "sun", "moon", "prophecy", "music"] },
  { label: "Sea & Underworld", colorVar: "--vscode-charts-cyan", keywords: ["sea", "earthquakes", "underworld", "the dead", "spring"] },
  { label: "Strife & Craft", colorVar: "--vscode-charts-red", keywords: ["war", "violence", "strategy", "wisdom", "fire", "forge", "crafts"] },
  { label: "Kin & Hearth", colorVar: "--vscode-charts-orange", keywords: ["marriage", "family", "oaths", "hearth", "home", "motherhood", "fertility", "modesty"] },
  { label: "Growth & Ecstasy", colorVar: "--vscode-charts-green", keywords: ["harvest", "agriculture", "grain", "wine", "vines", "ecstasy", "love", "beauty"] },
  { label: "Wayfarers", colorVar: "--vscode-charts-purple", keywords: ["travel", "trade", "thieves", "hunt", "time"] }
];

const EDGE_STYLES: Record<RelationType, { colorVar: string; lineStyle: "solid" | "dotted" | "dashed"; label: string }> = {
  "parent-child": { colorVar: "--vscode-charts-blue", lineStyle: "solid", label: "parent / child" },
  spouse: { colorVar: "--vscode-charts-red", lineStyle: "solid", label: "spouse" },
  sibling: { colorVar: "--vscode-charts-yellow", lineStyle: "dotted", label: "sibling" },
  rival: { colorVar: "--vscode-charts-orange", lineStyle: "dashed", label: "rival" },
  "secret-lover": { colorVar: "--vscode-charts-purple", lineStyle: "dashed", label: "secret lover" }
};

const ALL_COLOR_VARS: readonly string[] = [
  ...DOMAIN_GROUPS.map((g) => g.colorVar),
  OTHER_GROUP.colorVar,
  ...Object.values(EDGE_STYLES).map((s) => s.colorVar)
];

interface Theme {
  foreground: string;
  description: string;
  focusBorder: string;
  fontFamily: string;
  chart(name: string): string;
}

function resolveTheme(): Theme {
  const cs = getComputedStyle(document.body);
  const value = (name: string): string => cs.getPropertyValue(name).trim();
  const fallback = value("--vscode-charts-foreground") || value("--vscode-editor-foreground");
  const charts = new Map<string, string>();
  for (const name of ALL_COLOR_VARS) {
    charts.set(name, value(name) || fallback);
  }
  return {
    foreground: value("--vscode-editor-foreground"),
    description: value("--vscode-descriptionForeground"),
    focusBorder: value("--vscode-focusBorder"),
    fontFamily: cs.fontFamily || "sans-serif",
    chart(name: string): string {
      return charts.get(name) ?? fallback;
    }
  };
}

function domainGroupOf(d: Deity): DomainGroup {
  const haystack = `${d.domain} ${d.title}`.toLowerCase();
  for (const group of DOMAIN_GROUPS) {
    if (group.keywords.some((k) => haystack.includes(k))) {
      return group;
    }
  }
  return OTHER_GROUP;
}

function buildStylesheet(t: Theme): cytoscape.StylesheetStyle[] {
  const styles: cytoscape.StylesheetStyle[] = [
    {
      selector: "node",
      style: {
        label: "data(label)",
        shape: "ellipse",
        width: 22,
        height: 22,
        "background-color": t.chart(OTHER_GROUP.colorVar),
        "font-family": t.fontFamily,
        "font-size": 11,
        color: t.foreground,
        "text-valign": "bottom",
        "text-halign": "center",
        "text-margin-y": 6,
        "min-zoomed-font-size": 8
      }
    },
    {
      selector: "edge",
      style: {
        width: 2,
        label: "data(statusLabel)",
        "line-color": t.foreground,
        "line-style": "solid",
        "curve-style": "bezier",
        "font-family": t.fontFamily,
        "font-size": 8,
        color: t.description,
        "text-rotation": "autorotate",
        "text-margin-y": -8,
        "min-zoomed-font-size": 9,
        "text-wrap": "wrap"
      }
    },
    { selector: "node:selected", style: { "overlay-color": t.focusBorder, "overlay-opacity": 0.25 } },
    { selector: "edge:selected", style: { width: 4, "overlay-color": t.focusBorder, "overlay-opacity": 0.25 } },
    { selector: ".dimmed", style: { opacity: 0.12 } }
  ];
  const groups = [...DOMAIN_GROUPS, OTHER_GROUP];
  for (const group of groups) {
    styles.push({
      selector: `node[domainGroup = '${group.label}']`,
      style: { "background-color": t.chart(group.colorVar) }
    });
  }
  for (const style of Object.values(EDGE_STYLES)) {
    styles.push({
      selector: `edge[relationType = '${style.label}']`,
      style: { "line-color": t.chart(style.colorVar), "line-style": style.lineStyle }
    });
  }
  return styles;
}

export class GraphRenderer {
  private cy?: cytoscape.Core;
  private readonly themeObserver = new MutationObserver(() => this.applyTheme());
  private readonly swatches: { el: HTMLElement; colorVar: string }[] = [];
  private dataLoaded = false;

  constructor(
    private readonly container: HTMLElement,
    private readonly legend: HTMLElement,
    private readonly hint: HTMLElement,
    private readonly info: HTMLElement,
    private readonly onSelectDeity: (deityId: string) => void
  ) {}

  start(): void {
    this.cy = cytoscape({
      container: this.container,
      elements: [],
      style: buildStylesheet(resolveTheme()),
      wheelSensitivity: 0.2
    });
    this.cy.on("tap", "node", (e) => this.onSelectDeity(e.target.id()));
    this.cy.on("tap", "edge", (e) => this.showRelationInfo(e.target.data("relation") as Relation | undefined));
    this.cy.on("tap", (e) => {
      if (e.target === this.cy) {
        this.hideInfo();
      }
    });
    this.themeObserver.observe(document.body, { attributes: true, attributeFilter: ["data-vscode-theme-kind"] });
  }

  setData(deities: Deity[], relations: Relation[]): void {
    const cy = this.cy;
    if (!cy) {
      return;
    }
    cy.elements().remove();
    cy.add([
      ...deities.map((d): cytoscape.NodeDefinition => {
        const group = domainGroupOf(d);
        return {
          group: "nodes",
          data: { id: d.id, label: d.name, domainGroup: group.label, deity: d },
          position: { x: 0, y: 0 }
        };
      }),
      ...relations.map(
        (r): cytoscape.EdgeDefinition => ({
          group: "edges",
          data: { id: edgeIdOf(r), source: r.a, target: r.b, relationType: EDGE_STYLES[r.type].label, statusLabel: r.status ?? "", relation: r }
        })
      )
    ]);
    if (!this.dataLoaded) {
      this.dataLoaded = true;
      this.buildLegend();
      this.hint.classList.remove("hidden");
      cy.layout({ name: "cose", padding: 40, animate: true, animationDuration: 500, idealEdgeLength: 90, nodeRepulsion: () => 9000 }).run();
    }
  }

  focus(nodeIds: readonly string[], edgeIds: readonly string[]): void {
    const cy = this.cy;
    if (!cy) {
      return;
    }
    const keep = new Set<string>([...nodeIds, ...edgeIds]);
    cy.batch(() => {
      for (const el of cy.elements()) {
        el.toggleClass("dimmed", !keep.has(el.id()));
      }
    });
  }

  clearFocus(): void {
    const cy = this.cy;
    if (!cy) {
      return;
    }
    cy.elements().removeClass("dimmed");
    this.hideInfo();
  }

  dispose(): void {
    this.themeObserver.disconnect();
    this.cy?.destroy();
  }

  private applyTheme(): void {
    const theme = resolveTheme();
    this.cy?.style().fromJson(buildStylesheet(theme));
    for (const { el, colorVar } of this.swatches) {
      el.style.backgroundColor = theme.chart(colorVar);
    }
  }

  private buildLegend(): void {
    const theme = resolveTheme();
    this.legend.textContent = "";
    this.swatches.length = 0;
    this.legend.appendChild(this.legendTitle("Domains"));
    const seen = new Set<string>();
    for (const node of this.cy?.nodes() ?? []) {
      const d = node.data("deity") as Deity;
      const group = domainGroupOf(d);
      if (seen.has(group.label)) {
        continue;
      }
      seen.add(group.label);
      const swatch = document.createElement("span");
      swatch.className = "legend-swatch";
      swatch.style.backgroundColor = theme.chart(group.colorVar);
      this.swatches.push({ el: swatch, colorVar: group.colorVar });
      this.legend.appendChild(this.legendRow(swatch, group.label));
    }
    this.legend.appendChild(this.legendTitle("Relations"));
    for (const style of Object.values(EDGE_STYLES)) {
      const line = document.createElement("span");
      line.className = `legend-line${style.lineStyle === "solid" ? "" : ` ${style.lineStyle}`}`;
      line.style.borderTopColor = theme.chart(style.colorVar);
      this.swatches.push({ el: line, colorVar: style.colorVar });
      this.legend.appendChild(this.legendRow(line, style.label));
    }
    this.legend.classList.remove("hidden");
  }

  private legendTitle(text: string): HTMLElement {
    const el = document.createElement("div");
    el.className = "legend-title";
    el.textContent = text;
    return el;
  }

  private legendRow(sample: HTMLElement, text: string): HTMLElement {
    const row = document.createElement("div");
    row.className = "legend-row";
    row.appendChild(sample);
    const label = document.createElement("span");
    label.textContent = text;
    row.appendChild(label);
    return row;
  }

  private showRelationInfo(r: Relation | undefined): void {
    if (!r || !this.cy) {
      return;
    }
    this.info.textContent = "";
    const title = document.createElement("div");
    title.className = "info-title";
    const a = (this.cy.getElementById(r.a).data("label") as string | undefined) ?? r.a;
    const b = (this.cy.getElementById(r.b).data("label") as string | undefined) ?? r.b;
    title.textContent = `${a} — ${EDGE_STYLES[r.type].label} — ${b}`;
    this.info.appendChild(title);
    const lines = [r.status ? `Status: ${r.status}` : "", r.note ?? ""].filter((s) => s.length > 0);
    if (lines.length > 0) {
      const body = document.createElement("div");
      body.textContent = lines.join("\n");
      this.info.appendChild(body);
    }
    this.info.classList.remove("hidden");
  }

  private hideInfo(): void {
    this.info.classList.add("hidden");
  }
}
