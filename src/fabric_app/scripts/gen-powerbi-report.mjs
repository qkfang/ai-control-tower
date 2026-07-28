// Deterministic PBIR/PBIP generator for the "AI Control Tower" report.
// Builds a live-connection report bound to the Fabric semantic model
// AI_Control_Tower in workspace AI_Control_Tower_dev.
//
// Run:  node scripts/gen-powerbi-report.mjs
// Output: ../AI Control Tower (PBIP)  ->  <repo>/powerbi/

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_ROOT = path.resolve(__dirname, '..', 'powerbi');
const REPORT_NAME = 'AI Control Tower';
const REPORT_DIR = path.join(OUT_ROOT, `${REPORT_NAME}.Report`);
const DEF_DIR = path.join(REPORT_DIR, 'definition');
const PAGES_DIR = path.join(DEF_DIR, 'pages');
const RES_DIR = path.join(REPORT_DIR, 'StaticResources', 'RegisteredResources');
const BASE_DIR = path.join(REPORT_DIR, 'StaticResources', 'SharedResources', 'BaseThemes');

// ---- Semantic model binding -------------------------------------------------
const WORKSPACE = 'AI_Control_Tower_dev';
const MODEL = 'AI_Control_Tower';
const MODEL_ID = '3b48550f-7643-4e21-9150-0c645dc7a03b';
const ENTITY = 'foundryagent_fact';

// ---- Schema URLs ------------------------------------------------------------
const S = {
  defProps: 'https://developer.microsoft.com/json-schemas/fabric/item/report/definitionProperties/1.0.0/schema.json',
  version: 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/versionMetadata/1.0.0/schema.json',
  report: 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/report/2.0.0/schema.json',
  pages: 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/pagesMetadata/1.0.0/schema.json',
  page: 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/page/2.1.0/schema.json',
  visual: 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.9.0/schema.json',
};

// ---- Palette ----------------------------------------------------------------
const C = {
  bg: '#0A0E1A',
  panel: '#121826',
  panelBorder: '#1F2A3C',
  band: '#0E1730',
  accent: '#22D3EE',
  text: '#E5E7EB',
  white: '#FFFFFF',
  muted: '#94A3B8',
  cyan: '#22D3EE',
  teal: '#2DD4BF',
  green: '#22C55E',
  amber: '#F59E0B',
  red: '#EF4444',
  violet: '#8B5CF6',
  blue: '#3B82F6',
  pink: '#EC4899',
};
const DATA_COLORS = [C.cyan, C.teal, C.green, C.amber, C.violet, C.blue, C.pink, C.red];

const THEME_FILE = 'AIControlRoom-a1b2c3d4.json';

// ---- Expression encoders ----------------------------------------------------
const litBool = (b) => ({ expr: { Literal: { Value: b ? 'true' : 'false' } } });
const litStr = (s) => ({ expr: { Literal: { Value: `'${s}'` } } });
const litD = (n) => ({ expr: { Literal: { Value: `${n}D` } } });
const litNum = (n) => ({ expr: { Literal: { Value: `${n}` } } });
const solid = (color) => ({ solid: { color: litStr(color) } });

const col = (property) => ({
  Column: { Expression: { SourceRef: { Entity: ENTITY } }, Property: property },
});
const mea = (property) => ({
  Measure: { Expression: { SourceRef: { Entity: ENTITY } }, Property: property },
});
const projCol = (property) => ({ field: col(property), queryRef: `${ENTITY}.${property}`, nativeQueryRef: property });
const projMea = (property) => ({ field: mea(property), queryRef: `${ENTITY}.${property}`, nativeQueryRef: property });

const hex = () => crypto.randomBytes(10).toString('hex');

// ---- File helpers -----------------------------------------------------------
function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2), 'utf8');
}

