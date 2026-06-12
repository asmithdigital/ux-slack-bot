// src/search.js

class FigmaRateLimitError extends Error {
  constructor() { super('Figma rate limit reached'); this.name = 'FigmaRateLimitError'; }
}

// ─── Figma fetch with 429 retry ───
async function figmaFetch(url) {
  const opts = { headers: { 'X-Figma-Token': process.env.FIGMA_TOKEN } };
  let res = await fetch(url, opts);
  if (res.status === 429) {
    await new Promise(r => setTimeout(r, 5000));
    res = await fetch(url, opts);
    if (res.status === 429) throw new FigmaRateLimitError();
  }
  return res;
}

// ─── Search Figma Design files ───
export async function searchFigma(query) {
  try {
    const fileKeys = (process.env.FIGMA_FILE_KEYS || '').split(',').filter(Boolean);
    if (fileKeys.length === 0) {
      return 'No FIGMA_FILE_KEYS configured in .env.';
    }
    let content = '';
    for (const key of fileKeys) {
      const res = await figmaFetch(`https://api.figma.com/v1/files/${key.trim()}`);
      if (!res.ok) {
        content += `\nCould not access Figma file ${key.trim()} (${res.status})`;
        continue;
      }
      const data = await res.json();
      const components = Object.values(data.components || {})
        .map(c => c.name).slice(0, 30);
      const pages = (data.document?.children || []).map(p => p.name);
      content += `\n\nFigma Design file: ${data.name}`;
      content += `\nPages: ${pages.join(', ')}`;
      if (components.length > 0) {
        content += `\nComponents: ${components.join(', ')}`;
      }
    }
    return content || 'No readable content found in Figma Design files.';
  } catch (e) {
    return `Figma search error: ${e.message}`;
  }
}

// ─── Search FigJam boards ───
export async function searchFigJam(query) {
  try {
    const fileKeys = (process.env.FIGJAM_FILE_KEYS || '').split(',').filter(Boolean);
    if (fileKeys.length === 0) {
      return 'No FIGJAM_FILE_KEYS configured in .env.';
    }
    let content = '';
    for (const key of fileKeys) {
      const res = await figmaFetch(`https://api.figma.com/v1/files/${key.trim()}`);
      if (!res.ok) {
        content += `\nCould not access FigJam file ${key.trim()} (${res.status})`;
        continue;
      }
      const data = await res.json();
      // Extract text from sticky notes, shapes, and connectors
      const texts = [];
      function extractText(node) {
        if (node.characters) texts.push(node.characters.trim());
        if (node.children) node.children.forEach(child => extractText(child));
      }
      if (data.document) extractText(data.document);
      content += `\n\nFigJam board: ${data.name}`;
      if (texts.length > 0) {
        content += `\nContent: ${texts.slice(0, 40).join(' | ')}`;
      }
    }
    return content || 'No readable content found in FigJam files.';
  } catch (e) {
    return `FigJam search error: ${e.message}`;
  }
}

// ─── Search Miro boards — ENTERPRISE ONLY ───
export async function searchMiro(query) {
  if (!process.env.MIRO_ACCESS_TOKEN) {
    return '[Miro is not available in this demo — requires a paid Miro plan. ' +
      'In the enterprise version, the bot searches Miro boards for journey ' +
      'maps, workshop outputs, and research data. FigJam is used instead.]';
  }
  try {
    const boardsRes = await fetch('https://api.miro.com/v2/boards?limit=50', {
      headers: { 'Authorization': `Bearer ${process.env.MIRO_ACCESS_TOKEN}` }
    });
    if (!boardsRes.ok) return 'Could not access Miro boards.';
    const boards = await boardsRes.json();
    if (!boards.data || boards.data.length === 0) return 'No Miro boards found.';
    const recent = boards.data.slice(0, 5);
    let content = '';
    for (const board of recent) {
      const itemsRes = await fetch(
        `https://api.miro.com/v2/boards/${board.id}/items?limit=50`,
        { headers: { 'Authorization': `Bearer ${process.env.MIRO_ACCESS_TOKEN}` } }
      );
      if (!itemsRes.ok) continue;
      const items = await itemsRes.json();
      const texts = (items.data || [])
        .filter(i => i.data && i.data.content)
        .map(i => i.data.content.replace(/<[^>]+>/g, '').trim())
        .filter(Boolean).slice(0, 20);
      if (texts.length > 0) {
        content += `\n\nMiro board: ${board.name}\n${texts.join('\n')}`;
      }
    }
    return content || 'No readable content found in Miro boards.';
  } catch (e) {
    return `Miro search error: ${e.message}`;
  }
}

