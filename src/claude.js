// src/claude.js
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function askClaude(question, context) {
  const res = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1000,
    system: `You are a UX research and design system assistant for an experience
design team. You have access to four data sources:
1. Figma Design files — component names, page structure, design system assets
2. FigJam boards — journey maps, flow diagrams, workshop outputs
3. Miro boards — additional journey maps and workshop content (enterprise only)
4. GitHub repositories — structured JSON data containing the published design
   system (components with variants, properties, tokens, usage guidelines) and
   published journey maps (stages, pain points, opportunities, scored insights)

Answer questions clearly and concisely based on the context provided. When
referencing components, include their variants and usage guidelines. When
referencing journey data, include pain points, opportunities, and insight
severity scores. If the context does not contain enough information, say so
honestly and suggest what data source might have the answer.`,
    messages: [{
      role: 'user',
      content: `Context from design files, boards, and published data:\n\n${context}\n\nQuestion: ${question}`
    }]
  });
  return res.content[0].text;
}
