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
  localContent: null,
  dirty: false,
};

function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "SELECT_FILE":
      // Reset the buffer; SYNC_EXTERNAL_CONTENT will land once the SWR cache
      // resolves the new file's content.
      return { selectedPath: action.path, localContent: null, dirty: false };
    case "SYNC_EXTERNAL_CONTENT":
      return { ...state, localContent: action.content, dirty: false };
    case "UPDATE_LOCAL_CONTENT":
      return {
        ...state,
        localContent: action.content,
        dirty: action.content !== action.serverContent,
      };
    case "MARK_CLEAN":
      return { ...state, dirty: false };
    case "DESELECT_FILE":
      return { selectedPath: null, localContent: null, dirty: false };
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
