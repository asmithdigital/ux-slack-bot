// index.js
import 'dotenv/config';
import { App } from '@slack/bolt';
import express from 'express';
import { askClaude } from './src/claude.js';
import { searchFigma, searchFigJam, searchMiro, searchGitHub } from './src/search.js';

const slackApp = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true
});

slackApp.event('app_mention', async ({ event, say }) => {
  const question = event.text.replace(/<@[^>]+>/g, '').trim();

  await say({
    text: 'Got it — searching your design system, journey data, and design files now...',
    thread_ts: event.ts
  });

  try {
    const [figmaCtx, figjamCtx, miroCtx, githubCtx] = await Promise.all([
      searchFigma(question),
      searchFigJam(question),
      searchMiro(question),
      searchGitHub(question)
    ]);

    const context = [
      `FIGMA DESIGN FILES:\n${figmaCtx}`,
      `FIGJAM BOARDS:\n${figjamCtx}`,
      `MIRO BOARDS:\n${miroCtx}`,
      `DESIGN SYSTEM & JOURNEY DATA (GitHub):\n${githubCtx}`
    ].join('\n\n');

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
