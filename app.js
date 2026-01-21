// app.js (FINAL VERSION - Complete & Optimized)

const LOCAL_KEY = 'miniide.files.v1';
const INDENT_SIZE = 15;

// ------------------- Simple in-browser file system -------------------
let files = JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null');
if (!files) {
  files = [
    { id: 'index.html', name: 'index.html', language: 'html', content:
`<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Preview</title>
  </head>
  <body>
    <h1>Hello from MiniIDE</h1>
  </body>
</html>` },
    { id: 'script.js', name: 'script.js', language: 'javascript', content: `console.log('hello world')` },
    { id: 'styles.css', name: 'styles.css', language: 'css', content: `body{font-family:sans-serif}` },
    { id: 'src/main.py', name: 'src/main.py', language: 'python', content: `print("Python in folder works!")` },
    { id: 'src/Hello.java', name: 'src/Hello.java', language: 'java', content: `public class Hello {\n  public static void main(String[] args) {\n    System.out.println("Java requires a server to run.");\n  }\n}` },
    { id: 'src/main.cpp', name: 'src/main.cpp', language: 'cpp', content: `#include <iostream>\nint main() {\n    std::cout << "C++ needs a server/wasm to compile.";\n    return 0;\n}` }
  ];
  localStorage.setItem(LOCAL_KEY, JSON.stringify(files));
}

function saveFiles(){ localStorage.setItem(LOCAL_KEY, JSON.stringify(files)); }

// ------------------- UI refs -------------------
const fileListEl = document.getElementById('fileList');
const tabsEl = document.getElementById('tabs');
const editorContainer = document.getElementById('editor');
const consoleEl = document.getElementById('consoleOutput');
const previewIframe = document.getElementById('preview');
const previewWrap = document.getElementById('previewWrap');
const languageSelect = document.getElementById('languageSelect');
const bottomPanelWrap = document.querySelector('.bottom-panel-wrap');

let currentFileId = files[0].id;
let monacoEditor = null;
let monaco = null;

// store one monaco model per file id to preserve undo/redo & language
const modelStore = new Map();

// ------------------- Folder/File Tree Structure Logic -------------------
function getFileStructure(fileList) {
    const structure = {};
    fileList.sort((a, b) => a.name.localeCompare(b.name));
    for (const file of fileList) {
        const parts = file.name.split('/');
        let current = structure;
        let currentPath = '';
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            const isLast = (i === parts.length - 1);
            currentPath = currentPath ? `${currentPath}/${part}` : part;
            if (isLast) {
                current[part] = file;
            } else {
                if (!current[part]) {
                    current[part] = { _isFolder: true, children: {}, path: currentPath };
                }
                current = current[part].children;
            }
        }
    }
    return structure;
}

function buildFileTree(structure) {
    const ul = document.createElement('ul');
    const sortedKeys = Object.keys(structure).sort((a, b) => {
        const aIsFolder = structure[a]._isFolder;
        const bIsFolder = structure[b]._isFolder;
        if (aIsFolder && !bIsFolder) return -1;
        if (!aIsFolder && bIsFolder) return 1;
        return a.localeCompare(b);
    });

    for (const key of sortedKeys) {
        const item = structure[key];

        if (item._isFolder) {
            const folderLi = document.createElement('li');
            folderLi.className = 'folder-entry';
            const folderPath = item.path || key;

            if (localStorage.getItem(`folderState-${folderPath}`) === 'collapsed') {
                folderLi.classList.add('collapsed');
            }

            folderLi.innerHTML = `
                <div class="item-content" data-path="${folderPath}">
                    <div class="meta">
                        <span class="toggle-icon">▾</span>
                        <span class="name">📁 ${key}</span>
                    </div>
                    <div class="actions">
                        <button class="del-folder" data-path="${folderPath}">Del</button> 
                    </div>
                </div>
            `;

            const childrenUl = buildFileTree(item.children);
            folderLi.appendChild(childrenUl);

            folderLi.querySelector('.item-content').addEventListener('click', (e) => {
                if (e.target.tagName === 'BUTTON' || e.target.closest('.actions')) return;
                folderLi.classList.toggle('collapsed');
                if (folderLi.classList.contains('collapsed')) {
                    localStorage.setItem(`folderState-${folderPath}`, 'collapsed');
                    folderLi.querySelector('.toggle-icon').textContent = '▸';
                } else {
                    localStorage.removeItem(`folderState-${folderPath}`);
                    folderLi.querySelector('.toggle-icon').textContent = '▾';
                }
            });

            if (!folderLi.classList.contains('collapsed')) {
                folderLi.querySelector('.toggle-icon').textContent = '▾';
            } else {
                folderLi.querySelector('.toggle-icon').textContent = '▸';
            }

            ul.appendChild(folderLi);

        } else {
            const li = document.createElement('li');
            li.className = 'file-entry' + (item.id === currentFileId ? ' active' : '');
            li.setAttribute('data-id', item.id);
            li.innerHTML = `
                <div class="item-content" data-id="${item.id}">
                    <div class="meta">
                        <span class="name">${key}</span>
                        <small>${item.language||''}</small>
                    </div>
                    <div class="actions">
                        <button class="rename" data-id="${item.id}">Rename</button>
                        <button class="del" data-id="${item.id}">Del</button>
                    </div>
                </div>
            `;
            ul.appendChild(li);
        }
    }
    return ul;
}

