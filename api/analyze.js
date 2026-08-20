/**
 * ==============================================================================
 * Vercel Serverless Function: /api/analyze
 * 
 * [역할]
 * 클라이언트로부터 일기 텍스트(diaryText)를 전달받아, 최신 Google Gemini 3.6 Flash 생성형 AI를
 * 호출합니다. responseSchema(구조화된 출력)를 적용하여 사용자의 일기 내용에 100% 맞춤화된
 * 실시간 생성 답변(이모지, 감정라벨, 따뜻한 위로/공감 메시지)을 생성하여 반환합니다.
 * ==============================================================================
 */

export default async function handler(req, res) {
  // CORS 헤더 설정
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST 요청만 지원합니다.' });
  }

  try {
    let bodyData = req.body;
    if (typeof bodyData === 'string') {
      try {
        bodyData = JSON.parse(bodyData);
      } catch (e) {
        bodyData = {};
      }
    }

    const diaryText = bodyData?.diaryText;

    if (!diaryText || diaryText.trim() === '') {
      return res.status(400).json({ error: '일기 내용이 비어있습니다.' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: '서버에 GEMINI_API_KEY 환경변수가 설정되지 않았습니다.'
      });
    }

    // 최신 Google Gemini 3.6 Flash 엔드포인트
    const geminiEndpoint = `https://generativelanguage.googleapis.com/v1/models/gemini-3.6-flash:generateContent`;

    const geminiPayload = {
      contents: [
        {
          role: "user",
          parts: [
            { text: `[사용자의 일기 내용]\n${diaryText}` }
          ]
        }
      ],
      systemInstruction: {
        parts: [
          {
            text: `당신은 사람들의 지친 마음을 따뜻하게 안아주고 깊이 공감해 주는 다정한 AI 심리 상담사이자 일기 감정 분석 전문가입니다.
사용자가 작성한 일기 내용을 꼼꼼히 읽고, 일기 속 구체적인 사건과 감정에 깊이 공감하는 100% 맞춤형 답변을 생성해 주세요.
정형화된 문장이 아닌, 사용자가 쓴 단어와 상황에 맞춘 다정하고 섬세한 2~3줄의 위로/응원 메시지(aiMessage), 대표 감정 이모지 1개(emoji), 2~4단어의 한국어 감정 명칭(label)을 작성하세요.`
          }
        ]
      },
      generationConfig: {
        temperature: 0.8,
        maxOutputTokens: 1000,
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            emoji: {
              type: "STRING",
              description: "일기 내용의 핵심 감정을 나타내는 가장 잘 어울리는 대표 이모지 1개 (예: 🐱, ☕, 🥹, 🌧️, 🚗 등)"
            },
            label: {
              type: "STRING",
              description: "해당 감정을 표현하는 2~4단어의 한국어 감정 명칭"
            },
            aiMessage: {
              type: "STRING",
              description: "일기 내용 속 구체적인 상황을 언급하며 건네는 2~3줄의 다정하고 따뜻한 위로 및 공감 메시지"
            }
          },
          required: ["emoji", "label", "aiMessage"]
        }
      }
    };

    const response = await fetch(geminiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify(geminiPayload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Gemini API 호출 실패 (${response.status}):`, errorText);
      return res.status(response.status).json({
        error: `Gemini API 호출 실패: ${response.status}`,
        details: errorText
      });
    }

    const geminiResult = await response.json();
    const rawContent = geminiResult.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawContent) {
      throw new Error('Gemini AI 응답 텍스트가 비어있습니다.');
    }

    // 완벽한 JSON 파싱
    const parsedData = JSON.parse(rawContent);

    // 실제 Google Gemini 생성형 AI의 실시간 분석 결과 반환
    return res.status(200).json({
      success: true,
      emoji: parsedData.emoji,
      label: parsedData.label,
      aiMessage: parsedData.aiMessage
    });

  } catch (error) {
    console.error('분석 처리 중 오류:', error);
    return res.status(500).json({
      error: '감정 분석 중 서버 오류가 발생했습니다.',
      message: error.message
    });
  }
}