// ─── Search GitHub repos for structured JSON data ───
export async function searchGitHub(query) {
  try {
    const repos = [
      {
        name: 'Design System',
        owner: process.env.GITHUB_OWNER,
        repo: process.env.GITHUB_DS_REPO,
        files: ['public/data/components.json', 'public/data/tokens.json', 'public/data/foundations.json']
      },
      {
        name: 'Journey Management',
        owner: process.env.GITHUB_OWNER,
        repo: process.env.GITHUB_JM_REPO,
        files: ['public/data/index.json']
      }
    ];
    let content = '';
    for (const source of repos) {
      if (!source.owner || !source.repo) continue;
      for (const filePath of source.files) {
        const url = `https://raw.githubusercontent.com/${source.owner}/${source.repo}/main/${filePath}`;
        const res = await fetch(url);
        if (!res.ok) continue;
        const text = await res.text();
        try {
          const data = JSON.parse(text);
          content += `\n\n${source.name} — ${filePath}:\n`;
          if (data.components) {
            content += data.components.map(c =>
              `Component: ${c.name} (${c.status}) — ${c.description} | ` +
              `Variants: ${(c.variants || []).map(v => v.name).join(', ')}`
            ).join('\n');
          }
          if (data.colors) {
            content += `\nColours: ${data.colors.map(c => `${c.name}: ${c.value} — ${c.usage}`).join(', ')}`;
          }
          if (data.typography) {
            content += `\nTypography: ${data.typography.map(t => `${t.name}: ${t.fontFamily} ${t.fontSize}`).join(', ')}`;
          }
          if (data.foundations) {
            content += data.foundations.map(f => `${f.title}: ${f.content}`).join('\n');
          }
          if (data.hierarchy) {
            function displayHierarchy(node, depth) {
              const indent = '  '.repeat(depth);
              content += `${indent}Journey: ${node.name} (${node.level})\n`;
              for (const child of (node.children || [])) displayHierarchy(child, depth + 1);
            }
            for (const j of data.hierarchy) displayHierarchy(j, 0);
          }
        } catch { content += `\n${source.name} — ${filePath}: (not yet populated)`; }
      }
      // Fetch individual journey files
      if (source.repo === process.env.GITHUB_JM_REPO && source.owner) {
        const idxUrl = `https://raw.githubusercontent.com/${source.owner}/${source.repo}/main/public/data/index.json`;
        const idxRes = await fetch(idxUrl);
        if (idxRes.ok) {
          try {
            const idx = JSON.parse(await idxRes.text());
            const ids = [];
            function collectIds(node) {
              if (node.id) ids.push(node.id);
              for (const child of (node.children || [])) collectIds(child);
            }
            for (const top of (idx.hierarchy || [])) collectIds(top);
            for (const id of ids.slice(0, 10)) {
              const jUrl = `https://raw.githubusercontent.com/${source.owner}/${source.repo}/main/public/data/journeys/${id}.json`;
              const jRes = await fetch(jUrl);
              if (!jRes.ok) continue;
              try {
                const j = JSON.parse(await jRes.text());
                content += `\n\nJourney: ${j.name} (${j.status})\n`;
                content += JSON.stringify(j, null, 2);
              } catch { /* skip */ }
            }
          } catch { /* skip */ }
        }
      }
    }
    return content || 'No data found in GitHub repos. The sites may not be populated yet.';
  } catch (e) {
    return `GitHub search error: ${e.message}`;
  }
}