function deleteFolder(folderPath) {
    const prefix = folderPath + '/';
    const initialLength = files.length;

    files = files.filter(f => !f.name.startsWith(prefix));

    // remove placeholder if exact match exists
    const placeholderIndex = files.findIndex(f => f.id === `${folderPath}/README.md` || f.id === folderPath);
    if (placeholderIndex !== -1) {
         files.splice(placeholderIndex, 1);
    }

    const filesDeletedCount = initialLength - files.length;

    if (filesDeletedCount === 0) {
        appendConsole(`Folder not found or already empty: ${folderPath}`, 'error');
        return;
    }

    // if current file was inside deleted folder, pick first file or null
    if (currentFileId && currentFileId.startsWith(prefix)) {
        currentFileId = files.length > 0 ? files[0].id : null;
    }

    if (!files.length) {
        files.push({ id: 'untitled.js', name: 'untitled.js', language: 'javascript', content: '// New project initialized' });
        currentFileId = files[0].id;
    }

    // remove models from modelStore for deleted files
    for (const key of Array.from(modelStore.keys())) {
        if (key.startsWith(prefix)) modelStore.delete(key);
    }

    saveFiles();
    renderFileList();
    renderTabs();
    if (currentFileId) loadCurrentFile();
    else clearPreview();
    appendConsole(`Deleted folder structure and ${filesDeletedCount} files: ${folderPath}`);
    localStorage.removeItem(`folderState-${folderPath}`);
}

// ------------------- Render file list -------------------
function renderFileList(){
  fileListEl.innerHTML = '';
  const structure = getFileStructure(files);
  const tree = buildFileTree(structure);
  fileListEl.appendChild(tree);

  fileListEl.querySelectorAll('.file-entry .item-content').forEach(div=>{
    div.addEventListener('click', (e)=> {
      if (e.target.tagName === 'BUTTON' || e.target.closest('.actions')) return;
      currentFileId = div.dataset.id;
      renderTabs();
      loadCurrentFile();
      renderFileList();
    });
  });

  fileListEl.querySelectorAll('.rename').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      const id = e.target.dataset.id;
      renameFile(id);
    });
  });

  fileListEl.querySelectorAll('.del').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      const id = e.target.dataset.id;
      files = files.filter(x=>x.id!==id);
      // also remove model
      if (modelStore.has(id)) {
        const model = modelStore.get(id);
        try { model.dispose(); } catch(_) {}
        modelStore.delete(id);
      }
      if (!files.length) files.push({id:'untitled.js',name:'untitled.js',language:'javascript',content:'// New project initialized'});
      if (currentFileId === id) currentFileId = files[0].id;
      saveFiles(); renderFileList(); renderTabs(); loadCurrentFile();
      appendConsole(`Deleted file: ${id}`);
    });
  });

  fileListEl.querySelectorAll('.del-folder').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const folderPath = e.target.dataset.path;
      if (confirm(`Are you sure you want to delete the folder: ${folderPath}? This will delete all files inside it.`)) {
        deleteFolder(folderPath);
      }
    });
  });
}

