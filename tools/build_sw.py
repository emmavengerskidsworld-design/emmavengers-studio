"""Generate sw.js (offline cache + update detection). Run after ANY change:  python3 tools/build_sw.py
Every app file is precached; each file is keyed by its content hash so an update only downloads changed files.
The build id changes whenever any file changes, so phones get the '✨ New update ready' button automatically."""
import os, hashlib, json
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP_DIRS = {'.git', 'tools', 'tests', 'node_modules', 'lib'}   # lib/ (sound library, speech engine) is cached on use, not precached
SKIP = {'sw.js', 'README.md', '.nojekyll', 'LICENSE'}
files, h = {}, hashlib.sha256()
for d, ds, fs in os.walk(ROOT):
    ds[:] = sorted(x for x in ds if x not in SKIP_DIRS and not x.startswith('.'))
    for f in sorted(fs):
        rel = os.path.relpath(os.path.join(d, f), ROOT).replace(os.sep, '/')
        if f in SKIP or f.startswith('.') or f.endswith(('.py', '.log', '.md', '.LICENSE', '.map', '.txt')): continue
        data = open(os.path.join(ROOT, rel), 'rb').read(); dg = hashlib.sha256(data).hexdigest()[:10]
        files['./' + rel] = dg; h.update(rel.encode() + b'\0' + dg.encode())
build = h.hexdigest()[:12]
tpl = open(os.path.join(ROOT, 'tools', 'sw.template.js')).read()
out = tpl.replace('__BUILD__', build).replace('__ASSETS__', json.dumps(list(files), separators=(',', ':')))
out = out.replace("const BUILD =", "const ASSETS_V = " + json.dumps(files, separators=(',', ':')) + ";\nconst BUILD =", 1)
open(os.path.join(ROOT, 'sw.js'), 'w').write(out)
print(f'build {build}: {len(files)} files, {sum(os.path.getsize(os.path.join(ROOT, k[2:])) for k in files)/1e6:.2f} MB precached')
