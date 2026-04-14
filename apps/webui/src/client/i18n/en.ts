export const translations = {
  // Sidebar
  "sidebar.templates": "Templates",
  "sidebar.projects": "Projects",
  "sidebar.projectSettings": "Project settings",
  "sidebar.streamingIndicator": "Streaming…",

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

  // Slash command popup
  "slash.listboxLabel": "Slash commands",
  "slash.noMatches": "No commands match",
  "slash.skillTag": "skill",

  // Project tabs
  "project.new": "New project",
  "project.namePlaceholder": "Project name...",
  "project.deleteConfirm": "Delete?",
  "project.confirmDelete": "Confirm delete",
  "project.cancelDelete": "Cancel",
  "project.deleteFailed": "Failed to delete project: {{error}}",
  "project.duplicate": "Duplicate project",
  "project.duplicateNamePlaceholder": "New project name...",
  "project.newOptionsEmpty": "Empty project",
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
  "templates.label": "THE LIBRARY",
  "templates.description": "Create a new project from a template.",
  "templates.createProject": "Create project",
  "templates.empty": "No templates available",
  "templates.heroPlaceholder": "Choose a world from the left",
  "templates.nameLabel": "Name this world",
  "templates.namePlaceholder": "enter a name",
  "templates.begin": "Begin",
  "templates.loading": "Loading...",
  "templates.noReadme": "No README yet",
  "templates.dragHandle": "Drag to reorder",
  "templates.reorderFailed": "Failed to save the new order. Please try again.",

  // README modal (in-project)
  "readme.modalTitle": "README",
  "readme.close": "Close",
  "readme.commandDescription": "Show project README",

  // Save as template
  "project.saveAsTemplate": "Save as template",
  "template.saveTitle": "Save as Template",
  "template.name": "Template Name",
  "template.templateDescription": "Description",
  "template.namePlaceholder": "Template name...",
  "template.descriptionPlaceholder": "Optional description...",
  "template.files": "Files",
  "template.save": "Save Template",
  "template.saving": "Saving...",
  "template.overwriteConfirm": "\"{{name}}\" already exists. Overwrite?",
  "template.overwrite": "Overwrite",
  "template.noPreview": "Select a file to preview",
  "template.binaryFile": "Binary file",

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

  // Project settings modal
  "projectModal.title": "Project Settings",

  // Edit mode
  "editMode.switchToEdit": "Edit mode",
  "editMode.switchToChat": "Chat mode",
  "editMode.selectFile": "Select a file to edit",
  "editMode.unsavedTitle": "Unsaved Changes",
  "editMode.unsavedMessage": "You have unsaved changes. What would you like to do?",
  "editMode.save": "Save",
  "editMode.discard": "Discard",
  "editMode.cancel": "Cancel",
  "editMode.imagePreview": "Image preview",
  "editMode.revealInExplorer": "Show in Explorer",
  "editMode.deleteFile": "Delete",
  "editMode.deleteConfirmTitle": "Delete File",
  "editMode.deleteConfirmMessage": "Are you sure you want to delete \"{{name}}\"? This cannot be undone.",
  "editMode.newFile": "New File",
  "editMode.newFolder": "New Folder",
  "editMode.rename": "Rename",
  "editMode.deleteFolderConfirmTitle": "Delete Folder",
  "editMode.deleteFolderConfirmMessage": "Are you sure you want to delete \"{{name}}\" and all its contents? This cannot be undone.",

  // Sidebar collapse
  "ui.sidebar.collapse": "Collapse sidebar",
  "ui.sidebar.expand": "Expand sidebar",

  // Notifications
  "notifications.title": "Notifications",
  "notifications.desktopLabel": "Desktop notifications",
  "notifications.desktopDesc": "Get notified when an agent finishes while you're on another project or tab.",
  "notifications.enabled": "Enabled",
  "notifications.disabled": "Disabled",
  "notifications.blocked": "Blocked by browser — allow notifications in site settings to enable.",
  "notifications.sessionComplete": "{{project}} finished",
  "notifications.sessionCompleteBody": "Tap to view the response.",
  "notifications.sessionError": "{{project}} hit an error",
  "notifications.sessionErrorBody": "Tap to see the details.",
} as const satisfies Record<string, string>;

export type TranslationKey = keyof typeof translations;
