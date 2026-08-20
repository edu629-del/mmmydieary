/**
 * ==============================================================================
 * Vercel Serverless Function: /api/analyze
 * 
 * [보안 역할]
 * 클라이언트(index.html)로부터 일기 본문(diaryText)만 전달받고,
 * 환경변수(process.env.GEMINI_API_KEY)에 안전하게 저장된 API 키를 사용하여
 * Google Gemini 3.6 Flash 생성형 AI API를 호출합니다.
 * 
 * 이를 통해 브라우저나 GitHub 어디에도 API 키가 노출되지 않도록 완벽하게 보호합니다.
 * ==============================================================================
 */

export default async function handler(req, res) {
  // CORS 헤더 설정 (모든 도메인에서의 안전한 통신 허용)
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // 브라우저의 사전 요청(Preflight OPTIONS) 처리
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // POST 요청만 허용
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST 요청만 지원합니다.' });
  }

  try {
    // 요청 데이터 파싱
    let bodyData = req.body;
    if (typeof bodyData === 'string') {
      try {
        bodyData = JSON.parse(bodyData);
      } catch (e) {
        bodyData = {};
      }
    }

    const diaryText = bodyData?.diaryText;

    // 일기 텍스트 유효성 검사
    if (!diaryText || diaryText.trim() === '') {
      return res.status(400).json({ error: '일기 내용이 비어있습니다.' });
    }

    // 🔒 환경변수에서 Google Gemini API 키 안전하게 가져오기
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: '서버 환경변수에 GEMINI_API_KEY가 설정되지 않았습니다. Vercel 환경변수 설정을 확인해 주세요.'
      });
    }

    // Google Gemini 3.6 Flash API 엔드포인트
    const geminiEndpoint = `https://generativelanguage.googleapis.com/v1/models/gemini-3.6-flash:generateContent?key=${apiKey}`;

    // Gemini API 요청 페이로드 (구조화된 출력 responseSchema 적용)
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
사용자가 작성한 일기 내용을 꼼꼼히 읽고, 일기 속 구체적인 사건과 단어에 깊이 공감하는 100% 맞춤형 답변을 생성해 주세요.
정형화된 문장이 아닌, 사용자가 쓴 상황에 맞춘 다정하고 섬세한 2~3줄의 위로/응원 메시지(aiMessage), 대표 감정 이모지 1개(emoji), 2~4단어의 한국어 감정 명칭(label)을 JSON 규격에 맞게 작성하세요.`
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
              description: "일기 내용의 핵심 감정을 나타내는 가장 잘 어울리는 대표 이모지 1개"
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

    // Google Gemini API 호출
    const response = await fetch(geminiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
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

    // JSON 파싱
    const parsedData = JSON.parse(rawContent);

    // 프론트엔드로 안전하게 분석 결과만 전달
    return res.status(200).json({
      success: true,
      emoji: parsedData.emoji || '🌿',
      label: parsedData.label || '소중한 하루',
      aiMessage: parsedData.aiMessage || '소중한 하루를 기록해 주셔서 감사해요. 오늘도 수고 많으셨어요.'
    });

  } catch (error) {
    console.error('분석 처리 중 서버 오류:', error);
    return res.status(500).json({
      error: '감정 분석 중 서버 오류가 발생했습니다.',
      message: error.message
    });
  }
}
