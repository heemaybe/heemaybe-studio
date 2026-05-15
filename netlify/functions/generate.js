const https = require('https');

const REFERENCE_IMAGES = {
  animal: 'https://raw.githubusercontent.com/heemaybe/heemaybe-studio/main/animal.png',
  human: 'https://raw.githubusercontent.com/heemaybe/heemaybe-studio/main/human.png',
};

async function imageUrlToBase64(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('base64')));
      res.on('error', reject);
    }).on('error', reject);
  });
}

exports.handler = async function(event, context) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }, body: '' };
  }
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  try {
    const { action, charType = 'animal' } = JSON.parse(event.body);
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!anthropicKey || !openaiKey) return { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'API 키 없음' }) };

    // 1. Claude 프레임 분석
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001', max_tokens: 1000,
        messages: [{ role: 'user', content: `너는 카카오 이모티콘 전문 작가 도우미야. 아래 동작을 보고 4개의 프레임을 설계해줘.\n동작: "${action}"\n반드시 아래 JSON만 응답해.\n{"frames":[{"num":1,"ko":"한국어 포즈 설명 1-2문장","poseDesc":"영어 포즈 설명 (짧게)"}],"tip":"작가 팁 한국어"}` }]
      })
    });
    const claudeData = await claudeRes.json();
    if (!claudeRes.ok) throw new Error(claudeData.error?.message || 'Claude 오류');
    const text = claudeData.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());

    // 2. 레퍼런스 이미지 로드
    const refBase64 = await imageUrlToBase64(REFERENCE_IMAGES[charType] || REFERENCE_IMAGES.animal);

    // 3. GPT-4o Vision으로 포즈 프롬프트 강화 후 DALL-E 생성
    for (let i = 0; i < parsed.frames.length; i++) {
      try {
        const frame = parsed.frames[i];

        // GPT-4o로 레퍼런스 분석 + 상세 프롬프트 생성
        const visionRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
          body: JSON.stringify({
            model: 'gpt-4o', max_tokens: 300,
            messages: [{ role: 'user', content: [
              { type: 'image_url', image_url: { url: `data:image/png;base64,${refBase64}`, detail: 'high' } },
              { type: 'text', text: `Analyze this character's exact proportions (head size, body size, limb length ratios). Then write a DALL-E prompt to draw this EXACT same character in this pose: "${frame.poseDesc}". The prompt must enforce: same head-to-body ratio, black outline only, white background, no color, no shading, cross-shaped face marks. Output ONLY the DALL-E prompt, nothing else.` }
            ]}]
          })
        });
        const visionData = await visionRes.json();
        const enhancedPrompt = visionData.choices?.[0]?.message?.content || '';

        // DALL-E 3으로 이미지 생성
        const dalleRes = await fetch('https://api.openai.com/v1/images/generations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
          body: JSON.stringify({
            model: 'dall-e-3',
            prompt: enhancedPrompt || `Chibi emoticon line art, ${frame.poseDesc}, round head 60% height, small round body, thick black outline only, white background, no color no shading, cross-shaped face, coloring book style`,
            n: 1, size: '1024x1024', quality: 'standard', style: 'natural'
          })
        });
        const dalleData = await dalleRes.json();
        parsed.frames[i].imageUrl = dalleData.data?.[0]?.url || null;
      } catch (e) {
        parsed.frames[i].imageUrl = null;
      }
      if (i < parsed.frames.length - 1) await new Promise(r => setTimeout(r, 300));
    }

    return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(parsed) };
  } catch (err) {
    return { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: err.message }) };
  }
};
