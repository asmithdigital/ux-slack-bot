// index.js
import 'dotenv/config';
import { App } from '@slack/bolt';
import express from 'express';
import { askClaude, generatePrompt } from './src/claude.js';
import {
  searchFigma, searchFigJam, searchMiro, searchGitHub, searchPersonas,
  searchFigmaVisuals, searchFigmaComponents, searchFigmaFrames, detectChanges
} from './src/search.js';

const slackApp = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true
});

const VISUAL_TRIGGERS = ['show me', 'what does', 'look like', 'screenshot', 'image of', 'visual'];
const PROMPT_TRIGGERS = ['i need to', 'how should i', 'help me design', 'prepare a brief', 'what should i do about', 'draft acceptance criteria', 'generate a brief'];
const CHANGE_TRIGGERS = ['what changed', 'any updates', "what's new", 'whats new', 'what is new'];
const PERSONA_NAMES = [
  'sarah mitchell', 'james cooper', 'priya sharma',
  'tom & lisa chen', 'tom chen', 'lisa chen', 'maria rossi', 'alex nguyen'
];
const PERSONA_TRIGGERS = [
  'persona', 'customer type', 'user profile', 'user type',
  'user need', 'user goal', 'user frustrat',
  'customer need', 'customer goal', 'customer frustrat'
];

const isVisualQuery = q => VISUAL_TRIGGERS.some(t => q.toLowerCase().includes(t));
const isPromptQuery = q => PROMPT_TRIGGERS.some(t => q.toLowerCase().includes(t));
const isChangeQuery = q => CHANGE_TRIGGERS.some(t => q.toLowerCase().includes(t));
const isPersonaQuery = q => {
  const lower = q.toLowerCase();
  return PERSONA_TRIGGERS.some(t => lower.includes(t)) || PERSONA_NAMES.some(n => lower.includes(n));
};

async function postImageBlocks(say, event, results) {
  const blocks = [];
  for (const r of results) {
    if (!r.imageUrl) continue;
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*${r.name}*` }
    });
    blocks.push({ type: 'image', image_url: r.imageUrl, alt_text: `${r.name} from Figma` });
  }
  if (blocks.length === 0) return;
  await say({ blocks, text: `Figma visuals`, thread_ts: event.ts });
}

slackApp.event('app_mention', async ({ event, say }) => {
  const question = event.text.replace(/<@[^>]+>/g, '').trim();

  await say({
    text: 'Got it — searching your design system, journey data, and design files now...',
    thread_ts: event.ts
  });

  try {
    // ── Change detection ──
    if (isChangeQuery(question)) {
      const changes = await detectChanges();
      await say({ text: changes, thread_ts: event.ts });
      return;
    }

    // ── Run all text searches in parallel ──
    const personaNeeded = isPersonaQuery(question);
    const [figmaCtx, figjamCtx, miroCtx, githubCtx, personaCtx] = await Promise.all([
      searchFigma(question),
      searchFigJam(question),
      searchMiro(question),
      searchGitHub(question),
      personaNeeded ? searchPersonas(question) : Promise.resolve(null)
    ]);

    const contextParts = [
      `FIGMA DESIGN FILES:\n${figmaCtx}`,
      `FIGJAM BOARDS:\n${figjamCtx}`,
      `MIRO BOARDS:\n${miroCtx}`,
      `DESIGN SYSTEM & JOURNEY DATA (GitHub):\n${githubCtx}`
    ];

    if (personaCtx) {
      contextParts.push(`PERSONA DATA:\n${personaCtx}`);
      const lower = question.toLowerCase();
      const isCrossQuery = (
        lower.includes('journey') || lower.includes('feel') ||
        lower.includes('experience') || lower.includes('stage') ||
        lower.includes('emotion') || lower.includes('how does') || lower.includes('how do')
      );
      contextParts.push(
        isCrossQuery
          ? '[SYSTEM: This question is about a persona AND a journey. Combine the persona\'s personaEmotions scores at each journey stage with their specific frustrations, and weave in the relevant opportunities from the journey data. Answer from the persona\'s lived perspective — use their name, reference their life situation, and ground every point in their specific attributes from the PERSONA DATA above.]'
          : '[SYSTEM: This question is about a persona. Answer from the persona\'s perspective, referencing their specific goals, frustrations, behaviours, preferred channel, digital confidence, family status, and linked journeys from the PERSONA DATA above. Use their name and make the answer personal and specific.]'
      );
    }

    const context = contextParts.join('\n\n');

    // ── Visual queries — fetch images, pass flags to Claude, post images after ──
    if (isVisualQuery(question)) {
      const { results, figmaRateLimited, total } = await searchFigmaVisuals(question).catch(() => ({ results: [], figmaRateLimited: false, total: 0 }));
      const remaining = total - results.length;
      const visualHints = [];
      if (figmaRateLimited) visualHints.push('[SYSTEM: Figma was rate limited — no images could be fetched. Per the visual queries rules, show the :warning: warning inline below each component description, not as a separate message.]');
      if (remaining > 0) visualHints.push(`[SYSTEM: ${remaining} more matching components exist beyond the 6 shown. Include the "There are ${remaining} more components..." message at the end of your response.]`);
      const visualCtx = visualHints.length ? '\n\n' + visualHints.join('\n') : '';
      const answer = await askClaude(question, context + visualCtx);
      await say({ text: answer, thread_ts: event.ts });
      if (results.some(r => r.imageUrl)) {
        await postImageBlocks(say, event, results);
      }
      return;
    }

    // ── Prompt generation queries ──
    if (isPromptQuery(question)) {
      let components = [], frames = [];
      try {
        [components, frames] = await Promise.all([
          searchFigmaComponents(question).catch(() => []),
          searchFigmaFrames(question).catch(() => [])
        ]);
      } catch { /* non-fatal */ }

      let response;
      try {
        response = await generatePrompt(question, context, { components, frames });
      } catch {
        // Fall back to regular answer if prompt generation fails
        const answer = await askClaude(question, context);
        await say({ text: answer, thread_ts: event.ts });
        return;
      }

      const summaryMatch = response.match(/SUMMARY:\s*([\s\S]*?)(?=PROMPT FOR CLAUDE DESKTOP:|$)/i);
      const promptMatch = response.match(/PROMPT FOR CLAUDE DESKTOP:\s*([\s\S]*)/i);
      const summary = summaryMatch?.[1]?.trim() || '';
      const prompt = promptMatch?.[1]?.trim() || response;
      const formatted = `${summary ? summary + '\n\n' : ''}*Prompt for Claude Desktop:*\n\`\`\`\n${prompt}\n\`\`\``;
      await say({ text: formatted, thread_ts: event.ts });
      return;
    }

    // ── Regular question — synthesise answer from all sources ──
    const answer = await askClaude(question, context);
    await say({ text: answer, thread_ts: event.ts });

  } catch (err) {
    await say({
      text: `Sorry, something went wrong: ${err.message}`,
      thread_ts: event.ts
    });
  }
});

// Health check endpoint for UptimeRobot
const api = express();
api.get('/health', (_req, res) => res.json({ status: 'ok' }));
api.listen(3000, () => console.log('Health check running on port 3000'));

await slackApp.start();
console.log('UX Assistant is running — waiting for Slack messages');
