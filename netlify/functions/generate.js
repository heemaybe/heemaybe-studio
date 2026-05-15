exports.handler = async function(event, context) {
  // CORS preflight
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

    // API 키는 환경변수에서 안전하게 가져옴
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'API 키가 설정되지 않았어요' })
      };
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
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
      "prompt": "chibi kawaii cute emoticon character, [구체적인 포즈 영어 설명], simple clean line art, white background, cartoon sticker style, no text, flat design"
    }
  ],
  "tip": "이 동작을 자연스럽게 그리기 위한 작가 팁 1가지 (한국어)"
}`
        }]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        statusCode: response.status,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: data.error?.message || 'API 오류' })
      };
    }

    const text = data.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());

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