// ---- Visual builders --------------------------------------------------------
function panelVCO(title, opts = {}) {
  const vco = {
    background: [{ properties: { show: litBool(true), color: solid(opts.panel || C.panel), transparency: litD(0) } }],
    border: [{ properties: { show: litBool(true), color: solid(C.panelBorder), radius: litD(10) } }],
    dropShadow: [{ properties: { show: litBool(true), preset: litStr('Custom'), color: solid('#000000'), transparency: litD(60), shadowBlur: litD(8), position: litStr('Outer'), shadowDistance: litD(2) } }],
  };
  if (title) {
    vco.title = [{
      properties: {
        show: litBool(true),
        text: litStr(title),
        fontColor: solid(C.text),
        background: solid(opts.panel || C.panel),
        fontSize: litD(11),
        fontFamily: litStr('Segoe UI Semibold'),
        alignment: litStr('left'),
      },
    }];
  }
  return vco;
}

function baseVisual(name, pos, visual, vco) {
  const v = { $schema: S.visual, name, position: { x: pos.x, y: pos.y, z: pos.z ?? 1000, height: pos.h, width: pos.w, tabOrder: pos.z ?? 1000 }, visual };
  if (vco) v.visual.visualContainerObjects = vco;
  return v;
}

// KPI card
function card(pos, measureName, title, accent, opts = {}) {
  const visual = {
    visualType: 'cardVisual',
    query: { queryState: { Data: { projections: [projMea(measureName)] } } },
    objects: {
      value: [{
        properties: {
          fontFamily: litStr('Segoe UI Semibold'),
          fontSize: litD(34),
          bold: litBool(true),
          fontColor: solid(C.white),
          ...(opts.displayUnits != null ? { labelDisplayUnits: litNum(opts.displayUnits) } : {}),
          ...(opts.precision != null ? { labelPrecision: litNum(opts.precision) } : {}),
        },
        selector: { id: 'default' },
      }],
      accentBar: [{ properties: { show: litBool(true), color: solid(accent), transparency: litD(0) } }],
    },
  };
  const vco = panelVCO(title, opts);
  // colored left accent via border already; keep title accent color
  vco.title[0].properties.fontColor = solid(accent);
  return baseVisual(hex(), pos, visual, vco);
}

function donut(pos, catProp, measureName, title) {
  const visual = {
    visualType: 'donutChart',
    query: { queryState: { Category: { projections: [projCol(catProp)] }, Y: { projections: [projMea(measureName)] } } },
    objects: {
      legend: [{ properties: { show: litBool(true), position: litStr('Right'), labelColor: solid(C.muted), fontSize: litD(9) } }],
      labels: [{ properties: { color: solid(C.text), fontSize: litD(9) } }],
    },
  };
  return baseVisual(hex(), pos, visual, panelVCO(title));
}

function barH(pos, catProp, measureNames, title, sortMeasure) {
  const visual = {
    visualType: 'clusteredBarChart',
    query: {
      queryState: {
        Category: { projections: [projCol(catProp)] },
        Y: { projections: measureNames.map(projMea) },
      },
      ...(sortMeasure ? { sortDefinition: { sort: [{ field: mea(sortMeasure), direction: 'Descending' }], isDefaultSort: true } } : {}),
    },
    objects: {
      categoryAxis: [{ properties: { show: litBool(true), labelColor: solid(C.muted), fontSize: litD(9) } }],
      valueAxis: [{ properties: { show: litBool(true), labelColor: solid(C.muted), fontSize: litD(9) } }],
      labels: [{ properties: { show: litBool(true), color: solid(C.text), fontSize: litD(9) } }],
      legend: measureNames.length > 1 ? [{ properties: { show: litBool(true), labelColor: solid(C.muted), fontSize: litD(9) } }] : [{ properties: { show: litBool(false) } }],
    },
  };
  return baseVisual(hex(), pos, visual, panelVCO(title));
}

