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
  buffer: null,
};

function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "SELECT_FILE":
      return { selectedPath: action.path, buffer: null };
    case "UPDATE_BUFFER":
      return { ...state, buffer: action.content };
    case "DISCARD_BUFFER":
      // Only drop the shadow if it still matches what was saved — preserves
      // keystrokes the user made during the save round-trip.
      return state.buffer === action.ifEquals ? { ...state, buffer: null } : state;
    case "DESELECT_FILE":
      return { selectedPath: null, buffer: null };
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
