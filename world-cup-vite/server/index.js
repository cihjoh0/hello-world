import express from 'express';
import cors from 'cors';
import Anthropic from '@anthropic-ai/sdk';

const app  = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors());
app.use(express.json());

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function buildStatsBlock(match, stats) {
  const { homeTeam, awayTeam, score, status, group } = match;
  const hs = score?.fullTime?.home ?? 0;
  const as = score?.fullTime?.away ?? 0;
  const ht = score?.halfTime ? `HT ${score.halfTime.home}–${score.halfTime.away}` : '';

  const lines = [
    `Match: ${homeTeam.name} ${hs}–${as} ${awayTeam.name} (${status}) ${ht}`,
    `Context: ${group ?? match.stage}`,
    '',
    `Possession:     ${homeTeam.shortName} ${stats.possession?.home ?? '?'}%  /  ${awayTeam.shortName} ${stats.possession?.away ?? '?'}%`,
    `Shots:          ${stats.shots?.home ?? 0}  /  ${stats.shots?.away ?? 0}`,
    `Shots on Target:${stats.shotsOnTarget?.home ?? 0}  /  ${stats.shotsOnTarget?.away ?? 0}`,
    `xG:             ${stats.xG?.home ?? 0}  /  ${stats.xG?.away ?? 0}`,
    `Big Chances:    ${stats.bigChances?.home ?? 0}  /  ${stats.bigChances?.away ?? 0}`,
    `Corners:        ${stats.corners?.home ?? 0}  /  ${stats.corners?.away ?? 0}`,
    `Passes:         ${stats.passes?.home ?? 0}  /  ${stats.passes?.away ?? 0}`,
    `Pass Accuracy:  ${stats.passAccuracy?.home ?? 0}%  /  ${stats.passAccuracy?.away ?? 0}%`,
    `Tackles:        ${stats.tackles?.home ?? 0}  /  ${stats.tackles?.away ?? 0}`,
    `Fouls:          ${stats.fouls?.home ?? 0}  /  ${stats.fouls?.away ?? 0}`,
    `Saves:          ${stats.saves?.home ?? 0}  /  ${stats.saves?.away ?? 0}`,
  ];

  if (stats.goals?.length) {
    lines.push('', 'Goals:');
    stats.goals.forEach(g => {
      const team = g.team === 'home' ? homeTeam.shortName : awayTeam.shortName;
      const assist = g.assist ? ` (assist: ${g.assist})` : '';
      const type = g.type !== 'REGULAR' ? ` [${g.type}]` : '';
      lines.push(`  ${g.minute}' ${team} - ${g.scorer}${assist}${type}`);
    });
  }

  if (stats.cards?.length) {
    lines.push('', 'Cards:');
    stats.cards.forEach(c => {
      const team = c.team === 'home' ? homeTeam.shortName : awayTeam.shortName;
      lines.push(`  ${c.minute}' ${team} - ${c.player} [${c.type}]`);
    });
  }

  return lines.join('\n');
}

app.post('/api/analysis', async (req, res) => {
  const { match, stats } = req.body ?? {};
  if (!match || !stats) {
    return res.status(400).json({ error: 'match and stats required' });
  }

  const statsBlock = buildStatsBlock(match, stats);
  const prompt = `You are a football analyst providing post-match analysis for the FIFA World Cup 2026. Analyze this match concisely in 3–4 short paragraphs covering: key tactical story, standout moments, individual performances, and what this result means for the group. Be specific and insightful. Use plain text only, no markdown.

Match data:
${statsBlock}`;

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('Cache-Control', 'no-cache');

  try {
    const stream = client.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }],
    });

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
        res.write(chunk.delta.text);
      }
    }
    res.end();
  } catch (err) {
    console.error('Analysis error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Analysis failed' });
    } else {
      res.end();
    }
  }
});

app.listen(PORT, () => {
  console.log(`World Cup API server running on http://localhost:${PORT}`);
});
