/**
 * ==============================================================================
 * 로컬 개발용 서버 (server.js)
 * 
 * [설명]
 * Vercel에 배포하기 전에 로컬 컴퓨터에서 웹사이트와 Gemini API를 테스트할 수 있도록
 * Node.js 내장 모듈만으로 동작하는 가벼운 로컬 개발 서버입니다.
 * 
 * [포트 처리]
 * 포트 8000을 우선 시도하며, 다른 프로세스가 사용 중일 경우 3000번 포트로 자동 전환됩니다.
 * ==============================================================================
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import analyzeHandler from './api/analyze.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let PORT = process.env.PORT || 8000;

// 1. .env.local 및 .env 파일에서 환경변수 로드 함수
function loadEnvFile(envPath) {
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...values] = trimmed.split('=');
        if (key && values.length > 0) {
          process.env[key.trim()] = values.join('=').trim().replace(/^["']|["']$/g, '');
        }
      }
    }
  }
}

// 환경변수 로드
loadEnvFile(path.join(__dirname, '.env.local'));
loadEnvFile(path.join(__dirname, '.env'));

console.log('----------------------------------------------------');
console.log('🔑 Gemini API 키 로드 상태:', process.env.GEMINI_API_KEY ? '✅ 정상 로드됨' : '❌ 없음');
console.log('----------------------------------------------------');

// 2. HTTP 서버 생성
const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  // 1) /api/analyze 엔드포인트 라우팅 (Vercel Serverless Function 실행)
  if (pathname === '/api/analyze') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        req.body = body ? JSON.parse(body) : {};
      } catch (e) {
        req.body = body;
      }

      res.status = (statusCode) => {
        res.statusCode = statusCode;
        return res;
      };
      res.json = (data) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(data));
      };

      try {
        await analyzeHandler(req, res);
      } catch (err) {
        console.error('API 처리 오류:', err);
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: '서버 내부 오류가 발생했습니다.' }));
      }
    });
    return;
  }

  // 2) 정적 파일 서빙 (index.html 등)
  let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);
  
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
  };

  const contentType = mimeTypes[ext] || 'text/plain; charset=utf-8';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        fs.readFile(path.join(__dirname, 'index.html'), (fallbackErr, fallbackContent) => {
          if (fallbackErr) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('404 Not Found');
          } else {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(fallbackContent, 'utf-8');
          }
        });
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`서버 오류: ${err.code}`);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

// 포트 충돌 시 3000번 포트로 자동 전환
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`⚠️ 포트 ${PORT}이 이미 사용 중입니다. 포트 3000으로 자동 전환합니다.`);
    PORT = 3000;
    server.listen(PORT, () => {
      console.log(`🚀 감정 분석 다이어리 로컬 서버가 시작되었습니다!`);
      console.log(`👉 접속 주소: http://localhost:${PORT}`);
    });
  } else {
    console.error('서버 오류:', err);
  }
});

server.listen(PORT, () => {
  console.log(`🚀 감정 분석 다이어리 로컬 서버가 시작되었습니다!`);
  console.log(`👉 접속 주소: http://localhost:${PORT}`);
});
