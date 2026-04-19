import {
  createContext,
  use,
  useReducer,
  type ReactNode,
  type Dispatch,
} from "react";
import type { EditorState, EditorAction } from "./editor.types.js";

const initialState: EditorState = {
  selectedPath: null,
  originalContent: null,
  buffer: null,
};

function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "SELECT_FILE":
      return {
        selectedPath: action.path,
        originalContent: action.content,
        buffer: action.content,
      };
    case "UPDATE_BUFFER":
      return { ...state, buffer: action.content };
    case "FILE_SAVED":
      // Buffer is intentionally preserved so edits made during the write
      // round-trip survive; dirty re-derives against the new baseline.
      if (state.originalContent === action.savedContent) return state;
      return { ...state, originalContent: action.savedContent };
    case "EXTERNAL_REFRESH":
      // Drop if selection moved during the refresh fetch.
      if (state.selectedPath !== action.path) return state;
      return { ...state, originalContent: action.content, buffer: action.content };
    case "DESELECT_FILE":
      return { selectedPath: null, originalContent: null, buffer: null };
    case "RENAME_SELECTED":
      return { ...state, selectedPath: action.newPath };
    case "CLEAR":
      return initialState;
    default:
      return state;
  }
}

const EditorStateContext = createContext<EditorState>(initialState);
const EditorDispatchContext = createContext<Dispatch<EditorAction>>(() => {});

export function EditorProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(editorReducer, initialState);
  return (
    <EditorStateContext value={state}>
      <EditorDispatchContext value={dispatch}>
        {children}
      </EditorDispatchContext>
    </EditorStateContext>
  );
}

export function useEditorState() {
  return use(EditorStateContext);
}

export function useEditorDispatch() {
  return use(EditorDispatchContext);
}
