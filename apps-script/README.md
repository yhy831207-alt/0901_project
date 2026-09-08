# Google Apps Script 회원 API 설정

이 디렉터리의 `Code.gs`는 현재 블로그의 회원가입·로그인 MVP용 코드입니다.

## 설치

1. 대상 스프레드시트에서 `확장 프로그램 → Apps Script`를 엽니다.
2. 기본 `Code.gs` 내용을 이 디렉터리의 `Code.gs`로 교체합니다.
3. `배포 → 새 배포 → 웹 앱`을 선택합니다.
4. 실행 사용자는 `나`, 액세스 권한은 블로그 공개 범위에 맞게 설정합니다.
5. 생성된 `/exec` URL을 블로그의 API URL로 사용합니다.
6. 웹 앱에 첫 요청이 오면 `Users`, `Sessions` 탭과 인증 비밀값이 자동 생성됩니다.

수동 초기화가 필요할 때만 편집기에서 `setupAuthSheets`를 실행하세요.

## 요청 예시

Apps Script와 브라우저 간 불필요한 preflight 요청을 피하도록 `URLSearchParams`를 사용합니다.

```js
const body = new URLSearchParams({
  action: 'signup',
  email: 'user@example.com',
  password: 'securepass123',
  name: '김민준',
  nickname: '기록하는민준',
});

const response = await fetch(WEB_APP_URL, {
  method: 'POST',
  body,
  redirect: 'follow',
});

const result = await response.json();
```

지원하는 `action`은 `signup`, `login`, `session`, `logout`입니다. 로그인 성공 시 반환되는 토큰은 브라우저의 `sessionStorage`에 저장하는 것을 권장하며 URL 쿼리 문자열에는 넣지 마세요.

## 보안 범위

이 구현은 소규모 개인 블로그용 MVP입니다. 비밀번호 원문은 저장하지 않고 사용자별 솔트와 Script Properties의 비밀값으로 HMAC-SHA256 처리합니다. 로그인 시도 제한은 Cache Service 기반의 보조 방어이므로 완전한 공격 차단 수단은 아닙니다.

민감한 개인정보, 결제 또는 대규모 공개 서비스에는 Firebase Authentication, Supabase Auth 같은 전용 인증 서비스를 사용하세요.