function colV(pos, catProp, measureNames, title) {
  const visual = {
    visualType: 'clusteredColumnChart',
    query: {
      queryState: {
        Category: { projections: [projCol(catProp)] },
        Y: { projections: measureNames.map(projMea) },
      },
    },
    objects: {
      categoryAxis: [{ properties: { show: litBool(true), labelColor: solid(C.muted), fontSize: litD(9) } }],
      valueAxis: [{ properties: { show: litBool(true), labelColor: solid(C.muted), fontSize: litD(9) } }],
      labels: [{ properties: { show: litBool(false) } }],
      legend: measureNames.length > 1 ? [{ properties: { show: litBool(true), labelColor: solid(C.muted), fontSize: litD(9) } }] : [{ properties: { show: litBool(false) } }],
    },
  };
  return baseVisual(hex(), pos, visual, panelVCO(title));
}

function line(pos, catProp, measureNames, title) {
  const visual = {
    visualType: 'lineChart',
    query: {
      queryState: {
        Category: { projections: [projCol(catProp)] },
        Y: { projections: measureNames.map(projMea) },
      },
    },
    objects: {
      categoryAxis: [{ properties: { show: litBool(true), labelColor: solid(C.muted), fontSize: litD(9) } }],
      valueAxis: [{ properties: { show: litBool(true), labelColor: solid(C.muted), fontSize: litD(9) } }],
      labels: [{ properties: { show: litBool(false) } }],
      legend: measureNames.length > 1 ? [{ properties: { show: litBool(true), labelColor: solid(C.muted), fontSize: litD(9) } }] : [{ properties: { show: litBool(false) } }],
    },
  };
  return baseVisual(hex(), pos, visual, panelVCO(title));
}

function table(pos, cols, title) {
  const visual = {
    visualType: 'tableEx',
    query: { queryState: { Values: { projections: cols.map((c) => (c.measure ? projMea(c.name) : projCol(c.name))) } } },
    objects: {
      columnHeaders: [{ properties: { fontColor: solid(C.text), backColor: solid(C.band) } }],
      values: [{ properties: { fontColorPrimary: solid(C.text), backColorPrimary: solid(C.panel), fontColorSecondary: solid(C.text), backColorSecondary: solid('#0F1626') } }],
    },
  };
  return baseVisual(hex(), pos, visual, panelVCO(title));
}

function slicer(pos, prop, title) {
  const visual = {
    visualType: 'slicer',
    query: { queryState: { Values: { projections: [projCol(prop)] } } },
    objects: {
      data: [{ properties: { mode: litStr('Basic') } }],
      header: [{ properties: { show: litBool(true), fontColor: solid(C.text), fontSize: litD(10) } }],
      items: [{ properties: { fontColor: solid(C.text), fontSize: litD(9) } }],
    },
  };
  return baseVisual(hex(), pos, visual, panelVCO(title));
}

function shapeRect(pos, color, z) {
  return baseVisual(hex(), { ...pos, z: z ?? 0 }, {
    visualType: 'shape',
    objects: {
      shape: [{ properties: { tileShape: litStr('rectangle') } }],
      fill: [{ properties: { fillColor: solid(color), transparency: litD(0) }, selector: { id: 'default' } }],
      outline: [{ properties: { show: litBool(false) }, selector: { id: 'default' } }],
    },
    visualContainerObjects: {
      background: [{ properties: { show: litBool(false) } }],
      border: [{ properties: { show: litBool(false) } }],
      padding: [{ properties: { top: litD(0), bottom: litD(0), left: litD(0), right: litD(0) } }],
    },
  });
}

function textbox(pos, runs, z) {
  return baseVisual(hex(), { ...pos, z: z ?? 10000 }, {
    visualType: 'textbox',
    objects: { general: [{ properties: { paragraphs: [{ textRuns: runs, horizontalTextAlignment: 'left' }] } }] },
    visualContainerObjects: {
      background: [{ properties: { show: litBool(false) } }],
      border: [{ properties: { show: litBool(false) } }],
      padding: [{ properties: { top: litD(0), bottom: litD(0), left: litD(0), right: litD(0) } }],
    },
  });
}