// ─── Get a PNG image URL for a Figma node ───
export async function getFigmaImage(fileKey, nodeId) {
  const res = await figmaFetch(
    `https://api.figma.com/v1/images/${fileKey}?ids=${nodeId}&format=png&scale=2`
  );
  if (!res.ok) throw new Error(`Figma image API error: ${res.status}`);
  const data = await res.json();
  return data.images?.[nodeId] || null;
}

// ─── Search Figma visual results (components + frames), max 6 image fetches ───
// Returns { results, figmaRateLimited, total } — caller passes these to Claude context.
export async function searchFigmaVisuals(query) {
  const candidates = [];
  let figmaRateLimited = false;
  const fileKeys = (process.env.FIGMA_FILE_KEYS || '').split(',').filter(Boolean);

  for (const key of fileKeys) {
    try {
      const res = await figmaFetch(`https://api.figma.com/v1/files/${key.trim()}/components`);
      if (!res.ok) continue;
      const data = await res.json();
      for (const c of (data.meta?.components || [])) {
        if (c.name.toLowerCase().includes(query.toLowerCase())) {
          candidates.push({ name: c.name, description: c.description || '', nodeId: c.node_id, fileKey: key.trim() });
        }
      }
    } catch (e) {
      if (e instanceof FigmaRateLimitError) figmaRateLimited = true;
    }
  }

  for (const key of fileKeys) {
    try {
      const res = await figmaFetch(`https://api.figma.com/v1/files/${key.trim()}`);
      if (!res.ok) continue;
      const data = await res.json();
      const found = [];
      function scan(node) {
        if (
          (node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'COMPONENT_SET') &&
          node.name.toLowerCase().includes(query.toLowerCase())
        ) found.push({ name: node.name, description: '', nodeId: node.id, fileKey: key.trim() });
        if (node.children) node.children.forEach(scan);
      }
      if (data.document) scan(data.document);
      candidates.push(...found);
    } catch (e) {
      if (e instanceof FigmaRateLimitError) figmaRateLimited = true;
    }
  }

  const total = candidates.length;
  const results = [];

  for (const candidate of candidates.slice(0, 6)) {
    let imageUrl = null;
    try {
      imageUrl = await getFigmaImage(candidate.fileKey, candidate.nodeId);
    } catch (e) {
      if (e instanceof FigmaRateLimitError) figmaRateLimited = true;
    }
    results.push({ ...candidate, imageUrl });
  }

  return { results, figmaRateLimited, total };
}

// ─── Search Figma published components with image URLs ───
export async function searchFigmaComponents(query) {
  const results = [];
  const fileKeys = (process.env.FIGMA_FILE_KEYS || '').split(',').filter(Boolean);
  for (const key of fileKeys) {
    try {
      const res = await figmaFetch(`https://api.figma.com/v1/files/${key.trim()}/components`);
      if (!res.ok) continue;
      const data = await res.json();
      const components = data.meta?.components || [];
      const matches = components.filter(c =>
        c.name.toLowerCase().includes(query.toLowerCase())
      );
      for (const match of matches.slice(0, 3)) {
        let imageUrl = null;
        try { imageUrl = await getFigmaImage(key.trim(), match.node_id); } catch { /* no image */ }
        results.push({
          name: match.name,
          description: match.description || '',
          nodeId: match.node_id,
          fileKey: key.trim(),
          imageUrl
        });
      }
    } catch { /* skip file */ }
  }
  return results;
}

