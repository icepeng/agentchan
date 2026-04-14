import type { TranslationKey } from "./en.js";

export const translations: Record<TranslationKey, string> = {
  // Sidebar
  "sidebar.templates": "템플릿",
  "sidebar.projects": "프로젝트",
  "sidebar.projectSettings": "프로젝트 설정",
  "sidebar.streamingIndicator": "생성 중…",

  // Provider / Model
  "provider.label": "프로바이더",
  "model.label": "모델",

  // Skills
  "skills.label": "스킬",

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
  "chat.skillLoaded": "스킬 로드됨",
  "chat.showBody": "보기",
  "chat.hideBody": "숨기기",

  // Empty state
  "empty.subtitle": "크리에이티브 라이팅 스튜디오",
  "empty.noProjectTitle": "첫 프로젝트를 템플릿에서 시작하세요",
  "empty.browseTemplates": "템플릿 둘러보기",
  "empty.openAgentPanel": "에이전트 패널 열기",
  "empty.showAgentPanel": "에이전트 패널 표시",

  // Input
  "input.placeholder": "메시지를 입력하세요...",
  "input.branchPlaceholder": "이 분기에서 계속...",
  "input.tokenIn": "입력",
  "input.tokenOut": "출력",
  "input.context": "컨텍스트",

  // Slash command popup
  "slash.listboxLabel": "슬래시 명령",
  "slash.noMatches": "일치하는 명령이 없습니다",
  "slash.skillTag": "skill",

  // Project tabs
  "project.new": "새 프로젝트",
  "project.namePlaceholder": "프로젝트 이름...",
  "project.deleteConfirm": "삭제?",
  "project.confirmDelete": "삭제 확인",
  "project.cancelDelete": "취소",
  "project.deleteFailed": "프로젝트 삭제 실패: {{error}}",
  "project.duplicate": "프로젝트 복제",
  "project.duplicateNamePlaceholder": "새 프로젝트 이름...",
  "project.newOptionsEmpty": "빈 프로젝트",
  "project.newOptionsFromTemplate": "템플릿에서",

  // Project settings
  "settings.back": "뒤로",
  "settings.general": "일반",
  "settings.skills": "스킬",
  "settings.renderer": "렌더러",
  "settings.projectConfig": "프로젝트 설정",
  "settings.name": "이름",
  "settings.notes": "노트",
  "settings.save": "저장",
  "settings.saving": "저장 중...",
  "settings.newSkill": "새 스킬",
  "settings.noSkills": "스킬 없음",
  "settings.selectSkillToEdit": "편집할 스킬을 선택하세요",
  "settings.rendererTs": "renderer.ts",
  "settings.projectRenderer": "프로젝트 렌더러",
  "settings.notCreatedYet": "아직 생성되지 않음",
  "settings.loading": "로딩 중...",
  "settings.noRendererYet": "renderer.ts가 아직 없습니다",
  "settings.system": "시스템",
  "settings.projectSystem": "프로젝트 시스템 프롬프트",
  "settings.noSystemYet": "SYSTEM.md가 아직 없습니다",

  // Templates page
  "templates.title": "템플릿",
  "templates.label": "THE LIBRARY",
  "templates.description": "템플릿으로 새 프로젝트를 시작하세요.",
  "templates.createProject": "프로젝트 생성",
  "templates.empty": "사용 가능한 템플릿이 없습니다",
  "templates.heroPlaceholder": "왼쪽에서 세계를 하나 골라주세요",
  "templates.nameLabel": "이 세계에 이름을 붙여주세요",
  "templates.namePlaceholder": "이름 입력",
  "templates.begin": "시작하기",
  "templates.loading": "불러오는 중...",
  "templates.noReadme": "README가 아직 준비되지 않았어요",

  // README modal (in-project)
  "readme.modalTitle": "README",
  "readme.close": "닫기",
  "readme.commandDescription": "프로젝트 README 보기",

  // Save as template
  "project.saveAsTemplate": "템플릿으로 저장",
  "template.saveTitle": "템플릿으로 저장",
  "template.name": "템플릿 이름",
  "template.templateDescription": "설명",
  "template.namePlaceholder": "템플릿 이름...",
  "template.descriptionPlaceholder": "선택적 설명...",
  "template.files": "파일",
  "template.save": "템플릿 저장",
  "template.saving": "저장 중...",
  "template.overwriteConfirm": "\"{{name}}\" 템플릿이 이미 존재합니다. 덮어쓰시겠습니까?",
  "template.overwrite": "덮어쓰기",
  "template.noPreview": "미리보기할 파일을 선택하세요",
  "template.binaryFile": "바이너리 파일",

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

  // Project settings modal
  "projectModal.title": "프로젝트 설정",

  // Edit mode
  "editMode.switchToEdit": "편집 모드",
  "editMode.switchToChat": "채팅 모드",
  "editMode.selectFile": "편집할 파일을 선택하세요",
  "editMode.unsavedTitle": "저장되지 않은 변경",
  "editMode.unsavedMessage": "저장되지 않은 변경사항이 있습니다. 어떻게 할까요?",
  "editMode.save": "저장",
  "editMode.discard": "버리기",
  "editMode.cancel": "취소",
  "editMode.imagePreview": "이미지 미리보기",
  "editMode.revealInExplorer": "탐색기에서 열기",
  "editMode.deleteFile": "삭제",
  "editMode.deleteConfirmTitle": "파일 삭제",
  "editMode.deleteConfirmMessage": "\"{{name}}\" 파일을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.",
  "editMode.newFile": "새 파일",
  "editMode.newFolder": "새 폴더",
  "editMode.rename": "이름 변경",
  "editMode.deleteFolderConfirmTitle": "폴더 삭제",
  "editMode.deleteFolderConfirmMessage": "\"{{name}}\" 폴더와 모든 내용을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.",

  // Sidebar collapse
  "ui.sidebar.collapse": "사이드바 접기",
  "ui.sidebar.expand": "사이드바 펼치기",

  // Notifications
  "notifications.title": "알림",
  "notifications.desktopLabel": "데스크톱 알림",
  "notifications.desktopDesc": "다른 프로젝트나 탭을 보고 있을 때 에이전트가 완료되면 알려드립니다.",
  "notifications.enabled": "켜짐",
  "notifications.disabled": "꺼짐",
  "notifications.blocked": "브라우저에서 차단됨 — 사이트 설정에서 알림을 허용하세요.",
  "notifications.sessionComplete": "{{project}} 완료",
  "notifications.sessionCompleteBody": "응답을 확인하려면 탭하세요.",
  "notifications.sessionError": "{{project}} 오류 발생",
  "notifications.sessionErrorBody": "상세 내용을 확인하려면 탭하세요.",
};
