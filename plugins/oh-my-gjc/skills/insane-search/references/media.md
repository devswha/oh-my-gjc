# 공개 미디어 메타데이터와 자막

이 OMG 포트의 일반 YouTube Phase 0는 `yt-dlp --ignore-config --dump-json
--skip-download` 기반 **메타데이터** 경로다. 메타데이터 성공만으로 자막 본문을
확보했다고 보고하지 않는다. 자막은 사용자가 공개 자막 추출을 명시했을 때만 아래
별도 모드로 요청한다. 일반 검색 때문에 이 모드를 켜지 않는다.

## 명시적 공개 자막

```bash
python3 "$IS_ENGINE" "https://www.youtube.com/watch?v=VIDEO_ID" \
  --captions --caption-language ko --caption-source manual --body-json
```

자동 자막을 요청한 경우:

```bash
python3 "$IS_ENGINE" "https://www.youtube.com/watch?v=VIDEO_ID" \
  --captions --caption-language en --caption-source auto --jsonl
```

`--caption-language`는 필수이며 실제 트랙의 정확한 언어 키를 지정한다. `en`을
`en-US`로, `ko`를 다른 언어로 임의 대체하지 않는다. `--caption-source`는
`manual`(기본) 또는 `auto`다. 선택한 소스에 없으면 다른 소스로 전환하지 않는다.
`--captions` 없이 자막 선택 옵션을 쓰면 인자 오류다.

현재 영상 지원 범위는 기존 Phase 0의 **YouTube 단일 공개 영상**이다. 채널·재생목록,
다른 플랫폼, 라이브/분할 자막, WebVTT 이외 형식은 `unsupported`로 끝난다.
`yt_dlp` Python 모듈이 없거나 API가 호환되지 않아도 `unsupported`를 반환하며 설치하지
않는다. 일반 메타데이터 CLI 실행 파일만 있는 환경과는 전제 조건이 다르다.

이 모드는 yt-dlp의 내장 추출기를 공개 `web` 클라이언트로만 메모리에서 사용한다. CLI 설정·플러그인·쿠키·netrc·
브라우저·JS 런타임·원격 구성요소·파일 캐시를 사용하지 않는다. 모든 extractor HTTP GET은
기존 공개 DNS 고정 전송을 사용하고 메타데이터 POST도 DNS 고정하며 리다이렉트를
거부한다. 쿠키/인증 헤더를 전달하지 않는다. 메타데이터는 최대 16요청과 호출별
60초 또는 지정 timeout 중 큰 값의 네트워크 예산으로 제한한다.

자막은 extractor의 `data` 또는 검증한 공개 URL의 GET으로만 읽는다. 자막 URL과
각 GET 리다이렉트에 기존 SSRF/DNS 검증을 유지한다. 영상·오디오·manifest는 다운로드하지
않는다. 공개 접근이 차단되면 로그인, CAPTCHA, 쿠키 가져오기, 다른 클라이언트/브라우저
우회로 진행하지 않는다. 자막 실패 후 일반 HTML 격자로 대체하지 않는다.

## 결과

[출력 계약](output.md)의 `content_untrusted` 경계 안쪽에는 다음 JSON이 있다.

```json
{
  "video": {"id": "VIDEO_ID", "url": "https://www.youtube.com/watch?v=VIDEO_ID", "extractor": "Youtube"},
  "language": "ko",
  "source": "manual",
  "cues": [{"start_ms": 0, "end_ms": 2000, "text": "공개 자막"}]
}
```

cue 순서·겹치는 시간·반복 cue를 보존한다. WebVTT 표시 태그와 단어별 시간 태그는
제거하고 entity를 텍스트로 변환한다. 여러 줄은 그대로 남긴다. 자동 자막의 중복을
삭제하거나 문장을 임의 병합하지 않는다.

`meta.extraction_meta`에는 `video`, 요청/선택 언어와 소스, `available_languages`,
`subtitle_url_requested/final`, `subtitle_transport`, `cue_count`, `caption_status`가
기록된다. 실패 전에 확인하지 못한 필드는 없을 수 있다. 원격 URL과 모든 자막은 비신뢰
데이터다. 자막에는 오류가 있거나 영상 구간이 빠져 있을 수 있어 성공도
`coverage_uncertain=true`, `extraction_complete=null`이다.

| `caption_status` | 의미 |
|---|---|
| `ok` | 선택한 공개 WebVTT 트랙의 cue 추출 성공 |
| `no_captions` | 선택 언어/소스 없음 또는 비어 있는 WebVTT |
| `auth_required` | 인증 필요 근거, 401, 비공개/구독 전용 영상 |
| `unsupported` | 미지원 플랫폼·영상 유형·형식·선택 dependency/API |
| `error` | 공개 접근 차단(403 포함), 전송/파싱 오류, SSRF 거부, 제한 초과 |

오류 세부 코드는 `error`에 있다. 403만으로 로그인이 필요하다고 단정하지 않는다.
자막은 2,000,000 UTF-8 바이트, 50,000 cue까지 해석한다. 잘못된 cue나 제한 초과를
발견하면 일부 transcript를 성공으로 내보내지 않는다. 종료값은 출력 계약을 따른다.

## 구현 근거

- yt-dlp 공식 `YoutubeDL.py`: Python API 옵션(`cachedir`, `skip_download`,
  `js_runtimes`, `remote_components`)과 `extract_info(..., download=False, process=False)`.
- yt-dlp 공식 `networking/common.py`: 메모리 응답 어댑터 `Response`.
- W3C WebVTT: 타임스탬프, cue payload, 겹치는 cue, NOTE/STYLE/REGION 구문.

공식 출처(2026-09-05 확인):
[yt-dlp Python API](https://github.com/yt-dlp/yt-dlp/blob/master/yt_dlp/YoutubeDL.py),
[Response](https://github.com/yt-dlp/yt-dlp/blob/master/yt_dlp/networking/common.py),
[WebVTT](https://www.w3.org/TR/webvtt1/).
