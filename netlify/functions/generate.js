exports.handler = async function(event, context) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { action } = JSON.parse(event.body);

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    if (!anthropicKey) {
      return {
        statusCode: 500,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'API 키가 설정되지 않았어요' })
      };
    }

    // 1. Claude로 프레임 분석
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: `너는 카카오 이모티콘 전문 작가 도우미야. 아래 동작을 보고 움직이는 이모티콘을 위한 4개의 프레임 도안을 설계해줘.

동작: "${action}"

반드시 아래 JSON 형식으로만 응답해. 다른 텍스트는 절대 쓰지 마.

{
  "frames": [
    {
      "num": 1,
      "ko": "한국어로 이 프레임 포즈 설명 (작가가 그릴 수 있게 구체적으로, 1-2문장)",
      "prompt": "simple chibi character sketch, extremely minimal design, round head with tiny cross mark face, small round body, thick black outline only, pure white background, no color no shading no fill, coloring book style, single character pose showing [구체적인 포즈 영어 설명], clean simple lines, emoticon reference sheet style, black and white line art only"
    }
  ],
  "tip": "이 동작을 자연스럽게 그리기 위한 작가 팁 1가지 (한국어)"
}`
        }]
      })
    });

    const claudeData = await claudeRes.json();
    if (!claudeRes.ok) throw new Error(claudeData.error?.message || 'Claude 오류');

    const text = claudeData.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());

    // 2. DALL-E 3로 이미지 생성 (OpenAI 키 있으면)
    if (openaiKey) {
      const imagePromises = parsed.frames.map(async (frame) => {
        try {
          const imgRes = await fetch('https://api.openai.com/v1/images/generations', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${openaiKey}`
            },
            body: JSON.stringify({
              model: 'dall-e-3',
              prompt: frame.prompt,
              n: 1,
              size: '1024x1024',
              quality: 'standard',
              style: 'vivid'
            })
          });
          const imgData = await imgRes.json();
          return imgData.data?.[0]?.url || null;
        } catch (e) {
          return null;
        }
      });

      const imageUrls = await Promise.all(imagePromises);
      parsed.frames = parsed.frames.map((frame, i) => ({
        ...frame,
        imageUrl: imageUrls[i]
      }));
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(parsed)
    };

  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message })
    };
  }
};