function renameFile(oldId){
  const file = files.find(f=>f.id===oldId);
  if (!file) return;

  const newName = prompt(`Rename '${file.name}' to (include path, e.g., src/file.js):`, file.name);
  if (!newName || newName === file.name) return;
  if (files.some(f=>f.id===newName)) {
    appendConsole('Rename failed: File with this name already exists.', 'error');
    return;
  }

  // update file entry
  file.id = newName;
  file.name = newName;
  file.language = detectLang(newName);

  // update modelStore: move model if exists
  if (modelStore.has(oldId)) {
    const model = modelStore.get(oldId);
    modelStore.delete(oldId);
    modelStore.set(newName, model);
  } else {
    // create model entry for new name later when loaded
  }

  if (currentFileId === oldId) currentFileId = newName;

  saveFiles();
  renderFileList();
  renderTabs();
  if (currentFileId === newName) loadCurrentFile();
  appendConsole(`File renamed to: ${newName}`);
}

// ------------------- Tabs -------------------
function renderTabs(){
  tabsEl.innerHTML = '';
  files.forEach(f=>{
    const t = document.createElement('div');
    t.className = 'tab' + (f.id===currentFileId ? ' active':'');
    t.textContent = f.name.split('/').pop();
    t.dataset.id = f.id;
    t.addEventListener('click', ()=>{ currentFileId = f.id; loadCurrentFile(); renderTabs(); renderFileList(); });
    tabsEl.appendChild(t);
  });
}

// ------------------- Monaco init and Language mapping -------------------
require.config({ paths: { 'vs': 'https://unpkg.com/monaco-editor@0.39.0/min/vs' }});
require(['vs/editor/editor.main'], function(m) {
  monaco = m;

  // create initial models for existing files
  for (const f of files) {
    const lang = mapLang(f.language);
    const model = monaco.editor.createModel(f.content || '', lang, monaco.Uri.parse('inmemory://' + f.id));
    modelStore.set(f.id, model);
  }

  // pick model for current file
  const initialFile = files.find(f => f.id === currentFileId) || files[0];
  const initialModel = modelStore.get(initialFile.id) || monaco.editor.createModel(initialFile.content || '', mapLang(initialFile.language));
  modelStore.set(initialFile.id, initialModel);

  monacoEditor = monaco.editor.create(editorContainer, {
      model: initialModel,
      automaticLayout:true,
      fontSize:14,
      theme: document.body.dataset.theme === 'light' ? 'vs-light' : 'vs-dark',
      scrollbar: {
          verticalScrollbarSize: 8,
          horizontalScrollbarSize: 8,
          alwaysConsumeMouseWheel: false
      }
  });

  // when any model changes, sync to files array
  monacoEditor.onDidChangeModelContent(() => {
    const model = monacoEditor.getModel();
    if (!model) return;
    // find file id from model's URI
    const modelId = model.uri.path ? model.uri.path.replace(/^\/?/, '') : null;
    if (modelId) {
      const idx = files.findIndex(f=>f.id===modelId);
      if (idx >= 0) files[idx].content = model.getValue();
      scheduleAutoSave();
    }
  });

  // also listen for model switch to update languageSelect
  monacoEditor.onDidChangeModel(() => {
    const m = monacoEditor.getModel();
    if (!m) return;
    const modelId = m.uri.path ? m.uri.path.replace(/^\/?/, '') : null;
    const file = files.find(f=>f.id===modelId);
    if (file) languageSelect.value = file.language || 'javascript';
  });

  renderFileList();
  renderTabs();
  loadCurrentFile();

  window.addEventListener('resize', () => {
      if (monacoEditor) monacoEditor.layout();
  });

  // Apply resizing logic
  makeBottomPanelResizable();
  makePreviewResizable();
  makeSidebarResizable();
});

