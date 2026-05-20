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

export async function generatePrompt(question, context, matchedData = {}) {
  const dataHints = [];
  if (matchedData.components?.length) {
    dataHints.push(`Matched Figma components: ${matchedData.components.map(c => c.name).join(', ')}`);
  }
  if (matchedData.frames?.length) {
    dataHints.push(`Matched Figma frames/screens: ${matchedData.frames.map(f => f.name).join(', ')}`);
  }

  const res = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    system: `You are a prompt generator for a UX design team. The user has asked a question that requires creative work — designing, prototyping, or updating something. You cannot do this work yourself. Instead, generate a ready-to-paste prompt that a designer can copy into the Claude Desktop app (which has Figma and Chrome connectors).

The prompt you generate should:
- Reference the specific Figma file URL where the relevant design lives
- Include the specific pain points, insights, or requirements from the data
- Reference the design system components and tokens that should be used
- Be specific enough that Claude Desktop can act on it immediately
- Start with a clear instruction like 'Look at this Figma file...' or 'Generate a prototype that...'

Format your response as:
SUMMARY: [1-2 sentence summary of what the data shows]
PROMPT FOR CLAUDE DESKTOP:
[the actual prompt to copy-paste]`,
    messages: [{
      role: 'user',
      content: `Context from design files, boards, and published data:\n\n${context}${dataHints.length ? '\n\n' + dataHints.join('\n') : ''}\n\nQuestion: ${question}`
    }]
  });
  return res.content[0].text;
}