function header(title, subtitle) {
  return [
    shapeRect({ x: 0, y: 0, w: 1280, h: 64 }, C.band, 1),
    shapeRect({ x: 0, y: 64, w: 1280, h: 3 }, C.accent, 2),
    shapeRect({ x: 0, y: 12, w: 5, h: 40 }, C.accent, 3),
    textbox({ x: 20, y: 14, w: 700, h: 40 }, [
      { value: title, textStyle: { fontFamily: 'Segoe UI Semibold', fontSize: '22px', fontWeight: 'bold', color: C.white } },
    ], 10),
    textbox({ x: 900, y: 22, w: 360, h: 28 }, [
      { value: subtitle, textStyle: { fontFamily: 'Segoe UI', fontSize: '12px', color: C.muted } },
    ], 10),
  ];
}

// ---- Pages ------------------------------------------------------------------
function pageObjects() {
  return {
    background: [{ properties: { color: solid(C.bg), transparency: litD(0) } }],
    outspace: [{ properties: { color: solid(C.bg), transparency: litD(0) } }],
  };
}

const KX = [20, 328, 636, 944];
const KW = 298;

function buildCommandCentre() {
  const v = [];
  v.push(...header('AI CONTROL ROOM', 'Foundry Agent Operations'));
  // KPI row
  v.push(card({ x: KX[0], y: 80, w: KW, h: 116, z: 100 }, 'Active Agents', 'ACTIVE AGENTS', C.cyan, { displayUnits: 0 }));
  v.push(card({ x: KX[1], y: 80, w: KW, h: 116, z: 101 }, 'Total Invocations', 'TOTAL INVOCATIONS', C.teal, { displayUnits: 0 }));
  v.push(card({ x: KX[2], y: 80, w: KW, h: 116, z: 102 }, 'Total Tokens', 'TOTAL TOKENS', C.green, { displayUnits: 1000, precision: 1 }));
  v.push(card({ x: KX[3], y: 80, w: KW, h: 116, z: 103 }, 'Success Rate', 'SUCCESS RATE', C.amber, { displayUnits: 0 }));
  // Row 2
  v.push(donut({ x: 20, y: 212, w: 400, h: 250, z: 110 }, 'operation_name', 'Total Invocations', 'Invocations by Operation'));
  v.push(line({ x: 440, y: 212, w: 400, h: 250, z: 111 }, 'date_key', ['Total Tokens'], 'Daily Token Trend'));
  v.push(donut({ x: 860, y: 212, w: 400, h: 250, z: 112 }, 'agent_id', 'Total Tokens', 'Token Share by Agent'));
  // Row 3
  v.push(table({ x: 20, y: 478, w: 620, h: 222, z: 120 }, [
    { name: 'agent_id' },
    { name: 'Total Invocations', measure: true },
    { name: 'Total Tokens', measure: true },
    { name: 'Avg Duration (ms)', measure: true },
    { name: 'Success Rate', measure: true },
  ], 'Agent Activity'));
  v.push(colV({ x: 660, y: 478, w: 600, h: 222, z: 121 }, 'agent_id', ['Input Tokens', 'Output Tokens'], 'Prompt vs Completion Tokens by Agent'));
  return { displayName: 'AI Control Room', visuals: v };
}