function mapLang(l){
  if (!l) return 'javascript';
  if (l==='html') return 'html';
  if (l==='css') return 'css';
  if (l==='python') return 'python';
  if (l==='cpp') return 'cpp';
  if (l==='java') return 'java';
  if (l==='markdown') return 'markdown';
  return 'javascript';
}

function loadCurrentFile(){
  const file = files.find(f=>f.id===currentFileId);
  if (!file || !monacoEditor || !monaco) return;

  // ensure we have a model for this file
  let model = modelStore.get(file.id);
  if (!model) {
    model = monaco.editor.createModel(file.content || '', mapLang(file.language), monaco.Uri.parse('inmemory://' + file.id));
    modelStore.set(file.id, model);
  }

  monacoEditor.setModel(model); // switch editor to this model
  monaco.editor.setModelLanguage(model, mapLang(file.language));
  languageSelect.value = file.language || 'javascript';

  renderTabs();
  renderFileList();
}

function detectLang(name){
  const ext = name.split('.').pop().toLowerCase();
  if (ext==='html') return 'html';
  if (ext==='css') return 'css';
  if (ext==='js') return 'javascript';
  if (ext==='py') return 'python';
  if (ext==='java') return 'java';
  if (ext==='cpp' || ext==='c') return 'cpp';
  if (ext==='md' || ext==='markdown') return 'markdown';
  if (ext==='json') return 'json';
  return 'javascript';
}

// ------------------- Controls -------------------
document.getElementById('newFile').addEventListener('click', ()=>{
  const name = prompt('New file name (include path, e.g., folder/file.js):','untitled.js');
  if (!name) return;

  if (files.some(f => f.id === name)) {
      appendConsole(`File creation failed: A file named '${name}' already exists.`, 'error');
      return;
  }

  const id = name;
  const lang = detectLang(name);
  files.push({ id, name, language:lang, content: ''});
  // create model immediately
  if (monaco) {
    const model = monaco.editor.createModel('', mapLang(lang), monaco.Uri.parse('inmemory://' + id));
    modelStore.set(id, model);
  }
  currentFileId = id; saveFiles(); renderFileList(); renderTabs(); loadCurrentFile();
  appendConsole(`New file created: ${name}`);
});

document.getElementById('newFolder').addEventListener('click', ()=>{
  const folder = prompt('New folder name (e.g., src):','newfolder');
  if(!folder) return;

  const name = folder + '/README.md';
  if (files.some(f => f.name.startsWith(folder + '/'))) {
      appendConsole(`Folder structure '${folder}' already exists.`, 'error');
      return;
  }

  files.push({id:name,name,language:'markdown',content:`# ${folder}\n\nThis is a placeholder file for the folder structure.`});
  currentFileId = name; saveFiles(); renderFileList(); renderTabs(); loadCurrentFile();
  appendConsole(`Created folder structure: ${folder} (represented by ${name})`);
});

document.getElementById('saveAll').addEventListener('click', ()=>{ saveFiles(); appendConsole('Saved to localStorage'); });

document.getElementById('uploadBtn').addEventListener('click', ()=> document.getElementById('upload').click());
document.getElementById('upload').addEventListener('change', async (e)=>{
  const list = Array.from(e.target.files);
  let uploadedCount = 0;

  for (const f of list){
    const path = f.webkitRelativePath || f.name;
    if (files.some(file => file.id === path)) {
        appendConsole(`Skipped file (already exists): ${path}`, 'error');
        continue;
    }

    try {
        const text = await f.text();
        files.push({ id:path, name:path, language: detectLang(path), content:text});
        uploadedCount++;
    } catch (err) {
        appendConsole(`Error reading file ${path}: ${err.message}`, 'error');
    }
  }

  e.target.value = null;

  if (uploadedCount > 0) {
      saveFiles();
      // create models for new files if monaco ready
      if (monaco) {
        for (const f of files.slice(-uploadedCount)) {
          const model = monaco.editor.createModel(f.content || '', mapLang(f.language), monaco.Uri.parse('inmemory://' + f.id));
          modelStore.set(f.id, model);
        }
      }
      renderFileList();
      renderTabs();
      currentFileId = files[files.length - 1].id;
      loadCurrentFile();
  }
  appendConsole(`Uploaded ${uploadedCount} new files.`);
});

