#!/bin/sh
# Concatenate src/ parts into the single-file app, stamp the service worker, verify precache files.
cd "$(dirname "$0")"
{ cat src/00_head.html; for f in src/10_engine.js src/20_data.js src/30_net.js src/40_game.js src/50_ui.js src/60_gameui.js src/70_actions.js; do cat "$f"; echo; done; printf '</script>\n</body>\n</html>\n'; } > app/index.html
V=$(grep -o "APP_VERSION = '[^']*'" src/20_data.js | cut -d"'" -f2)
sed -i "s/^const CACHE = .*/const CACHE = 'trade-arena-v$V';/" app/sw.js
node -e "
const fs=require('fs');
const s=fs.readFileSync('app/index.html','utf8');
const m=s.match(/<script>\n([\s\S]*)<\/script>\n<\/body>/);
fs.writeFileSync('/tmp/arena_check.js',m[1]);
const sw=fs.readFileSync('app/sw.js','utf8');
const shell=eval(sw.match(/const SHELL = (\[.*?\]);/)[1]);
const missing=shell.filter(f=>f!=='./'&&!fs.existsSync('app/'+f));
if(missing.length){console.error('SW precache missing:',missing);process.exit(1);}
const man=JSON.parse(fs.readFileSync('app/manifest.json','utf8'));
const files=[...man.icons.map(i=>i.src),...(man.screenshots||[]).map(i=>i.src)].filter(f=>!fs.existsSync('app/'+f));
if(files.length){console.error('manifest references missing:',files);process.exit(1);}
" && node --check /tmp/arena_check.js && node --check app/sw.js && echo "build ok: v$V" && wc -c app/index.html
