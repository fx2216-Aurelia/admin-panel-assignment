const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const ts = require(path.join(root, 'node_modules/typescript'));
const sharp = require(path.join(root, 'node_modules/sharp'));
const output = process.env.PHOTO_LION_TEST_OUTPUT || path.join(root, 'validation');
const cache = new Map();
function load(relative, overrides = {}) {
    const filename = path.resolve(root, relative);
    if (cache.has(filename) && !Object.keys(overrides).length) return cache.get(filename);
    const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
    const moduleObject = { exports: {} };
    new Function('require', 'module', 'exports', compiled)((name) => {
        if (overrides[name]) return overrides[name];
        if (name.startsWith('.')) return load(path.relative(root, path.resolve(path.dirname(filename), name + '.ts')));
        return require(require.resolve(name, { paths: [root] }));
    }, moduleObject, moduleObject.exports);
    if (!Object.keys(overrides).length) cache.set(filename, moduleObject.exports);
    return moduleObject.exports;
}
const { choosePlacement, lionBounds, overlaps } = load('lib/photoLionGeometry.ts');
const { lionSvg, normalizePhoto, compositePhoto, createPhotoLion } = load('lib/photoLion.ts');
const results = [];
async function test(name, run) { await run(); results.push(name); console.log(`PASS ${name}`); }
const subwaySvg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="900" height="600" fill="#d8e4e8"/><rect y="360" width="900" height="240" fill="#9badae"/><rect x="70" y="50" width="260" height="225" rx="28" fill="#537988" stroke="#526166" stroke-width="15"/><rect x="510" y="50" width="260" height="225" rx="28" fill="#537988" stroke="#526166" stroke-width="15"/><rect x="450" y="345" width="360" height="96" rx="25" fill="#449acc"/><rect x="450" y="270" width="360" height="94" rx="25" fill="#58a9d4"/><path d="M455 440v99M800 440v99M394 0v600" stroke="#59696e" stroke-width="13"/></svg>`;
const librarySvg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="900" height="600" fill="#efdfbf"/><rect y="390" width="900" height="210" fill="#bd996c"/><path d="M40 45h800v240H40Z" fill="#765535"/><path d="M50 150h780M50 250h780" stroke="#b6936e" stroke-width="10"/><rect x="176" y="295" width="150" height="147" rx="14" fill="#74734c"/><rect x="170" y="441" width="162" height="30" rx="8" fill="#535333"/><path d="M185 470v98m130-98v98" stroke="#5e4b38" stroke-width="12"/><path d="M420 389h420l55 180H350Z" fill="#956e43"/><path d="M475 405h92v50h-92Z" fill="#e9dfc6"/></svg>`;
const subway = { people: [], faces: [], obstacles: [], supports: [{ kind: 'seat', box_2d: [575, 500, 735, 900] }] };
const library = { people: [], faces: [], obstacles: [[648, 388, 948, 995]], supports: [{ kind: 'seat', box_2d: [735, 189, 785, 369] }] };
const fullPerson = { people: [[0, 0, 1000, 1000]], faces: [[50, 50, 300, 300]], obstacles: [], supports: subway.supports };
(async () => {
    fs.mkdirSync(output, { recursive: true });
    let photo;
    await test('server computes geometry, entire sprite avoids people/faces/foreground', async () => {
        for (const scene of [subway, library, { ...subway, people: [[50, 520, 800, 710]], faces: [[80, 530, 300, 650]] }]) {
            const placement = choosePlacement(scene, 900, 600);
            if (placement.mode === 'companion_margin') continue;
            const bounds = lionBounds(placement, 900, 600);
            const box = [bounds.top / 600 * 1000, bounds.left / 900 * 1000, (bounds.top + bounds.height) / 600 * 1000, (bounds.left + bounds.width) / 900 * 1000];
            assert.ok(bounds.top >= 0 && bounds.left >= 0 && bounds.top + bounds.height <= 600);
            for (const obstacle of [...scene.people, ...scene.faces, ...scene.obstacles]) assert.equal(overlaps(box, obstacle), false);
        }
        assert.equal(choosePlacement(subway, 900, 600).mode, 'support');
        assert.equal(choosePlacement(library, 900, 600).mode, 'support');
        assert.ok(!lionSvg('sit').includes('opacity=".14"'));
        assert.ok(lionSvg('stand').includes('opacity=".14"'));
    });
    await test('valid no-support/full-frame person/foreground obstruction uses separate strip, not 422', async () => {
        for (const scene of [{ error: 'no_safe_support' }, { ...subway, supports: [] }, fullPerson, { ...subway, obstacles: [[0, 0, 1000, 1000]] }, { ...subway, supports: [{ kind: 'seat', box_2d: [10, 0, 30, 40] }] }]) assert.equal(choosePlacement(scene, 900, 600).mode, 'companion_margin');
    });
    await test('invalid/incomplete/non-finite/reversed/outside boxes are rejected, not described as recognition', async () => {
        for (const scene of [null, { ...subway, people: undefined }, { ...subway, people: [[0, 0, NaN, 20]] }, { ...subway, faces: [[100, 100, 50, 200]] }, { ...subway, obstacles: [[0, 0, 1200, 50]] }, { ...subway, supports: [{ kind: 'imaginary', box_2d: [1, 1, 2, 2] }] }]) assert.throws(() => choosePlacement(scene, 900, 600));
    });
    await test('photo normalization strips EXIF and enforces byte/pixel/null errors', async () => {
        const png = await sharp(Buffer.from(subwaySvg)).png().withMetadata({ exif: { IFD0: { Copyright: 'Private test metadata' } } }).toBuffer();
        photo = await normalizePhoto(`data:image/png;base64,${png.toString('base64')}`);
        const metadata = await sharp(photo).metadata();
        assert.equal(metadata.format, 'jpeg'); assert.equal(metadata.exif, undefined);
        await assert.rejects(normalizePhoto(null), (error) => error.status === 400);
        for (const bad of ['', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,YWJjZA==', 'x'.repeat(1_450_001), 'https://example.com/private.jpg']) await assert.rejects(normalizePhoto(bad));
        const tiny = await sharp({ create: { width: 50, height: 50, channels: 3, background: '#fff' } }).png().toBuffer();
        await assert.rejects(normalizePhoto(`data:image/png;base64,${tiny.toString('base64')}`));
    });
    await test('render JPEG fixtures, dimensions retained; full-person fallback only adds margin', async () => {
        for (const [name, fixture, scene] of [['subway', subwaySvg, subway], ['library', librarySvg, library], ['fallback', subwaySvg, fullPerson]]) {
            const original = await sharp(Buffer.from(fixture)).jpeg().toBuffer();
            const image = await compositePhoto(original, choosePlacement(scene, 900, 600));
            const bytes = Buffer.from(image.split(',')[1], 'base64');
            const metadata = await sharp(bytes).metadata();
            assert.equal(metadata.width, 900);
            assert.equal(metadata.height > 600, name === 'fallback');
            fs.writeFileSync(path.join(output, `${name}.jpg`), bytes);
        }
    });
    await test('mock HTTP vision sends actual bytes; safe failure and explicit companion fallback', async () => {
        const oldFetch = global.fetch; const oldKey = process.env.GEMINI_API_KEY;
        process.env.GEMINI_API_KEY = 'validation-only-not-real';
        let geometry = subway; let captured;
        global.fetch = async (url, options) => {
            captured = JSON.parse(options.body);
            return new Response(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify(geometry) }] }, finishReason: 'STOP' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        };
        try {
            const dataUrl = `data:image/jpeg;base64,${photo.toString('base64')}`;
            assert.equal((await createPhotoLion(dataUrl)).placement.mode, 'support');
            assert.equal(captured.contents[0].parts[1].inlineData.mimeType, 'image/jpeg');
            assert.ok(captured.contents[0].parts[1].inlineData.data.length > 100);
            geometry = { ...subway, supports: [], scene: 'Sensitive person description must not persist' };
            const result = await createPhotoLion(dataUrl);
            assert.equal(result.placement.mode, 'companion_margin'); assert.match(result.notice, /below the photo/);
            assert.ok(!JSON.stringify(result.placement).includes('Sensitive'));
            geometry = { error: 'no_safe_support' };
            assert.equal((await createPhotoLion(dataUrl)).placement.mode, 'companion_margin');
            geometry = { supports: [] };
            await assert.rejects(createPhotoLion(dataUrl), (error) => error.status === 503);
            global.fetch = async () => { throw new Error('Offline'); };
            await assert.rejects(createPhotoLion(dataUrl), (error) => error.status === 503);
        } finally { global.fetch = oldFetch; if (oldKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = oldKey; }
    });
    await test('real local no-key condition is explicit 503', async () => {
        const previous = process.env.GEMINI_API_KEY; delete process.env.GEMINI_API_KEY;
        try { await assert.rejects(createPhotoLion(`data:image/jpeg;base64,${photo.toString('base64')}`), (error) => error.status === 503 && /not configured/.test(error.message)); }
        finally { if (previous !== undefined) process.env.GEMINI_API_KEY = previous; }
    });
    await test('feed route pages in database, validates offsets and never uses service-role client', async () => {
        let captured; let authenticated = true;
        const posts = Array.from({ length: 11 }, (_, index) => ({ id: String(index), output_text: '{"analysis":"hello"}' }));
        const route = load('app/api/feed/route.ts', { '@/lib/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: authenticated ? { id: 'viewer' } : null } }) }, rpc: async (name, params) => { captured = { name, params }; return { data: posts }; } }) } });
        const response = await route.GET(new Request('https://local.test/api/feed?offset=10&tab=mine'));
        const body = await response.json();
        assert.equal(body.posts.length, 10); assert.equal(body.nextOffset, 20);
        assert.deepEqual(captured, { name: 'photo_lion_feed', params: { page_offset: 10, page_size: 11, feed_tab: 'mine', feed_sort: 'latest', commented_ids: [] } });
        for (const query of ['offset=-1', 'offset=NaN', 'offset=10001', 'tab=unknown']) assert.equal((await route.GET(new Request(`https://local.test/api/feed?${query}`))).status, 400);
        authenticated = false;
        assert.equal((await route.GET(new Request('https://local.test/api/feed'))).status, 401);
    });
    await test('image endpoint returns bytes only on demand, uses cookie auth/RLS, denies bad ids', async () => {
        let authenticated = true; let fetched = 0;
        const route = load('app/api/generations/[id]/image/route.ts', { '@/lib/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: authenticated ? { id: 'viewer' } : null } }) }, from: () => ({ select: (fields) => { assert.equal(fields, 'output_text'); return { eq: () => ({ single: async () => { fetched++; return { data: { output_text: JSON.stringify({ image_source: 'user_photo_lion', image_url: `data:image/jpeg;base64,${photo.toString('base64')}` }) } }; } }) }; } }) }) } });
        const context = { params: Promise.resolve({ id: '00000000-0000-0000-0000-000000000001' }) };
        const response = await route.GET(new Request('https://local.test/image'), context);
        assert.equal(response.headers.get('Content-Type'), 'image/jpeg'); assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
        assert.deepEqual(Buffer.from(await response.arrayBuffer()), photo);
        authenticated = false;
        assert.equal((await route.GET(new Request('https://local.test/image'), context)).status, 401); assert.equal(fetched, 1);
        assert.equal((await route.GET(new Request('https://local.test/image'), { params: Promise.resolve({ id: '../secret' }) })).status, 400);
    });
    await test('publication gate is off by default and persisted scene description removed', async () => {
        const route = fs.readFileSync(path.join(root, 'app/api/generate/route.ts'), 'utf8');
        assert.ok(route.includes("PHOTO_COMMUNITY_SHARING_ENABLED !== 'true'"));
        assert.ok(!route.includes('placement.scene'));
        const page = fs.readFileSync(path.join(root, 'app/page.tsx'), 'utf8');
        assert.ok(!page.includes(".select('*')")); assert.ok(page.includes('nextOffset !== null'));
    });
    fs.writeFileSync(path.join(output, 'preview.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><title>Photo lion review fixtures</title><style>body{font:16px system-ui;background:#eef4ee;color:#264437;padding:24px}main{display:flex;gap:20px;align-items:start}article{background:white;padding:16px;border-radius:16px;flex:1}img{width:100%;height:auto}small{display:block;margin-top:20px}</style><h1>Blue-shirt lion — review risk fixtures</h1><p>Synthetic scenes + supplied geometry; NOT real photo/Gemini acceptance.</p><main><article><h2>Empty subway seat</h2><img src="subway.jpg"></article><article><h2>Chair, foreground table avoided</h2><img src="library.jpg"></article><article><h2>No safe support</h2><p>Separate companion strip: original photo not overlaid.</p><img src="fallback.jpg"></article></main><small>Seated lion has no floating ground shadow. Bounding-box checks are only as complete as model detections; actual-person and foreground detection still require real photographs.</small></html>`);
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ tests: results, limitations: ['Vision HTTP mocked; no real Gemini key', 'Synthetic scenes, not real photographs', 'No real account, database policies, mobile or PNG card E2E', 'Full build requires real Supabase config; no placeholder values supplied'] }, null, 2));
})().catch((error) => { console.error(error); process.exitCode = 1; });
