export const translations = {
  // Sidebar
  "sidebar.templates": "Templates",
  "sidebar.projects": "Projects",
  "sidebar.projectSettings": "Project settings",

  // Provider / Model
  "provider.label": "Provider",
  "model.label": "Model",

  // Skills
  "skills.label": "Skills",

  // Theme
  "theme.title": "Theme: {{preference}}",

  // Language
  "language.title": "Language: {{preference}}",

  // Session
  "session.new": "New session",
  "session.closePanel": "Close panel",
  "session.deleteConfirm": 'Delete "{{title}}"?',
  "session.deleteConfirmFull": 'Delete session "{{title}}"?',
  "session.delete": "Delete",
  "session.noSessions": "No sessions yet",

  // Chat
  "chat.you": "You",
  "chat.agent": "Agent",
  "chat.fork": "fork",
  "chat.branchFromHere": "Branch from here",
  "chat.branchingFromMessage": "branching from message",
  "chat.branching": "branching",
  "chat.cancel": "cancel",
  "chat.awaitingInput": "awaiting input_",
  "chat.selectSession": "select a session_",
  "chat.delete": "delete",
  "chat.regenerate": "retry",
  "chat.streamError": "Something went wrong",
  "chat.streamErrorRetry": "Try sending your message again",
  "chat.multiProviderAgent": "multi-provider ai agent",
  "chat.compactSummary": "Summarized from previous session",
  "chat.compactShowDetails": "show details",
  "chat.compactHideDetails": "hide details",
  "chat.skillLoaded": "Skill loaded",
  "chat.showBody": "show",
  "chat.hideBody": "hide",

  // Empty state
  "empty.subtitle": "creative writing studio",
  "empty.openAgentPanel": "Open agent panel",
  "empty.showAgentPanel": "Show agent panel",

  // Input
  "input.placeholder": "Send a message...",
  "input.branchPlaceholder": "Continue from this branch...",
  "input.tokenIn": "in",
  "input.tokenOut": "out",
  "input.context": "context",

  // Project tabs
  "project.new": "New project",
  "project.namePlaceholder": "Project name...",
  "project.deleteConfirm": "Delete?",
  "project.confirmDelete": "Confirm delete",
  "project.cancelDelete": "Cancel",
  "project.deleteFailed": "Failed to delete project: {{error}}",
  "project.duplicateSettings": "Copy settings to new project",
  "project.duplicateSettingsNamePlaceholder": "New project name...",
  "project.newOptionsEmpty": "Empty project",
  "project.newOptionsCopyFrom": "Copy from another project",
  "project.newOptionsFromTemplate": "From template",

  // Project settings
  "settings.back": "Back",
  "settings.general": "General",
  "settings.skills": "Skills",
  "settings.renderer": "Renderer",
  "settings.projectConfig": "Project Configuration",
  "settings.name": "Name",
  "settings.notes": "Notes",
  "settings.save": "Save",
  "settings.saving": "Saving...",
  "settings.newSkill": "New skill",
  "settings.noSkills": "No skills",
  "settings.selectSkillToEdit": "Select a skill to edit",
  "settings.rendererTs": "renderer.ts",
  "settings.projectRenderer": "Project renderer",
  "settings.notCreatedYet": "Not created yet",
  "settings.loading": "Loading...",
  "settings.noRendererYet": "No renderer.ts yet",
  "settings.system": "System",
  "settings.projectSystem": "Project system prompt",
  "settings.noSystemYet": "No SYSTEM.md yet",

  // Templates page
  "templates.title": "Templates",
  "templates.description": "Create a new project from a template.",
  "templates.createProject": "Create project",
  "templates.empty": "No templates available",

  // Skill/Renderer editor
  "editor.unsaved": "unsaved changes",
  "editor.saved": "saved",
  "editor.delete": "Delete",
  "editor.save": "Save",
  "editor.saving": "Saving...",
  "editor.tokens": "tokens",
  "editor.approx": "~",

  // Global settings
  "globalSettings.title": "Settings",
  "globalSettings.appearance": "Appearance",
  "globalSettings.apiKeys": "API Keys",
  "globalSettings.theme": "Theme",
  "globalSettings.themeSystem": "System",
  "globalSettings.themeLight": "Light",
  "globalSettings.themeDark": "Dark",
  "globalSettings.themeSystemDesc": "",
  "globalSettings.themeLightDesc": "",
  "globalSettings.themeDarkDesc": "",
  "globalSettings.language": "Language",
  "globalSettings.langSystem": "System",
  "globalSettings.langEn": "English",
  "globalSettings.langKo": "Korean",
  "globalSettings.langSystemDesc": "Follows your browser language",
  "globalSettings.apiKeysDescription": "Configure API keys for each provider. Keys are stored in the server database.",
  "globalSettings.apiKey": "API Key",
  "globalSettings.apiKeyPlaceholder": "Enter API key...",
  "globalSettings.apiKeyConfigured": "Configured",
  "globalSettings.apiKeyEmpty": "Not configured",
  "globalSettings.saveKey": "Save",
  "globalSettings.removeKey": "Remove",
  "globalSettings.savingKey": "Saving...",
  "globalSettings.activeProvider": "Active Provider & Model",
  "globalSettings.activeProviderDesc": "Select which provider and model to use for conversations",

  // Custom Providers
  "customApi.providers": "Custom Providers",
  "customApi.providersDesc": "Add custom API providers with your own endpoints.",
  "customApi.addProvider": "Add Provider",
  "customApi.providerName": "Provider Name",
  "customApi.providerNamePlaceholder": "my-provider",
  "customApi.url": "API URL",
  "customApi.urlPlaceholder": "https://api.example.com/v1",
  "customApi.requestModel": "Model IDs (comma-separated)",
  "customApi.requestModelPlaceholder": "gpt-4o, gpt-4o-mini",
  "customApi.format": "API Format",

  // Parameters
  "params.label": "Parameters",
  "params.temperature": "Temperature",
  "params.maxTokens": "Max Tokens",
  "params.contextWindow": "Context Window",
  "params.thinking": "Thinking",

  // Onboarding
  "onboarding.welcomeDescription": "Your AI creative tool.",
  "onboarding.getStarted": "Get Started",
  "onboarding.skip": "Skip",
  "onboarding.skipForNow": "Skip for now",
  "onboarding.continue": "Continue",
  "onboarding.themeTitle": "Choose a theme",
  "onboarding.apiKeyTitle": "Add your API key",
  "onboarding.apiKeyDescription": "Pick a provider and paste your key.",
  "onboarding.startCreating": "Start",

  // Common (shared across settings and library new-skill forms)
  "common.cancel": "Cancel",
  "common.create": "Create",
  "common.save": "Save",
  "common.newSkillTitle": "New Skill",
  "common.skillNamePlaceholder": "skill-name (lowercase, hyphens)",
} as const satisfies Record<string, string>;

export type TranslationKey = keyof typeof translations;