document.getElementById('downloadZip').addEventListener('click', async ()=>{
  const zip = new JSZip();
  for (const f of files) zip.file(f.name, f.content || '');
  const blob = await zip.generateAsync({type:'blob'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download='project.zip'; a.click();
  URL.revokeObjectURL(url);
  appendConsole('Downloaded ZIP');
});

languageSelect.addEventListener('change', ()=>{
  const file = files.find(f=>f.id===currentFileId);
  if (file){
      file.language = languageSelect.value;
      saveFiles();
      renderFileList();
      // update monaco model language if exists
      const model = modelStore.get(file.id);
      if (model && monaco) {
          monaco.editor.setModelLanguage(model, mapLang(file.language));
      }
      loadCurrentFile();
  }
});

// ------------------- Run button (Execution logic) -------------------
document.getElementById('runBtn').addEventListener('click', async ()=>{
  if (!monacoEditor) return;
  const file = files.find(f=>f.id===currentFileId);
  if (!file) return;
  const lang = file.language || 'javascript';

  clearConsole();

  if (lang==='cpp' || lang==='java') {
    const code = file.content;
    const isJava = lang === 'java';

    appendConsole(`⛔ EXECUTION HALTED (${lang}): Server/WASM Required for Compilation.`, 'error');
    appendConsole('To run this code, use an external online compiler.');

    const compilerName = isJava ? "Programiz (Java)" : "Programiz (C++)";
    const externalLink = isJava
        ? `https://www.programiz.com/java-programming/online-compiler/`
        : `https://www.programiz.com/cpp-programming/online-compiler/`;

    const codeDiv = document.createElement('div');
    codeDiv.className = 'code-snippet';
    // show raw code safely (escape)
    const escaped = code.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    codeDiv.innerHTML = `<pre>${escaped}</pre>
        <button onclick="copyToClipboard('${btoa(code)}')">Copy Code</button>
        <a href="${externalLink}" target="_blank" style="margin-left: 10px; text-decoration: none;">
            <button>Run on ${compilerName} 🚀</button>
        </a>`;

    consoleEl.appendChild(codeDiv);
    consoleEl.scrollTop = consoleEl.scrollHeight;
    return;
  }

  appendConsole(`Run: ${file.name} (${lang})`);

  if (lang==='html') {
    const html = file.content;
    // search for style and script file names in files list
    const cssFile = files.find(f=>f.name==='styles.css' || f.name==='style.css' || f.name.endsWith('/styles.css'));
    const jsFile = files.find(f=>f.name==='script.js' || f.name==='main.js' || f.name.endsWith('/script.js') || f.name.endsWith('/main.js'));
    const css = cssFile ? `<style>${cssFile.content}</style>` : '';
    const js = jsFile ? `<script>
      (function(){
        const _log = console.log;
        console.log = function(){ parent.postMessage({type:'log',args:Array.from(arguments)}, '*'); _log.apply(console,arguments); };
        try { ${jsFile.content} } catch (e) { parent.postMessage({type:'error', args:[e.message]}, '*'); }
      })();
    </script>` : '';
    // inject css into head, js before body close
    let srcdoc = html;
    if (srcdoc.includes('</head>')) srcdoc = srcdoc.replace('</head>', css + '</head>');
    else srcdoc = css + srcdoc;
    if (srcdoc.includes('</body>')) srcdoc = srcdoc.replace('</body>', js + '</body>');
    else srcdoc = srcdoc + js;
    previewIframe.srcdoc = srcdoc;
    appendConsole('Preview updated (HTML/CSS/JS executed)');
    return;
  }

  if (lang==='javascript') {
    const code = file.content;
    // wrap and forward console
    const src = `<script>
      (function(){
        const _log = console.log;
        console.log = function(){ parent.postMessage({type:'log', args: Array.from(arguments)}, '*'); _log.apply(console, arguments); };
        try {
          ${code}
        } catch(e) {
          parent.postMessage({type:'error', args:[e.message]}, '*');
        }
      })();
    </script>`;
    previewIframe.srcdoc = src;
    appendConsole('JS executed in preview iframe');
    return;
  }

  if (lang==='python') {
    appendConsole('Running Python (Skulpt)...');
    (function runSk() {
      Sk.configure({
        output: function(text){ window.postMessage({type:'log', args:[text]}, '*'); },
        read: function(x){
          if (Sk.builtinFiles === undefined || Sk.builtinFiles['files'][x] === undefined) throw 'File not found: '+x;
          return Sk.builtinFiles['files'][x];
        }
      });
      const prog = file.content;
      (Sk.misceval.asyncToPromise(function(){ return Sk.importMainWithBody('<stdin>', false, prog); })).then(function(mod){
        appendConsole('Python finished');
      }, function(err){
        appendConsole('Python error: ' + err.toString(), 'error');
      });
    })();
    return;
  }

  appendConsole(`Execution not defined for language: ${lang}`);
});

window.copyToClipboard = function(encodedCode) {
    const code = atob(encodedCode);
    navigator.clipboard.writeText(code).then(() => {
        appendConsole('Code copied to clipboard!', 'log');
    }).catch(err => {
        appendConsole('Could not copy code: ' + err, 'error');
    });
};

// ------------------- Console and Preview Controls -------------------
function appendConsole(msg, type='log'){
  const d = document.createElement('div');
  d.textContent = msg;
  d.style.padding='4px';
  d.style.whiteSpace = 'pre-wrap';
  if (type==='error') d.style.color = 'salmon';
  consoleEl.appendChild(d);
  consoleEl.scrollTop = consoleEl.scrollHeight;
}

document.getElementById('clearConsole').addEventListener('click', clearConsole);
function clearConsole(){
    consoleEl.innerHTML = '';
    appendConsole('Console cleared.', 'log');
}

document.getElementById('clearPreview').addEventListener('click', clearPreview);
function clearPreview() {
    previewIframe.srcdoc = `<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>`;
    appendConsole('Preview content cleared.', 'log');
}

// handle messages coming from iframe (logs / errors)
window.addEventListener('message', (e)=>{
  try{
    const d = e.data;
    if (!d || !d.type) return;
    if (d.type === 'log') appendConsole(d.args.join(' '));
    if (d.type === 'error') appendConsole('Error: ' + d.args.join(' '),'error');
  }catch(err){}
});

// ------------------- Toggle Preview and Resizing Logic -------------------
document.getElementById('togglePreview').addEventListener('click', ()=>{
    const isHidden = previewWrap.classList.toggle('hidden');
    if (monacoEditor) monacoEditor.layout();
});

function makeBottomPanelResizable(){
    const resizer = document.getElementById('bottomResizer');
    const bottomPanelWrap = document.querySelector('.bottom-panel-wrap');
    let dragging = false;
    let startY = 0;
    let startHeight = 0;
    const main = document.querySelector('.main');

    resizer.addEventListener('mousedown', (e) => {
        dragging = true;
        startY = e.clientY;
        startHeight = bottomPanelWrap.offsetHeight;
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'ns-resize';
    });

    window.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        const dy = e.clientY - startY;
        let newHeight = startHeight - dy;

        const minHeight = 40;
        const maxHeight = main.offsetHeight - 100;

        newHeight = Math.max(minHeight, newHeight);
        newHeight = Math.min(maxHeight, newHeight);

        bottomPanelWrap.style.height = newHeight + 'px';
        if (monacoEditor) monacoEditor.layout();
    });

    window.addEventListener('mouseup', () => {
        dragging = false;
        document.body.style.userSelect = 'auto';
        document.body.style.cursor = 'default';
    });
}

