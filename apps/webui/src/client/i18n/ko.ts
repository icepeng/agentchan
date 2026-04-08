import type { TranslationKey } from "./en.js";

export const translations: Record<TranslationKey, string> = {
  // Sidebar
  "sidebar.library": "라이브러리",
  "sidebar.projects": "프로젝트",
  "sidebar.projectSettings": "프로젝트 설정",

  // Provider / Model
  "provider.label": "프로바이더",
  "model.label": "모델",

  // Skills
  "skills.label": "스킬",
  "skills.alwaysActive": "항상 활성",

  // Theme
  "theme.title": "테마: {{preference}}",

  // Language
  "language.title": "언어: {{preference}}",

  // Session
  "session.new": "새 세션",
  "session.closePanel": "패널 닫기",
  "session.deleteConfirm": '"{{title}}" 삭제하시겠습니까?',
  "session.deleteConfirmFull": '"{{title}}" 세션을 삭제하시겠습니까?',
  "session.delete": "삭제",
  "session.noSessions": "세션이 없습니다",

  // Chat
  "chat.you": "나",
  "chat.agent": "에이전트",
  "chat.fork": "분기",
  "chat.branchFromHere": "여기서 분기",
  "chat.branchingFromMessage": "메시지에서 분기 중",
  "chat.branching": "분기 중",
  "chat.cancel": "취소",
  "chat.awaitingInput": "입력 대기 중_",
  "chat.selectSession": "세션을 선택하세요_",
  "chat.delete": "삭제",
  "chat.regenerate": "재시도",
  "chat.streamError": "오류가 발생했습니다",
  "chat.streamErrorRetry": "메시지를 다시 보내보세요",
  "chat.multiProviderAgent": "멀티 프로바이더 AI 에이전트",
  "chat.compactSummary": "이전 세션에서 요약됨",
  "chat.compactShowDetails": "자세히 보기",
  "chat.compactHideDetails": "접기",

  // Empty state
  "empty.subtitle": "크리에이티브 라이팅 스튜디오",
  "empty.openAgentPanel": "에이전트 패널 열기",
  "empty.showAgentPanel": "에이전트 패널 표시",

  // Input
  "input.placeholder": "메시지를 입력하세요...",
  "input.branchPlaceholder": "이 분기에서 계속...",
  "input.tokenIn": "입력",
  "input.tokenOut": "출력",
  "input.context": "컨텍스트",

  // Project tabs
  "project.new": "새 프로젝트",
  "project.namePlaceholder": "프로젝트 이름...",
  "project.deleteConfirm": "삭제?",
  "project.confirmDelete": "삭제 확인",
  "project.cancelDelete": "취소",
  "project.deleteFailed": "프로젝트 삭제 실패: {{error}}",
  "project.duplicateSettings": "새 프로젝트에 설정 복사",
  "project.duplicateSettingsNamePlaceholder": "새 프로젝트 이름...",
  "project.newOptionsEmpty": "빈 프로젝트로 시작",
  "project.newOptionsCopyFrom": "다른 프로젝트에서 복제",

  // Project settings
  "settings.back": "뒤로",
  "settings.general": "일반",
  "settings.skills": "스킬",
  "settings.renderer": "렌더러",
  "settings.projectConfig": "프로젝트 설정",
  "settings.name": "이름",
  "settings.outputDir": "출력 디렉토리",
  "settings.notes": "노트",
  "settings.save": "저장",
  "settings.saving": "저장 중...",
  "settings.fromLibrary": "라이브러리에서",
  "settings.newSkill": "새 스킬",
  "settings.noSkills": "스킬 없음",
  "settings.selectSkillToEdit": "편집할 스킬을 선택하세요",
  "settings.rendererTs": "renderer.ts",
  "settings.projectRenderer": "프로젝트 렌더러",
  "settings.notCreatedYet": "아직 생성되지 않음",
  "settings.rendererLibrary": "라이브러리",
  "settings.preview": "미리보기",
  "settings.applyToProject": "프로젝트에 적용",
  "settings.recommended": "추천",
  "settings.applying": "적용 중...",
  "settings.loading": "로딩 중...",
  "settings.noRendererYet": "renderer.ts가 아직 없습니다",
  "settings.selectRendererToPreview": "미리볼 라이브러리 렌더러를 선택하세요",
  "settings.createInLibraryFirst": "먼저 라이브러리에서 생성하세요",
  "settings.noLibraryRenderers": "라이브러리 렌더러 없음",

  // Library page
  "library.title": "라이브러리",
  "library.skillsTab": "스킬",
  "library.renderersTab": "렌더러",
  "library.newSkill": "새 스킬",
  "library.newRenderer": "새 렌더러",
  "library.newSkillTitle": "새 스킬",
  "library.newRendererTitle": "새 렌더러",
  "library.skillNamePlaceholder": "스킬-이름 (소문자, 하이픈)",
  "library.rendererNamePlaceholder": "렌더러-이름",
  "library.cancel": "취소",
  "library.create": "생성",
  "library.selectSkillToEdit": "편집할 스킬을 선택하세요",
  "library.selectRendererToEdit": "편집할 렌더러를 선택하세요",

  // Library browser
  "libraryBrowser.title": "라이브러리에서 추가",
  "libraryBrowser.noLibrarySkills": "라이브러리 스킬 없음",
  "libraryBrowser.allAlreadyAdded": "모든 라이브러리 스킬이 이미 추가됨",
  "libraryBrowser.add": "추가",
  "libraryBrowser.added": "적용됨",
  "libraryBrowser.copying": "복사 중...",

  // Skill/Renderer editor
  "editor.unsaved": "저장되지 않은 변경",
  "editor.saved": "저장됨",
  "editor.delete": "삭제",
  "editor.save": "저장",
  "editor.saving": "저장 중...",
  "editor.tokens": "토큰",
  "editor.approx": "약",

  // Global settings
  "globalSettings.title": "설정",
  "globalSettings.appearance": "외관",
  "globalSettings.apiKeys": "API 키",
  "globalSettings.theme": "테마",
  "globalSettings.themeSystem": "시스템",
  "globalSettings.themeLight": "라이트",
  "globalSettings.themeDark": "다크",
  "globalSettings.themeSystemDesc": "",
  "globalSettings.themeLightDesc": "",
  "globalSettings.themeDarkDesc": "",
  "globalSettings.language": "언어",
  "globalSettings.langSystem": "시스템",
  "globalSettings.langEn": "English",
  "globalSettings.langKo": "한국어",
  "globalSettings.langSystemDesc": "브라우저 언어 설정을 따름",
  "globalSettings.apiKeysDescription": "각 프로바이더의 API 키를 설정합니다. 키는 서버 데이터베이스에 저장됩니다.",
  "globalSettings.apiKey": "API 키",
  "globalSettings.apiKeyPlaceholder": "API 키를 입력하세요...",
  "globalSettings.apiKeyConfigured": "설정됨",
  "globalSettings.apiKeyEmpty": "미설정",
  "globalSettings.saveKey": "저장",
  "globalSettings.removeKey": "삭제",
  "globalSettings.savingKey": "저장 중...",
  "globalSettings.activeProvider": "활성 프로바이더 및 모델",
  "globalSettings.activeProviderDesc": "대화에 사용할 프로바이더와 모델을 선택하세요",

  // Custom Providers
  "customApi.providers": "커스텀 프로바이더",
  "customApi.providersDesc": "자체 엔드포인트로 커스텀 API 프로바이더를 추가합니다.",
  "customApi.addProvider": "프로바이더 추가",
  "customApi.providerName": "프로바이더 이름",
  "customApi.providerNamePlaceholder": "my-provider",
  "customApi.url": "API URL",
  "customApi.urlPlaceholder": "https://api.example.com/v1",
  "customApi.requestModel": "모델 ID (쉼표로 구분)",
  "customApi.requestModelPlaceholder": "gpt-4o, gpt-4o-mini",
  "customApi.format": "API 포맷",

  // Parameters
  "params.label": "파라미터",
  "params.temperature": "온도",
  "params.maxTokens": "최대 토큰",
  "params.contextWindow": "컨텍스트 윈도우",
  "params.thinking": "사고",

  // Onboarding
  "onboarding.welcomeDescription": "당신을 위한 AI 창작 도구.",
  "onboarding.getStarted": "시작하기",
  "onboarding.skip": "건너뛰기",
  "onboarding.skipForNow": "나중에 설정",
  "onboarding.continue": "계속",
  "onboarding.themeTitle": "테마 선택",
  "onboarding.apiKeyTitle": "API 키 등록",
  "onboarding.apiKeyDescription": "프로바이더를 선택하고 키를 붙여넣으세요.",
  "onboarding.startCreating": "시작",

  // Common
  "common.cancel": "취소",
  "common.create": "생성",
  "common.save": "저장",
  "common.newSkillTitle": "새 스킬",
  "common.skillNamePlaceholder": "스킬-이름 (소문자, 하이픈)",
};
