import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@12/dist/mermaid.esm.min.mjs";

const $ = id => document.getElementById(id);

const els = {
  canvas:$("canvas"),
  diagram:$("diagram"),
  edgesLayer:$("edgesLayer"),
  properties:$("propertiesPanel"),
  codePanel:$("codePanel"),
  propertiesPanel:$("propertiesPanel"),
  codeEditor:$("codeEditor"),
  status:$("status"),
  toast:$("toast"),
  minimap:$("minimap"),
  zoomValue:$("zoomValue"),
  previewOverlay:$("previewOverlay"),
  previewContainer:$("previewContainer"),
  selectionAction:$("selectionAction"),
  undoBtn:$("undoBtn"),
  redoBtn:$("redoBtn"),
  addNodeBtn:$("addNodeBtn"),
  fitBtn:$("fitBtn"),
  resetViewBtn:$("resetViewBtn"),
  saveBtn:$("saveBtn"),
  previewBtn:$("previewBtn"),
  closePreview:$("closePreview"),
  exportBtn:$("exportBtn"),
  applyCode:$("applyCode"),
  copyCode:$("copyCode"),
  zoomIn:$("zoomIn"),
  zoomOut:$("zoomOut"),
  propertiesTab:$("propertiesTab"),
  codeTab:$("codeTab")
};

const STORAGE_KEY = "mermaid-flowchart-editor-v4";

const state = {
  direction:"TD",
  nodes:[],
  edges:[],
  extra:[],
  selectedNode:null,
  selectedEdge:null,
  drag:null,
  pan:null,
  zoom:1,
  offsetX:300,
  offsetY:180,
  history:[],
  historyIndex:-1,
  code:"",
  previewId:0,
  connectionDrag:null,
  clipboard:null,
  suppressNextClick:false
};

const NODE_SHAPES = [
  ["rect","四角"],
  ["round","角丸"],
  ["stadium","ピル"],
  ["diamond","ひし形"]
];

const EDGE_TYPES = [
  ["arrow","矢印"],
  ["line","線"],
  ["dotted","点線"],
  ["thick","太線"],
  ["circle","円"],
  ["cross","×"]
];

mermaid.initialize({
  startOnLoad:false,
  securityLevel:"loose",
  theme:"base",
  themeVariables:{
    primaryColor:"#ffffff",
    primaryTextColor:"#20242a",
    primaryBorderColor:"#646d79",
    lineColor:"#687482",
    secondaryColor:"#ffffff",
    tertiaryColor:"#ffffff",
    fontFamily:'Inter,"Noto Sans JP",system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    fontSize:"14px"
  },
  flowchart:{
    htmlLabels:false,
    curve:"stepAfter",
    nodeSpacing:60,
    rankSpacing:90,
    padding:12
  }
});

function log(...args){
  console.log("[MermaidGUI]",...args);
}

function warn(...args){
  console.warn("[MermaidGUI]",...args);
}

function errorLog(...args){
  console.error("[MermaidGUI]",...args);
}

function setStatus(text,error=false){
  if(!els.status){
    errorLog("status element not found");
    return;
  }
  els.status.textContent=text;
  els.status.style.color=error ? "#b42318" : "#70757d";
}

function toast(text){
  const message=String(text??"");
  // Connection completion/cancellation and node-addition notices are intentionally
  // silent. They interrupt editing without adding useful information. Keep them in
  // the console for diagnostics instead of showing a user-facing toast.
  if(/^(?:接続しました|接続をキャンセルしました|ノードを追加しました)$/.test(message)){
    log("toast suppressed",message);
    return;
  }
  if(!els.toast){
    errorLog("toast element not found");
    return;
  }
  els.toast.textContent=message;
  els.toast.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer=setTimeout(()=>{
    els.toast?.classList.remove("show");
  },1500);
}

function uid(prefix="N"){
  return prefix + Math.random().toString(36).slice(2,8);
}