// ─── Search Figma frames/screens with image URLs ───
export async function searchFigmaFrames(query) {
  const results = [];
  const fileKeys = (process.env.FIGMA_FILE_KEYS || '').split(',').filter(Boolean);
  for (const key of fileKeys) {
    try {
      const res = await figmaFetch(`https://api.figma.com/v1/files/${key.trim()}`);
      if (!res.ok) continue;
      const data = await res.json();
      const frames = [];
      function findFrames(node) {
        if (
          (node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'COMPONENT_SET') &&
          node.name.toLowerCase().includes(query.toLowerCase())
        ) {
          frames.push({ name: node.name, nodeId: node.id });
        }
        if (node.children) node.children.forEach(child => findFrames(child));
      }
      if (data.document) findFrames(data.document);
      for (const frame of frames.slice(0, 3)) {
        let imageUrl = null;
        try { imageUrl = await getFigmaImage(key.trim(), frame.nodeId); } catch { /* no image */ }
        results.push({ ...frame, fileKey: key.trim(), imageUrl });
      }
    } catch { /* skip file */ }
  }
  return results;
}

// ─── Search Prototype Platform ───
export async function searchPrototypePlatform(query) {
  try {
    const res = await fetch(
      'https://raw.githubusercontent.com/asmithdigital/raa-prototype-platform/main/data/prototypes.json'
    );
    if (!res.ok) return `Prototype platform data unavailable (${res.status}).`;
    const data = await res.json();
    const prototypes = data.prototypes || [];
    if (prototypes.length === 0) return 'No prototypes found in the platform data.';

    const PROTO_BASE = 'https://asmithdigital.github.io/raa-prototype-platform';
    const DS_BASE = 'https://asmithdigital.github.io/design-system-site';
    const protoLink = id => `${PROTO_BASE}/prototypes/${id}`;
    const presentLink = s => {
      const type = s.route?.startsWith('/app') ? 'app' : 'web';
      return `${PROTO_BASE}/present/${type}/${s.id}`;
    };
    const compLink = name =>
      `${DS_BASE}/components/${name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}`;

    const q = query.toLowerCase();

    // "what prototypes exist" / "show me all prototypes"
    if (q.includes('what prototypes exist') || q.includes('show me all prototypes') || q.includes('list prototypes')) {
      let out = `PROTOTYPE PLATFORM — ${prototypes.length} prototypes:\n\n`;
      for (const p of prototypes) {
        out += `${p.name} | ${p.category} | ${p.status} | ${p.screens.length} screens\n`;
        out += `Link: ${protoLink(p.id)}\n\n`;
      }
      return out;
    }

    // "what screens exist for [name]"
    const screensForMatch = q.match(/what screens (?:exist |are there )?for (.+)/);
    if (screensForMatch) {
      const target = screensForMatch[1].trim();
      const proto = prototypes.find(p =>
        p.name.toLowerCase().includes(target) || p.id.toLowerCase().includes(target)
      );
      if (!proto) return `No prototype found matching "${target}".`;
      let out = `${proto.name} — ${proto.screens.length} screens:\n\n`;
      for (const s of [...proto.screens].sort((a, b) => a.order - b.order)) {
        out += `${s.order}. ${s.name}\n`;
        if (s.description) out += `   ${s.description}\n`;
        out += `   Link: ${presentLink(s)}\n\n`;
      }
      return out;
    }

    // "what components does [screen] use"
    const compForMatch = q.match(/what components (?:does |do )?(?:the |a |an )?(.+?) use/);
    if (compForMatch) {
      const target = compForMatch[1].trim();
      for (const p of prototypes) {
        for (const s of p.screens) {
          if (s.name.toLowerCase().includes(target) || s.id.toLowerCase().includes(target)) {
            let out = `${s.name} (from ${p.name}) — ${s.components.length} component(s):\n`;
            for (const c of s.components) out += `- ${c}: ${compLink(c)}\n`;
            return out;
          }
        }
      }
      return `No screen found matching "${compForMatch[1].trim()}".`;
    }

    // General keyword match — return matching prototypes/screens; fall back to brief overview
    const keywords = q.split(/\s+/).filter(w => w.length > 2);
    let out = 'PROTOTYPE PLATFORM DATA:\n\n';
    let anyMatch = false;

    for (const p of prototypes) {
      const protoText = `${p.name} ${p.description || ''} ${p.category} ${p.status}`.toLowerCase();
      const screenHits = p.screens.filter(s => {
        const st = `${s.name} ${s.description || ''} ${s.components.join(' ')}`.toLowerCase();
        return keywords.some(kw => st.includes(kw));
      });
      const protoHit = keywords.some(kw => protoText.includes(kw));

      if (protoHit || screenHits.length > 0) {
        anyMatch = true;
        out += `Prototype: ${p.name} (${p.status}) — ${protoLink(p.id)}\n`;
        out += `  Category: ${p.category} | ${p.screens.length} screens total\n`;
        if (p.description) out += `  ${p.description}\n`;
        for (const s of screenHits) {
          out += `  Screen: ${s.order}. ${s.name} — ${presentLink(s)}\n`;
          if (s.components.length) out += `    Components: ${s.components.join(', ')}\n`;
        }
        out += '\n';
      }
    }

    if (!anyMatch) {
      out = `PROTOTYPE PLATFORM — ${prototypes.length} prototype(s) available:\n`;
      for (const p of prototypes) {
        out += `${p.name} (${p.status}, ${p.screens.length} screens) — ${protoLink(p.id)}\n`;
      }
    }
    return out;
  } catch (e) {
    return `Prototype platform search error: ${e.message}`;
  }
}

