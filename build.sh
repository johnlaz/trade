#!/bin/sh
# Concatenate src/ parts into the single-file app
cd "$(dirname "$0")"
{ cat src/00_head.html; for f in src/10_engine.js src/20_data.js src/30_net.js src/40_game.js src/50_ui.js src/60_gameui.js src/70_actions.js; do cat "$f"; echo; done; printf '</script>\n</body>\n</html>\n'; } > app/index.html
# syntax check the combined script
node -e "const s=require('fs').readFileSync('app/index.html','utf8');const m=s.match(/<script>\n([\s\S]*)<\/script>\n<\/body>/);require('fs').writeFileSync('/tmp/arena_check.js',m[1]);" && node --check /tmp/arena_check.js && echo "syntax ok" && wc -c app/index.html
