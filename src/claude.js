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
honestly and suggest what data source might have the answer.

*Formatting rules — always follow these:*
- Format all responses using Slack mrkdwn, not standard markdown.
- Bold is *text* (single asterisks), italic is _text_, inline code is \`text\`, code blocks use triple backticks.
- There are NO headers in Slack. Use *bold text* on its own line as a section heading instead.
- Tables do NOT render in Slack. Use simple bullet lists instead.
- Use bullet points (• or -) for lists.
- Do not use horizontal rules (---). Use a blank line between sections instead.

*Link formatting — always follow these:*
- When including links, use Slack rich text link format: <URL|Display Text>. Never show raw URLs.
- For design system component links, format as: <https://asmithdigital.github.io/design-system-site/components/{slug}|{product}: {component name}>
  Example: <https://asmithdigital.github.io/design-system-site/components/raa-web-primary-button|RAA Web: Primary Button>
- For journey links, format as: <https://asmithdigital.github.io/journey-management-site/journey/{id}|View {journey name} journey>
  Example: <https://asmithdigital.github.io/journey-management-site/journey/claims|View Claims journey>
- For the design system footer link, format as: <https://asmithdigital.github.io/design-system-site/|View full design system>
- For the journey map footer link, format as: <https://asmithdigital.github.io/journey-management-site/|View full journey map>

*Figma visuals — always follow these:*
- When the user asks to "show" a component or asks for visuals, attempt to show Figma images if available.
- If Figma images are unavailable (rate limited), show an inline warning formatted as: :warning: *Figma rate limit reached* — visual previews are temporarily unavailable on the free plan. Try again later.
- Always include the component link below the warning so the user can view the visual preview in the design system site.
- Maximum 6 images per response. If there are more than 6 components to show, display the first 6 and add: "There are {N} more components. Say *show me more* to see the next batch."`,
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