// ─── Search Journey Management site ───
export async function searchJourneyManagement(query) {
  try {
    const res = await fetch(
      'https://raw.githubusercontent.com/asmithdigital/journey-management-site/main/public/data/journeys.json'
    );
    if (!res.ok) return `Journey management data unavailable (${res.status}).`;
    const data = await res.json();
    const journeys = data.journeys || [];
    if (journeys.length === 0) return 'No journeys found in the journey management data.';

    const q = query.toLowerCase();
    const keywords = q.split(/\s+/).filter(w => w.length > 2);

    const matched = journeys.filter(j => {
      const text = [
        j.name, j.description || '', j.category || '', j.status || '',
        ...(j.touchpoints || []).map(t => `${t.name} ${t.description || ''}`)
      ].join(' ').toLowerCase();
      return keywords.some(kw => text.includes(kw));
    });

    const list = matched.length > 0 ? matched : journeys;
    let out = `JOURNEY MANAGEMENT — ${list.length} journey(s)${matched.length > 0 ? ' matching query' : ' (all)'}:\n\n`;

    for (const j of list) {
      out += `Journey: ${j.name} | Status: ${j.status} | Category: ${j.category}\n`;
      if (j.description) out += `  ${j.description}\n`;
      if (j.touchpoints && j.touchpoints.length > 0) {
        out += `  Touchpoints (${j.touchpoints.length}):\n`;
        for (const t of j.touchpoints) {
          out += `    - ${t.name} [${t.channel}]: ${t.description || ''}`;
          if (t.prototypeScreenId) out += ` (prototype screen: ${t.prototypeScreenId})`;
          out += '\n';
        }
      }
      out += '\n';
    }
    return out;
  } catch (e) {
    return `Journey management search error: ${e.message}`;
  }
}

// ─── Search personas from journey-management-site repo ───
const _personaCache = { raw: null, ts: 0 };
const PERSONA_TTL = 60 * 60 * 1000;