function escapeMermaidText(value){
  return String(value ?? "")
    .replace(/\\/g,"\\\\")
    .replace(/#/g,"#35;")
    .replace(/"/g,"#quot;")
    .replace(/\|/g,"#124;");
}

function decodeMermaid(value){
  return String(value ?? "")
    .replace(/#quot;/g,'"')
    .replace(/#124;/g,"|")
    .replace(/#35;/g,"#")
    .replace(/#9829;/g,"♥");
}

function escapeId(value){
  const v=String(value ?? "").trim().replace(/[^\w\u3040-\u30ff\u3400-\u9fff-]/g,"_");
  return v || uid("N");
}

function htmlAttr(value){
  return String(value??"")
    .replace(/&/g,"&amp;")
    .replace(/"/g,"&quot;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;");
}

function htmlText(value){
  return String(value??"")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;");
}

function uniqueNodeId(base="N"){
  let id=escapeId(base);
  let i=1;
  while(getNode(id)){
    id=escapeId(base)+i++;
  }
  return id;
}

function needsQuotedNodeLabel(value){
  return /[\[\]\(\)\{\}"'|;]|^\s|\s$/.test(String(value??"")) || String(value??"").includes("\n");
}

function nodeLabelSyntax(label){
  const text=escapeMermaidText(label);
  return needsQuotedNodeLabel(label) ? `"${text}"` : text;
}

function shapeToSyntax(node){
  const id=escapeId(node.id);
  const label=nodeLabelSyntax(node.label || node.id);

  switch(node.shape){
    case "round": return `${id}(${label})`;
    case "stadium": return `${id}([${label}])`;
    case "diamond": return `${id}{${label}}`;
    default: return `${id}[${label}]`;
  }
}

function edgeSyntax(edge){
  const from=escapeId(edge.from);
  const to=escapeId(edge.to);
  const label=edge.label ? `|${escapeMermaidText(edge.label)}|` : "";

  switch(edge.type){
    case "line":
      return label ? `${from} --- ${label} ${to}` : `${from} --- ${to}`;
    case "dotted":
      return label ? `${from} -.->${label} ${to}` : `${from} -.-> ${to}`;
    case "thick":
      return label ? `${from} ==>${label} ${to}` : `${from} ==> ${to}`;
    case "circle":
      return label ? `${from} ---${label}o ${to}` : `${from} ---o ${to}`;
    case "cross":
      return label ? `${from} ---${label}x ${to}` : `${from} ---x ${to}`;
    default:
      // Mermaid canonical link-label syntax: A -->|label| B
      return label ? `${from} -->${label} ${to}` : `${from} --> ${to}`;
  }
}

function graphToMermaid(){
  const lines=[`flowchart ${state.direction}`];
  for(const node of state.nodes){
    lines.push(`    ${shapeToSyntax(node)}`);
  }
  for(const edge of state.edges){
    lines.push(`    ${edgeSyntax(edge)}`);
  }
  if(state.extra.length){
    lines.push(...state.extra);
  }
  return lines.join("\n");
}

function cloneGraph(){
  return JSON.parse(JSON.stringify({
    direction:state.direction,
    nodes:state.nodes,
    edges:state.edges,
    extra:state.extra
  }));
}

function restoreGraph(snapshot){
  if(!snapshot || typeof snapshot!=="object"){
    errorLog("Invalid history snapshot");
    return;
  }
  state.direction=snapshot.direction||"TD";
  state.nodes=Array.isArray(snapshot.nodes) ? snapshot.nodes : [];
  state.edges=Array.isArray(snapshot.edges) ? snapshot.edges : [];
  state.extra=Array.isArray(snapshot.extra) ? snapshot.extra : [];
  state.selectedNode=null;
  state.selectedEdge=null;
  state.drag=null;
  state.connectionDrag=null;
  renderAll();
  log("history restored");
}

function pushHistory(){
  const snapshot=cloneGraph();
  const serialized=JSON.stringify(snapshot);

  if(
    state.history[state.historyIndex] &&
    JSON.stringify(state.history[state.historyIndex])===serialized
  ){
    return;
  }

  state.history=state.history.slice(0,state.historyIndex+1);
  state.history.push(snapshot);

  if(state.history.length>80){
    state.history.shift();
  }

  state.historyIndex=state.history.length-1;
  updateHistoryButtons();
  log("history pushed");
}

function undo(){
  if(state.historyIndex<=0){
    log("undo unavailable");
    return;
  }
  state.historyIndex--;
  restoreGraph(state.history[state.historyIndex]);
  toast("元に戻しました");
  log("undo");
}

function redo(){
  if(state.historyIndex>=state.history.length-1){
    log("redo unavailable");
    return;
  }
  state.historyIndex++;
  restoreGraph(state.history[state.historyIndex]);
  toast("やり直しました");
  log("redo");
}

function updateHistoryButtons(){
  const undoBtn=$("undoBtn");
  const redoBtn=$("redoBtn");

  if(!undoBtn || !redoBtn){
    errorLog("history buttons not found");
    return;
  }

  undoBtn.disabled=state.historyIndex<=0;
  redoBtn.disabled=state.historyIndex>=state.history.length-1;
}

function getNode(id){
  return state.nodes.find(n=>n.id===id);
}

function nodeCenter(node){
  return {
    x:node.x+(node.width||140)/2,
    y:node.y+(node.height||58)/2
  };
}

function connectionPoint(node,target){
  const c=nodeCenter(node);
  const dx=target.x-c.x;
  const dy=target.y-c.y;
  const w=(node.width||140)/2;
  const h=(node.height||58)/2;

  if(Math.abs(dx)*h > Math.abs(dy)*w){
    const sx=dx>=0 ? 1 : -1;
    return {x:c.x+sx*w,y:c.y+(dy/dx)*sx*w};
  }

  const sy=dy>=0 ? 1 : -1;
  return {x:c.x+(dx/dy)*sy*h,y:c.y+sy*h};
}

function handlePoint(node,side){
  const x=side.includes("right") ? node.x+node.width : node.x;
  const y=side.includes("bottom") ? node.y+node.height : node.y;
  return {x,y};
}

function wrapLabelLines(label,charsPerLine=22){
  const text=String(label??"");
  const wrappedLines=[];

  for(const rawLine of text.split("\n")){
    const line=[...rawLine];
    if(!line.length){
      wrappedLines.push("");
      continue;
    }
    for(let index=0; index<line.length; index+=charsPerLine){
      wrappedLines.push(line.slice(index,index+charsPerLine).join(""));
    }
  }

  return wrappedLines.length ? wrappedLines : [""];
}

function estimateNodeSize(label){
  const wrappedLines=wrapLabelLines(label,24);
  const maxChars=Math.max(1,...wrappedLines.map(line=>[...line].length));
  const width=Math.max(120,Math.min(420,40+maxChars*8));
  const height=Math.max(56,Math.min(320,28+Math.max(1,wrappedLines.length)*24));
  return {width,height};
}

function normalizeNodeSize(node,size){
  if(!node || !size){
    errorLog("normalizeNodeSize: node or size missing");
    return size || {width:120,height:52};
  }

  if(node.shape==="diamond") {
    const labelLines=wrapLabelLines(node.label || node.id,18);
    const longestLine=Math.max(1,...labelLines.map(line=>[...line].length));
    const side=Math.max(112,Math.min(360,56+longestLine*8),48+labelLines.length*24);
    return {width:Math.round(side),height:Math.round(side)};
  }

  return {
    width:Math.max(120,Math.round(size.width)),
    height:Math.max(52,Math.round(size.height))
  };
}

function resizeNodeToLabel(node){
  if(!node){
    errorLog("resizeNodeToLabel: node missing");
    return;
  }
  const size=normalizeNodeSize(node,estimateNodeSize(node.label || node.id));
  node.width=size.width;
  node.height=size.height;
}

function getVisibleCanvasRect(padding=24){
  if(!els.canvas){
    errorLog("getVisibleCanvasRect: canvas missing");
    return {x:0,y:0,width:800,height:600};
  }
  const width=els.canvas.clientWidth||800;
  const height=els.canvas.clientHeight||600;
  const pad=Math.max(0,padding)/Math.max(state.zoom,.001);
  const left=(-state.offsetX)/Math.max(state.zoom,.001)+pad;
  const top=(-state.offsetY)/Math.max(state.zoom,.001)+pad;
  const right=(width-state.offsetX)/Math.max(state.zoom,.001)-pad;
  const bottom=(height-state.offsetY)/Math.max(state.zoom,.001)-pad;
  return {x:left,y:top,width:Math.max(1,right-left),height:Math.max(1,bottom-top)};
}

function findFreeNodePosition(width,height){
  const visible=getVisibleCanvasRect(12);
  const minX=visible.x;
  const minY=visible.y;
  const maxX=visible.x+visible.width-width;
  const maxY=visible.y+visible.height-height;

  if(maxX<minX || maxY<minY){
    errorLog("findFreeNodePosition: visible canvas too small",{width,height,visible});
    return {
      x:minX,
      y:minY,
      full:false,
      clamped:true
    };
  }

  const gap=24;
  const isFree=(x,y)=>{
    const test={x,y,width,height};
    return !state.nodes.some(existing=>rectsOverlap(test,existing,gap));
  };

  // Prefer the visual center, but inspect the entire visible area before giving up.
  // The previous implementation sampled only a sparse expanding ring and could miss
  // real gaps between existing nodes.
  const centerX=minX+(maxX-minX)/2;
  const centerY=minY+(maxY-minY)/2;
  const step=8;
  const candidates=[];
  const seen=new Set();

  const addCandidate=(x,y)=>{
    const clampedX=Math.min(maxX,Math.max(minX,x));
    const clampedY=Math.min(maxY,Math.max(minY,y));
    const sx=Math.round(clampedX/step)*step;
    const sy=Math.round(clampedY/step)*step;
    const cx=Math.min(maxX,Math.max(minX,sx));
    const cy=Math.min(maxY,Math.max(minY,sy));
    const key=`${cx}|${cy}`;
    if(!seen.has(key)){
      seen.add(key);
      candidates.push({x:cx,y:cy,distance:Math.hypot(cx-centerX,cy-centerY)});
    }
  };

  // Generate every usable grid cell. Sorting by distance keeps the placement pleasant
  // while still guaranteeing that a free visible position is found when one exists.
  for(let y=minY;y<=maxY+0.001;y+=step){
    for(let x=minX;x<=maxX+0.001;x+=step){
      addCandidate(x,y);
    }
  }
  addCandidate(maxX,maxY);
  addCandidate(minX,maxY);
  addCandidate(maxX,minY);
  addCandidate(minX,minY);
  candidates.sort((a,b)=>a.distance-b.distance);

  for(const candidate of candidates){
    if(isFree(candidate.x,candidate.y)){
      const result={x:candidate.x,y:candidate.y,full:false};
      log("new node placed in free visible space",result);
      return result;
    }
  }

  // Dense diagrams can have no gap that satisfies the preferred spacing. Continue with
  // a second pass using zero extra gap so the node still never overlaps an existing node.
  const touchCandidates=candidates;
  const isTouchFree=(x,y)=>{
    const test={x,y,width,height};
    return !state.nodes.some(existing=>rectsOverlap(test,existing,0));
  };
  for(const candidate of touchCandidates){
    if(isTouchFree(candidate.x,candidate.y)){
      const result={x:candidate.x,y:candidate.y,full:false,compact:true};
      log("new node placed in compact free visible space",result);
      return result;
    }
  }

  // The visible rectangle is genuinely packed. Reflow all nodes into a collision-free
  // grid instead of creating a new overlapping node. Existing node order is preserved.
  warn("visible canvas packed; reflowing nodes to create free space",{nodeCount:state.nodes.length});
  const all=[...state.nodes.map(node=>({node,width:node.width,height:node.height})),{node:null,width,height}];
  const placementCandidates=[];
  for(let y=minY;y<=maxY+0.001;y+=step){
    for(let x=minX;x<=maxX+0.001;x+=step){
      placementCandidates.push({x,y});
    }
  }
  const placed=[];
  for(const item of all){
    const candidate=placementCandidates.find(point=>!placed.some(other=>rectsOverlap(
      {x:point.x,y:point.y,width:item.width,height:item.height},
      other,
      0
    )));
    if(!candidate){
      errorLog("findFreeNodePosition: unable to place without overlap after reflow",{visible,width,height});
      return {x:minX,y:minY,full:true};
    }
    const box={x:candidate.x,y:candidate.y,width:item.width,height:item.height,node:item.node};
    placed.push(box);
    if(item.node===null){
      for(const entry of placed){
        if(entry.node){
          entry.node.x=entry.x;
          entry.node.y=entry.y;
        }
      }
      const result={x:box.x,y:box.y,full:false,reflowed:true};
      log("new node placed after collision-free reflow",result);
      return result;
    }
  }

  errorLog("findFreeNodePosition: unexpected placement failure",{visible,width,height});
  return {x:minX,y:minY,full:true};
}

function createNode(){
  const id=uniqueNodeId("N");
  const template={shape:"rect",label:"新しいノード"};
  const size=normalizeNodeSize(template,estimateNodeSize(template.label));
  const position=findFreeNodePosition(size.width,size.height);
  if(position.full){
    errorLog("node creation aborted: no collision-free visible position",position);
    return;
  }

  const node={
    id,
    label:"新しいノード",
    shape:"rect",
    x:position.x,
    y:position.y,
    width:size.width,
    height:size.height
  };

  state.nodes.push(node);
  state.selectedNode=id;
  state.selectedEdge=null;
  pushHistory();
  renderAll();
  focusNode(id);
  log("node created",id,{x:node.x,y:node.y});
}

function removeSelected(){
  if(state.selectedNode){
    const id=state.selectedNode;
    if(!getNode(id)){
      state.selectedNode=null;
      warn("selected node missing",id);
      renderAll();
      return;
    }

    state.nodes=state.nodes.filter(n=>n.id!==id);
    state.edges=state.edges.filter(e=>e.from!==id && e.to!==id);
    state.selectedNode=null;
    pushHistory();
    renderAll();
    toast("ノードを削除しました");
    log("node deleted",id);
    return;
  }

  if(state.selectedEdge){
    const id=state.selectedEdge;
    const exists=state.edges.some(e=>e.id===id);
    if(!exists){
      state.selectedEdge=null;
      warn("selected edge missing",id);
      renderAll();
      return;
    }

    state.edges=state.edges.filter(e=>e.id!==id);
    state.selectedEdge=null;
    pushHistory();
    renderAll();
    toast("接続を削除しました");
    log("edge deleted",id);
  }
}

function updateSelectionVisuals(){
  const nodes=els.diagram?.querySelectorAll(".node");
  if(!nodes){
    errorLog("updateSelectionVisuals: diagram nodes unavailable");
    return;
  }
  nodes.forEach(node=>{
    const selected=node.dataset.id===state.selectedNode;
    node.classList.toggle("selected",selected);
  });

  const edgeLines=els.edgesLayer?.querySelectorAll(".edge-line");
  if(!edgeLines){
    errorLog("updateSelectionVisuals: edge layer unavailable");
    return;
  }
  edgeLines.forEach(path=>{
    path.classList.toggle("selected",path.dataset.edgeId===state.selectedEdge);
  });
}

function selectNode(id,rerender=true){
  const node=getNode(id);
  if(!node){
    errorLog("selectNode: node not found",id);
    return;
  }
  state.selectedNode=id;
  state.selectedEdge=null;
  if(rerender){
    renderNodes();
    renderEdges();
  }else{
    updateSelectionVisuals();
  }
  renderSelectionAction();
  renderProperties();
  log("node selected",id,{rerender});
}

function selectEdge(id,rerender=true){
  const edge=state.edges.find(x=>x.id===id);
  if(!edge){
    errorLog("selectEdge: edge not found",id);
    return;
  }
  state.selectedEdge=id;
  state.selectedNode=null;
  if(rerender){
    renderNodes();
    renderEdges();
  }else{
    updateSelectionVisuals();
  }
  renderSelectionAction();
  renderProperties();
  log("edge selected",id,{rerender});
}

function updateNode(id,key,value){
  const node=getNode(id);
  if(!node){
    errorLog("updateNode: node not found",id);
    return;
  }

  if(key==="id"){
    const next=escapeId(value);
    if(!next || next===node.id){
      renderProperties();
      return;
    }

    if(getNode(next)){
      toast("そのIDは既に使用されています");
      renderProperties();
      warn("duplicate node id",next);
      return;
    }

    for(const edge of state.edges){
      if(edge.from===node.id) edge.from=next;
      if(edge.to===node.id) edge.to=next;
    }

    node.id=next;
    state.selectedNode=next;
  }else if(key==="label"){
    node[key]=String(value??"");
    resizeNodeToLabel(node);
  }else if(key==="shape"){
    if(!NODE_SHAPES.some(([v])=>v===value)){
      warn("unsupported shape selection",value);
      return;
    }
    node.shape=value;
    resizeNodeToLabel(node);
  }else if(key==="x" || key==="y"){
    const number=Number(value);
    if(!Number.isFinite(number)){
      toast("位置には数値を入力してください");
      renderProperties();
      warn("invalid position",value);
      return;
    }
    node[key]=number;
  }else{
    warn("unsupported node property",key);
    return;
  }

  pushHistory();
  renderAll();
  log("node updated",id,key);
}

function updateEdge(id,key,value){
  const edge=state.edges.find(e=>e.id===id);
  if(!edge){
    errorLog("updateEdge: edge not found",id);
    return;
  }

  if(key==="from" || key==="to"){
    if(!getNode(value)){
      toast("存在するノードを選択してください");
      renderProperties();
      warn("edge endpoint not found",value);
      return;
    }
  }

  if(key==="type" && !EDGE_TYPES.some(([v])=>v===value)){
    warn("unsupported edge type",value);
    return;
  }

  edge[key]=key==="label" ? String(value??"") : value;
  pushHistory();
  renderAll();
  log("edge updated",id,key);
}

function addEdge(from,to,type="arrow",label=""){
  if(!from || !to || from===to){
    warn("invalid edge endpoints",from,to);
    return false;
  }

  if(!getNode(from) || !getNode(to)){
    warn("edge endpoint does not exist",from,to);
    return false;
  }

  const exists=state.edges.some(
    e=>e.from===from && e.to===to && e.type===type && e.label===label
  );

  if(exists){
    warn("duplicate edge skipped",from,to);
    toast("同じ接続は既にあります");
    return false;
  }

  const edge={
    id:uid("E"),
    from,
    to,
    type,
    label
  };

  state.edges.push(edge);
  state.selectedEdge=edge.id;
  state.selectedNode=null;
  pushHistory();
  renderAll();
  log("edge added",edge);
  return true;
}

function parseNodeExpression(expr){
  const original=expr.trim().replace(/;$/,"");
  if(!original) return null;

  let m;

  if((m=original.match(/^([A-Za-z_][\w-]*)@(?:\{\s*shape\s*:\s*(rect|rounded|stadium|diamond|diam|decision)\s*\})$/i))){
    const shapeMap={
      rect:"rect",
      rounded:"round",
      stadium:"stadium",
      diamond:"diamond",
      diam:"diamond",
      decision:"diamond"
    };
    return {id:m[1],label:m[1],shape:shapeMap[m[2].toLowerCase()]};
  }

  if((m=original.match(/^([A-Za-z_][\w-]*)\[\[([\s\S]*)\]\]$/))){
    return {unsupported:true,id:m[1],label:decodeNodeLabel(m[2]),shape:"rect",reason:"subprocess"};
  }

  if((m=original.match(/^([A-Za-z_][\w-]*)\(\[([\s\S]*)\]\)$/))){
    return {id:m[1],label:decodeNodeLabel(m[2]),shape:"stadium"};
  }

  if((m=original.match(/^([A-Za-z_][\w-]*)\{([\s\S]*)\}$/))){
    return {id:m[1],label:decodeNodeLabel(m[2]),shape:"diamond"};
  }

  if((m=original.match(/^([A-Za-z_][\w-]*)\(([\s\S]*)\)$/))){
    return {id:m[1],label:decodeNodeLabel(m[2]),shape:"round"};
  }

  if((m=original.match(/^([A-Za-z_][\w-]*)\[([\s\S]*)\]$/))){
    return {id:m[1],label:decodeNodeLabel(m[2]),shape:"rect"};
  }

  if((m=original.match(/^([A-Za-z_][\w-]*)$/))){
    return {id:m[1],label:m[1],shape:"rect"};
  }

  return null;
}

function decodeNodeLabel(value){
  let text=String(value??"").trim();

  if(
    text.length>=2 &&
    text.startsWith('"') &&
    text.endsWith('"')
  ){
    text=text.slice(1,-1);
  }

  return decodeMermaid(text);
}

function stripQuotedMermaidLabel(value){
  let text=String(value??"").trim();

  if(text.startsWith('"') && text.endsWith('"') && text.length>=2){
    text=text.slice(1,-1);
  }

  return decodeMermaid(text);
}

function findEdgeSplit(line){
  const text=line.trim().replace(/;$/,'').trim();
  let depth=0;
  let quote='';
  let escaped=false;

  for(let i=0;i<text.length;i++){
    const ch=text[i];

    if(escaped){
      escaped=false;
      continue;
    }
    if(ch==='\\'){
      escaped=true;
      continue;
    }
    if(quote){
      if(ch===quote) quote='';
      continue;
    }
    if(ch==='"' || ch==="'"){
      quote=ch;
      continue;
    }
    if('[({'.includes(ch)){
      depth++;
      continue;
    }
    if('])}'.includes(ch)){
      depth=Math.max(0,depth-1);
      continue;
    }
    if(depth!==0) continue;

    const rest=text.slice(i);
    const patterns=[
      {re:/^-->(\|[^|]*\|)/,type:'arrow'},
      {re:/^-->/,type:'arrow'},
      {re:/^--\|([^|]*)\|>/,type:'arrow',labelIndex:1},
      {re:/^-\.->(\|[^|]*\|)/,type:'dotted'},
      {re:/^-\.->/,type:'dotted'},
      {re:/^==>(\|[^|]*\|)/,type:'thick'},
      {re:/^==>/,type:'thick'},
      {re:/^---(\|[^|]*\|o)/,type:'circle'},
      {re:/^---(\|[^|]*\|x)/,type:'cross'},
      {re:/^---(\|[^|]*\|)/,type:'line'},
      {re:/^---o/,type:'circle'},
      {re:/^---x/,type:'cross'},
      {re:/^---/,type:'line'}
    ];

    for(const pattern of patterns){
      const match=rest.match(pattern.re);
      if(!match) continue;

      let end=i+match[0].length;
      let label='';

      if(pattern.labelIndex!==undefined){
        label=stripQuotedMermaidLabel(match[pattern.labelIndex]);
      }else{
        const token=match[1]||'';
        if(token.startsWith('|') && token.endsWith('|')){
          label=stripQuotedMermaidLabel(token.slice(1,-1));
        }
      }

      let remainder=text.slice(end).trim();

      if(!label && remainder.startsWith('|')){
        const labelMatch=remainder.match(/^\|([^|]*)\|\s*/);
        if(labelMatch){
          label=stripQuotedMermaidLabel(labelMatch[1]);
          remainder=remainder.slice(labelMatch[0].length).trim();
        }
      }

      return {
        left:text.slice(0,i).trim(),
        right:remainder,
        type:pattern.type,
        label
      };
    }
  }

  return null;
}

function splitEdge(line){
  const split=findEdgeSplit(line);
  if(!split) return null;

  const from=parseNodeExpression(split.left);
  const to=parseNodeExpression(split.right);

  if(!from || !to) return null;

  return {
    from,
    to,
    type:split.type,
    label:split.label
  };
}

function sanitizeImportedNode(node){
  const id=escapeId(node.id);
  const label=node.label || id;
  const shape=NODE_SHAPES.some(([v])=>v===node.shape) ? node.shape : "rect";
  const size=normalizeNodeSize({shape},estimateNodeSize(label));

  return {
    id,
    label,
    shape,
    width:size.width,
    height:size.height,
    x:0,
    y:0
  };
}

function layoutNodes(nodes,edges,direction){
  if(!nodes.length) return;

  const byId=new Map(nodes.map(node=>[node.id,node]));
  const incoming=new Map(nodes.map(node=>[node.id,[]]));
  const outgoing=new Map(nodes.map(node=>[node.id,[]]));
  const indegree=new Map(nodes.map(node=>[node.id,0]));

  for(const edge of edges){
    if(!byId.has(edge.from) || !byId.has(edge.to) || edge.from===edge.to) continue;
    outgoing.get(edge.from).push(edge.to);
    incoming.get(edge.to).push(edge.from);
    indegree.set(edge.to,(indegree.get(edge.to)||0)+1);
  }

  const rank=new Map();
  const visited=new Set();
  const queue=nodes.filter(node=>(indegree.get(node.id)||0)===0);

  if(!queue.length) queue.push(nodes[0]);
  for(const node of queue){
    rank.set(node.id,0);
  }

  let qIndex=0;
  while(qIndex<queue.length){
    const current=queue[qIndex++];
    if(visited.has(current.id)) continue;
    visited.add(current.id);
    const currentRank=rank.get(current.id)||0;

    for(const nextId of outgoing.get(current.id)||[]){
      if(visited.has(nextId)) continue;
      const nextRank=Math.max(rank.get(nextId)??0,currentRank+1);
      rank.set(nextId,nextRank);
      const nextNode=byId.get(nextId);
      if(nextNode) queue.push(nextNode);
    }
  }

  for(const node of nodes){
    if(!rank.has(node.id)) rank.set(node.id,0);
  }

  const layers=new Map();
  for(const node of nodes){
    const r=rank.get(node.id)||0;
    if(!layers.has(r)) layers.set(r,[]);
    layers.get(r).push(node);
  }

  const ranks=[...layers.keys()].sort((a,b)=>a-b);

  const averageNeighborIndex=(node,neighborMap,layer)=>{
    const indexes=new Map(layer.map((item,index)=>[item.id,index]));
    const values=(neighborMap.get(node.id)||[])
      .map(id=>indexes.get(id))
      .filter(index=>index!==undefined);
    return values.length ? values.reduce((sum,value)=>sum+value,0)/values.length : Number.POSITIVE_INFINITY;
  };

  for(let pass=0;pass<8;pass++){
    for(let i=1;i<ranks.length;i++){
      const current=layers.get(ranks[i]);
      const prev=layers.get(ranks[i-1]);
      current.sort((a,b)=>{
        const aa=averageNeighborIndex(a,incoming,prev);
        const bb=averageNeighborIndex(b,incoming,prev);
        if(aa!==bb) return aa-bb;
        return a.id.localeCompare(b.id);
      });
    }
    for(let i=ranks.length-2;i>=0;i--){
      const current=layers.get(ranks[i]);
      const next=layers.get(ranks[i+1]);
      current.sort((a,b)=>{
        const aa=averageNeighborIndex(a,outgoing,next);
        const bb=averageNeighborIndex(b,outgoing,next);
        if(aa!==bb) return aa-bb;
        return a.id.localeCompare(b.id);
      });
    }
  }

  const mainGap=110;
  const crossGap=64;

  if(direction==="LR" || direction==="RL") {
    let cursor=0;
    for(const r of ranks){
      const layer=layers.get(r);
      const columnWidth=Math.max(...layer.map(node=>node.width));
      const totalHeight=layer.reduce((sum,node)=>sum+node.height,0)+Math.max(0,layer.length-1)*crossGap;
      let y=-totalHeight/2;
      for(const node of layer){
        node.x=cursor+(columnWidth-node.width)/2;
        node.y=y;
        y+=node.height+crossGap;
      }
      cursor+=columnWidth+mainGap;
    }

    if(direction==="RL") {
      const maxX=Math.max(...nodes.map(node=>node.x+node.width));
      const minX=Math.min(...nodes.map(node=>node.x));
      for(const node of nodes){
        node.x=maxX+minX-node.x-node.width;
      }
    }
  } else {
    let cursor=0;
    for(const r of ranks){
      const layer=layers.get(r);
      const rowHeight=Math.max(...layer.map(node=>node.height));
      const totalWidth=layer.reduce((sum,node)=>sum+node.width,0)+Math.max(0,layer.length-1)*crossGap;
      let x=-totalWidth/2;
      for(const node of layer){
        node.x=x;
        node.y=cursor+(rowHeight-node.height)/2;
        x+=node.width+crossGap;
      }
      cursor+=rowHeight+mainGap;
    }

    if(direction==="BT") {
      const minY=Math.min(...nodes.map(node=>node.y));
      const maxY=Math.max(...nodes.map(node=>node.y+node.height));
      for(const node of nodes){
        node.y=minY+maxY-node.y-node.height;
      }
    }
  }

  resolveOverlaps(nodes);
}

function rectsOverlap(a,b,gap=18){
  return !(
    a.x+a.width+gap<=b.x ||
    b.x+b.width+gap<=a.x ||
    a.y+a.height+gap<=b.y ||
    b.y+b.height+gap<=a.y
  );
}

function resolveOverlaps(nodes){
  for(let pass=0;pass<40;pass++){
    let moved=false;

    for(let i=0;i<nodes.length;i++){
      for(let j=i+1;j<nodes.length;j++){
        const a=nodes[i];
        const b=nodes[j];
        if(!rectsOverlap(a,b)) continue;

        const ax=a.x+a.width/2;
        const ay=a.y+a.height/2;
        const bx=b.x+b.width/2;
        const by=b.y+b.height/2;

        const pushX=(a.width+b.width)/2+18-Math.abs(ax-bx);
        const pushY=(a.height+b.height)/2+18-Math.abs(ay-by);

        if(pushX<pushY){
          const shift=pushX/2;
          if(ax<=bx){
            a.x-=shift;
            b.x+=shift;
          }else{
            a.x+=shift;
            b.x-=shift;
          }
        }else{
          const shift=pushY/2;
          if(ay<=by){
            a.y-=shift;
            b.y+=shift;
          }else{
            a.y+=shift;
            b.y-=shift;
          }
        }

        moved=true;
      }
    }

    if(!moved) break;
  }

  if(nodes.some((node,index)=>nodes.slice(index+1).some(other=>rectsOverlap(node,other,0)))){
    warn("overlap remained after collision resolution");
  }else{
    log("layout collision check passed");
  }
}

function normalizeEditorMermaidSyntax(source){
  return String(source??"")
    .replace(/--\|([^|]*)\|>/g,"-->|$1|")
}

function parseEdgeChain(line){
  const result=[];
  let current=line.trim().replace(/;$/,'').trim();
  let guard=0;

  while(current && guard++<32){
    const split=findEdgeSplit(current);
    if(!split) break;

    const from=parseNodeExpression(split.left);
    if(!from) break;

    const nested=findEdgeSplit(split.right);
    if(!nested){
      const to=parseNodeExpression(split.right);
      if(!to) break;
      result.push({from,to,type:split.type,label:split.label});
      break;
    }

    const middle=parseNodeExpression(nested.left);
    if(!middle) break;
    result.push({from,to:middle,type:split.type,label:split.label});
    current=split.right;
  }

  return result;
}

async function parseMermaidSource(source){
  const normalized=normalizeEditorMermaidSyntax(source);
  const valid=await mermaid.parse(normalized,{suppressErrors:false});
  if(!valid){
    throw new Error("Mermaid構文が無効です");
  }

  const lines=normalized.replace(/\r/g,"").split("\n");
  const nodesMap=new Map();
  const edges=[];
  const extra=[];
  let direction="TD";
  let bodyStarted=false;
  let unsupportedShapes=[];

  const addNode=nodeData=>{
    if(!nodeData) return;
    if(nodeData.unsupported){
      unsupportedShapes.push(nodeData.id);
      return;
    }

    if(!nodesMap.has(nodeData.id)){
      nodesMap.set(nodeData.id,sanitizeImportedNode(nodeData));
      return;
    }

    const existing=nodesMap.get(nodeData.id);
    if(existing.label===existing.id && nodeData.label!==nodeData.id){
      existing.label=nodeData.label;
    }
    if(existing.shape==="rect" && nodeData.shape!=="rect"){
      existing.shape=nodeData.shape;
    }
    const size=normalizeNodeSize(existing,estimateNodeSize(existing.label || existing.id));
    existing.width=size.width;
    existing.height=size.height;
  };

  for(const raw of lines){
    const line=raw.trim();
    if(!line) continue;

    if(/^%%/.test(line)){
      extra.push(raw);
      continue;
    }

    const fm=line.match(/^(?:flowchart|graph)\s*(TB|TD|BT|RL|LR)?\b/i);
    if(fm){
      const sourceDirection=(fm[1]||"TD").toUpperCase();
      direction=sourceDirection==="TB" ? "TD" : sourceDirection;
      bodyStarted=true;
      continue;
    }

    if(!bodyStarted) continue;

    const statements=line.split(/;(?![^\[\(\{]*[\]\)\}])/).map(item=>item.trim()).filter(Boolean);
    for(const statement of statements){
      const chain=parseEdgeChain(statement);
      if(chain.length){
        for(const edge of chain){
          addNode(edge.from);
          addNode(edge.to);
          if(edge.from.unsupported || edge.to.unsupported) continue;

          edges.push({
            id:uid("E"),
            from:escapeId(edge.from.id),
            to:escapeId(edge.to.id),
            type:edge.type,
            label:edge.label
          });
        }
        continue;
      }

      const node=parseNodeExpression(statement);
      if(node){
        addNode(node);
        continue;
      }

      extra.push(statement);
    }
  }

  if(unsupportedShapes.length){
    throw new Error(
      `未対応のノード形状があります: ${[...new Set(unsupportedShapes)].join(", ")}\n`+
      "このエディタで使用できる形状は、四角・角丸・ピル・ひし形のみです。"
    );
  }

  const cleanEdges=edges.filter(edge=>getNodeFromMap(nodesMap,edge.from) && getNodeFromMap(nodesMap,edge.to));
  const nodes=[...nodesMap.values()];
  layoutNodes(nodes,cleanEdges,direction);

  return {direction,nodes,edges:cleanEdges,extra};
}

function getNodeFromMap(nodesMap,id){
  return nodesMap.get(id) || null;
}

function renderNodes(){
  if(!els.diagram){
    errorLog("diagram element not found");
    return;
  }

  els.diagram.querySelectorAll(".node").forEach(element=>element.remove());

  for(const node of state.nodes){
    const el=document.createElement("div");
    el.className=
      `node ${node.shape||"rect"}`+
      `${state.selectedNode===node.id ? " selected" : ""}`+
      `${state.connectionDrag?.fromNodeId===node.id ? " connect-source" : ""}`;
    el.dataset.id=node.id;
    if(node.shape==="diamond"){
      const normalized=normalizeNodeSize(node,{width:node.width||140,height:node.height||140});
      node.width=normalized.width;
      node.height=normalized.height;
    }

    el.style.left=node.x+"px";
    el.style.top=node.y+"px";
    el.style.width=node.width+"px";
    el.style.height=node.height+"px";

    const label=document.createElement("div");
    label.className="node-label";
    label.textContent=node.label || node.id;
    el.appendChild(label);

    for(const side of ["top","right","bottom","left"]){
      const handle=document.createElement("div");
      handle.className=`handle ${side}`;
      handle.dataset.side=side;
      handle.title="ドラッグして接続";
      el.appendChild(handle);
    }

    el.addEventListener("pointerdown",event=>{
      if(event.button!==0) return;

      if(event.target instanceof Element && event.target.classList.contains("handle")){
        event.preventDefault();
        event.stopPropagation();
        beginConnectionDrag(event,node,event.target);
        return;
      }

      if(state.connectionDrag){
        event.preventDefault();
        event.stopPropagation();
        finishConnectionOnNode(node.id);
        return;
      }

      event.stopPropagation();

      if(handleManualDoubleClick("node",node.id,event)){
        state.drag=null;
        state.pan=null;
        return;
      }

      selectNode(node.id,false);

      const point=canvasPoint(event);
      state.drag={
        node,
        startX:point.x,
        startY:point.y,
        nodeX:node.x,
        nodeY:node.y,
        pointerId:event.pointerId,
        moved:false
      };
      log("node drag started",node.id);
    });

    el.addEventListener("pointerenter",()=>{
      if(state.connectionDrag && state.connectionDrag.fromNodeId!==node.id){
        el.classList.add("connect-target");
      }
    });

    el.addEventListener("pointerleave",()=>{
      el.classList.remove("connect-target");
    });

    els.diagram.appendChild(el);
  }
}

function focusLabelProperty(kind,id){
  const targetId=String(id??"");
  if(!targetId){
    errorLog("focusLabelProperty: id missing",kind);
    return false;
  }

  const exists=kind==="node" ? Boolean(getNode(targetId)) : state.edges.some(edge=>edge.id===targetId);
  if(!exists){
    errorLog("focusLabelProperty: target not found",kind,targetId);
    return false;
  }

  state.selectedNode=kind==="node" ? targetId : null;
  state.selectedEdge=kind==="edge" ? targetId : null;

  const propertiesTab=$("propertiesTab");
  const codeTab=$("codeTab");
  if(!propertiesTab || !codeTab){
    errorLog("focusLabelProperty: property tabs not found");
    return false;
  }
  if(!els.propertiesPanel || !els.codePanel){
    errorLog("focusLabelProperty: property panels not found");
    return false;
  }

  propertiesTab.classList.add("active");
  codeTab.classList.remove("active");
  els.propertiesPanel.style.display="";
  els.codePanel.style.display="none";

  // Rebuild the property editor without rebuilding the canvas target. The latter is what
  // previously broke the browser's native double-click sequence.
  renderProperties();

  const selector=kind==="edge" ? "#propEdgeLabel" : "#propNodeLabel";
  const findInput=()=>els.propertiesPanel.querySelector(selector);
  const focusInput=(reason)=>{
    const input=findInput();
    if(!input){
      errorLog("focusLabelProperty: label input not found",kind,targetId,reason);
      return false;
    }

    try{
      input.focus({preventScroll:true});
      if(typeof input.setSelectionRange==="function") input.setSelectionRange(input.value.length,input.value.length);
    }catch(error){
      errorLog("focusLabelProperty: focus failed",kind,targetId,error);
      return false;
    }

    if(document.activeElement!==input){
      warn("focusLabelProperty: activeElement mismatch",kind,targetId,reason);
      return false;
    }

    log("label input focused",kind,targetId,reason);
    return true;
  };

  // Synchronous first attempt: normal browser execution should focus immediately.
  if(focusInput("sync")) return true;

  // Microtask fallback handles DOM replacement that occurs later in the same event turn,
  // while remaining effectively immediate and far earlier than an animation frame.
  queueMicrotask(()=>{
    if(focusInput("microtask")) return;

    // One final frame is only a recovery path for unusual browser/layout timing.
    requestAnimationFrame(()=>{
      if(!focusInput("animation-frame")){
        errorLog("focusLabelProperty: unable to focus label input",kind,targetId);
      }
    });
  });

  return true;
}

function isWithinDoubleClickWindow(previous,current){
  if(!previous || !current) return false;
  const dt=current.time-previous.time;
  const dx=current.clientX-previous.clientX;
  const dy=current.clientY-previous.clientY;
  return dt>=0 && dt<=450 && Math.hypot(dx,dy)<=10;
}

function handleManualDoubleClick(kind,id,event){
  const now={
    time:performance.now(),
    clientX:event.clientX,
    clientY:event.clientY,
    kind,
    id:String(id??"")
  };
  const previous=state.lastClick || null;
  const matched=previous && previous.kind===kind && previous.id===now.id && isWithinDoubleClickWindow(previous,now);
  state.lastClick=now;

  if(!matched) return false;

  event.preventDefault();
  event.stopPropagation();
  window.getSelection?.()?.removeAllRanges?.();
  const focused=focusLabelProperty(kind,now.id);
  state.lastManualDoubleClickTime=now.time;
  log("manual double-click handled",kind,now.id,{focused});
  return true;
}

function pointInsideRect(point,rect,pad=0){
  return point.x>rect.x-pad && point.x<rect.x+rect.width+pad &&
         point.y>rect.y-pad && point.y<rect.y+rect.height+pad;
}

function segmentClear(a,b,obstacles,pad=14){
  for(const node of obstacles){
    const r={x:node.x,y:node.y,width:node.width,height:node.height};
    if(a.x===b.x){
      if(a.x>=r.x-pad && a.x<=r.x+r.width+pad){
        const minY=Math.min(a.y,b.y);
        const maxY=Math.max(a.y,b.y);
        if(maxY>=r.y-pad && minY<=r.y+r.height+pad) return false;
      }
    }else if(a.y===b.y){
      if(a.y>=r.y-pad && a.y<=r.y+r.height+pad){
        const minX=Math.min(a.x,b.x);
        const maxX=Math.max(a.x,b.x);
        if(maxX>=r.x-pad && minX<=r.x+r.width+pad) return false;
      }
    }else{
      return false;
    }
  }
  return true;
}

function getPortPoint(node,side){
  const x=node.x;
  const y=node.y;
  const w=node.width;
  const h=node.height;
  switch(side){
    case "right": return {x:x+w,y:y+h/2};
    case "left": return {x:x,y:y+h/2};
    case "bottom": return {x:x+w/2,y:y+h};
    default: return {x:x+w/2,y:y};
  }
}

function portDirection(side){
  switch(side){
    case "right": return [1,0];
    case "left": return [-1,0];
    case "bottom": return [0,1];
    default: return [0,-1];
  }
}

function routeEdge(a,b,occupiedRoutes=[]){
  if(!a || !b){
    errorLog("routeEdge: missing node");
    return [];
  }

  const obstacles=state.nodes.filter(node=>node.id!==a.id && node.id!==b.id);
  const sides=["top","right","bottom","left"];
  const candidates=[];
  const centerDelta={x:nodeCenter(b).x-nodeCenter(a).x,y:nodeCenter(b).y-nodeCenter(a).y};
  const preferredStart=Math.abs(centerDelta.x)>=Math.abs(centerDelta.y) ? (centerDelta.x>=0?"right":"left") : (centerDelta.y>=0?"bottom":"top");
  const preferredEnd=Math.abs(centerDelta.x)>=Math.abs(centerDelta.y) ? (centerDelta.x>=0?"left":"right") : (centerDelta.y>=0?"top":"bottom");

  // Mermaid-like orthogonal routing strongly prefers the side facing the target.
  // When there is a clear straight corridor, keep it exactly straight.
  const directStart=getPortPoint(a,preferredStart);
  const directEnd=getPortPoint(b,preferredEnd);
  if(
    (directStart.x===directEnd.x || directStart.y===directEnd.y) &&
    segmentClear(directStart,directEnd,obstacles,12)
  ){
    log("edge direct orthogonal route",{from:a.id,to:b.id,fromSide:preferredStart,toSide:preferredEnd});
    return [directStart,directEnd];
  }

  const routeForPorts=(fromSide,toSide)=>{
    const start=getPortPoint(a,fromSide);
    const end=getPortPoint(b,toSide);
    const startDir=portDirection(fromSide);
    const endDir=portDirection(toSide);
    const blockedPoint=point=>obstacles.some(node=>pointInsideRect(point,node,4));

    const findSafeGuide=(port,direction)=>{
      for(let distance=24;distance<=160;distance+=8){
        const candidate={
          x:port.x+direction[0]*distance,
          y:port.y+direction[1]*distance
        };
        if(!blockedPoint(candidate)) return candidate;
      }
      return null;
    };

    const startGuide=findSafeGuide(start,startDir);
    const endGuide=findSafeGuide(end,endDir);
    if(!startGuide || !endGuide) return null;

    const xSet=new Set([start.x,startGuide.x,endGuide.x,end.x]);
    const ySet=new Set([start.y,startGuide.y,endGuide.y,end.y]);
    for(const node of obstacles){
      const pad=8;
      xSet.add(node.x-pad);
      xSet.add(node.x+node.width+pad);
      ySet.add(node.y-pad);
      ySet.add(node.y+node.height+pad);
    }
    for(const node of [a,b]){
      const pad=24;
      xSet.add(node.x-pad);
      xSet.add(node.x+node.width+pad);
      ySet.add(node.y-pad);
      ySet.add(node.y+node.height+pad);
    }

    const xs=[...xSet].filter(Number.isFinite).sort((x,y)=>x-y);
    const ys=[...ySet].filter(Number.isFinite).sort((x,y)=>x-y);
    const points=[];
    const index=new Map();
    const key=(x,y)=>`${x}|${y}`;

    for(const y of ys){
      for(const x of xs){
        const point={x,y};
        if(blockedPoint(point)) continue;
        index.set(key(x,y),points.length);
        points.push(point);
      }
    }

    const ensurePoint=point=>{
      const k=key(point.x,point.y);
      if(index.has(k)) return index.get(k);
      if(blockedPoint(point)) return -1;
      index.set(k,points.length);
      points.push(point);
      return points.length-1;
    };

    const startIndex=ensurePoint(startGuide);
    const endIndex=ensurePoint(endGuide);
    if(startIndex<0 || endIndex<0) return null;

    const directions=[[1,0],[0,1],[-1,0],[0,-1]];
    const initialDirection=directions.findIndex(([dx,dy])=>dx===startDir[0]&&dy===startDir[1]);
    const queue=[];
    const distance=new Map();
    const previous=new Map();
    const push=item=>{
      queue.push(item);
      let i=queue.length-1;
      while(i>0){
        const parent=Math.floor((i-1)/2);
        if(queue[parent].cost<=queue[i].cost) break;
        [queue[parent],queue[i]]=[queue[i],queue[parent]];
        i=parent;
      }
    };
    const pop=()=>{
      if(!queue.length) return null;
      const top=queue[0];
      const tail=queue.pop();
      if(queue.length && tail){
        queue[0]=tail;
        let i=0;
        while(true){
          const left=i*2+1;
          const right=left+1;
          let smallest=i;
          if(left<queue.length && queue[left].cost<queue[smallest].cost) smallest=left;
          if(right<queue.length && queue[right].cost<queue[smallest].cost) smallest=right;
          if(smallest===i) break;
          [queue[i],queue[smallest]]=[queue[smallest],queue[i]];
          i=smallest;
        }
      }
      return top;
    };
    const stateKey=(nodeIndex,direction)=>`${nodeIndex}/${direction}`;
    const initialKey=stateKey(startIndex,initialDirection);
    distance.set(initialKey,0);
    push({nodeIndex:startIndex,direction:initialDirection,cost:0});

    let finalKey=null;
    while(queue.length){
      const current=pop();
      if(!current) break;
      const currentKey=stateKey(current.nodeIndex,current.direction);
      if(current.cost!==(distance.get(currentKey)??Infinity)) continue;
      if(current.nodeIndex===endIndex){
        finalKey=currentKey;
        break;
      }

      const point=points[current.nodeIndex];
      const xIndex=xs.indexOf(point.x);
      const yIndex=ys.indexOf(point.y);
      for(let direction=0;direction<4;direction++){
        const [dx,dy]=directions[direction];
        let nextPointIndex=-1;
        if(dx!==0){
          const nextX=xs[xIndex+dx];
          if(Number.isFinite(nextX)) nextPointIndex=index.get(key(nextX,point.y))??-1;
        }else{
          const nextY=ys[yIndex+dy];
          if(Number.isFinite(nextY)) nextPointIndex=index.get(key(point.x,nextY))??-1;
        }
        if(nextPointIndex<0) continue;
        const nextPoint=points[nextPointIndex];
        if(!segmentClear(point,nextPoint,obstacles,4)) continue;

        const step=Math.abs(nextPoint.x-point.x)+Math.abs(nextPoint.y-point.y);
        const bend=current.direction===direction ? 0 : 160;
        const cost=current.cost+step+bend;
        const nextKey=stateKey(nextPointIndex,direction);
        if(cost<(distance.get(nextKey)??Infinity)){
          distance.set(nextKey,cost);
          previous.set(nextKey,currentKey);
          push({nodeIndex:nextPointIndex,direction,cost});
        }
      }
    }

    if(!finalKey) return null;
    const reversed=[];
    let cursor=finalKey;
    while(cursor){
      const slash=cursor.lastIndexOf("/");
      reversed.push(points[Number(cursor.slice(0,slash))]);
      cursor=previous.get(cursor)||null;
    }
    reversed.reverse();

    const route=[start,startGuide,...reversed.slice(1,-1),endGuide,end];
    const cleaned=simplifyOrthogonalRoute(route);
    if(cleaned.length<2) return null;
    if(cleaned.some((point,i)=>i>0 && !segmentClear(cleaned[i-1],point,obstacles,4))) return null;
    return cleaned;
  };

  for(const fromSide of sides){
    for(const toSide of sides){
      const route=routeForPorts(fromSide,toSide);
      if(!route || route.length<2) continue;
      const length=routeLength(route);
      const bends=Math.max(0,route.length-2);
      const startDir=portDirection(fromSide);
      const endDir=portDirection(toSide);
      const sidePenalty=(fromSide===preferredStart?0:5000)+(toSide===preferredEnd?0:5000);
      candidates.push({route,score:length+bends*120+sidePenalty});
    }
  }

  const segmentConflictScore=(route)=>{
    if(!occupiedRoutes.length || route.length<2) return 0;
    let penalty=0;
    const overlapRange=(a1,a2,b1,b2)=>Math.max(0,Math.min(Math.max(a1,a2),Math.max(b1,b2))-Math.max(Math.min(a1,a2),Math.min(b1,b2)));
    const intersects=(a1,a2,b1,b2)=>{
      const aHorizontal=Math.abs(a1.y-a2.y)<0.01;
      const bHorizontal=Math.abs(b1.y-b2.y)<0.01;
      if(aHorizontal && bHorizontal){
        if(Math.abs(a1.y-b1.y)<1){
          penalty += overlapRange(a1.x,a2.x,b1.x,b2.x)>6 ? 120000 : 0;
        }
        return;
      }
      if(!aHorizontal && !bHorizontal){
        if(Math.abs(a1.x-b1.x)<1){
          penalty += overlapRange(a1.y,a2.y,b1.y,b2.y)>6 ? 120000 : 0;
        }
        return;
      }
      const h=aHorizontal ? [a1,a2] : [b1,b2];
      const v=aHorizontal ? [b1,b2] : [a1,a2];
      if(v[0].x>=Math.min(h[0].x,h[1].x)-1 && v[0].x<=Math.max(h[0].x,h[1].x)+1 &&
         h[0].y>=Math.min(v[0].y,v[1].y)-1 && h[0].y<=Math.max(v[0].y,v[1].y)+1){
        penalty += 18000;
      }
    };
    for(let i=1;i<route.length;i++){
      for(const previousRoute of occupiedRoutes){
        for(let j=1;j<previousRoute.length;j++) intersects(route[i-1],route[i],previousRoute[j-1],previousRoute[j]);
      }
    }
    return penalty;
  };

  for(const candidate of candidates){
    candidate.score += segmentConflictScore(candidate.route);
  }
  candidates.sort((x,y)=>x.score-y.score);
  const best=candidates[0]?.route;
  if(best){
    log("edge route calculated",{from:a.id,to:b.id,points:best.length});
    return best;
  }

  warn("edge route unavailable without crossing an obstacle",a.id,b.id);
  return [];
}

function simplifyOrthogonalRoute(points){
  const result=[];
  for(const point of points){
    const previousPoint=result.at(-1);
    if(previousPoint && previousPoint.x===point.x && previousPoint.y===point.y) continue;
    const before=result.at(-2);
    if(before && previousPoint && before.x===previousPoint.x && previousPoint.x===point.x || before && previousPoint && before.y===previousPoint.y && previousPoint.y===point.y){
      result[result.length-1]=point;
    }else{
      result.push(point);
    }
  }
  return result;
}

function routeLength(points){
  let total=0;
  for(let i=1;i<points.length;i++) total+=Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y);
  return total;
}

function roundedPathD(points,radius=8){
  if(points.length<2) return "";
  if(points.length===2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;

  let d=`M ${points[0].x} ${points[0].y}`;
  for(let i=1;i<points.length-1;i++) {
    const previous=points[i-1];
    const current=points[i];
    const next=points[i+1];
    const inLength=Math.hypot(current.x-previous.x,current.y-previous.y);
    const outLength=Math.hypot(next.x-current.x,next.y-current.y);
    const r=Math.min(radius,inLength/2,outLength/2);
    const inPoint={
      x:current.x+(previous.x-current.x)*(r/(inLength||1)),
      y:current.y+(previous.y-current.y)*(r/(inLength||1))
    };
    const outPoint={
      x:current.x+(next.x-current.x)*(r/(outLength||1)),
      y:current.y+(next.y-current.y)*(r/(outLength||1))
    };
    d+=` L ${inPoint.x} ${inPoint.y} Q ${current.x} ${current.y} ${outPoint.x} ${outPoint.y}`;
  }
  const last=points.at(-1);
  d+=` L ${last.x} ${last.y}`;
  return d;
}

function edgeMarkerForType(type){
  switch(type){
    case "circle": return "url(#mlg-circle)";
    case "cross": return "url(#mlg-cross)";
    case "line": return "";
    default: return "url(#mlg-arrow)";
  }
}

function renderEdges(){
  const svg=els.edgesLayer;
  if(!svg){
    errorLog("edges layer not found");
    return;
  }

  svg.innerHTML="";
  const ns="http://www.w3.org/2000/svg";
  ensureMarkers(svg,ns);

  const routedRoutes=[];

  for(const edge of state.edges){
    const a=getNode(edge.from);
    const b=getNode(edge.to);
    if(!a || !b){
      warn("edge references missing node",edge);
      continue;
    }

    const points=routeEdge(a,b,routedRoutes);
    if(points.length<2){
      warn("edge route unavailable",edge.id);
      continue;
    }
    routedRoutes.push(points);
    const d=roundedPathD(points,8);

    const path=document.createElementNS(ns,"path");
    path.classList.add("edge-line");
    if(state.selectedEdge===edge.id) path.classList.add("selected");
    path.setAttribute("d",d);
    if(edge.type==="dotted") path.setAttribute("stroke-dasharray","6 5");
    if(edge.type==="thick") path.setAttribute("stroke-width","3.4");
    const marker=edgeMarkerForType(edge.type);
    if(marker) path.setAttribute("marker-end",marker);

    const hit=document.createElementNS(ns,"path");
    hit.classList.add("edge-hit");
    hit.dataset.edgeId=edge.id;
    hit.setAttribute("d",d);
    hit.addEventListener("pointerdown",event=>{
      event.preventDefault();
      event.stopPropagation();
      if(handleManualDoubleClick("edge",edge.id,event)) return;
      selectEdge(edge.id,false);
    });

    svg.appendChild(hit);
    svg.appendChild(path);

    if(edge.label){
      renderEdgeLabel(svg,ns,edge.label,points,edge);
      const labelGroup=[...svg.querySelectorAll(".edge-label-group")].find(group=>group.dataset.edgeId===edge.id);
      if(labelGroup){
      }else{
        warn("edge label group not found after render",edge.id);
      }
    }
  }

  renderConnectionPreview();
}

function polylineMidpoint(points){
  const total=routeLength(points);
  if(total<=0) return points[0] || {x:0,y:0};
  let remaining=total/2;
  for(let i=1;i<points.length;i++){
    const a=points[i-1];
    const b=points[i];
    const length=Math.hypot(b.x-a.x,b.y-a.y);
    if(remaining<=length){
      const ratio=remaining/(length||1);
      return {x:a.x+(b.x-a.x)*ratio,y:a.y+(b.y-a.y)*ratio};
    }
    remaining-=length;
  }
  return points.at(-1);
}

function renderEdgeLabel(svg,ns,label,points,edge=null){
  const mid=polylineMidpoint(points);
  const width=Math.max(64,[...String(label)].length*7.5+22);
  const height=24;

  const group=document.createElementNS(ns,"g");
  group.classList.add("edge-label-group");
  group.dataset.edgeId=edge?.id || "";

  const bg=document.createElementNS(ns,"rect");
  bg.classList.add("edge-label-bg");
  bg.setAttribute("x",mid.x-width/2);
  bg.setAttribute("y",mid.y-height/2);
  bg.setAttribute("width",width);
  bg.setAttribute("height",height);

  const text=document.createElementNS(ns,"text");
  text.classList.add("edge-label");
  text.setAttribute("x",mid.x);
  text.setAttribute("y",mid.y+4);
  text.setAttribute("text-anchor","middle");
  text.textContent=label;

  group.append(bg,text);

  svg.appendChild(group);
}

function updateNodeLabelLive(id,value){
  const node=getNode(id);
  if(!node){
    errorLog("updateNodeLabelLive: node not found",id);
    return;
  }

  node.label=String(value??"");
  resizeNodeToLabel(node);

  const el=[...(els.diagram?.querySelectorAll(".node") || [])].find(item=>item?.dataset?.id===node.id) || null;
  if(!el){
    errorLog("updateNodeLabelLive: visual node not found",node.id);
    return;
  }

  el.style.width=node.width+"px";
  el.style.height=node.height+"px";
  const labelEl=el.querySelector(".node-label");
  if(!labelEl){
    errorLog("updateNodeLabelLive: node label element not found",node.id);
    return;
  }
  labelEl.textContent=node.label || node.id;

  // Do not rebuild the node while typing: that would steal focus. Update only the visual
  // label, dimensions, routed edges and derived Mermaid code.
  renderEdges();
  renderSelectionAction();
  renderCode();
  renderMinimap();
  saveLocal();
  log("node label live updated instantly",node.id,node.label);
}

function commitNodeLabel(id,value){
  const node=getNode(id);
  if(!node){
    errorLog("commitNodeLabel: node not found",id);
    return;
  }
  node.label=String(value??"");
  resizeNodeToLabel(node);
  pushHistory();
  renderAll();
  log("node label committed",id,node.label);
}

function updateEdgeLabelLive(id,value){
  const edge=state.edges.find(item=>item.id===id);
  if(!edge){
    errorLog("updateEdgeLabelLive: edge not found",id);
    return;
  }
  edge.label=String(value??"");
  renderEdges();
  renderSelectionAction();
  renderCode();
  saveLocal();
  log("edge label live updated",id);
}

function commitEdgeLabel(id,value){
  const edge=state.edges.find(item=>item.id===id);
  if(!edge){
    errorLog("commitEdgeLabel: edge not found",id);
    return;
  }
  edge.label=String(value??"");
  pushHistory();
  renderAll();
  log("edge label committed",id);
}

function ensureMarkers(svg,ns){
  if(svg.querySelector("#mlg-markers")) return;

  const defs=document.createElementNS(ns,"defs");
  defs.id="mlg-markers";

  const marker=document.createElementNS(ns,"marker");
  marker.id="mlg-arrow";
  marker.setAttribute("viewBox","0 0 10 10");
  marker.setAttribute("refX","9");
  marker.setAttribute("refY","5");
  marker.setAttribute("markerWidth","6");
  marker.setAttribute("markerHeight","6");
  marker.setAttribute("orient","auto-start-reverse");

  const arrow=document.createElementNS(ns,"path");
  arrow.setAttribute("d","M 0 0 L 10 5 L 0 10 z");
  arrow.setAttribute("fill","#66717e");
  marker.appendChild(arrow);

  const circle=document.createElementNS(ns,"marker");
  circle.id="mlg-circle";
  circle.setAttribute("viewBox","0 0 10 10");
  circle.setAttribute("refX","9");
  circle.setAttribute("refY","5");
  circle.setAttribute("markerWidth","6");
  circle.setAttribute("markerHeight","6");
  circle.setAttribute("orient","auto");

  const circleShape=document.createElementNS(ns,"circle");
  circleShape.setAttribute("cx","5");
  circleShape.setAttribute("cy","5");
  circleShape.setAttribute("r","3");
  circleShape.setAttribute("fill","#66717e");
  circle.appendChild(circleShape);

  const cross=document.createElementNS(ns,"marker");
  cross.id="mlg-cross";
  cross.setAttribute("viewBox","0 0 10 10");
  cross.setAttribute("refX","9");
  cross.setAttribute("refY","5");
  cross.setAttribute("markerWidth","6");
  cross.setAttribute("markerHeight","6");
  cross.setAttribute("orient","auto");

  const x=document.createElementNS(ns,"path");
  x.setAttribute("d","M 2 2 L 8 8 M 8 2 L 2 8");
  x.setAttribute("stroke","#66717e");
  x.setAttribute("stroke-width","1.7");
  cross.appendChild(x);

  defs.append(marker,circle,cross);
  svg.prepend(defs);
}

function beginConnectionDrag(event,node,handle){
  if(!node){
    errorLog("beginConnectionDrag: node missing");
    return;
  }
  if(!(handle instanceof Element)){
    errorLog("beginConnectionDrag: handle element missing",node.id);
    return;
  }

  const side=handle.dataset.side;
  if(!["top","right","bottom","left"].includes(side)){
    errorLog("beginConnectionDrag: invalid handle side",side,node.id);
    return;
  }

  // The source point is the mathematical center of the selected connection handle.
  // Do not derive it from transformed DOM coordinates: zoom/re-render timing can otherwise
  // shift the preview to a corner even though the drag started on a handle.
  const start=getPortPoint(node,side);

  state.connectionDrag={
    fromNodeId:node.id,
    side,
    start,
    current:start
  };
  state.lastClick=null;

  state.drag=null;
  state.pan=null;

  renderNodes();
  renderEdges();

  document.addEventListener("pointermove",handleConnectionPointerMove);
  document.addEventListener("pointerup",handleConnectionPointerUp,{once:true});

  log("connection drag started",node.id,side);
}

function handleConnectionPointerMove(event){
  if(!state.connectionDrag) return;

  const point=canvasPoint(event);
  state.connectionDrag.current=point;
  renderConnectionPreview();

  const under=document.elementFromPoint(event.clientX,event.clientY);
  const target=under?.closest?.(".node");
  els.diagram.querySelectorAll(".node.connect-target").forEach(node=>node.classList.remove("connect-target"));

  if(target){
    const targetId=target.dataset.id;
    if(targetId && targetId!==state.connectionDrag.fromNodeId){
      target.classList.add("connect-target");
    }
  }
}

function handleConnectionPointerUp(event){
  document.removeEventListener("pointermove",handleConnectionPointerMove);

  if(!state.connectionDrag){
    renderConnectionPreview();
    return;
  }

  const under=document.elementFromPoint(event.clientX,event.clientY);
  const target=under?.closest?.(".node");
  const targetId=target?.dataset?.id;

  if(targetId && targetId!==state.connectionDrag.fromNodeId){
    addEdge(state.connectionDrag.fromNodeId,targetId);
    }else{
      log("connection drag canceled");
  }

  state.connectionDrag=null;
  renderNodes();
  renderEdges();
}

function finishConnectionOnNode(nodeId){
  if(!state.connectionDrag) return;
  if(nodeId===state.connectionDrag.fromNodeId) return;

  if(addEdge(state.connectionDrag.fromNodeId,nodeId)){
    }
  state.connectionDrag=null;
  renderNodes();
  renderEdges();
}

function renderConnectionPreview(){
  const svg=els.edgesLayer;
  if(!svg) return;

  svg.querySelectorAll(".connection-preview,.connection-preview-dot").forEach(node=>node.remove());

  const drag=state.connectionDrag;
  if(!drag?.current) return;

  const ns="http://www.w3.org/2000/svg";
  const start=drag.start;
  const end=drag.current;

  const preview=document.createElementNS(ns,"path");
  preview.classList.add("connection-preview");
  preview.setAttribute("d",`M ${start.x} ${start.y} L ${end.x} ${end.y}`);

  const dot=document.createElementNS(ns,"circle");
  dot.classList.add("connection-preview-dot");
  dot.setAttribute("cx",end.x);
  dot.setAttribute("cy",end.y);
  dot.setAttribute("r","4");

  svg.appendChild(preview);
  svg.appendChild(dot);
}

function renderSelectionAction(){
  const action=els.selectionAction;
  if(!action){
    errorLog("selection action not found");
    return;
  }

  const selection=getSelectionAnchor();
  if(!selection){
    action.style.display="none";
    return;
  }

  action.style.display="flex";
  action.style.left=selection.x+"px";
  action.style.top=selection.y+"px";
}

function getSelectionAnchor(){
  if(state.selectedNode){
    const node=getNode(state.selectedNode);
    if(!node) return null;
    return {
      x:node.x+node.width/2,
      y:node.y-8
    };
  }

  if(state.selectedEdge){
    const edge=state.edges.find(item=>item.id===state.selectedEdge);
    if(!edge) return null;

    const a=getNode(edge.from);
    const b=getNode(edge.to);
    if(!a || !b) return null;

    const ca=nodeCenter(a);
    const cb=nodeCenter(b);
    const p1=connectionPoint(a,cb);
    const p2=connectionPoint(b,ca);

    return {
      x:(p1.x+p2.x)/2,
      y:(p1.y+p2.y)/2-10
    };
  }

  return null;
}

function directionOptionsHtml(){
  const directions=[
    ["TD","上 → 下"],
    ["BT","下 → 上"],
    ["LR","左 → 右"],
    ["RL","右 → 左"]
  ];
  return directions.map(([value,label])=>
    `<option value="${value}" ${state.direction===value?"selected":""}>${label}</option>`
  ).join("");
}

function renderProperties(){
  if(state.selectedNode){
    const n=getNode(state.selectedNode);

    if(!n){
      state.selectedNode=null;
      renderProperties();
      return;
    }

    els.properties.innerHTML=`
      <div class="panel-section">
        <div class="section-title">Node</div>
        <div class="field">
          <label>ID</label>
          <input id="propNodeId" value="${htmlAttr(n.id)}">
        </div>
        <div class="field">
          <label>ラベル</label>
          <textarea id="propNodeLabel">${htmlText(n.label)}</textarea>
        </div>
        <div class="field">
          <label>形状</label>
          <select id="propNodeShape">
            ${NODE_SHAPES.map(([v,l])=>
              `<option value="${v}" ${n.shape===v?"selected":""}>${l}</option>`
            ).join("")}
          </select>
        </div>
        <div class="hint">位置はキャンバス上でドラッグできます。サイズは内容に合わせて自動調整します。</div>
      </div>
      <div class="panel-section">
        <div class="section-title">Flowchart</div>
        <div class="field">
          <label>方向</label>
          <select id="direction">
            ${directionOptionsHtml()}
          </select>
        </div>
      </div>
    `;

    bindNodeProperties();
    return;
  }

  if(state.selectedEdge){
    const e=state.edges.find(x=>x.id===state.selectedEdge);

    if(!e){
      state.selectedEdge=null;
      renderProperties();
      return;
    }

    els.properties.innerHTML=`
      <div class="panel-section">
        <div class="section-title">Edge</div>
        <div class="field">
          <label>開始ノード</label>
          <select id="propEdgeFrom">
            ${state.nodes.map(n=>
              `<option value="${htmlAttr(n.id)}" ${n.id===e.from?"selected":""}>${htmlText(n.id)}</option>`
            ).join("")}
          </select>
        </div>
        <div class="field">
          <label>終了ノード</label>
          <select id="propEdgeTo">
            ${state.nodes.map(n=>
              `<option value="${htmlAttr(n.id)}" ${n.id===e.to?"selected":""}>${htmlText(n.id)}</option>`
            ).join("")}
          </select>
        </div>
        <div class="field">
          <label>種類</label>
          <select id="propEdgeType">
            ${EDGE_TYPES.map(([v,l])=>
              `<option value="${v}" ${e.type===v?"selected":""}>${l}</option>`
            ).join("")}
          </select>
        </div>
        <div class="field">
          <label>ラベル</label>
          <input id="propEdgeLabel" value="${htmlAttr(e.label||"")}">
        </div>
        <div class="hint">ラベル付き矢印はMermaidの正規構文 <code>--&gt;|ラベル|</code> で生成します。</div>
      </div>
      <div class="panel-section">
        <div class="section-title">Flowchart</div>
        <div class="field">
          <label>方向</label>
          <select id="direction">
            ${directionOptionsHtml()}
          </select>
        </div>
      </div>
    `;

    bindEdgeProperties();
    return;
  }

  els.properties.innerHTML=`
    <div class="panel-section">
      <div class="section-title">Flowchart</div>
      <div class="field">
        <label>方向</label>
        <select id="direction">
          ${directionOptionsHtml()}
        </select>
      </div>
      <div class="hint">ノードの上下左右にある接続ポイントからドラッグすると、線をプレビューしながら接続できます。</div>
    </div>
    <div class="empty">
      ノードまたは接続を選択すると<br>
      プロパティを編集できます。
    </div>
  `;

  const direction=$("direction");
  if(!direction){
    warn("direction selector not found in empty properties");
    return;
  }

  direction.addEventListener("change",event=>{
    const value=event.target.value;
    if(!["TB","TD","BT","RL","LR"].includes(value)){
      warn("invalid direction",value);
      return;
    }
    state.direction=value;
    pushHistory();
    renderAll();
    log("direction changed",value);
  });
}

function bindNodeProperties(){
  const id=$("propNodeId");
  const label=$("propNodeLabel");
  const shape=$("propNodeShape");
  const direction=$("direction");

  if(!id || !label || !shape || !direction){
    errorLog("node property controls missing");
    return;
  }

  id.addEventListener("change",event=>{
    updateNode(state.selectedNode,"id",event.target.value);
  });
  label.addEventListener("input",event=>{
    updateNodeLabelLive(state.selectedNode,event.target.value);
  });
  label.addEventListener("change",event=>{
    commitNodeLabel(state.selectedNode,event.target.value);
  });
  shape.addEventListener("change",event=>{
    updateNode(state.selectedNode,"shape",event.target.value);
  });
  direction.addEventListener("change",event=>{
    const value=event.target.value;
    if(!["TB","TD","BT","RL","LR"].includes(value)){
      warn("invalid direction",value);
      return;
    }
    state.direction=value;
    pushHistory();
    renderAll();
    log("direction changed",value);
  });
}

function bindEdgeProperties(){
  const from=$("propEdgeFrom");
  const to=$("propEdgeTo");
  const type=$("propEdgeType");
  const label=$("propEdgeLabel");
  const direction=$("direction");

  if(!from || !to || !type || !label || !direction){
    errorLog("edge property controls missing");
    return;
  }

  from.addEventListener("change",event=>{
    updateEdge(state.selectedEdge,"from",event.target.value);
  });
  to.addEventListener("change",event=>{
    updateEdge(state.selectedEdge,"to",event.target.value);
  });
  type.addEventListener("change",event=>{
    updateEdge(state.selectedEdge,"type",event.target.value);
  });
  label.addEventListener("input",event=>{
    updateEdgeLabelLive(state.selectedEdge,event.target.value);
  });
  label.addEventListener("change",event=>{
    commitEdgeLabel(state.selectedEdge,event.target.value);
  });
  direction.addEventListener("change",event=>{
    const value=event.target.value;
    if(!["TB","TD","BT","RL","LR"].includes(value)){
      warn("invalid direction",value);
      return;
    }
    state.direction=value;
    pushHistory();
    renderAll();
    log("direction changed",value);
  });
}

function renderCode(){
  state.code=graphToMermaid();
  if(els.codeEditor){
    els.codeEditor.value=state.code;
  }else{
    errorLog("code editor not found");
  }
}

function renderMinimap(){
  const svg=els.minimap?.querySelector("svg");

  if(!svg){
    errorLog("minimap svg not found");
    return;
  }

  svg.innerHTML="";
  if(!state.nodes.length) return;

  const ns="http://www.w3.org/2000/svg";

  const xs=state.nodes.flatMap(n=>[n.x,n.x+n.width]);
  const ys=state.nodes.flatMap(n=>[n.y,n.y+n.height]);

  const minX=Math.min(...xs)-30;
  const minY=Math.min(...ys)-30;
  const maxX=Math.max(...xs)+30;
  const maxY=Math.max(...ys)+30;

  const w=Math.max(1,maxX-minX);
  const h=Math.max(1,maxY-minY);
  const scale=Math.min(150/w,95/h);
  const ox=(160-w*scale)/2-minX*scale;
  const oy=(105-h*scale)/2-minY*scale;

  for(const e of state.edges){
    const a=getNode(e.from);
    const b=getNode(e.to);
    if(!a||!b) continue;

    const line=document.createElementNS(ns,"line");
    line.classList.add("minimap-edge");
    line.setAttribute("x1",nodeCenter(a).x*scale+ox);
    line.setAttribute("y1",nodeCenter(a).y*scale+oy);
    line.setAttribute("x2",nodeCenter(b).x*scale+ox);
    line.setAttribute("y2",nodeCenter(b).y*scale+oy);
    svg.appendChild(line);
  }

  for(const n of state.nodes){
    const r=document.createElementNS(ns,"rect");
    r.classList.add("minimap-node");
    r.setAttribute("x",n.x*scale+ox);
    r.setAttribute("y",n.y*scale+oy);
    r.setAttribute("width",Math.max(3,n.width*scale));
    r.setAttribute("height",Math.max(3,n.height*scale));
    svg.appendChild(r);
  }
}

function applyTransform(){
  if(!els.diagram || !els.zoomValue){
    errorLog("transform UI elements not found");
    return;
  }

  els.diagram.style.transform=
    `translate(${state.offsetX}px,${state.offsetY}px) scale(${state.zoom})`;

  els.zoomValue.textContent=Math.round(state.zoom*100)+"%";
  renderSelectionAction();
}

function canvasPoint(event){
  if(!els.canvas){
    errorLog("canvas element not found");
    return {x:0,y:0};
  }

  const r=els.canvas.getBoundingClientRect();
  return {
    x:(event.clientX-r.left-state.offsetX)/state.zoom,
    y:(event.clientY-r.top-state.offsetY)/state.zoom
  };
}

function zoomAt(factor,cx,cy){
  const before=canvasPoint({clientX:cx,clientY:cy});
  state.zoom=Math.max(.2,Math.min(3,state.zoom*factor));

  const r=els.canvas.getBoundingClientRect();
  state.offsetX=cx-r.left-before.x*state.zoom;
  state.offsetY=cy-r.top-before.y*state.zoom;

  applyTransform();
  log("zoom changed",state.zoom);
}

function resetView(){
  state.zoom=1;
  state.offsetX=300;
  state.offsetY=180;
  applyTransform();
  log("view reset");
}

function fitView(){
  if(!state.nodes.length){
    resetView();
    toast("表示できるノードがありません");
    return;
  }

  const xs=state.nodes.flatMap(n=>[n.x,n.x+n.width]);
  const ys=state.nodes.flatMap(n=>[n.y,n.y+n.height]);

  const minX=Math.min(...xs);
  const minY=Math.min(...ys);
  const maxX=Math.max(...xs);
  const maxY=Math.max(...ys);

  const w=Math.max(1,maxX-minX+120);
  const h=Math.max(1,maxY-minY+120);

  const cw=els.canvas.clientWidth;
  const ch=els.canvas.clientHeight;

  state.zoom=Math.max(.2,Math.min(2,Math.min(cw/w,ch/h)));
  state.offsetX=(cw-(maxX+minX)*state.zoom)/2;
  state.offsetY=(ch-(maxY+minY)*state.zoom)/2;

  applyTransform();
  log("view fitted");
}

function focusNode(id){
  const n=getNode(id);
  if(!n){
    errorLog("focusNode: node not found",id);
    return;
  }

  const cw=els.canvas.clientWidth;
  const ch=els.canvas.clientHeight;

  state.offsetX=cw/2-(n.x+n.width/2)*state.zoom;
  state.offsetY=ch/2-(n.y+n.height/2)*state.zoom;
  applyTransform();
  log("focused node",id);
}

function resolveDroppedNode(node){
  if(!node) return;
  const others=state.nodes.filter(item=>item.id!==node.id);

  for(let i=0;i<40;i++){
    const conflict=others.find(other=>rectsOverlap(node,other,12));
    if(!conflict) break;

    const dx=(node.x+node.width/2)-(conflict.x+conflict.width/2);
    const dy=(node.y+node.height/2)-(conflict.y+conflict.height/2);

    if(Math.abs(dx)>=Math.abs(dy)){
      node.x=conflict.x+(dx>=0 ? conflict.width+18 : -node.width-18);
    }else{
      node.y=conflict.y+(dy>=0 ? conflict.height+18 : -node.height-18);
    }
  }

  log("dropped node overlap resolved",node.id);
}

function renderAll(){
  renderNodes();
  renderEdges();
  renderSelectionAction();
  renderProperties();
  renderCode();
  renderMinimap();
  applyTransform();
  updateHistoryButtons();

  setStatus(`${state.nodes.length} ノード / ${state.edges.length} 接続`);
  saveLocal();
  log("renderAll complete");
}

function showPreviewError(error){
  if(!els.previewContainer){
    errorLog("preview container not found");
    return;
  }

  els.previewContainer.innerHTML=
    `<div class="error">${htmlText(error?.message || String(error))}</div>`;
  els.previewOverlay?.classList.add("open");
}

async function showPreview(){
  const source=graphToMermaid();
  try{
    setStatus("Mermaidをレンダリング中...");
    await mermaid.parse(source,{suppressErrors:false});
    const id=`mermaidPreview${++state.previewId}`;
    const result=await mermaid.render(id,source);
    if(!result?.svg) throw new Error("MermaidのSVG生成結果が空です");

    const wrapper=document.createElement("div");
    if(!wrapper){
      throw new Error("SVGプレビュー用要素の生成に失敗しました");
    }
    wrapper.innerHTML=result.svg;
    const svg=wrapper.querySelector("svg");
    if(!svg){
      throw new Error("Mermaid SVG要素が見つかりません");
    }

    applySvgVisualStyle(svg,false);
    els.previewContainer.innerHTML="";
    els.previewContainer.appendChild(svg);
    els.previewOverlay.classList.add("open");
    setStatus(`${state.nodes.length} ノード / ${state.edges.length} 接続`);
    log("Mermaid rendered successfully with native routing");
  }catch(error){
    errorLog("Render error:",error);
    showPreviewError(error);
  }
}

function applySvgVisualStyle(svg,includeWatermark){
  if(!svg){
    errorLog("applySvgVisualStyle: svg missing");
    return;
  }

  svg.setAttribute("role","img");
  svg.setAttribute("aria-label","Nidele 簡単フローチャート");

  const style=document.createElementNS("http://www.w3.org/2000/svg","style");
  style.textContent=`
    .node rect,.node polygon,.node path,.node circle { fill:#fff !important; stroke:#646d79 !important; stroke-width:1.7px !important; }
    .node .label, .node text { fill:#20242a !important; }
    .edgePath path, .flowchart-link { stroke:#687482 !important; stroke-width:2.2px !important; }
    .edgeLabel rect { fill:#fff !important; stroke:#d5dbe2 !important; }
    .edgeLabel text, .edgeLabel tspan { fill:#303740 !important; }
  `;
  svg.insertBefore(style,svg.firstChild);

  const nodeGroups=svg.querySelectorAll("g.node");
  nodeGroups.forEach(group=>{
    const rect=group.querySelector("rect");
    if(rect){
      const shape=group.classList.contains("rounded") || group.classList.contains("stadium");
      if(!shape){
        rect.setAttribute("rx","0");
        rect.setAttribute("ry","0");
      }
    }
  });

  // Mermaid already produces the correct diamond geometry.
  // Do not rewrite its polygon points: changing them can distort the native aspect ratio.
  log("SVG native diamond geometry preserved");

  if(includeWatermark){
    const ns="http://www.w3.org/2000/svg";
    const viewBox=(svg.getAttribute("viewBox")||"0 0 800 600").split(/\s+/).map(Number);
    const [vx,vy,vw,vh]=viewBox.length===4 && viewBox.every(Number.isFinite) ? viewBox : [0,0,800,600];
    const watermark=document.createElementNS(ns,"text");
    watermark.setAttribute("x",String(vx+vw-12));
    watermark.setAttribute("y",String(vy+vh-12));
    watermark.setAttribute("text-anchor","end");
    watermark.setAttribute("font-family",'Inter,"Noto Sans JP",system-ui,sans-serif');
    watermark.setAttribute("font-size","12");
    watermark.setAttribute("fill","#7f8995");
    watermark.setAttribute("opacity","0.72");
    watermark.textContent="Nidele 簡単フローチャート";
    svg.appendChild(watermark);
    log("SVG watermark added");
  }
}

function exportSvg(){
  try{
    const source=graphToMermaid();
    const renderId=`mermaidExport${++state.previewId}`;
    setStatus("SVGを書き出し中...");
    mermaid.parse(source,{suppressErrors:false}).then(async()=>{
      const result=await mermaid.render(renderId,source);
      if(!result?.svg) throw new Error("MermaidのSVG生成結果が空です");
      const wrapper=document.createElement("div");
      wrapper.innerHTML=result.svg;
      const svg=wrapper.querySelector("svg");
      if(!svg) throw new Error("Mermaid SVG要素が見つかりません");
      applySvgVisualStyle(svg,true);

      const serialized=new XMLSerializer().serializeToString(svg);
      const blob=new Blob([serialized],{type:"image/svg+xml;charset=utf-8"});
      const url=URL.createObjectURL(blob);
      const a=document.createElement("a");
      if(!a){
        URL.revokeObjectURL(url);
        throw new Error("SVGダウンロード要素の生成に失敗しました");
      }
      a.href=url;
      a.download="nidele-flowchart.svg";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
      setStatus(`${state.nodes.length} ノード / ${state.edges.length} 接続`);
      toast("SVGを書き出しました");
      log("SVG exported with Mermaid native routing and watermark");
    }).catch(error=>{
      errorLog("SVG export render error:",error);
      toast("SVGを書き出せませんでした");
      setStatus("SVG出力エラー",true);
    });
  }catch(error){
    errorLog("SVG export error:",error);
    toast("SVGを書き出せませんでした");
    setStatus("SVG出力エラー",true);
  }
}

async function applyCode(){
  if(!els.codeEditor){
    errorLog("applyCode: code editor not found");
    return;
  }

  const source=els.codeEditor.value.trim();

  if(!source){
    toast("コードが空です");
    warn("empty Mermaid source");
    return;
  }

  try{
    setStatus("Mermaidを解析中...");

    const parsed=await parseMermaidSource(source);

    state.direction=parsed.direction;
    state.nodes=parsed.nodes;
    state.edges=parsed.edges;
    state.extra=parsed.extra;

    state.selectedNode=null;
    state.selectedEdge=null;
    state.connectionDrag=null;

    pushHistory();
    renderAll();

    toast("コードを反映しました（重なりを回避）");
    log("Mermaid parsed successfully",{
      nodes:state.nodes.length,
      edges:state.edges.length,
      direction:state.direction
    });
  }catch(error){
    errorLog("Mermaid parse error:",error);
    setStatus("Mermaid構文エラー",true);
    toast("Mermaid構文エラー");
    showPreviewError(error);
  }
}

function saveLocal(){
  try{
    localStorage.setItem(STORAGE_KEY,JSON.stringify({
      direction:state.direction,
      nodes:state.nodes,
      edges:state.edges,
      extra:state.extra,
      offsetX:state.offsetX,
      offsetY:state.offsetY,
      zoom:state.zoom,
      code:state.code || graphToMermaid()
    }));
    log("local save complete");
  }catch(error){
    errorLog("localStorage save failed:",error);
    setStatus("保存エラー",true);
  }
}

function loadLocal(){
  try{
    const raw=localStorage.getItem(STORAGE_KEY);
    if(!raw){
      log("no saved project");
      return false;
    }

    const data=JSON.parse(raw);

    state.direction=["TB","TD","BT","RL","LR"].includes(data.direction) ? data.direction : "TD";
    state.nodes=Array.isArray(data.nodes) ? data.nodes : [];
    state.edges=Array.isArray(data.edges) ? data.edges : [];
    state.extra=Array.isArray(data.extra) ? data.extra : [];
    state.offsetX=Number.isFinite(data.offsetX)?data.offsetX:300;
    state.offsetY=Number.isFinite(data.offsetY)?data.offsetY:180;
    state.zoom=Number.isFinite(data.zoom)?data.zoom:1;
    state.code=data.code || "";

    for(const node of state.nodes){
      node.shape=NODE_SHAPES.some(([v])=>v===node.shape) ? node.shape : "rect";
      const size=normalizeNodeSize(node,estimateNodeSize(node.label || node.id));
      node.width=node.shape==="diamond" ? size.width : (Number.isFinite(node.width) ? node.width : size.width);
      node.height=node.shape==="diamond" ? size.height : (Number.isFinite(node.height) ? node.height : size.height);
      node.x=Number.isFinite(node.x) ? node.x : 0;
      node.y=Number.isFinite(node.y) ? node.y : 0;
    }

    log("saved project restored");
    return true;
  }catch(error){
    errorLog("localStorage restore failed:",error);
    return false;
  }
}

function clearSelection(){
  state.selectedNode=null;
  state.selectedEdge=null;
  renderNodes();
  renderEdges();
  renderSelectionAction();
  renderProperties();
  log("selection cleared");
}

function copySelection(){
  if(state.selectedNode){
    const node=getNode(state.selectedNode);
    if(!node){
      errorLog("copySelection: node not found");
      return;
    }

    state.clipboard={
      type:"node",
      data:JSON.parse(JSON.stringify(node))
    };
    writeClipboardText(shapeToSyntax(node));
    toast("ノードをコピーしました");
    log("node copied",node.id);
    return;
  }

  if(state.selectedEdge){
    const edge=state.edges.find(item=>item.id===state.selectedEdge);
    if(!edge){
      errorLog("copySelection: edge not found");
      return;
    }

    state.clipboard={
      type:"edge",
      data:JSON.parse(JSON.stringify(edge))
    };
    writeClipboardText(edgeSyntax(edge));
    toast("接続をコピーしました");
    log("edge copied",edge.id);
    return;
  }

  toast("コピーする要素を選択してください");
}

async function writeClipboardText(text){
  if(!navigator.clipboard?.writeText){
    warn("navigator.clipboard.writeText unavailable");
    return;
  }

  try{
    await navigator.clipboard.writeText(text);
    log("clipboard text written");
  }catch(error){
    warn("clipboard text write failed:",error);
  }
}

function pasteSelection(){
  const clip=state.clipboard;
  if(!clip){
    toast("コピーした要素がありません");
    log("paste unavailable");
    return;
  }

  if(clip.type==="node"){
    const source=clip.data;
    if(!source){
      errorLog("invalid node clipboard data");
      return;
    }

    const node=JSON.parse(JSON.stringify(source));
    node.id=uniqueNodeId(source.id || "N");
    node.x=(Number.isFinite(source.x)?source.x:0)+40;
    node.y=(Number.isFinite(source.y)?source.y:0)+40;

    resolveDroppedNode(node);

    state.nodes.push(node);
    state.selectedNode=node.id;
    state.selectedEdge=null;
    pushHistory();
    renderAll();
    log("node pasted",node.id);
    return;
  }

  if(clip.type==="edge"){
    const source=clip.data;
    if(!source || !getNode(source.from) || !getNode(source.to)){
      toast("接続先のノードがありません");
      warn("edge paste skipped because endpoints are missing");
      return;
    }

    const edge={
      id:uid("E"),
      from:source.from,
      to:source.to,
      type:source.type,
      label:source.label || ""
    };

    state.edges.push(edge);
    state.selectedEdge=edge.id;
    state.selectedNode=null;
    pushHistory();
    renderAll();
    toast("接続を貼り付けました");
    log("edge pasted",edge.id);
  }
}

function cutSelection(){
  if(!state.selectedNode && !state.selectedEdge){
    toast("切り取る要素を選択してください");
    return;
  }

  copySelection();
  removeSelected();
  toast("切り取りました");
  log("selection cut");
}

function handleGlobalPointerDown(event){
  if(event.button!==0) return;

  if(state.connectionDrag){
    event.preventDefault();
    return;
  }

  if(event.target===els.canvas || event.target.classList.contains("canvas-grid")){
    clearSelection();

    state.pan={
      x:event.clientX,
      y:event.clientY,
      ox:state.offsetX,
      oy:state.offsetY
    };

    els.canvas.classList.add("dragging");

    try{
      els.canvas.setPointerCapture(event.pointerId);
    }catch(error){
      warn("canvas pointer capture unavailable",error);
    }
  }
}

els.canvas.addEventListener("pointerdown",handleGlobalPointerDown);

function handleCanvasDoubleClick(event){
  const target=event.target;
  const now=performance.now();
  if(state.lastManualDoubleClickTime && now-state.lastManualDoubleClickTime<250){
    log("native dblclick fallback skipped after manual double-click");
    return;
  }
  if(!(target instanceof Element)){
    errorLog("dblclick target is not an Element");
    return;
  }

  const nodeElement=target.closest(".node");
  const nodeId=nodeElement?.dataset?.id || null;
  if(nodeId){
    event.preventDefault();
    event.stopPropagation();
    if(!getNode(nodeId)){
      errorLog("double-click node not found",nodeId);
      return;
    }
    const focused=focusLabelProperty("node",nodeId);
    log("node double-click handled",nodeId,{focused});
    return;
  }

  const labelGroup=target.closest(".edge-label-group");
  const edgeHit=target.closest(".edge-hit");
  const edgeId=labelGroup?.dataset?.edgeId || edgeHit?.dataset?.edgeId || null;
  if(edgeId){
    event.preventDefault();
    event.stopPropagation();
    if(!state.edges.some(item=>item.id===edgeId)){
      errorLog("double-click edge not found",edgeId);
      return;
    }
    const focused=focusLabelProperty("edge",edgeId);
    log("edge double-click handled",edgeId,{focused});
  }
}

// Capture phase ensures the editor handles double-click before any child SVG/DOM handler
// can consume it or the node is replaced by a render pass.
els.canvas.addEventListener("dblclick",handleCanvasDoubleClick,true);

els.canvas.addEventListener("pointermove",event=>{
  if(state.connectionDrag){
    handleConnectionPointerMove(event);
    return;
  }

  if(state.drag){
    const p=canvasPoint(event);
    const d=state.drag;

    d.node.x=d.nodeX+(p.x-d.startX);
    d.node.y=d.nodeY+(p.y-d.startY);

    if(
      Math.abs(d.node.x-d.nodeX)>2 ||
      Math.abs(d.node.y-d.nodeY)>2
    ){
      d.moved=true;
      state.lastClick=null;
      log("node drag movement detected",d.node.id);
    }

    renderNodes();
    renderEdges();
    renderSelectionAction();
    renderMinimap();
    return;
  }

  if(state.pan){
    state.offsetX=state.pan.ox+(event.clientX-state.pan.x);
    state.offsetY=state.pan.oy+(event.clientY-state.pan.y);
    applyTransform();
  }
});

els.canvas.addEventListener("pointerup",()=>{
  if(state.drag){
    if(state.drag.moved){
      resolveDroppedNode(state.drag.node);
      pushHistory();
      renderAll();
    }
    state.drag=null;
  }

  state.pan=null;
  els.canvas.classList.remove("dragging");
});

els.canvas.addEventListener("wheel",event=>{
  event.preventDefault();
  zoomAt(event.deltaY<0 ? 1.1 : .9,event.clientX,event.clientY);
},{passive:false});

els.addNodeBtn?.addEventListener("click",()=>{
  createNode();
});

els.selectionAction?.addEventListener("click",event=>{
  event.preventDefault();
  event.stopPropagation();
  removeSelected();
});

els.undoBtn?.addEventListener("click",undo);
els.redoBtn?.addEventListener("click",redo);

els.zoomIn?.addEventListener("click",()=>{
  const r=els.canvas.getBoundingClientRect();
  zoomAt(1.15,r.left+r.width/2,r.top+r.height/2);
});

els.zoomOut?.addEventListener("click",()=>{
  const r=els.canvas.getBoundingClientRect();
  zoomAt(.87,r.left+r.width/2,r.top+r.height/2);
});

els.fitBtn?.addEventListener("click",fitView);
els.resetViewBtn?.addEventListener("click",resetView);

els.saveBtn?.addEventListener("click",()=>{
  saveLocal();
  toast("保存しました");
  log("manual save complete");
});

els.previewBtn?.addEventListener("click",()=>void showPreview());

els.closePreview?.addEventListener("click",()=>{
  els.previewOverlay?.classList.remove("open");
  log("preview closed");
});

els.exportBtn?.addEventListener("click",()=>void exportSvg());

els.applyCode?.addEventListener("click",()=>void applyCode());

els.copyCode?.addEventListener("click",async()=>{
  if(!els.codeEditor){
    errorLog("copyCode: code editor not found");
    return;
  }

  if(!navigator.clipboard?.writeText){
    toast("クリップボードが利用できません");
    warn("navigator.clipboard.writeText unavailable");
    return;
  }

  try{
    await navigator.clipboard.writeText(els.codeEditor.value);
    toast("コピーしました");
    log("Mermaid code copied");
  }catch(error){
    errorLog("Code clipboard error:",error);
    toast("コピーできませんでした");
  }
});

els.propertiesTab?.addEventListener("click",()=>{
  const propertiesTab=$("propertiesTab");
  const codeTab=$("codeTab");

  if(!propertiesTab || !codeTab){
    errorLog("properties/code tabs not found");
    return;
  }

  propertiesTab.classList.add("active");
  codeTab.classList.remove("active");
  els.propertiesPanel.style.display="";
  els.codePanel.style.display="none";
  log("properties tab opened");
});

els.codeTab?.addEventListener("click",()=>{
  const propertiesTab=$("propertiesTab");
  const codeTab=$("codeTab");

  if(!propertiesTab || !codeTab){
    errorLog("properties/code tabs not found");
    return;
  }

  codeTab.classList.add("active");
  propertiesTab.classList.remove("active");
  els.propertiesPanel.style.display="none";
  els.codePanel.style.display="";
  els.codeEditor.value=graphToMermaid();
  log("Mermaid tab opened");
});

document.addEventListener("keydown",event=>{
  const target=event.target;
  const editing=
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement;

  const mod=event.ctrlKey || event.metaKey;
  const key=event.key.toLowerCase();

  if(mod && key==="z" && !editing){
    event.preventDefault();
    if(event.shiftKey) redo();
    else undo();
    return;
  }

  if(mod && key==="y" && !editing){
    event.preventDefault();
    redo();
    return;
  }

  if(mod && key==="c" && !editing){
    event.preventDefault();
    copySelection();
    return;
  }

  if(mod && key==="x" && !editing){
    event.preventDefault();
    cutSelection();
    return;
  }

  if(mod && key==="v" && !editing){
    event.preventDefault();
    pasteSelection();
    return;
  }

  if(
    (event.key==="Delete" || event.key==="Backspace") &&
    !editing
  ){
    event.preventDefault();
    removeSelected();
    return;
  }

  if(event.key==="Escape"){
    if(state.connectionDrag){
      state.connectionDrag=null;
      document.removeEventListener("pointermove",handleConnectionPointerMove);
      renderNodes();
      renderEdges();
          log("connection drag escaped");
    }else if(els.previewOverlay?.classList.contains("open")){
      els.previewOverlay.classList.remove("open");
    }else{
      clearSelection();
    }
  }
});

window.addEventListener("beforeunload",saveLocal);

async function boot(){
  try{
    const requiredElements=[
      ["canvas",els.canvas],
      ["diagram",els.diagram],
      ["edgesLayer",els.edgesLayer],
      ["propertiesPanel",els.propertiesPanel],
      ["codePanel",els.codePanel],
      ["codeEditor",els.codeEditor],
      ["status",els.status],
      ["toast",els.toast],
      ["minimap",els.minimap],
      ["zoomValue",els.zoomValue],
      ["previewOverlay",els.previewOverlay],
      ["previewContainer",els.previewContainer]
    ];

    const missing=requiredElements.filter(([,element])=>!element).map(([name])=>name);
    if(missing.length){
      throw new Error(`必要なDOM要素がありません: ${missing.join(", ")}`);
    }

    setStatus("Mermaidを初期化中...");
    await mermaid.parse("flowchart TD\nA[Start] -->|Yes| B(B)");

    const restored=loadLocal();
    const mermaidSource=`flowchart TD\nStart[ノードをクリック] --> Process[上下左右の点をドラッグ] --> End[接続可能]`;

    if(!restored){
      try{
        const parsed=await parseMermaidSource(mermaidSource);
        state.direction=parsed.direction;
        state.nodes=parsed.nodes;
        state.edges=parsed.edges;
        state.extra=parsed.extra;
      }catch(error){
        errorLog("Initial Mermaid parse failed:",error);
        setStatus("初期化エラー",true);
        showPreviewError(error);
        return;
      }
      pushHistory();
    }else{
      state.history=[];
      state.historyIndex=-1;
      pushHistory();
    }

    renderAll();
    state.code=mermaidSource;
    saveLocal();
    fitView();

    setStatus(`${state.nodes.length} ノード / ${state.edges.length} 接続`);
    log("Editor initialized without React");
  }catch(error){
    errorLog("Boot error:",error);
    setStatus("初期化エラー",true);
    showPreviewError(error);
  }
}

boot();