function makePreviewResizable(){
  const preview = document.getElementById('previewWrap');
  const g = document.getElementById('previewResizer');
  const consolePanel = document.querySelector('.console-wrap');

  let dragging=false, startX=0, startConsoleWidth=0;

  g.addEventListener('mousedown', (e)=>{
    dragging=true;
    startX=e.clientX;
    startConsoleWidth = consolePanel.offsetWidth;
    document.body.style.userSelect='none';
    document.body.style.cursor = 'ew-resize';
  });

  window.addEventListener('mousemove',(e)=>{
    if(!dragging) return;
    const dx = e.clientX - startX;
    let w = startConsoleWidth + dx;

    const mainWidth = document.querySelector('.bottom-panel').offsetWidth;
    const minWidth = 100;

    w = Math.max(minWidth, w);
    w = Math.min(mainWidth - minWidth, w);

    consolePanel.style.width = w + 'px';
    preview.style.flexGrow = 1;

    if (monacoEditor) monacoEditor.layout();
  });

  window.addEventListener('mouseup',()=>{
    dragging=false;
    document.body.style.userSelect='auto';
    document.body.style.cursor = 'default';
  });
}

// Sidebar Resizing Logic
function makeSidebarResizable(){
    const sidebar = document.querySelector('.sidebar');
    const resizer = document.getElementById('sidebarResizer');

    let dragging = false;
    let startX = 0;
    let startWidth = 0;

    resizer.addEventListener('mousedown', (e) => {
        dragging = true;
        startX = e.clientX;
        startWidth = sidebar.offsetWidth;
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'ew-resize';
    });

    window.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        const dx = e.clientX - startX;
        let newWidth = startWidth + dx;

        const minWidth = 150;
        const maxWidth = window.innerWidth / 2;

        newWidth = Math.max(minWidth, newWidth);
        newWidth = Math.min(maxWidth, newWidth);

        sidebar.style.width = newWidth + 'px';
        resizer.style.left = newWidth + 'px';

        if (monacoEditor) monacoEditor.layout();
    });

    window.addEventListener('mouseup', () => {
        dragging = false;
        document.body.style.userSelect = 'auto';
        document.body.style.cursor = 'default';
    });
}

