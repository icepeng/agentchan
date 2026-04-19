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
  dirty: false,
};

function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "SELECT_FILE":
      return {
        selectedPath: action.path,
        originalContent: action.content,
        dirty: false,
      };
    case "MARK_DIRTY":
      // Idempotent — returning the same reference makes useReducer bail out,
      // so repeat fires from CodeMirror's updateListener don't propagate.
      return state.dirty ? state : { ...state, dirty: true };
    case "FILE_SAVED":
      return { ...state, originalContent: action.savedContent, dirty: false };
    case "EXTERNAL_REFRESH":
      // Drop if selection moved during the refresh fetch.
      if (state.selectedPath !== action.path) return state;
      return { ...state, originalContent: action.content, dirty: false };
    case "DESELECT_FILE":
      return initialState;
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
