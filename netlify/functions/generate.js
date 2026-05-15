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

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001', max_tokens: 1000,
        messages: [{ role: 'user', content: `너는 카카오 이모티콘 전문 작가 도우미야. 아래 동작을 보고 4개의 프레임을 설계해줘.\n동작: "${action}"\n반드시 아래 JSON만 응답해. 다른 텍스트 절대 금지.\n{"frames":[{"num":1,"ko":"한국어 포즈 설명 1-2문장","poseDesc":"very short english pose description"}],"tip":"작가 팁 한국어"}` }]
      })
    });
    const claudeData = await claudeRes.json();
    if (!claudeRes.ok) throw new Error(claudeData.error?.message || 'Claude 오류');
    const text = claudeData.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());

    const charStyle = charType === 'human'
      ? 'chibi human character, 3-head-tall proportion, round head, tiny body, stubby arms and legs'
      : 'chibi animal character, very round large head, tiny round body, small stubby limbs, animal ears';

    for (let i = 0; i < parsed.frames.length; i++) {
      try {
        const frame = parsed.frames[i];
        const pose = frame.poseDesc || 'standing neutral pose';
        const dalleRes = await fetch('https://api.openai.com/v1/images/generations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
          body: JSON.stringify({
            model: 'dall-e-3',
            prompt: `Simple black and white line art emoticon sticker. ${charStyle}. Pose: ${pose}. Style rules: thick black outlines only, pure white background, absolutely no color, no shading, no fill, no gradients. Cross or plus shaped facial marks instead of detailed face. Coloring book style. Single character centered with lots of white space. Kawaii emoticon reference sheet style.`,
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