function buildEstate() {
  const v = [];
  v.push(...header('AI ESTATE', 'Agent inventory & performance'));
  v.push(card({ x: KX[0], y: 80, w: KW, h: 116, z: 100 }, 'Active Agents', 'AGENTS', C.cyan, { displayUnits: 0 }));
  v.push(card({ x: KX[1], y: 80, w: KW, h: 116, z: 101 }, 'Avg Tokens per Invocation', 'AVG TOKENS / CALL', C.teal, { displayUnits: 0 }));
  v.push(card({ x: KX[2], y: 80, w: KW, h: 116, z: 102 }, 'Avg Duration (ms)', 'AVG LATENCY (MS)', C.violet, { displayUnits: 0 }));
  v.push(card({ x: KX[3], y: 80, w: KW, h: 116, z: 103 }, 'Failed Invocations', 'FAILED CALLS', C.red, { displayUnits: 0 }));
  // Left big table
  v.push(table({ x: 20, y: 212, w: 760, h: 488, z: 110 }, [
    { name: 'agent_id' },
    { name: 'Total Invocations', measure: true },
    { name: 'Total Tokens', measure: true },
    { name: 'Input Tokens', measure: true },
    { name: 'Output Tokens', measure: true },
    { name: 'Avg Duration (ms)', measure: true },
    { name: 'Success Rate', measure: true },
  ], 'Agent Estate Explorer'));
  // Right charts
  v.push(barH({ x: 800, y: 212, w: 460, h: 240, z: 111 }, 'agent_id', ['Total Tokens'], 'Total Tokens by Agent', 'Total Tokens'));
  v.push(barH({ x: 800, y: 460, w: 460, h: 240, z: 112 }, 'agent_id', ['Avg Duration (ms)'], 'Avg Latency by Agent (ms)', 'Avg Duration (ms)'));
  return { displayName: 'AI Estate', visuals: v };
}

function buildEconomics() {
  const v = [];
  v.push(...header('TOKEN ECONOMICS', 'Consumption & estimated cost'));
  v.push(card({ x: KX[0], y: 80, w: KW, h: 116, z: 100 }, 'Total Tokens', 'TOTAL TOKENS', C.green, { displayUnits: 1000, precision: 1 }));
  v.push(card({ x: KX[1], y: 80, w: KW, h: 116, z: 101 }, 'Input Tokens', 'PROMPT TOKENS', C.cyan, { displayUnits: 1000, precision: 1 }));
  v.push(card({ x: KX[2], y: 80, w: KW, h: 116, z: 102 }, 'Output Tokens', 'COMPLETION TOKENS', C.teal, { displayUnits: 1000, precision: 1 }));
  v.push(card({ x: KX[3], y: 80, w: KW, h: 116, z: 103 }, 'Est. Token Cost (USD)', 'EST. COST (USD)', C.amber, {}));
  // Row 2
  v.push(barH({ x: 20, y: 212, w: 620, h: 250, z: 110 }, 'agent_id', ['Total Tokens'], 'Token Usage by Agent', 'Total Tokens'));
  v.push(line({ x: 660, y: 212, w: 600, h: 250, z: 111 }, 'date_key', ['Input Tokens', 'Output Tokens'], 'Prompt vs Completion Trend'));
  // Row 3
  v.push(donut({ x: 20, y: 478, w: 500, h: 222, z: 120 }, 'agent_id', 'Est. Token Cost (USD)', 'Estimated Cost Share by Agent'));
  v.push(colV({ x: 540, y: 478, w: 720, h: 222, z: 121 }, 'agent_id', ['Input Tokens', 'Output Tokens'], 'Prompt vs Completion Tokens by Agent'));
  return { displayName: 'Token Economics', visuals: v };
}

// ---- Emit -------------------------------------------------------------------
function clean() {
  if (fs.existsSync(OUT_ROOT)) fs.rmSync(OUT_ROOT, { recursive: true, force: true });
}

