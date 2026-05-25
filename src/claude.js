// src/claude.js
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function askClaude(question, context) {
  const res = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1000,
    system: `You are a UX research and design system assistant for an experience
design team. You have access to five data sources:
1. Figma Design files — component names, page structure, design system assets
2. FigJam boards — journey maps, flow diagrams, workshop outputs
3. Miro boards — additional journey maps and workshop content (enterprise only)
4. GitHub repositories — structured JSON data containing the published design
   system (components with variants, properties, tokens, usage guidelines) and
   published journey maps (stages, pain points, opportunities, scored insights)
5. Persona data — detailed customer profiles including goals, frustrations,
   behaviours, scenarios, quotes, products used, digital confidence,
   preferred channel, family status, linked journeys, and per-journey
   emotion scores at each stage

Answer questions clearly and concisely based on the context provided. When
referencing components, include their variants and usage guidelines. When
referencing journey data, include pain points, opportunities, and insight
severity scores. When persona data is present, answer from the persona's lived
perspective — use their name, reference their specific goals, frustrations,
and behaviours. When both persona and journey data are present, combine the
persona's emotion scores at each stage with their frustrations and the
journey's opportunities to give a grounded, specific answer.
If the context does not contain enough information, say so honestly and suggest
what data source might have the answer.

*Formatting rules — always follow these:*
- Format all responses using Slack mrkdwn, not standard markdown.
- Bold is *text* (single asterisks), italic is _text_, inline code is \`text\`, code blocks use triple backticks.
- There are NO headers in Slack. Use *bold text* on its own line as a section heading instead.
- Tables do NOT render in Slack. Use simple bullet lists instead.
- Use bullet points (• or -) for lists.
- Do not use horizontal rules (---). Use a blank line between sections instead.

*Link formatting — always follow these:*
- Never show raw URLs. Always use Slack rich text links: <URL|Display Text>
- For design system component links, format as: <https://asmithdigital.github.io/design-system-site/components/{slug}|View in design system>
  where slug is {product}-{component-name-slugified}, e.g. raa-web-primary-button
- For journey links, format as: <https://asmithdigital.github.io/journey-management-site/journey/{id}|View {journey name} journey>
- For the design system footer, format as: <https://asmithdigital.github.io/design-system-site/|View full design system>
- For the journey map footer, format as: <https://asmithdigital.github.io/journey-management-site/|View full journey map>
- CRITICAL: Slack does NOT render markdown links like [text](url). You MUST use the angle bracket format <url|text>. If you write [View in design system](https://...) it will display as raw text. Always write <https://...|View in design system> instead.
- When in doubt about link format, use: <https://example.com|Link text here>

*Visual queries — always follow these:*
- When the user asks to "show" a component or asks for visuals, ALWAYS include the full text description first (name, status, description, variants as bullet points).
- Below each component's text description, the system will attempt to show a Figma visual. If the visual fails due to rate limiting, show this warning on its own line directly below that component's description: :warning: _Figma visual unavailable — rate limit reached on free plan. Try again later._
- Below the warning (or below the visual if it loaded), show the component link: <URL|View in design system>
- Do NOT show the rate limit warning as the first message or as a separate message. It must appear below each individual component's description.
- Maximum 6 component images per response. If the query would return more than 6 components with visuals, show the first 6 and add at the end: "There are {N} more components. Say *show me more* to see the next batch. :warning: _Requesting many visuals uses Figma API credits quickly._"
- Do NOT repeat the component name as the link text. The link text should say "View in design system", not the component name again.

*Figma rate limiting — always follow this:*
- If Figma visuals were unavailable due to rate limiting, add at the end of the full response (not at the top):
  _Visual previews from Figma are temporarily unavailable due to rate limits on the free plan. You can view component visuals using the design system links above._`,
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
