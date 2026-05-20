// src/search.js

// ─── Search Figma Design files ───
export async function searchFigma(query) {
  try {
    const fileKeys = (process.env.FIGMA_FILE_KEYS || '').split(',').filter(Boolean);
    if (fileKeys.length === 0) {
      return 'No FIGMA_FILE_KEYS configured in .env.';
    }
    let content = '';
    for (const key of fileKeys) {
      const res = await fetch(`https://api.figma.com/v1/files/${key.trim()}`, {
        headers: { 'X-Figma-Token': process.env.FIGMA_TOKEN }
      });
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
      const res = await fetch(`https://api.figma.com/v1/files/${key.trim()}`, {
        headers: { 'X-Figma-Token': process.env.FIGMA_TOKEN }
      });
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
        files: ['data/components.json', 'data/tokens.json', 'data/foundations.json']
      },
      {
        name: 'Journey Management',
        owner: process.env.GITHUB_OWNER,
        repo: process.env.GITHUB_JM_REPO,
        files: ['data/index.json']
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
            for (const j of data.hierarchy) {
              content += `Journey: ${j.name} (${j.level})`;
              if (j.children) content += ` — Sub-journeys: ${j.children.map(c => c.name).join(', ')}`;
              content += '\n';
            }
          }
        } catch { content += `\n${source.name} — ${filePath}: (not yet populated)`; }
      }
      // Fetch individual journey files
      if (source.repo === process.env.GITHUB_JM_REPO && source.owner) {
        const idxUrl = `https://raw.githubusercontent.com/${source.owner}/${source.repo}/main/data/index.json`;
        const idxRes = await fetch(idxUrl);
        if (idxRes.ok) {
          try {
            const idx = JSON.parse(await idxRes.text());
            const ids = [];
            for (const top of (idx.hierarchy || [])) {
              ids.push(top.id);
              for (const ch of (top.children || [])) ids.push(ch.id);
            }
            for (const id of ids.slice(0, 10)) {
              const jUrl = `https://raw.githubusercontent.com/${source.owner}/${source.repo}/main/data/journeys/${id}.json`;
              const jRes = await fetch(jUrl);
              if (!jRes.ok) continue;
              try {
                const j = JSON.parse(await jRes.text());
                content += `\n\nJourney: ${j.name} (${j.status})`;
                content += `\nSummary: ${j.summary || 'No summary'}`;
                for (const s of (j.stages || [])) {
                  content += `\n  Stage: ${s.name} — Emotion: ${s.emotions?.label} (${s.emotions?.score}/5)`;
                  content += ` — Pain points: ${(s.painPoints || []).join('; ')}`;
                }
                for (const ins of (j.insights || [])) {
                  content += `\n  Insight [${ins.severity}]: ${ins.text}`;
                }
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
  const res = await fetch(
    `https://api.figma.com/v1/images/${fileKey}?ids=${nodeId}&format=png&scale=2`,
    { headers: { 'X-Figma-Token': process.env.FIGMA_TOKEN } }
  );
  if (!res.ok) throw new Error(`Figma image API error: ${res.status}`);
  const data = await res.json();
  return data.images?.[nodeId] || null;
}

// ─── Search Figma published components with image URLs ───
export async function searchFigmaComponents(query) {
  const results = [];
  const fileKeys = (process.env.FIGMA_FILE_KEYS || '').split(',').filter(Boolean);
  for (const key of fileKeys) {
    try {
      const res = await fetch(`https://api.figma.com/v1/files/${key.trim()}/components`, {
        headers: { 'X-Figma-Token': process.env.FIGMA_TOKEN }
      });
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
      const res = await fetch(`https://api.figma.com/v1/files/${key.trim()}`, {
        headers: { 'X-Figma-Token': process.env.FIGMA_TOKEN }
      });
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

// ─── Detect changes between live Figma and published GitHub data ───
export async function detectChanges() {
  // Gather live components from Figma
  const fileKeys = (process.env.FIGMA_FILE_KEYS || '').split(',').filter(Boolean);
  const liveByName = {};
  for (const key of fileKeys) {
    try {
      const res = await fetch(`https://api.figma.com/v1/files/${key.trim()}/components`, {
        headers: { 'X-Figma-Token': process.env.FIGMA_TOKEN }
      });
      if (!res.ok) continue;
      const data = await res.json();
      for (const c of (data.meta?.components || [])) {
        // Use the component set name (root before '/') as the canonical name
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
      const url = `https://raw.githubusercontent.com/${process.env.GITHUB_OWNER}/${process.env.GITHUB_DS_REPO}/main/data/components.json`;
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
    const liveVariantCount = liveByName[n].length;
    const publishedVariantCount = publishedByName[n].length;
    return liveVariantCount !== publishedVariantCount;
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