function emit() {
  clean();
  fs.mkdirSync(PAGES_DIR, { recursive: true });

  // .pbip
  writeJson(path.join(OUT_ROOT, `${REPORT_NAME}.pbip`), {
    $schema: 'https://developer.microsoft.com/json-schemas/fabric/item/pbip/definitionProperties/1.0.0/schema.json',
    version: '1.0',
    artifacts: [{ report: { path: `${REPORT_NAME}.Report` } }],
    settings: { enableAutoRecovery: true },
  });

  // .platform
  writeJson(path.join(REPORT_DIR, '.platform'), {
    $schema: 'https://developer.microsoft.com/json-schemas/fabric/gitIntegration/platformProperties/2.0.0/schema.json',
    metadata: { type: 'Report', displayName: REPORT_NAME },
    config: { version: '2.0', logicalId: crypto.randomUUID() },
  });

  // definition.pbir (live connection)
  writeJson(path.join(REPORT_DIR, 'definition.pbir'), {
    $schema: S.defProps,
    version: '4.0',
    datasetReference: {
      byConnection: {
        connectionString: `Data Source=powerbi://api.powerbi.com/v1.0/myorg/${WORKSPACE};Initial Catalog=${MODEL};Integrated Security=ClaimsToken`,
        pbiServiceModelId: null,
        pbiModelVirtualServerName: 'sobe_wowvirtualserver',
        pbiModelDatabaseName: MODEL_ID,
        connectionType: 'pbiServiceXmlaStyleLive',
        name: 'EntityDataSource',
      },
    },
  });

  // version.json
  writeJson(path.join(DEF_DIR, 'version.json'), { $schema: S.version, version: '2.0.0' });

  // theme
  writeJson(path.join(RES_DIR, THEME_FILE), {
    name: THEME_FILE,
    dataColors: DATA_COLORS,
    background: C.bg,
    foreground: C.text,
    foregroundNeutralSecondary: C.muted,
    tableAccent: C.accent,
    good: C.green,
    neutral: C.amber,
    bad: C.red,
    maximum: C.green,
    minimum: C.red,
    textClasses: {
      label: { color: C.text, fontFace: 'Segoe UI' },
      title: { color: C.text, fontFace: 'Segoe UI Semibold' },
    },
  });
  writeJson(path.join(BASE_DIR, 'CY24SU10.json'), { name: 'CY24SU10', dataColors: DATA_COLORS, background: C.bg, foreground: C.text, tableAccent: C.accent });

  // report.json
  writeJson(path.join(DEF_DIR, 'report.json'), {
    $schema: S.report,
    themeCollection: {
      baseTheme: { name: 'CY24SU10', type: 'SharedResources', reportVersionAtImport: '5.55' },
      customTheme: { name: THEME_FILE, type: 'RegisteredResources', reportVersionAtImport: '5.55' },
    },
    resourcePackages: [
      { name: 'SharedResources', type: 'SharedResources', items: [{ name: 'CY24SU10', path: 'BaseThemes/CY24SU10.json', type: 'BaseTheme' }] },
      { name: 'RegisteredResources', type: 'RegisteredResources', items: [{ name: THEME_FILE, path: THEME_FILE, type: 'CustomTheme' }] },
    ],
    settings: { useStylableVisualContainerHeader: true },
  });

  const pages = [buildCommandCentre(), buildEstate(), buildEconomics()];
  const pageNames = [];
  for (const p of pages) {
    const pname = 'ReportSection' + crypto.randomBytes(12).toString('hex');
    pageNames.push(pname);
    const pdir = path.join(PAGES_DIR, pname);
    writeJson(path.join(pdir, 'page.json'), {
      $schema: S.page,
      name: pname,
      displayName: p.displayName,
      displayOption: 'FitToPage',
      height: 720,
      width: 1280,
      objects: pageObjects(),
    });
    for (const vis of p.visuals) {
      writeJson(path.join(pdir, 'visuals', vis.name, 'visual.json'), vis);
    }
  }

  writeJson(path.join(PAGES_DIR, 'pages.json'), {
    $schema: S.pages,
    pageOrder: pageNames,
    activePageName: pageNames[0],
  });

  console.log('Generated PBIP at', OUT_ROOT);
  console.log('Pages:', pages.map((p) => p.displayName).join(', '));
}

emit();