// ------------------- Shortcuts and Autosave -------------------
window.addEventListener('keydown', (e)=>{
  if ((e.ctrlKey || e.metaKey) && e.key === 's'){ e.preventDefault(); saveFiles(); appendConsole('Saved'); }
  if ((e.ctrlKey || e.metaKey) && e.key === '/') { e.preventDefault(); toggleComment(); }
});

function toggleComment(){
  if (!monacoEditor) return;
  monacoEditor.getAction('editor.action.commentLine').run();
}

let autosaveTimer = null;
function scheduleAutoSave(){
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(()=>{ saveFiles(); appendConsole('Auto-saved'); }, 900);
}

// ------------------- Theme toggle -------------------
document.getElementById('themeToggle').addEventListener('click', ()=>{
  const isDark = document.body.dataset.theme === 'dark';
  document.body.dataset.theme = isDark ? 'light' : 'dark';

  if (monacoEditor) {
      monaco.editor.setTheme(isDark ? 'vs-light' : 'vs-dark');
  }
});

// --------------------------
// --------------------------
// COPY CODE — 100% WORKING (FIXED)
// --------------------------
document.getElementById("copyBtn").onclick = () => {
    // Check if the editor instance exists
    if (!monacoEditor) {
        alert("Editor not ready yet.");
        return;
    }
    
    // FIX: Use the correct variable 'monacoEditor' instead of the undefined 'editor'
    const code = monacoEditor.getValue();

    // PRIMARY METHOD
    navigator.clipboard.writeText(code)
        .then(() => {
            alert("Copied Successfully!");
        })
        .catch(() => {
            // FALLBACK METHOD
            const temp = document.createElement("textarea");
            temp.value = code;
            temp.style.position = "fixed";
            temp.style.left = "-9999px";
            document.body.appendChild(temp);

            temp.select();
            temp.setSelectionRange(0, temp.value.length);

            try {
                const ok = document.execCommand("copy");
                if (ok) {
                    alert("Copied Successfully!");
                } else {
                    alert("Copy Failed — Browser Blocked!");
                }
            } catch (err) {
                alert("Copy Failed — Permission Blocked.");
            }

            document.body.removeChild(temp);
        });
};