async function fetchPersonaRaw() {
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_JM_REPO;
  if (!owner || !repo) return null;
  const paths = [
    'src/data/personas.js',
    'src/data/Personas.jsx',
    'src/data/personas.json',
    'src/pages/Personas.jsx',
    'src/Personas.jsx',
    'src/components/Personas.jsx',
  ];
  for (const p of paths) {
    const res = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/main/${p}`);
    if (res.ok) return await res.text();
  }
  return null;
}

function extractPersonaContext(raw, query) {
  const names = [
    'Sarah Mitchell', 'James Cooper', 'Priya Sharma',
    'Tom & Lisa Chen', 'Maria Rossi', 'Alex Nguyen'
  ];
  const lower = query.toLowerCase();
  const matched = names.filter(n =>
    lower.includes(n.toLowerCase()) ||
    n.toLowerCase().split(' ').some(part => part.length > 3 && lower.includes(part))
  );

  if (matched.length > 0) {
    const chunks = [];
    for (const name of matched) {
      const idx = raw.indexOf(name);
      if (idx === -1) continue;
      const start = Math.max(0, idx - 500);
      const end = Math.min(raw.length, idx + 2500);
      chunks.push(raw.slice(start, end));
    }
    if (chunks.length > 0) return `Persona data:\n${chunks.join('\n\n---\n\n')}`;
  }

  const arrayStart = raw.indexOf('const PERSONAS');
  if (arrayStart !== -1) return `PERSONAS data:\n${raw.slice(arrayStart, arrayStart + 8000)}`;
  return `Persona data:\n${raw.slice(0, 6000)}`;
}

export async function searchPersonas(query) {
  try {
    const now = Date.now();
    if (!_personaCache.raw || (now - _personaCache.ts) >= PERSONA_TTL) {
      _personaCache.raw = await fetchPersonaRaw();
      _personaCache.ts = now;
    }
    if (!_personaCache.raw) return 'Persona data not found in the journey-management-site repo.';
    return extractPersonaContext(_personaCache.raw, query);
  } catch (e) {
    return `Persona search error: ${e.message}`;
  }
}

// ─── Detect changes between live Figma and published GitHub data ───
export async function detectChanges() {
  // Gather live components from Figma
  const fileKeys = (process.env.FIGMA_FILE_KEYS || '').split(',').filter(Boolean);
  const liveByName = {};
  for (const key of fileKeys) {
    try {
      const res = await figmaFetch(`https://api.figma.com/v1/files/${key.trim()}/components`);
      if (!res.ok) continue;
      const data = await res.json();
      for (const c of (data.meta?.components || [])) {
        const rootName = c.containing_frame?.name || c.name.split('/')[0];
        if (!liveByName[rootName]) liveByName[rootName] = [];
        liveByName[rootName].push(c.name);
      }
    } catch { /* skip */ }
  }

  // Gather published components from GitHub
  const publishedByName = {};
  if (process.env.GITHUB_OWNER && process.env.GITHUB_DS_REPO) {
    try {
      const url = `https://raw.githubusercontent.com/${process.env.GITHUB_OWNER}/${process.env.GITHUB_DS_REPO}/main/public/data/components.json`;
      const res = await fetch(url);
      if (res.ok) {
        const data = JSON.parse(await res.text());
        for (const c of (data.components || [])) {
          publishedByName[c.name] = c.variants || [];
        }
      }
    } catch { /* skip */ }
  }

  if (Object.keys(liveByName).length === 0 && Object.keys(publishedByName).length === 0) {
    return 'Could not retrieve data from Figma or GitHub to compare. Check your API tokens and repo config.';
  }

  const liveNames = new Set(Object.keys(liveByName));
  const publishedNames = new Set(Object.keys(publishedByName));

  const added = [...liveNames].filter(n => !publishedNames.has(n));
  const removed = [...publishedNames].filter(n => !liveNames.has(n));
  const modified = [...liveNames].filter(n => {
    if (!publishedNames.has(n)) return false;
    return liveByName[n].length !== publishedByName[n].length;
  });

  if (added.length === 0 && removed.length === 0 && modified.length === 0) {
    return 'No changes detected between the live Figma design system and the published GitHub data.';
  }

  let summary = '*Design System Changes Detected:*';
  if (added.length > 0) summary += `\n\n*New components (${added.length}):* ${added.join(', ')}`;
  if (removed.length > 0) summary += `\n\n*Removed components (${removed.length}):* ${removed.join(', ')}`;
  if (modified.length > 0) {
    const detail = modified.map(n =>
      `${n} (live: ${liveByName[n].length} variants, published: ${publishedByName[n].length} variants)`
    ).join(', ');
    summary += `\n\n*Modified components (${modified.length}):* ${detail}`;
  }
  return summary;
}
